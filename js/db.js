let initialized = false;
let _books = null, _questions = null, _characters = null;

const SUPABASE_URL = 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';

const TIMEOUT = 4000;

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
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      if (res.status === 409 && method === 'POST') throw new Error("Bu ma'lumot allaqachon mavjud");
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

function tryGet(table, where) {
  return supabaseRequest('GET', table, { where }).catch(() => null);
}
function tryList(table) {
  return supabaseRequest('GET', table).catch(() => []);
}

export async function initDB() {
  if (initialized) return;
  initialized = true;
  // Preload data.js books & questions into memory
  const data = await import('./data.js');
  _books = data.books;
  _questions = data.questions;
  _characters = data.characters || [];
  // Seed Supabase in background silently
  tryList('books').then(list => {
    if (!list || list.length === 0) {
      seedSupabase(data);
    }
  }).catch(() => {});
}

async function seedSupabase(data) {
  for (const b of data.books) {
    try { await supabaseRequest('POST', 'books', { body: b }); } catch {}
  }
  for (const q of data.questions) {
    try { await supabaseRequest('POST', 'questions', { body: q }); } catch {}
  }
}

// Users
export const addUser = (d) => supabaseRequest('POST', 'users', { body: d }).then(() => d).catch(e => { throw e; });
export const getUserByUsername = (username) => tryGet('users', { username });
export const getUserById = (id) => tryGet('users', { id });
export const updateUser = (id, updates) => supabaseRequest('PATCH', 'users', { where: { id }, body: updates }).catch(() => null);
export const deleteUser = (id) => supabaseRequest('DELETE', 'users', { where: { id } }).catch(() => false);
export const getAllUsers = () => tryList('users');

// Books — always from memory (data.js), Supabase in background
export async function getBookById(id) {
  if (!_books) { const d = await import('./data.js'); _books = d.books; }
  return _books.find(b => b.id === id) || null;
}
export async function getAllBooks() {
  if (!_books) { const d = await import('./data.js'); _books = d.books; }
  return _books;
}
export const addBook = (d) => supabaseRequest('POST', 'books', { body: d }).then(() => d).catch(e => { throw e; });
export const updateBook = (id, updates) => supabaseRequest('PATCH', 'books', { where: { id }, body: updates }).catch(() => null);
export const deleteBook = (id) => supabaseRequest('DELETE', 'books', { where: { id } }).catch(() => false);

// Questions — always from memory (data.js)
export async function getQuestionsByBook(bookId) {
  if (!_questions) { const d = await import('./data.js'); _questions = d.questions; }
  return _questions.filter(q => q.bookId === bookId);
}
export async function getAllQuestions() {
  if (!_questions) { const d = await import('./data.js'); _questions = d.questions; }
  return _questions;
}
export const addQuestion = (d) => supabaseRequest('POST', 'questions', { body: d }).then(() => d).catch(e => { throw e; });
export const updateQuestion = (id, updates) => supabaseRequest('PATCH', 'questions', { where: { id }, body: updates }).catch(() => null);
export const deleteQuestion = (id) => supabaseRequest('DELETE', 'questions', { where: { id } }).catch(() => false);

// Results
export const addResult = (d) => supabaseRequest('POST', 'results', { body: d }).then(() => d).catch(e => { throw e; });
export const getResultsByUser = (userId) => tryList('results').then(r => r.filter(x => x.userId === userId).sort((a, b) => b.completedAt - a.completedAt));
export async function getResultById(id) { const r = await tryList('results'); return r.find(x => x.id === id) || null; }
export const getAllResults = () => tryList('results');

// Comments
export const addComment = (d) => supabaseRequest('POST', 'comments', { body: d }).then(() => d).catch(e => { throw e; });
export const getCommentsByBook = (bookId) => tryList('comments').then(c => c.filter(x => x.bookId === bookId).sort((a, b) => b.createdAt - a.createdAt));
export const getAllComments = () => tryList('comments');
export const updateComment = (id, updates) => supabaseRequest('PATCH', 'comments', { where: { id }, body: updates }).catch(() => null);
export const deleteComment = (id) => supabaseRequest('DELETE', 'comments', { where: { id } }).catch(() => false);

// Arena
export const addArenaMatch = (d) => supabaseRequest('POST', 'arena_matches', { body: d }).then(() => d).catch(e => { throw e; });
export const getArenaMatchesByUser = (userId) => tryList('arena_matches').then(r => r.filter(x => x.userId === userId).sort((a, b) => b.completedAt - a.completedAt));
export const getAllArenaMatches = () => tryList('arena_matches');

// Characters
export const addCharacter = (d) => supabaseRequest('POST', 'characters', { body: d }).then(() => d).catch(e => { throw e; });
export async function getAllCharacters() {
  if (!_characters) { const d = await import('./data.js'); _characters = d.characters || []; }
  return _characters;
}
export const updateCharacter = (id, updates) => supabaseRequest('PATCH', 'characters', { where: { id }, body: updates }).catch(() => null);
export const deleteCharacter = (id) => supabaseRequest('DELETE', 'characters', { where: { id } }).catch(() => false);

export async function updateUserStreak(userId) {
  const user = await getUserById(userId);
  if (!user) throw new Error("Foydalanuvchi topilmadi");
  if (!user.stats) user.stats = { testsCompleted: 0, avgScore: 0, bestScore: 0, currentStreak: 0, maxStreak: 0, lastQuizDate: '' };
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
