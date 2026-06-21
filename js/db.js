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
  const existing = await supabaseRequest('GET', 'books', { where: { id: 'otkan-kunlar' } });
  if (existing) return;

  const { books, questions } = await import('./data.js');

  for (const b of books) {
    try {
      await supabaseRequest('POST', 'books', { body: b });
    } catch (err) {
      if (!err.message.includes('409')) console.warn('Book seed skip:', b.id, err.message);
    }
  }
  for (const q of questions) {
    try {
      await supabaseRequest('POST', 'questions', { body: q });
    } catch {}
  }
  console.log('Ma\'lumotlar supabase\'ga yuklandi');
}

function supabaseGet(table, where) {
  return supabaseRequest('GET', table, { where });
}

function supabaseList(table, order) {
  return supabaseRequest('GET', table, { order });
}

async function supabaseAdd(table, data) {
  await supabaseRequest('POST', table, { body: data });
  return data;
}

async function supabaseUpdate(table, id, updates) {
  return supabaseRequest('PATCH', table, { where: { id }, body: updates });
}

async function supabaseDelete(table, id) {
  return supabaseRequest('DELETE', table, { where: { id } });
}

export function addUser(d) { return supabaseAdd('users', d); }
export function getUserByUsername(username) { return supabaseGet('users', { username }); }
export function getUserById(id) { return supabaseGet('users', { id }); }
export function updateUser(id, updates) { return supabaseUpdate('users', id, updates); }
export function deleteUser(id) { return supabaseDelete('users', id); }
export function getAllUsers() { return supabaseList('users', 'createdAt'); }

export function addBook(d) { return supabaseAdd('books', d); }
export function updateBook(id, updates) { return supabaseUpdate('books', id, updates); }
export function deleteBook(id) { return supabaseDelete('books', id); }
export function getBookById(id) { return supabaseGet('books', { id }); }
export async function getAllBooks() {
  const books = await supabaseList('books');
  if (books && books.length > 0) return books;
  const { books: fallback } = await import('./data.js');
  return fallback;
}

export function addQuestion(d) { return supabaseAdd('questions', d); }
export function updateQuestion(id, updates) { return supabaseUpdate('questions', id, updates); }
export function deleteQuestion(id) { return supabaseDelete('questions', id); }
export function getQuestionsByBook(bookId) { return supabaseRequest('GET', 'questions', { where: { bookId } }); }
export async function getAllQuestions() {
  const questions = await supabaseList('questions');
  if (questions && questions.length > 0) return questions;
  const { questions: fallback } = await import('./data.js');
  return fallback;
}

export function addResult(d) { return supabaseAdd('results', d); }
export function getResultsByUser(userId) { return supabaseRequest('GET', 'results', { where: { userId }, order: 'completedAt.desc' }); }
export function getResultById(id) { return supabaseGet('results', { id }); }
export function getAllResults() { return supabaseRequest('GET', 'results', { order: 'completedAt.desc' }); }

export function addComment(d) { return supabaseAdd('comments', d); }
export function getCommentsByBook(bookId) { return supabaseRequest('GET', 'comments', { where: { bookId }, order: 'createdAt.desc' }); }
export function getAllComments() { return supabaseRequest('GET', 'comments', { order: 'createdAt.desc' }); }
export function updateComment(id, updates) { return supabaseUpdate('comments', id, updates); }
export function deleteComment(id) { return supabaseDelete('comments', id); }

export function addArenaMatch(d) { return supabaseAdd('arena_matches', d); }
export function getArenaMatchesByUser(userId) { return supabaseRequest('GET', 'arena_matches', { where: { userId }, order: 'completedAt.desc' }); }
export function getAllArenaMatches() { return supabaseRequest('GET', 'arena_matches', { order: 'completedAt.desc' }); }

export function addCharacter(d) { return supabaseAdd('characters', d); }
export function getAllCharacters() { return supabaseList('characters'); }
export function updateCharacter(id, updates) { return supabaseUpdate('characters', id, updates); }
export function deleteCharacter(id) { return supabaseDelete('characters', id); }

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
