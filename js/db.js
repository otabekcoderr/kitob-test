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
// SUPABASE TARMOQ STATUSI VA CIRCUIT BREAKER
// ============================================================
let _supabaseFailCount = 0;
let _supabasePauseUntil = 0;

/**
 * Supabase tarmog'i holatini tekshiradi.
 * Agar ketma-ket tarmoq uzilishi / reset yuz bergan bo'lsa,
 * brauzerni qotirmaslik va konsolga qizil xatolar chiqarmaslik uchun
 * so'rovlarni vaqtincha to'xtatadi.
 */
export function isSupabaseOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (Date.now() < _supabasePauseUntil) return false;
  return true;
}

function _recordSupabaseSuccess() {
  _supabaseFailCount = 0;
  _supabasePauseUntil = 0;
}

function _recordSupabaseFailure(err) {
  _supabaseFailCount++;
  // 30 soniyadan 90 soniyagacha avtonom kesh rejimiga o'tish
  const pauseMs = Math.min(30_000 * Math.pow(1.5, _supabaseFailCount - 1), 90_000);
  _supabasePauseUntil = Date.now() + pauseMs;
  console.warn(`[db] Supabase tarmog'i vaqtincha uzilgan (${err?.message || 'aloqa yo\'q'}). Avtonom kesh rejimiga o'tildi (${Math.round(pauseMs / 1000)}s).`);
}

// ============================================================
// KONSTANTALAR
// ============================================================

/** So'rov timeout vaqti — 2.5 soniya (foydalanuvchi hech qachon qotib qolmasligi uchun) */
const TIMEOUT = 2_500;

// ============================================================
// TEZKOR IN-MEMORY KESH (SPEED & PERFORMANCE — 0ms LATENCY)
// ============================================================
let _booksCache = null;
const _questionsCache = new Map();

let _leaderboardCache = null;
let _leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 45 * 1000; // 45 soniya

let _charactersCache = null;

const _userResultsCache = new Map();
const _userResultsTime = new Map();
const USER_RESULTS_CACHE_TTL = 30 * 1000; // 30 soniya

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
 * Promise ga timeout qo'shadi va bekor bo'lganda AbortController orqali HTTP/2 oqimini toza to'xtatadi.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms=TIMEOUT]
 * @param {AbortController} [controller=null]
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms = TIMEOUT, controller = null) {
  let timerId;
  const timer = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      if (controller) {
        try { controller.abort(); } catch {}
      }
      reject(new Error('timeout'));
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timerId)),
    timer
  ]);
}

/**
 * Supabase so'rovini Circuit Breaker, timeout va AbortSignal bilan bajaradi.
 * Tarmoq uzilganda brauzer konsolini qizil xatolar bilan to'ldirmaydi va UI ni qotirmaydi.
 *
 * @param {object} query — Supabase query builder
 * @param {number} [ms=TIMEOUT]
 * @returns {Promise<{data: any, error: any}>}
 */
async function runQuery(query, ms = TIMEOUT) {
  if (!isSupabaseOnline()) {
    return { data: null, error: new Error('supabase_circuit_open') };
  }

  const controller = new AbortController();
  try {
    let target = query;
    if (target && typeof target.abortSignal === 'function') {
      target = target.abortSignal(controller.signal);
    }
    const res = await withTimeout(target, ms, controller);
    _recordSupabaseSuccess();
    return res;
  } catch (err) {
    _recordSupabaseFailure(err);
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
  _leaderboardCache = null;
  _leaderboardCacheTime = 0;
  _charactersCache = null;
  _userResultsCache.clear();
  _userResultsTime.clear();
}

function _initLocalBooks() {
  const bookMap = new Map();
  const deletedIds = _getDeletedBookIds().map(String);

  // 1. data.js dagi barcha tayyor kitoblar
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

  // 2. Foydalanuvchi/Admin tomonidan lokal saqlangan kitoblar
  const customBooks = _getLocalCustomBooks();
  customBooks.forEach(cb => {
    if (!cb || (!cb.id && !cb.title)) return;
    const idStr = String(cb.id || _slugify(cb.title));
    if (deletedIds.includes(idStr)) return;

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

  return Array.from(bookMap.values());
}

// Dastlabki yuklanishdayoq keshni darhol 0ms da tayyorlaymiz!
_booksCache = _initLocalBooks();

let _syncBooksPromise = null;

/**
 * Supabase dan kitoblarni orqa fonda asinxron tekshiradi.
 * UI kutmaydi, sahifa qotmaydi.
 */
async function _syncBooksInBackground() {
  if (_syncBooksPromise) return _syncBooksPromise;
  if (!isSupabaseOnline()) return _booksCache;

  _syncBooksPromise = (async () => {
    try {
      const { data, error } = await runQuery(
        supabase
          .from('books')
          .select('id, title, author, year, genre, difficulty, description, coverBg, coverTitleColor, coverImage, questionCount')
          .order('title', { ascending: true }),
        2500
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const deletedIds = _getDeletedBookIds().map(String);
        const bookMap = new Map();
        (_booksCache || _initLocalBooks()).forEach(b => bookMap.set(String(b.id), b));

        let hasChanges = false;
        data.forEach(sb => {
          if (!sb || (!sb.id && !sb.title)) return;
          const idStr = String(sb.id || _slugify(sb.title));
          if (!deletedIds.includes(idStr)) {
            let targetKey = idStr;
            if (!bookMap.has(targetKey)) {
              for (const [key, existing] of bookMap.entries()) {
                if (existing && _slugify(existing.title) === _slugify(sb.title)) {
                  targetKey = key;
                  break;
                }
              }
            }

            const existing = bookMap.get(targetKey);
            if (!existing) {
              hasChanges = true;
              const cover = sb.coverImage || sb.cover || `https://picsum.photos/seed/${targetKey}/300/400`;
              bookMap.set(targetKey, {
                id: targetKey,
                category: sb.category || sb.genre || 'Adabiyot',
                genre: sb.genre || sb.category || 'Badiiy',
                cover_url: cover,
                coverImage: cover,
                cover: cover,
                ...sb
              });
            }
          }
        });

        if (hasChanges) {
          _booksCache = Array.from(bookMap.values());
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kitobchi_books_updated'));
          }
        }
      }
    } catch { /* ignore */ }
    finally {
      _syncBooksPromise = null;
    }
    return _booksCache;
  })();

  return _syncBooksPromise;
}

/**
 * Barcha kitoblarni qaytaradi (Local-First: 0ms instant render).
 * Hech qachon tarmoq kutib sahifani qotirmaydi.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object[]>} — kitoblar massivi
 */
export async function getBooks(forceRefresh = false) {
  if (!_booksCache || _booksCache.length === 0) {
    _booksCache = _initLocalBooks();
  }

  // 1. Oddiy holatda — darhol 0ms keshdagi kitoblarni qaytaramiz!
  if (!forceRefresh) {
    _syncBooksInBackground(); // Orqa fonda foniy tekshirish
    return _booksCache;
  }

  // 2. Majburiy yangilash talab qilinganda — foniy sinxronlashni kutamiz
  await _syncBooksInBackground();
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
function _getLocalQuestionsForBook(bookId) {
  if (!bookId) return [];
  const targetId = String(bookId);
  const targetSlug = _slugify(bookId);

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
    if (_slugify(qBookId) === targetId || _slugify(qBookId) === targetSlug) return true;
    return false;
  }).map(_formatQuestion).filter(Boolean);

  const customQs = _getLocalCustomQuestions();
  const deletedQIds = _getDeletedQuestionIds().map(String);

  const qMap = new Map();
  staticMatched.forEach(q => {
    const qId = String(q.id);
    if (!deletedQIds.includes(qId)) {
      qMap.set(qId, { ...q });
    }
  });

  customQs.forEach(cq => {
    const qBookId = String(cq.book_id || cq.bookId || '');
    if (qBookId === String(bookId) || qBookId === targetId || _slugify(qBookId) === targetSlug) {
      const qId = String(cq.id);
      if (!deletedQIds.includes(qId)) {
        const existing = qMap.get(qId) || {};
        qMap.set(qId, { ...existing, ..._formatQuestion(cq) });
      }
    }
  });

  return Array.from(qMap.values());
}

async function _syncQuestionsInBackground(bookId, localQs = []) {
  if (!isSupabaseOnline()) return;
  try {
    const targetId = String(bookId);
    const targetSlug = _slugify(bookId);
    let query = supabase.from('questions').select('*');
    if (targetSlug && targetSlug !== targetId) {
      query = query.or(`bookId.eq.${targetId},bookId.eq.${targetSlug}`);
    } else {
      query = query.eq('bookId', targetId);
    }
    const { data, error } = await runQuery(query, 2500);
    if (!error && Array.isArray(data) && data.length > 0) {
      const qMap = new Map();
      localQs.forEach(q => qMap.set(String(q.id), q));
      let hasChanges = false;
      data.forEach(item => {
        const formatted = _formatQuestion(item);
        if (formatted) {
          const strId = String(formatted.id);
          if (!qMap.has(strId)) hasChanges = true;
          qMap.set(strId, { ...(qMap.get(strId) || {}), ...formatted });
        }
      });
      if (hasChanges) {
        const merged = Array.from(qMap.values());
        _questionsCache.set(targetId, merged);
        if (targetSlug) _questionsCache.set(targetSlug, merged);
      }
    }
  } catch { /* ignore */ }
}

/**
 * Berilgan kitob uchun savollarni qaytaradi (Local-First: 0ms instant render).
 * data.js dagi 600 ta savol darhol ochiladi, tarmoq tufayli sahifa qotmaydi.
 *
 * @param {string|number} bookId
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object[]>} — savollar massivi
 */
export async function getQuestions(bookId, forceRefresh = false) {
  if (!bookId) return [];

  const targetId = String(bookId);
  const targetSlug = _slugify(bookId);

  // 1. Keshda bo'lsa — zudlik bilan 0ms da qaytaramiz
  if (!forceRefresh && _questionsCache.has(targetId)) {
    return _questionsCache.get(targetId);
  }
  if (!forceRefresh && targetSlug && _questionsCache.has(targetSlug)) {
    return _questionsCache.get(targetSlug);
  }

  // 2. Lokal savollarni (data.js va localStorage) zudlik bilan olamiz (0ms)
  const localQs = _getLocalQuestionsForBook(bookId);

  if (localQs.length > 0) {
    _questionsCache.set(targetId, localQs);
    if (targetSlug) _questionsCache.set(targetSlug, localQs);

    // Agar forceRefresh bo'lmasa — darhol 0ms da qaytaramiz, foniy tekshiruvni orqa fonda qilamiz!
    if (!forceRefresh) {
      _syncQuestionsInBackground(bookId, localQs).catch(() => {});
      return localQs;
    }
  }

  // 3. Agar lokal topilmasa yoki forceRefresh bo'lsa — Supabase dan so'raymiz
  let dbQuestions = [];
  try {
    const searchId = targetSlug || targetId;
    let query = supabase.from('questions').select('*');
    if (targetSlug && targetSlug !== targetId) {
      query = query.or(`bookId.eq.${targetId},bookId.eq.${targetSlug}`);
    } else {
      query = query.eq('bookId', targetId);
    }
    const { data, error } = await runQuery(query, 2500);
    if (!error && Array.isArray(data) && data.length > 0) {
      dbQuestions = data.map(_formatQuestion).filter(Boolean);
    }
  } catch { /* ignore */ }

  const qMap = new Map();
  localQs.forEach(q => qMap.set(String(q.id), q));
  dbQuestions.forEach(q => qMap.set(String(q.id), { ...(qMap.get(String(q.id)) || {}), ...q }));

  const finalQuestions = Array.from(qMap.values());
  _questionsCache.set(targetId, finalQuestions);
  if (targetSlug) _questionsCache.set(targetSlug, finalQuestions);

  return finalQuestions;
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
      bookId:         String(data.bookId || data.book_id || fullQ.bookId || fullQ.book_id || ''),
      question:       data.question,
      options:        data.options,
      correctAnswer:  data.correctAnswer !== undefined ? data.correctAnswer : (data.correct_answer ?? 0),
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

  _questionsCache.clear();
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

  _questionsCache.clear();
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
  const user = getCurrentUser();
  const uid  = user?.id || 'guest';

  // Local storage ga saqlash (Offline / 404 fallback)
  try {
    // Foydalanuvchining shaxsiy tarixi
    const userKey = 'user_quiz_results_' + uid;
    const rawUser = localStorage.getItem(userKey);
    const existingUser = rawUser ? JSON.parse(rawUser) : [];
    existingUser.unshift(result);
    localStorage.setItem(userKey, JSON.stringify(existingUser.slice(0, 30)));

    // Umumiy zaxira tarixi
    const raw = localStorage.getItem('user_quiz_results');
    const existing = raw ? JSON.parse(raw) : [];
    existing.unshift(result);
    localStorage.setItem('user_quiz_results', JSON.stringify(existing.slice(0, 30)));
    localStorage.setItem('last_quiz_result', JSON.stringify(result));
  } catch { /* ignore */ }

  // Natijalar va reyting keshini tozalaymiz (yangi natija darhol aks etishi uchun)
  if (uid) {
    _userResultsCache.delete(uid);
    _userResultsTime.delete(uid);
  }
  _leaderboardCache = null;
  _leaderboardCacheTime = 0;

  try {
    if (!user) return { success: false, error: 'Tizimga kirmagansiz.' };

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
    if (!isUUID) {
      return { success: true };
    }

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
async function _syncUserResultsInBackground(uid) {
  if (!isSupabaseOnline()) return;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  if (!isUUID) return;

  try {
    const { data, error } = await runQuery(
      supabase
        .from('quiz_results')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      2500
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      const books = await getBooks();
      const res = data.map(r => {
        const b = books.find(x => String(x.id) === String(r.book_id));
        return {
          ...r,
          books: b ? { title: b.title, author: b.author } : null
        };
      });
      _userResultsCache.set(uid, res);
      _userResultsTime.set(uid, Date.now());
    }
  } catch { /* ignore */ }
}

/**
 * Foydalanuvchining barcha test natijalarini qaytaradi (Local-First: 0ms instant render).
 *
 * @param {string} [userId] — ko'rsatilmasa joriy foydalanuvchi
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object[]>}
 */
export async function getUserResults(userId, forceRefresh = false) {
  const uid = userId ?? getCurrentUser()?.id;
  if (!uid || uid === 'guest') return [];

  const now = Date.now();
  if (!forceRefresh && _userResultsCache.has(uid) && (now - (_userResultsTime.get(uid) || 0) < USER_RESULTS_CACHE_TTL)) {
    return _userResultsCache.get(uid);
  }

  // 1. Avval foydalanuvchining shaxsiy localStorage dagi natijalarini ZUDLIK BILAN (0ms) olamiz
  let localResults = [];
  try {
    const userRaw = localStorage.getItem('user_quiz_results_' + uid) || localStorage.getItem('user_quiz_results');
    if (userRaw) {
      const userList = JSON.parse(userRaw);
      if (Array.isArray(userList) && userList.length > 0) {
        const books = await getBooks();
        localResults = userList.map(r => {
          const b = books.find(x => String(x.id) === String(r.bookId || r.book_id));
          return {
            ...r,
            books: b ? { title: b.title, author: b.author } : null
          };
        });
      }
    }
  } catch { /* ignore */ }

  // Agar lokal natijalar mavjud bo'lsa va forceRefresh bo'lmasa — darhol 0ms da qaytaramiz!
  if (localResults.length > 0 && !forceRefresh) {
    _userResultsCache.set(uid, localResults);
    _userResultsTime.set(uid, now);
    _syncUserResultsInBackground(uid).catch(() => {});
    return localResults;
  }

  // 2. Supabase dan sinxronlash
  let dbData = [];
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  try {
    if (uid && isUUID && isSupabaseOnline()) {
      const { data, error } = await runQuery(
        supabase
          .from('quiz_results')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false }),
        2500
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        dbData = data;
      }
    }
  } catch { /* ignore */ }

  if (dbData.length > 0) {
    try {
      const books = await getBooks();
      const res = dbData.map(r => {
        const b = books.find(x => String(x.id) === String(r.book_id));
        return {
          ...r,
          books: b ? { title: b.title, author: b.author } : null
        };
      });
      _userResultsCache.set(uid, res);
      _userResultsTime.set(uid, now);
      return res;
    } catch {
      _userResultsCache.set(uid, dbData);
      _userResultsTime.set(uid, now);
      return dbData;
    }
  }

  if (localResults.length > 0) {
    _userResultsCache.set(uid, localResults);
    _userResultsTime.set(uid, now);
    return localResults;
  }

  try {
    const last = localStorage.getItem('last_quiz_result');
    if (last) {
      const single = JSON.parse(last);
      if (single && single.percentage !== undefined) {
        const books = await getBooks();
        const b = books.find(x => String(x.id) === String(single.bookId || single.book_id));
        const res = [{
          ...single,
          books: b ? { title: b.title, author: b.author } : null
        }];
        _userResultsCache.set(uid, res);
        _userResultsTime.set(uid, now);
        return res;
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

function _buildLocalLeaderboard() {
  let list = [];
  let localUsers = {};
  try {
    const raw = localStorage.getItem('kitobchi_all_users');
    if (raw) localUsers = JSON.parse(raw);
  } catch { /* ignore */ }

  Object.values(localUsers).forEach(u => {
    if (!u || !u.id) return;
    list.push({
      id: u.id,
      full_name: u.fullName || u.username,
      username: u.username,
      score: u.score || 0,
      streak: u.streak || 0,
      avatar_url: u.avatar || '',
      avatar: u.avatar || '👤',
      avatarImage: null,
      role: 'user',
    });
  });

  const cur = getCurrentUser();
  if (cur && cur.id) {
    const idx = list.findIndex(u => u.id === cur.id || (u.username && u.username === cur.username));
    if (idx >= 0) {
      list[idx].score = Math.max(list[idx].score || 0, cur.score || 0);
      list[idx].streak = Math.max(list[idx].streak || 0, cur.streak || 0);
      list[idx].full_name = cur.fullName || list[idx].full_name || cur.username;
      list[idx].avatar_url = cur.avatar || list[idx].avatar_url || '';
    } else {
      list.push({
        id: cur.id,
        full_name: cur.fullName || cur.username,
        username: cur.username,
        score: cur.score || 0,
        streak: cur.streak || 0,
        avatar_url: cur.avatar || '',
        avatar: cur.avatar || '👤',
        avatarImage: null,
        role: cur.isAdmin ? 'admin' : 'user',
      });
    }
  }

  SAMPLE_LEADERBOARD.forEach(s => {
    if (!list.some(u => u.username === s.username || u.id === s.id)) {
      list.push({ ...s });
    }
  });

  list.sort((a, b) => (b.score || 0) - (a.score || 0));
  return list;
}

// Boshlang'ich keshni darhol lokal ma'lumotlar bilan to'ldiramiz (0ms instant render)
_leaderboardCache = _buildLocalLeaderboard();
_leaderboardCacheTime = Date.now();

async function _syncLeaderboardInBackground(limit = 50) {
  if (!isSupabaseOnline()) return;
  try {
    const { data, error } = await runQuery(
      supabase
        .from('profiles')
        .select('id, username, full_name, avatar, avatar_image, avatar_char_id, is_admin, stats, created_at')
        .limit(limit),
      2500
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      let list = data.map(p => {
        const stats = p.stats || {};
        return {
          id: p.id,
          full_name: p.full_name || p.username || 'Kitobxon',
          username: p.username || '',
          score: stats.bestScore || stats.avgScore || p.score || 0,
          streak: stats.currentStreak || stats.maxStreak || p.streak || 0,
          avatar_url: p.avatar_image || p.avatar || '',
          avatar: p.avatar || '👤',
          avatarImage: p.avatar_image || null,
          role: p.is_admin ? 'admin' : 'user',
        };
      });

      let localUsers = {};
      try {
        const raw = localStorage.getItem('kitobchi_all_users');
        if (raw) localUsers = JSON.parse(raw);
      } catch { /* ignore */ }

      Object.values(localUsers).forEach(u => {
        if (!u || !u.id) return;
        const idx = list.findIndex(item => item.id === u.id || (item.username && item.username === u.username));
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            score: Math.max(list[idx].score || 0, u.score || 0),
            streak: Math.max(list[idx].streak || 0, u.streak || 0),
            avatar_url: u.avatar || list[idx].avatar_url || '',
            full_name: u.fullName || list[idx].full_name || u.username,
          };
        } else {
          list.push({
            id: u.id,
            full_name: u.fullName || u.username,
            username: u.username,
            score: u.score || 0,
            streak: u.streak || 0,
            avatar_url: u.avatar || '',
          });
        }
      });

      const cur = getCurrentUser();
      if (cur && cur.id) {
        const idx = list.findIndex(u => u.id === cur.id || (u.username && u.username === cur.username));
        if (idx >= 0) {
          list[idx].score = Math.max(list[idx].score || 0, cur.score || 0);
          list[idx].streak = Math.max(list[idx].streak || 0, cur.streak || 0);
          list[idx].full_name = cur.fullName || list[idx].full_name || cur.username;
          list[idx].avatar_url = cur.avatar || list[idx].avatar_url || '';
        } else {
          list.push({
            id: cur.id,
            full_name: cur.fullName || cur.username,
            username: cur.username,
            score: cur.score || 0,
            streak: cur.streak || 0,
            avatar_url: cur.avatar || '',
          });
        }
      }

      SAMPLE_LEADERBOARD.forEach(s => {
        if (!list.some(u => u.username === s.username || u.id === s.id)) {
          list.push({ ...s });
        }
      });

      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      _leaderboardCache = list;
      _leaderboardCacheTime = Date.now();
    }
  } catch { /* ignore */ }
}

/**
 * Eng yuqori ballli foydalanuvchilarni qaytaradi (Local-First: 0ms instant render).
 *
 * @param {number} [limit=50] — nechta foydalanuvchi
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object[]>}
 */
export async function getLeaderboard(limit = 50, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _leaderboardCache && (now - _leaderboardCacheTime < LEADERBOARD_CACHE_TTL)) {
    return _leaderboardCache.slice(0, limit);
  }

  if (!_leaderboardCache) {
    _leaderboardCache = _buildLocalLeaderboard();
    _leaderboardCacheTime = now;
  }

  if (!forceRefresh) {
    _syncLeaderboardInBackground(limit).catch(() => {});
    return _leaderboardCache.slice(0, limit);
  }

  await _syncLeaderboardInBackground(limit).catch(() => {});
  return (_leaderboardCache || _buildLocalLeaderboard()).slice(0, limit);
}

// ============================================================
// STREAK VA BALL YANGILASH HAMDA FOALLIK STATUSI
// ============================================================

/**
 * Foydalanuvchining faol kunlari ro'yxatini qaytaradi.
 * @param {string} userId
 * @returns {string[]}
 */
export function getActiveDates(userId) {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`kitobchi_active_dates_${userId}`);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Foydalanuvchiga faol kun qo'shadi.
 * @param {string} userId
 * @param {string} dateStr
 */
export function saveActiveDate(userId, dateStr) {
  if (!userId || !dateStr) return;
  try {
    const list = getActiveDates(userId);
    if (!list.includes(dateStr)) {
      list.push(dateStr);
      localStorage.setItem(`kitobchi_active_dates_${userId}`, JSON.stringify(list));
    }
  } catch (e) {
    console.warn('[db] saveActiveDate xatosi:', e);
  }
}

/**
 * Streak va ballni yangilaydi (test tugaganidan keyin chaqiriladi).
 *
 * @param {number} earnedScore  — bu testdan olingan ball
 * @param {string} todayDate    — "YYYY-MM-DD" formatida (formatDate() dan)
 * @returns {Promise<{success: boolean, newStreak: number, newScore: number, error?: string}>}
 */
export async function updateStreakAndScore(earnedScore, todayDate) {
  try {
    const user = getCurrentUser();
    if (!user) return { success: false, newStreak: 0, newScore: 0, error: 'Tizimga kirmagansiz.' };

    const { yesterday } = await import('./utils.js');
    const yesterdayStr = yesterday();

    const lastDate   = user.lastQuizDate ?? null;
    const oldStreak  = user.streak       ?? 0;
    const oldScore   = user.score        ?? 0;

    // Streak mantiq (mukammal hisoblash)
    let newStreak;
    if (lastDate === todayDate) {
      // Bugun allaqachon test yechilgan — streak o'zgarmaydi
      newStreak = Math.max(1, oldStreak);
    } else if (lastDate === yesterdayStr) {
      // Kecha yechilgan — bugungi kun bilan streak 1 taga oshadi
      newStreak = oldStreak + 1;
    } else {
      // Avval yechilmagan yoki 2+ kun o'tkazib yuborilgan — yangi streak boshlanadi
      newStreak = 1;
    }

    const newScore = oldScore + earnedScore;

    // Faol kunlar bazasiga kiritish
    saveActiveDate(user.id, todayDate);

    // Agar streak bekor qilingan xabari bo'lsa, uni tozalaymiz
    try {
      localStorage.removeItem(`kitobchi_streak_broken_ack_${user.id}`);
      localStorage.removeItem(`kitobchi_broken_streak_${user.id}`);
    } catch {}

    // Mahalliy profil va sessiyani yangilaymiz
    const { updateProfile } = await import('./auth.js');
    await updateProfile({ score: newScore, streak: newStreak, lastQuizDate: todayDate });

    _leaderboardCache = null;
    _leaderboardCacheTime = 0;
    _userResultsCache.delete(user.id);
    _userResultsTime.delete(user.id);

    return { success: true, newStreak, newScore };

  } catch (err) {
    console.error('[db] updateStreakAndScore xatosi:', err);
    return { success: false, newStreak: 0, newScore: 0, error: err.message };
  }
}

/**
 * Foydalanuvchining joriy streak holatini va haftalik taqvimini hisoblab beradi.
 * Agar foydalanuvchi streakni uzgan bo'lsa (kecha kirmagan bo'lsa), buni aniqlaydi va streakni 0 ga tushiradi.
 * 
 * @param {object|null} user
 * @param {object[]} [userResults=[]]
 * @returns {Promise<object>}
 */
export async function getStreakStatus(user, userResults = []) {
  if (!user) {
    return {
      isGuest: true,
      currentStreak: 0,
      isCompletedToday: false,
      isPendingToday: false,
      isBroken: false,
      brokenStreakAmount: 0,
      activeDates: [],
      weekDays: []
    };
  }

  const { today, yesterday, formatDate } = await import('./utils.js');
  const todayStr = today();
  const yesterdayStr = yesterday();
  const lastDate = user.lastQuizDate || null;
  const rawStreak = user.streak || 0;

  // Faol kunlarni yig'ish (localStorage + test natijalari)
  const localActive = getActiveDates(user.id);
  const resultDates = (userResults || [])
    .map(r => r.date || (r.created_at ? r.created_at.slice(0, 10) : null))
    .filter(Boolean);
  if (lastDate) localActive.push(lastDate);
  const allActiveDates = Array.from(new Set([...localActive, ...resultDates]));

  let currentStreak = rawStreak;
  let isCompletedToday = false;
  let isPendingToday = false;
  let isBroken = false;
  let brokenStreakAmount = 0;

  if (lastDate === todayStr || allActiveDates.includes(todayStr)) {
    // Bugun allaqachon muvaffaqiyatli bajarilgan
    isCompletedToday = true;
    isPendingToday = false;
    currentStreak = Math.max(1, rawStreak);
  } else if (lastDate === yesterdayStr || allActiveDates.includes(yesterdayStr)) {
    // Kecha bajarilgan, lekin bugun hali bajarilmagan — streak hali buzilmagan
    isCompletedToday = false;
    isPendingToday = true;
    currentStreak = rawStreak;
  } else {
    // Kecha ham, bugun ham test yechilmagan (2 yoki undan ortiq kun o'tgan)
    isCompletedToday = false;
    isPendingToday = true;
    if (rawStreak > 0) {
      // STREAK BUZILDI!
      isBroken = true;
      brokenStreakAmount = rawStreak;
      currentStreak = 0;

      try {
        localStorage.setItem(`kitobchi_broken_streak_${user.id}`, JSON.stringify({
          date: todayStr,
          amount: brokenStreakAmount,
        }));
      } catch {}

      // Profil va sessiyada streakni 0 ga tushiramiz
      const { updateProfile } = await import('./auth.js');
      await updateProfile({ streak: 0 }).catch(() => {});
    } else {
      currentStreak = 0;
      try {
        const brokenRaw = localStorage.getItem(`kitobchi_broken_streak_${user.id}`);
        if (brokenRaw) {
          const brokenInfo = JSON.parse(brokenRaw);
          if (brokenInfo.date === todayStr && brokenInfo.amount > 0) {
            isBroken = true;
            brokenStreakAmount = brokenInfo.amount;
          }
        }
      } catch {}
    }
  }

  // 7 kunlik joriy haftalik taqvim (Dushanba - Yakshanba)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0: Yak, 1: Du, ...
  const distanceToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMon);

  const dayNames = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  const fullDayNames = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
  const weekDays = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = formatDate(d);
    const isToday = dStr === todayStr;
    const isPast = dStr < todayStr;
    const isFuture = dStr > todayStr;
    const isActive = allActiveDates.includes(dStr) || (isToday && isCompletedToday);

    weekDays.push({
      name: dayNames[i],
      fullName: fullDayNames[i],
      date: dStr,
      dayNum: d.getDate(),
      isActive,
      isToday,
      isPast,
      isFuture
    });
  }

  return {
    isGuest: false,
    currentStreak,
    isCompletedToday,
    isPendingToday,
    isBroken,
    brokenStreakAmount,
    activeDates: allActiveDates,
    weekDays
  };
}

// ============================================================
// PERSONAJLAR (CHARACTERS CRUD)
// ============================================================

/**
 * Barcha personajlarni qaytaradi (Supabase + localData + localStorage).
 * @returns {Promise<object[]>}
 */
function _initLocalCharacters() {
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

  let customChars = [];
  try {
    const raw = localStorage.getItem('kitobchi_custom_characters');
    if (raw) customChars = JSON.parse(raw);
  } catch { /* ignore */ }

  const charMap = new Map();
  staticChars.forEach(c => charMap.set(String(c.id), c));
  customChars.forEach(c => charMap.set(String(c.id), { ...(charMap.get(String(c.id)) || {}), ...c }));

  const allBooks = localData.books || [];
  return Array.from(charMap.values()).map(c => {
    if (!c.bookTitle && c.book_id) {
      const b = allBooks.find(x => String(x.id) === String(c.book_id));
      if (b) c.bookTitle = b.title;
    }
    return c;
  });
}

// Modul yuklanishi bilan personajlar keshini zudlik bilan 0ms da to'ldiramiz!
_charactersCache = _initLocalCharacters();

async function _syncCharactersInBackground() {
  if (!isSupabaseOnline()) return _charactersCache;
  try {
    const { data, error } = await runQuery(
      supabase
        .from('characters')
        .select('id, name, bookTitle, avatar, color, description'),
      2500
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      const charMap = new Map();
      (_charactersCache || _initLocalCharacters()).forEach(c => charMap.set(String(c.id), c));

      let changed = false;
      data.forEach(c => {
        const strId = String(c.id);
        const existing = charMap.get(strId);
        if (!existing) {
          changed = true;
          charMap.set(strId, {
            id: c.id,
            name: c.name,
            book_id: c.book_id ?? c.bookId,
            bookTitle: c.bookTitle || c.book_title || '',
            avatar: c.avatar || '🎭',
            avatarImage: null,
            color: c.color || 'var(--color-primary)',
            description: c.description || '',
          });
        }
      });

      if (changed) {
        _charactersCache = Array.from(charMap.values());
      }
    }
  } catch { /* ignore */ }
  return _charactersCache;
}

/**
 * Barcha personajlarni qaytaradi (Local-First: 0ms instant render).
 * @returns {Promise<object[]>}
 */
export async function getCharacters(forceRefresh = false) {
  if (!_charactersCache || _charactersCache.length === 0) {
    _charactersCache = _initLocalCharacters();
  }

  // 1. Oddiy holatda — darhol 0ms keshdagi personajlarni qaytaramiz!
  if (!forceRefresh) {
    _syncCharactersInBackground().catch(() => {});
    return _charactersCache;
  }

  // 2. Majburiy yangilash talab qilinganda — foniy sinxronlashni kutamiz
  await _syncCharactersInBackground();
  return _charactersCache;
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

  // Supabase (agar jadval mavjud bo'lsa)
  try {
    const sbPayload = {
      id: targetId,
      name: fullChar.name,
      bookTitle: fullChar.bookTitle || fullChar.book_title || '',
      description: fullChar.description || '',
      avatar: fullChar.avatar || '🎭',
      color: fullChar.color || 'var(--color-primary)',
      avatarImage: fullChar.avatarImage || null,
    };
    if (id) {
      await supabase.from('characters').update(sbPayload).eq('id', targetId);
    } else {
      await supabase.from('characters').insert(sbPayload);
    }
  } catch (err) {
    console.warn('[db] saveCharacter Supabase fallback:', err);
  }

  _charactersCache = null;
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

  _charactersCache = null;
  return { success: true };
}

// ============================================================
// IZOHLAR / SHARHLAR (COMMENTS & REVIEWS)
async function _syncCommentsInBackground(bookId = null) {
  if (!isSupabaseOnline()) return;
  try {
    let query = supabase.from('comments').select('*').order('createdAt', { ascending: false }).limit(100);
    if (bookId) {
      query = query.eq('bookId', String(bookId));
    }
    const { data, error } = await runQuery(query, 2000);
    if (!error && Array.isArray(data) && data.length > 0) {
      const raw = localStorage.getItem('kitobchi_comments');
      const local = raw ? JSON.parse(raw) : [];
      const map = new Map();
      local.forEach(c => map.set(String(c.id), c));
      data.forEach(c => map.set(String(c.id), c));
      localStorage.setItem('kitobchi_comments', JSON.stringify(Array.from(map.values()).slice(0, 200)));
    }
  } catch { /* ignore */ }
}

/**
 * Kitobga tegishli izohlarni qaytaradi (Local-First: 0ms instant render).
 * @param {string|number} [bookId]
 * @returns {Promise<object[]>}
 */
export async function getComments(bookId = null) {
  let localComments = [];
  try {
    const raw = localStorage.getItem('kitobchi_comments');
    if (raw) localComments = JSON.parse(raw);
  } catch { /* ignore */ }

  if (isSupabaseOnline()) {
    _syncCommentsInBackground(bookId).catch(() => {});
  }

  let all = localComments;
  if (bookId) {
    all = all.filter(c => String(c.bookId || c.book_id) === String(bookId));
  }

  all.sort((a, b) => {
    const timeA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || a.created_at || a.date || 0).getTime();
    const timeB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || b.created_at || b.date || 0).getTime();
    return timeB - timeA;
  });

  return all;
}

/**
 * Yangi izoh qo'shadi.
 * @param {object} commentData
 * @returns {Promise<{success: boolean, comment?: object, error?: string}>}
 */
export async function saveComment(commentData) {
  const { getCurrentUser } = await import('./auth.js');
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Izoh qoldirish uchun tizimga kiring.' };

  const newComment = {
    id: 'comm-' + Date.now(),
    bookId: String(commentData.bookId || commentData.book_id || ''),
    book_id: String(commentData.bookId || commentData.book_id || ''),
    userId: user.id,
    user_id: user.id,
    userName: user.fullName || user.username || 'Foydalanuvchi',
    userAvatar: user.avatarImage || user.avatar || '👤',
    avatarCharId: user.avatarCharId || null,
    text: commentData.text?.trim() || '',
    likesCount: 0,
    likedBy: [],
    createdAt: Date.now(),
    created_at: new Date().toISOString(),
  };

  if (!newComment.text) {
    return { success: false, error: 'Izoh matni bo\'sh bo\'lmasligi kerak.' };
  }

  // Local storage ga saqlash
  try {
    const raw = localStorage.getItem('kitobchi_comments');
    const existing = raw ? JSON.parse(raw) : [];
    existing.unshift(newComment);
    localStorage.setItem('kitobchi_comments', JSON.stringify(existing.slice(0, 200)));
  } catch { /* ignore */ }

  // Supabase ga saqlash (aniq schema ustunlari bilan)
  try {
    await supabase.from('comments').insert({
      id: newComment.id,
      bookId: newComment.bookId,
      userId: newComment.userId,
      userName: newComment.userName,
      userAvatar: newComment.userAvatar,
      text: newComment.text,
      likesCount: 0,
      likedBy: [],
      createdAt: newComment.createdAt,
    });
  } catch (err) {
    console.warn('[db] saveComment Supabase fallback:', err);
  }

  return { success: true, comment: newComment };
}

/**
 * Izohni o'chiradi.
 * @param {string|number} id
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteComment(id) {
  const strId = String(id);
  try {
    const raw = localStorage.getItem('kitobchi_comments');
    if (raw) {
      const existing = JSON.parse(raw);
      const filtered = existing.filter(c => String(c.id) !== strId);
      localStorage.setItem('kitobchi_comments', JSON.stringify(filtered));
    }
  } catch { /* ignore */ }

  try {
    await supabase.from('comments').delete().eq('id', strId);
  } catch (err) {
    console.warn('[db] deleteComment Supabase fallback:', err);
  }

  return { success: true };
}

/**
 * Asosiy ma'lumotlarni orqa fonda oldindan keshlab qo'yadi.
 * Foydalanuvchi sahifalarga o'tganda (Home, Books, Leaderboard, Profile) kutmasdan 0ms da ochiladi.
 */
export function prefetchCommonData() {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2500));
  idle(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!_booksCache) await getBooks().catch(() => {});
      if (!_charactersCache) await getCharacters().catch(() => {});
    } catch { /* ignore */ }
  });
}
