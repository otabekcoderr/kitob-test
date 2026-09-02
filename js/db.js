// ============================================================
// db.js — Ma'lumotlar bazasi bilan ishlash
// ============================================================
// Barcha Supabase so'rovlari shu yerda.
// Tartib: avval Supabase, xato bo'lsa data.js fallback.
// Merge EMAS — biri ishlasa ikkinchisi chaqirilmaydi.
//
// Import qilinadi: supabase-client.js, auth.js, data.js
// Bu fayldan import qilinadi: barcha sahifa skriptlari
// ============================================================

import { supabase }      from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import * as localData    from './data.js';

// ============================================================
// KONSTANTALAR
// ============================================================

/** So'rov timeout vaqti — 2.5 soniya (tezkor fallback) */
const TIMEOUT = 2_500;

// ============================================================
// TEZKOR IN-MEMORY KESH (SPEED & PERFORMANCE)
// ============================================================
let _booksCache = null;
const _questionsCache = new Map();

// ============================================================
// ICHKI YORDAMCHI FUNKSIYALAR
// ============================================================

/**
 * Joriy foydalanuvchining Supabase JWT tokenini qaytaradi.
 * Token topilmasa — null.
 *
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    return session.access_token;
  } catch {
    return null;
  }
}

/**
 * Promise ga timeout qo'shadi.
 * TIMEOUT ms ichida javob kelmasa — xato otadi.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms=TIMEOUT]
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms = TIMEOUT) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
  );
  return Promise.race([promise, timer]);
}

/**
 * Supabase so'rovini timeout bilan bajaradi.
 * Natija: { data, error } — Supabase formatida.
 *
 * @param {object} query — Supabase query builder
 * @returns {Promise<{data: any, error: any}>}
 */
async function runQuery(query) {
  try {
    return await withTimeout(query);
  } catch (err) {
    return { data: null, error: err };
  }
}

// ============================================================
// KITOBLAR (HYBRID PERSISTENCE: SUPABASE + LOCALSTORAGE + DATA.JS)
// ============================================================

function _getLocalCustomBooks() {
  const result = [];
  const seenIds = new Set();
  const keys = [
    'kitobchi_books_store',
    'custom_books',
    'kitobchi_custom_books',
    'books_store',
    'kitobchi_books',
    'books'
  ];

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
      for (const item of items) {
        if (item && (item.id || item.title)) {
          const itemKey = String(item.id || _slugify(item.title));
          if (!seenIds.has(itemKey)) {
            seenIds.add(itemKey);
            result.push(item);
          }
        }
      }
    } catch { /* ignore */ }
  }
  return result;
}

function _getDeletedBookIds() {
  try {
    const raw = localStorage.getItem('kitobchi_deleted_books');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function _getLocalCustomQuestions() {
  const result = [];
  const seenIds = new Set();
  const keys = [
    'kitobchi_custom_questions',
    'custom_questions',
    'kitobchi_questions_store',
    'questions_store',
    'kitobchi_questions',
    'questions'
  ];

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
      for (const item of items) {
        if (item && item.question) {
          const itemKey = String(item.id || ((item.book_id || item.bookId) + '_' + item.question));
          if (!seenIds.has(itemKey)) {
            seenIds.add(itemKey);
            result.push(item);
          }
        }
      }
    } catch { /* ignore */ }
  }
  return result;
}

function _getDeletedQuestionIds() {
  try {
    const raw = localStorage.getItem('kitobchi_deleted_questions');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function clearDbCache() {
  _booksCache = null;
  _questionsCache.clear();
}

/**
 * Barcha kitoblarni qaytaradi (data.js kitoblari + Supabase + localStorage birlashmasi).
 * Hech qanday kitob yoki tahrir yo'qolmaydi!
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object[]>} — kitoblar massivi
 */
export async function getBooks(forceRefresh = false) {
  if (!forceRefresh && _booksCache && _booksCache.length > 0) {
    return _booksCache;
  }

  const bookMap = new Map();
  const deletedIds = _getDeletedBookIds().map(String);

  // 1. Asosiy zaxira: data.js dagi barcha kitoblarni yuklaymiz
  (localData.books ?? []).forEach(b => {
    if (!b || (!b.id && !b.title)) return;
    const idStr = String(b.id || _slugify(b.title));
    if (!deletedIds.includes(idStr)) {
      const cover = b.cover_url || b.coverImage || (typeof b.cover === 'string' && b.cover.startsWith('http') ? b.cover : '') || `https://picsum.photos/seed/${idStr}/300/400`;
      bookMap.set(idStr, {
        ...b,
        id: idStr,
        category: b.category || b.genre || 'Adabiyot',
        genre: b.genre || b.category || 'Badiiy',
        cover_url: cover,
        coverImage: cover,
        cover: cover,
      });
    }
  });

  // 2. Supabase dan yangi yoki yangilangan kitoblarni birlashtiramiz
  try {
    const { data, error } = await runQuery(
      supabase
        .from('books')
        .select('*')
        .order('title', { ascending: true })
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      data.forEach(sb => {
        if (!sb || (!sb.id && !sb.title)) return;
        const idStr = String(sb.id || _slugify(sb.title));
        if (!deletedIds.includes(idStr)) {
          // Find matching key by ID or title slug
          let targetKey = idStr;
          if (!bookMap.has(targetKey)) {
            for (const [key, existing] of bookMap.entries()) {
              if (existing && _slugify(existing.title) === _slugify(sb.title)) {
                targetKey = key;
                break;
              }
            }
          }

          const existing = bookMap.get(targetKey) || {};
          const cover = sb.cover_url || sb.coverImage || sb.cover || existing.cover || existing.cover_url || '';
          bookMap.set(targetKey, {
            ...existing,
            ...sb,
            id: targetKey,
            category: sb.category || sb.genre || existing.category || existing.genre || 'Adabiyot',
            genre: sb.genre || sb.category || existing.genre || existing.category || 'Badiiy',
            cover_url: cover,
            coverImage: cover,
            cover: cover,
          });
        }
      });
    }
  } catch (err) {
    console.warn('[db] getBooks Supabase fallback:', err);
  }

  // 3. Foydalanuvchi/Admin tomonidan kiritilgan yoki tahrirlangan kitoblarni ustiga yozamiz
  const customBooks = _getLocalCustomBooks();
  customBooks.forEach(cb => {
    if (!cb || (!cb.id && !cb.title)) return;
    const idStr = String(cb.id || _slugify(cb.title));
    if (deletedIds.includes(idStr)) return;

    // Find matching key by ID or slugified title
    let targetKey = idStr;
    if (!bookMap.has(targetKey)) {
      for (const [key, existing] of bookMap.entries()) {
        if (existing && (_slugify(existing.title) === _slugify(cb.title) || (cb.slug && _slugify(existing.slug) === _slugify(cb.slug)))) {
          targetKey = key;
          break;
        }
      }
    }

    const existing = bookMap.get(targetKey) || {};
    const cover = cb.cover_url || cb.coverImage || cb.cover || existing.cover || existing.cover_url || '';
    bookMap.set(targetKey, {
      ...existing,
      ...cb,
      id: targetKey,
      title: cb.title || existing.title,
      author: cb.author || existing.author,
      category: cb.category || cb.genre || existing.category || existing.genre || 'Adabiyot',
      genre: cb.genre || cb.category || existing.genre || existing.category || 'Badiiy',
      cover_url: cover,
      coverImage: cover,
      cover: cover,
    });
  });

  _booksCache = Array.from(bookMap.values());
  return _booksCache;
}

function _slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['`’"']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _formatQuestion(q) {
  if (!q) return null;
  const opts = Array.isArray(q.options) ? q.options : (Array.isArray(q.variants) ? q.variants : []);

  let correctAns = q.correct_answer ?? q.correctAnswer ?? q.answer;
  if (typeof correctAns === 'number' && opts[correctAns] !== undefined) {
    correctAns = opts[correctAns];
  }

  return {
    id: q.id,
    book_id: q.book_id ?? q.bookId,
    question: q.question ?? q.text ?? '',
    options: opts,
    correct_answer: String(correctAns ?? ''),
    explanation: q.explanation || '',
  };
}

/**
 * Bitta kitobni ID yoki slug bo'yicha qaytaradi.
 *
 * @param {string|number} bookId
 * @returns {Promise<object|null>}
 */
export async function getBookById(bookId) {
  if (!bookId) return null;

  const all = await getBooks();
  const strId = String(bookId);
  const slug  = _slugify(bookId);

  return all.find(b =>
    String(b.id) === strId ||
    _slugify(b.title) === strId ||
    _slugify(b.title) === slug ||
    (b.slug && (_slugify(b.slug) === strId || _slugify(b.slug) === slug))
  ) ?? null;
}

/**
 * Yangi kitob qo'shadi yoki mavjud kitobni yangilaydi (Supabase + localStorage).
 */
export async function saveBook(data, id = null) {
  const isEdit = Boolean(id);
  const targetId = String(id || data.id || _slugify(data.title) || ('book-' + Date.now()));

  // Mavjud kitob ma'lumotlarini olamiz
  const existingBook = await getBookById(targetId);

  const coverVal = data.cover_url || data.cover || data.coverImage || existingBook?.cover || '';
  const fullBook = {
    ...(existingBook || {}),
    ...data,
    id: targetId,
    title: String(data.title || existingBook?.title || '').trim(),
    author: String(data.author || existingBook?.author || '').trim(),
    category: data.category || data.genre || existingBook?.category || 'Badiiy',
    genre: data.genre || data.category || existingBook?.genre || 'Badiiy',
    year: data.year ? parseInt(data.year, 10) : (existingBook?.year || null),
    pages: data.pages ? parseInt(data.pages, 10) : (existingBook?.pages || null),
    cover: coverVal,
    cover_url: coverVal,
    coverImage: coverVal,
    description: String(data.description !== undefined ? data.description : (existingBook?.description || '')).trim(),
    questionCount: data.questionCount || existingBook?.questionCount || 10,
    updated_at: new Date().toISOString(),
  };

  // 1. LocalStorage ga barcha mos kalitlar bo'yicha saqlash
  const custom = _getLocalCustomBooks();
  const idx = custom.findIndex(b => String(b.id) === targetId || _slugify(b.title) === _slugify(fullBook.title));
  if (idx >= 0) {
    custom[idx] = { ...custom[idx], ...fullBook };
  } else {
    custom.push(fullBook);
  }
  localStorage.setItem('kitobchi_books_store', JSON.stringify(custom));
  localStorage.setItem('custom_books', JSON.stringify(custom));

  const deleted = _getDeletedBookIds().filter(d => String(d) !== targetId && String(d) !== _slugify(fullBook.title));
  localStorage.setItem('kitobchi_deleted_books', JSON.stringify(deleted));

  // 2. Keshni tozalash va hodisa jo'natish
  _booksCache = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitobchi_books_updated', { detail: fullBook }));
  }

  // 3. Supabase ga saqlashga urinish (xatosiz fallback)
  try {
    const sbPayload = {
      id:          targetId,
      title:       fullBook.title,
      author:      fullBook.author,
      genre:       fullBook.genre,
      year:        fullBook.year,
      cover:       fullBook.cover,
      coverImage:  fullBook.coverImage,
      description: fullBook.description,
    };

    if (isEdit) {
      await supabase.from('books').update(sbPayload).eq('id', targetId);
    } else {
      await supabase.from('books').insert(sbPayload);
    }
  } catch (err) {
    console.warn('[db] Supabase save book fallback to localStorage:', err);
  }

  return { success: true, book: fullBook };
}

/**
 * Kitobni o'chiradi (Supabase + localStorage).
 */
export async function deleteBook(id) {
  const strId = String(id);

  // 1. LocalStorage yangilash
  const custom = _getLocalCustomBooks().filter(b => String(b.id) !== strId && _slugify(b.title) !== strId);
  localStorage.setItem('kitobchi_books_store', JSON.stringify(custom));
  localStorage.setItem('custom_books', JSON.stringify(custom));

  const deleted = _getDeletedBookIds();
  if (!deleted.includes(strId)) {
    deleted.push(strId);
    localStorage.setItem('kitobchi_deleted_books', JSON.stringify(deleted));
  }

  // 2. Keshni tozalash va hodisa jo'natish
  _booksCache = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitobchi_books_updated', { detail: { id: strId, deleted: true } }));
  }

  // 3. Supabase dan o'chirish
  try {
    await supabase.from('books').delete().eq('id', strId);
  } catch (err) {
    console.warn('[db] Supabase delete book fallback:', err);
  }

  return { success: true };
}

// ============================================================
// SAVOLLAR (HYBRID PERSISTENCE)
// ============================================================

/**
 * Berilgan kitob uchun savollarni qaytaradi.
 *
 * @param {string|number} bookId
 * @returns {Promise<object[]>} — savollar massivi
 */
export async function getQuestions(bookId) {
  if (!bookId) return [];

  const targetBook = await getBookById(bookId);
  const targetId   = targetBook ? String(targetBook.id) : String(bookId);
  const targetSlug = _slugify(targetBook ? targetBook.title : bookId);

  let dbQuestions = [];
  try {
    const isNumeric = /^\d+$/.test(targetId);
    const query = isNumeric
      ? supabase.from('questions').select('*').eq('book_id', parseInt(targetId, 10))
      : supabase.from('questions').select('*').or(`book_id.eq.${targetId},bookId.eq.${targetId}`);

    const { data, error } = await runQuery(query);
    if (!error && Array.isArray(data) && data.length > 0) {
      dbQuestions = data.map(_formatQuestion).filter(Boolean);
    }
  } catch { /* ignore */ }

  let localList = [];
  if (Array.isArray(localData.questions)) {
    localList = localData.questions;
  } else if (typeof localData.questions === 'object' && localData.questions !== null) {
    if (Array.isArray(localData.questions[targetId])) {
      localList = localData.questions[targetId];
    } else if (Array.isArray(localData.questions[bookId])) {
      localList = localData.questions[bookId];
    } else {
      localList = Object.values(localData.questions).flat();
    }
  }

  const staticMatched = localList.filter(q => {
    if (!q) return false;
    const qBookId = String(q.bookId || q.book_id || '');
    if (qBookId === String(bookId) || qBookId === targetId) return true;
    if (targetBook && _slugify(qBookId) === _slugify(targetBook.id)) return true;
    if (targetBook && _slugify(qBookId) === targetSlug) return true;
    return false;
  }).map(_formatQuestion).filter(Boolean);

  const customQs = _getLocalCustomQuestions();
  const deletedQIds = _getDeletedQuestionIds().map(String);

  const qMap = new Map();

  // 1. Zaxira savollar
  staticMatched.forEach(q => {
    const qId = String(q.id);
    if (!deletedQIds.includes(qId)) {
      qMap.set(qId, { ...q });
    }
  });

  // 2. Supabase savollari
  dbQuestions.forEach(q => {
    const qId = String(q.id);
    if (!deletedQIds.includes(qId)) {
      const existing = qMap.get(qId) || {};
      qMap.set(qId, { ...existing, ...q });
    }
  });

  // 3. Custom / yangi savollar
  customQs.forEach(cq => {
    const qBookId = String(cq.book_id || cq.bookId || '');
    if (qBookId === String(bookId) || qBookId === targetId || (targetBook && _slugify(qBookId) === targetSlug)) {
      const qId = String(cq.id);
      if (!deletedQIds.includes(qId)) {
        const existing = qMap.get(qId) || {};
        qMap.set(qId, { ...existing, ..._formatQuestion(cq) });
      }
    }
  });

  return Array.from(qMap.values());
}

/**
 * Savol qo'shadi yoki tahrirlaydi (Supabase + localStorage).
 */
export async function saveQuestion(data, id = null) {
  const isEdit = Boolean(id);
  const targetId = id || (data.id || String(Date.now()));
  const fullQ = {
    id: targetId,
    ...data,
    updated_at: new Date().toISOString(),
  };

  const custom = _getLocalCustomQuestions();
  const idx = custom.findIndex(q => String(q.id) === String(targetId));
  if (idx >= 0) {
    custom[idx] = { ...custom[idx], ...fullQ };
  } else {
    custom.push(fullQ);
  }
  localStorage.setItem('kitobchi_custom_questions', JSON.stringify(custom));

  const deleted = _getDeletedQuestionIds().filter(d => String(d) !== String(targetId));
  localStorage.setItem('kitobchi_deleted_questions', JSON.stringify(deleted));

  // Supabase ga urinish
  try {
    const sbPayload = {
      book_id:        parseInt(data.book_id, 10) || data.book_id,
      question:       data.question,
      options:        data.options,
      correct_answer: data.correct_answer,
      explanation:    data.explanation || '',
    };

    const numericId = /^\d+$/.test(String(targetId)) ? parseInt(targetId, 10) : null;
    if (numericId !== null) {
      if (isEdit) {
        await supabase.from('questions').update(sbPayload).eq('id', numericId);
      } else {
        await supabase.from('questions').insert({ id: numericId, ...sbPayload });
      }
    } else {
      if (isEdit) {
        await supabase.from('questions').update(sbPayload).eq('id', targetId);
      } else {
        await supabase.from('questions').insert(sbPayload);
      }
    }
  } catch (err) {
    console.warn('[db] Supabase save question fallback:', err);
  }

  return { success: true, question: fullQ };
}

/**
 * Savolni o'chiradi (Supabase + localStorage).
 */
export async function deleteQuestion(id) {
  const strId = String(id);

  const custom = _getLocalCustomQuestions().filter(q => String(q.id) !== strId);
  localStorage.setItem('kitobchi_custom_questions', JSON.stringify(custom));

  const deleted = _getDeletedQuestionIds();
  if (!deleted.includes(strId)) {
    deleted.push(strId);
    localStorage.setItem('kitobchi_deleted_questions', JSON.stringify(deleted));
  }

  try {
    const numericId = /^\d+$/.test(strId) ? parseInt(strId, 10) : null;
    if (numericId !== null) {
      await supabase.from('questions').delete().eq('id', numericId);
    } else {
      await supabase.from('questions').delete().eq('id', strId);
    }
  } catch (err) {
    console.warn('[db] Supabase delete question fallback:', err);
  }

  return { success: true };
}

// ============================================================
// NATIJALAR (QUIZ RESULTS)
// ============================================================

/**
 * Test natijasini saqlaydi.
 *
 * @param {object} result
 * @param {string|number} result.bookId     — kitob ID
 * @param {number}        result.score      — to'plangan ball
 * @param {number}        result.total      — jami savollar
 * @param {number}        result.percentage — foiz
 * @param {number}        result.penalty    — jarima (anti-cheat)
 * @param {string}        result.date       — "YYYY-MM-DD" formatida
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveQuizResult(result) {
  // Local storage ga saqlash (Offline / 404 fallback)
  try {
    const raw = localStorage.getItem('user_quiz_results');
    const existing = raw ? JSON.parse(raw) : [];
    existing.unshift(result);
    localStorage.setItem('user_quiz_results', JSON.stringify(existing.slice(0, 20)));
    localStorage.setItem('last_quiz_result', JSON.stringify(result));
  } catch { /* ignore */ }

  try {
    const user = getCurrentUser();
    if (!user) return { success: false, error: 'Tizimga kirmagansiz.' };

    const book = _findLocalBook(result.bookId);
    const numericBookId = (book && /^\d+$/.test(String(book.id)))
      ? parseInt(book.id, 10)
      : (/^\d+$/.test(String(result.bookId)) ? parseInt(result.bookId, 10) : null);

    const payload = {
      user_id:    user.id,
      score:      result.score,
      total:      result.total,
      percentage: result.percentage,
      penalty:    result.penalty ?? 0,
      date:       result.date,
      created_at: new Date().toISOString(),
    };

    if (numericBookId !== null) {
      payload.book_id = numericBookId;
    }

    const { error } = await runQuery(
      supabase.from('quiz_results').insert(payload)
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

let _quizResultsTableMissing = false;

/**
 * Foydalanuvchining barcha test natijalarini qaytaradi.
 *
 * @param {string} [userId] — ko'rsatilmasa joriy foydalanuvchi
 * @returns {Promise<object[]>}
 */
export async function getUserResults(userId) {
  let dbData = [];
  try {
    const uid = userId ?? getCurrentUser()?.id;
    if (uid) {
      const { data, error } = await runQuery(
        supabase
          .from('quiz_results')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
      );

      if (!error && Array.isArray(data)) {
        dbData = data;
      }
    }
  } catch { /* ignore */ }

  // DB natijalarini kitoblar bilan biriktirish
  if (dbData.length > 0) {
    try {
      const books = await getBooks();
      return dbData.map(r => {
        const b = books.find(x => String(x.id) === String(r.book_id));
        return {
          ...r,
          books: b ? { title: b.title, author: b.author } : null
        };
      });
    } catch {
      return dbData;
    }
  }

  // Local storage fallback (400/404 so'rovisiz va xatosiz)
  try {
    const raw = localStorage.getItem('user_quiz_results');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        const books = await getBooks();
        return list.map(r => {
          const b = books.find(x => String(x.id) === String(r.bookId || r.book_id));
          return {
            ...r,
            books: b ? { title: b.title, author: b.author } : null
          };
        });
      }
    }
    const last = localStorage.getItem('last_quiz_result');
    if (last) {
      const single = JSON.parse(last);
      if (single && single.percentage !== undefined) {
        const books = await getBooks();
        const b = books.find(x => String(x.id) === String(single.bookId || single.book_id));
        return [{
          ...single,
          books: b ? { title: b.title, author: b.author } : null
        }];
      }
    }
  } catch { /* ignore */ }

  return [];
}

const SAMPLE_LEADERBOARD = [
  { id: 'sample-1', full_name: 'Alisher Rahimov',   username: 'alisher_r', score: 1450, streak: 12, avatar_url: '' },
  { id: 'sample-2', full_name: 'Zilola Saidova',    username: 'zilola_s',  score: 1280, streak: 9,  avatar_url: '' },
  { id: 'sample-3', full_name: 'Javohir Karimov',   username: 'javohir_k', score: 1150, streak: 7,  avatar_url: '' },
  { id: 'sample-4', full_name: 'Shahnoza Tursunova',username: 'shahnoza_t',score: 980,  streak: 5,  avatar_url: '' },
  { id: 'sample-5', full_name: 'Bobur Mirzaev',     username: 'bobur_m',   score: 840,  streak: 4,  avatar_url: '' },
  { id: 'sample-6', full_name: 'Madina Umarova',    username: 'madina_u',  score: 720,  streak: 3,  avatar_url: '' },
  { id: 'sample-7', full_name: 'Sardor Hakimov',    username: 'sardor_h',  score: 610,  streak: 2,  avatar_url: '' },
];

/**
 * Eng yuqori ballli foydalanuvchilarni qaytaradi.
 *
 * @param {number} [limit=50] — nechta foydalanuvchi
 * @returns {Promise<object[]>}
 */
export async function getLeaderboard(limit = 50) {
  let list = [];

  try {
    const { data, error } = await runQuery(
      supabase
        .from('profiles')
        .select('*')
        .limit(limit)
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      list = data;
    }
  } catch { /* ignore */ }

  // Agar Supabase dan kam yoki 0 ta ishtirokchi kelsa — namunaviy ishtirokchilarni qo'shamiz
  if (list.length === 0) {
    list = [...SAMPLE_LEADERBOARD];
  }

  // Joriy foydalanuvchini ro'yxatda bor-yo'qligini tekshiramiz va qo'shamiz
  const cur = getCurrentUser();
  if (cur && cur.id) {
    const exists = list.some(u => u.id === cur.id || (u.username && u.username === cur.username));
    if (!exists) {
      list.push({
        id: cur.id,
        full_name: cur.fullName || cur.username,
        username: cur.username,
        score: cur.score || 0,
        streak: cur.streak || 0,
        avatar_url: cur.avatar || '',
      });
    } else {
      const item = list.find(u => u.id === cur.id || u.username === cur.username);
      if (item && ((cur.score || 0) > (item.score || 0))) {
        item.score = cur.score;
        item.streak = cur.streak;
      }
    }
  }

  // Ball bo'yicha kamayish tartibida saralaymiz
  list.sort((a, b) => (b.score || 0) - (a.score || 0));

  return list.slice(0, limit);
}

// ============================================================
// STREAK YANGILASH
// ============================================================

/**
 * Streak va ballni yangilaydi (test tugaganidan keyin chaqiriladi).
 *
 * Mantiq:
 *   - lastQuizDate kecha bo'lsa → streak + 1
 *   - lastQuizDate bundan oldin bo'lsa → streak = 1
 *   - Bugun allaqachon yechilgan bo'lsa → streak o'zgarmaydi
 *
 * @param {number} earnedScore  — bu testdan olingan ball
 * @param {string} todayDate    — "YYYY-MM-DD" formatida (formatDate() dan)
 * @returns {Promise<{success: boolean, newStreak: number, newScore: number, error?: string}>}
 */
export async function updateStreakAndScore(earnedScore, todayDate) {
  try {
    const user = getCurrentUser();
    if (!user) return { success: false, newStreak: 0, newScore: 0, error: 'Tizimga kirmagansiz.' };

    const lastDate   = user.lastQuizDate ?? null;
    const oldStreak  = user.streak       ?? 0;
    const oldScore   = user.score        ?? 0;

    // Kecha sanasini hisoblash
    const todayObj     = new Date(todayDate);
    const yesterdayObj = new Date(todayObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

    // Streak mantiq
    let newStreak;
    if (lastDate === todayDate) {
      // Bugun allaqachon yechilgan — streak o'zgarmaydi
      newStreak = oldStreak;
    } else if (lastDate === yesterdayStr) {
      // Ketma-ket kun — streak ortadi
      newStreak = oldStreak + 1;
    } else {
      // Ko'p kun o'tib ketgan — streak nollanadi
      newStreak = 1;
    }

    const newScore = oldScore + earnedScore;

    // Supabase profiles yangilash
    const { error } = await runQuery(
      supabase
        .from('profiles')
        .update({
          score:          newScore,
          streak:         newStreak,
          last_quiz_date: todayDate,
        })
        .eq('id', user.id)
    );

    if (error) {
      console.error('[db] updateStreakAndScore xatosi:', error.message);
      return { success: false, newStreak: oldStreak, newScore: oldScore, error: error.message };
    }

    // localStorage ni ham yangilaymiz
    const { updateProfile } = await import('./auth.js');
    await updateProfile({ score: newScore, streak: newStreak, lastQuizDate: todayDate });

    return { success: true, newStreak, newScore };

  } catch (err) {
    console.error('[db] updateStreakAndScore xatosi:', err);
    return { success: false, newStreak: 0, newScore: 0, error: err.message };
  }
}

// ============================================================
// PERSONAJLAR (CHARACTERS CRUD)
// ============================================================

/**
 * Barcha personajlarni qaytaradi (Supabase + localData + localStorage).
 * @returns {Promise<object[]>}
 */
export async function getCharacters() {
  let list = [];

  // 1. Supabase dan olish
  try {
    const { data, error } = await runQuery(
      supabase.from('characters').select('*, books(title)').order('created_at', { ascending: false })
    );
    if (!error && Array.isArray(data) && data.length > 0) {
      list = data.map(c => ({
        id: c.id,
        name: c.name,
        book_id: c.book_id ?? c.bookId,
        bookTitle: c.books?.title ?? c.bookTitle ?? '',
        avatar: c.avatar || '🎭',
        avatarImage: c.avatarImage || c.avatar_image || c.image || null,
        color: c.color || 'var(--color-primary)',
        description: c.description || '',
      }));
    }
  } catch { /* ignore */ }

  // 2. localData zaxirasi
  const staticChars = (localData.characters || []).map(c => ({
    id: c.id,
    name: c.name,
    book_id: c.bookId ?? c.book_id ?? '',
    bookTitle: c.bookTitle ?? '',
    avatar: c.avatar || '🎭',
    avatarImage: c.avatarImage || c.image || null,
    color: c.color || 'var(--color-primary)',
    description: c.description || '',
  }));

  // 3. LocalStorage dan olish
  let customChars = [];
  try {
    const raw = localStorage.getItem('kitobchi_custom_characters');
    if (raw) customChars = JSON.parse(raw);
  } catch { /* ignore */ }

  // Birlashtirish
  const charMap = new Map();
  staticChars.forEach(c => charMap.set(String(c.id), c));
  list.forEach(c => charMap.set(String(c.id), { ...(charMap.get(String(c.id)) || {}), ...c }));
  customChars.forEach(c => charMap.set(String(c.id), { ...(charMap.get(String(c.id)) || {}), ...c }));

  return Array.from(charMap.values());
}

/**
 * Personaj qo'shadi yoki yangilaydi (Supabase + localStorage).
 */
export async function saveCharacter(data, id = null) {
  const targetId = id || data.id || ('char-' + Date.now());
  const fullChar = {
    ...data,
    id: targetId,
    avatar: data.avatar || '🎭',
    avatarImage: data.avatarImage || null,
    updated_at: new Date().toISOString(),
  };

  // LocalStorage
  let custom = [];
  try {
    const raw = localStorage.getItem('kitobchi_custom_characters');
    if (raw) custom = JSON.parse(raw);
  } catch { /* ignore */ }

  const idx = custom.findIndex(c => String(c.id) === String(targetId));
  if (idx >= 0) {
    custom[idx] = { ...custom[idx], ...fullChar };
  } else {
    custom.unshift(fullChar);
  }
  localStorage.setItem('kitobchi_custom_characters', JSON.stringify(custom));

  // Supabase
  try {
    const sbPayload = {
      id: targetId,
      name: fullChar.name,
      book_id: fullChar.book_id,
      description: fullChar.description || '',
      avatar: fullChar.avatar || '🎭',
      avatar_image: fullChar.avatarImage || null,
    };
    if (id) {
      await supabase.from('characters').update(sbPayload).eq('id', targetId);
    } else {
      await supabase.from('characters').insert(sbPayload);
    }
  } catch (err) {
    console.warn('[db] saveCharacter Supabase fallback:', err);
  }

  return { success: true, character: fullChar };
}

/**
 * Personajni o'chiradi.
 */
export async function deleteCharacter(id) {
  const strId = String(id);
  let custom = [];
  try {
    const raw = localStorage.getItem('kitobchi_custom_characters');
    if (raw) custom = JSON.parse(raw);
  } catch { /* ignore */ }
  custom = custom.filter(c => String(c.id) !== strId);
  localStorage.setItem('kitobchi_custom_characters', JSON.stringify(custom));

  try {
    await supabase.from('characters').delete().eq('id', strId);
  } catch (err) {
    console.warn('[db] deleteCharacter Supabase fallback:', err);
  }

  return { success: true };
}
