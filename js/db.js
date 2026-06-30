let initialized = false;
let _books = null, _questions = null, _characters = null;
let _dataModule = null;

async function getDataModule() {
  if (!_dataModule) _dataModule = await import('./data.js');
  return _dataModule;
}

const SUPABASE_URL = 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';

const TIMEOUT = 3000;
const MAX_RETRIES = 2;

async function supabaseRequest(method, table, opts = {}, retryCount = 0) {
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
      if (res.status === 429 && retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return supabaseRequest(method, table, opts, retryCount + 1);
      }
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
  const data = await getDataModule();
  _questions = data.questions;
  _characters = data.characters || [];
  _books = data.books;
  // Try Supabase in background — don't block initial load
  tryList('books').then(remoteBooks => {
    if (remoteBooks && remoteBooks.length > 0) {
      _books = remoteBooks;
    } else {
      seedSupabase(data);
    }
  }).catch(() => {});
  tryList('characters').then(remoteChars => {
    if (remoteChars && remoteChars.length > 0) {
      _characters = remoteChars;
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

export function sanitizeForDb(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>\"'&]/g, (char) => {
    const map = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
    return map[char];
  });
}

export function validateId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 100 && /^[a-zA-Z0-9\-_]+$/.test(id);
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
  if (!_books) { const d = await getDataModule(); _books = d.books; }
  return _books.find(b => b.id === id) || null;
}
export async function getAllBooks() {
  if (!_books) { const d = await getDataModule(); _books = d.books; }
  return _books;
}
export const addBook = async (d) => {
  await supabaseRequest('POST', 'books', { body: d });
  if (_books) _books.push(d);
  return d;
};
export const updateBook = async (id, updates) => {
  await supabaseRequest('PATCH', 'books', { where: { id }, body: updates }).catch(() => null);
  if (_books) {
    const idx = _books.findIndex(b => b.id === id);
    if (idx !== -1) _books[idx] = { ..._books[idx], ...updates };
  }
};
export const deleteBook = async (id) => {
  await supabaseRequest('DELETE', 'books', { where: { id } }).catch(() => false);
  if (_books) _books = _books.filter(b => b.id !== id);
};

// Questions — always from memory (data.js)
export async function getQuestionsByBook(bookId) {
  if (!_questions) { const d = await getDataModule(); _questions = d.questions; }
  return _questions.filter(q => q.bookId === bookId);
}
export async function getAllQuestions() {
  if (!_questions) { const d = await getDataModule(); _questions = d.questions; }
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
export const addCharacter = async (d) => {
  const result = await supabaseRequest('POST', 'characters', { body: d });
  if (Array.isArray(_characters)) _characters.push(result);
  return result;
};
export async function getAllCharacters() {
  try {
    const remote = await supabaseRequest('GET', 'characters');
    if (Array.isArray(remote) && remote.length > 0) {
      _characters = remote;
      return _characters;
    }
  } catch (e) {}
  if (!_characters) { const d = await getDataModule(); _characters = d.characters || []; }
  return _characters;
}
export const updateCharacter = async (id, updates) => {
  const result = await supabaseRequest('PATCH', 'characters', { where: { id }, body: updates });
  if (Array.isArray(_characters)) {
    const idx = _characters.findIndex(c => c.id === id);
    if (idx !== -1) _characters[idx] = { ..._characters[idx], ...updates };
  }
  return result;
};
export const deleteCharacter = async (id) => {
  await supabaseRequest('DELETE', 'characters', { where: { id } });
  if (Array.isArray(_characters)) _characters = _characters.filter(c => c.id !== id);
};

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
  await updateUser(userId, { stats: user.stats });
  return user;
}
