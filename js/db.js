let initialized = false;

const SUPABASE_URL = 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';

async function supabaseRequest(method, table, opts = {}) {
  const { where, body, order } = opts;
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  if (where) {
    for (const [k, v] of Object.entries(where)) {
      url += `&${k}=eq.${encodeURIComponent(String(v))}`;
    }
  }
  if (order) url += `&order=${order}`;

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      if (res.status === 409 && method === 'POST') {
        throw new Error("Bu ma'lumot allaqachon mavjud");
      }
      let msg = `Supabase xatosi (${table}): ${res.status}`;
      try { const t = await res.text(); if (t) msg += ' ' + t; } catch {}
      throw new Error(msg);
    }
    if (method === 'DELETE') return true;
    const data = await res.json();
    if (method === 'GET') {
      if (where) return data[0] || null;
      return data;
    }
    if (method === 'POST') return data[0] || body;
    if (method === 'PATCH') return data[0] || body;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Server bilan aloqa vaqti tugadi');
    throw err;
  }
}

export async function initDB() {
  if (initialized) return;
  initialized = true;
  seedDatabaseIfNeeded().catch(err => console.error('Seeding error:', err));
}

async function seedDatabaseIfNeeded() {
  const existing = await supabaseRequest('GET', 'books', { where: { id: 'otkan-kunlar' } }).catch(() => null);
  if (existing) return;
  const { books, questions } = await import('./data.js');
  for (const b of books) {
    try { await supabaseRequest('POST', 'books', { body: b }); } catch {}
  }
  for (const q of questions) {
    try { await supabaseRequest('POST', 'questions', { body: q }); } catch {}
  }
}

// Safe wrappers — Supabase ishlamasa data.js dan yuklaydi
async function safeList(table) {
  try { return await supabaseRequest('GET', table); } catch { return []; }
}
async function safeGet(table, where) {
  try { return await supabaseRequest('GET', table, { where }); } catch { return null; }
}
function safeGetFn(table) {
  return (where) => safeGet(table, where);
}
function safeListFn(table) {
  return () => safeList(table);
}

// Users
export const addUser = (d) => supabaseRequest('POST', 'users', { body: d }).then(() => d).catch(e => { throw e; });
export const getUserByUsername = safeGetFn('users');
export const getUserById = safeGetFn('users');
export const updateUser = (id, updates) => supabaseRequest('PATCH', 'users', { where: { id }, body: updates }).catch(() => null);
export const deleteUser = (id) => supabaseRequest('DELETE', 'users', { where: { id } }).catch(() => false);
export const getAllUsers = safeListFn('users');

// Books
export const addBook = (d) => supabaseRequest('POST', 'books', { body: d }).then(() => d).catch(e => { throw e; });
export const updateBook = (id, updates) => supabaseRequest('PATCH', 'books', { where: { id }, body: updates }).catch(() => null);
export const deleteBook = (id) => supabaseRequest('DELETE', 'books', { where: { id } }).catch(() => false);
export async function getBookById(id) {
  const [all, { books }] = await Promise.all([safeList('books'), import('./data.js')]);
  const dbBook = all ? all.find(b => b.id === id) : null;
  return dbBook || books.find(b => b.id === id) || null;
}

export async function getAllBooks() {
  const [db, { books: fallback }] = await Promise.all([safeList('books'), import('./data.js')]);
  if (!db || db.length === 0) return fallback;
  const m = {};
  for (const b of fallback) m[b.id] = b;
  for (const b of db) m[b.id] = b;
  return Object.values(m);
}

// Questions
export const addQuestion = (d) => supabaseRequest('POST', 'questions', { body: d }).then(() => d).catch(e => { throw e; });
export const updateQuestion = (id, updates) => supabaseRequest('PATCH', 'questions', { where: { id }, body: updates }).catch(() => null);
export const deleteQuestion = (id) => supabaseRequest('DELETE', 'questions', { where: { id } }).catch(() => false);

export async function getQuestionsByBook(bookId) {
  const all = await getAllQuestions();
  return all.filter(q => q.bookId === bookId);
}

export async function getAllQuestions() {
  const [db, { questions: fallback }] = await Promise.all([safeList('questions'), import('./data.js')]);
  if (!db || db.length === 0) return fallback;
  const m = {};
  for (const q of fallback) m[q.id] = q;
  for (const q of db) m[q.id] = q;
  return Object.values(m);
}

// Results
export const addResult = (d) => supabaseRequest('POST', 'results', { body: d }).then(() => d).catch(e => { throw e; });
export const getResultsByUser = (userId) => safeList('results').then(r => (r || []).filter(x => x.userId === userId).sort((a, b) => b.completedAt - a.completedAt));
export async function getResultById(id) {
  const r = await getAllResults();
  return r.find(x => x.id === id) || null;
}
export const getAllResults = safeListFn('results');

// Comments
export const addComment = (d) => supabaseRequest('POST', 'comments', { body: d }).then(() => d).catch(e => { throw e; });
export const getCommentsByBook = (bookId) => safeList('comments').then(c => (c || []).filter(x => x.bookId === bookId).sort((a, b) => b.createdAt - a.createdAt));
export const getAllComments = safeListFn('comments');
export const updateComment = (id, updates) => supabaseRequest('PATCH', 'comments', { where: { id }, body: updates }).catch(() => null);
export const deleteComment = (id) => supabaseRequest('DELETE', 'comments', { where: { id } }).catch(() => false);

// Arena
export const addArenaMatch = (d) => supabaseRequest('POST', 'arena_matches', { body: d }).then(() => d).catch(e => { throw e; });
export const getArenaMatchesByUser = (userId) => safeList('arena_matches').then(r => (r || []).filter(x => x.userId === userId).sort((a, b) => b.completedAt - a.completedAt));
export const getAllArenaMatches = safeListFn('arena_matches');

// Characters
export const addCharacter = (d) => supabaseRequest('POST', 'characters', { body: d }).then(() => d).catch(e => { throw e; });
export const getAllCharacters = safeListFn('characters');
export const updateCharacter = (id, updates) => supabaseRequest('PATCH', 'characters', { where: { id }, body: updates }).catch(() => null);
export const deleteCharacter = (id) => supabaseRequest('DELETE', 'characters', { where: { id } }).catch(() => false);

export async function updateUserStreak(userId) {
  const user = await getUserById(userId);
  if (!user) throw new Error("Foydalanuvchi topilmadi");
  if (!user.stats) {
    user.stats = { testsCompleted: 0, avgScore: 0, bestScore: 0, currentStreak: 0, maxStreak: 0, lastQuizDate: '' };
  }
  if (user.stats.currentStreak === undefined) user.stats.currentStreak = 0;
  if (user.stats.maxStreak === undefined) user.stats.maxStreak = 0;
  if (user.stats.lastQuizDate === undefined) user.stats.lastQuizDate = '';
  const today = new Date().toLocaleDateString('en-CA');
  if (user.stats.lastQuizDate === today) return user;
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  if (user.stats.lastQuizDate === yesterday) {
    user.stats.currentStreak += 1;
  } else {
    user.stats.currentStreak = 1;
  }
  user.stats.maxStreak = Math.max(user.stats.maxStreak, user.stats.currentStreak);
  user.stats.lastQuizDate = today;
  return updateUser(userId, { stats: user.stats });
}
