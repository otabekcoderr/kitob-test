import { supabase } from './supabase-client.js';

let initialized = false;
let _books = null, _questions = null, _characters = null;
let _dataModule = null;

async function getDataModule() {
  if (!_dataModule) _dataModule = await import('./data.js');
  return _dataModule;
}

const SUPABASE_URL = 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';

const TIMEOUT = 10000;
const MAX_RETRIES = 2;

async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || SUPABASE_ANON_KEY;
  } catch {
    return SUPABASE_ANON_KEY;
  }
}

async function supabaseRequest(method, table, opts = {}, retryCount = 0) {
  const { where, body, order, single } = opts;
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  if (where) {
    for (const [k, v] of Object.entries(where)) {
      url += `&${k}=eq.${encodeURIComponent(String(v))}`;
    }
  }
  if (order) url += `&order=${order}`;

  const accessToken = await getAccessToken();
 const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${accessToken}`,  // ← bu to'g'rimi?
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
      if (single) return data[0] || null;
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
  return supabaseRequest('GET', table, { where, single: true }).catch(() => null);
}
function tryList(table, where) {
  return supabaseRequest('GET', table, { where }).catch(() => []);
}

export async function initDB() {
  if (initialized) return;
  initialized = true;
  const data = await getDataModule();
  _questions = data.questions;
  _characters = data.characters || [];
  _books = data.books;

  tryList('books').then(remoteBooks => {
    if (remoteBooks && remoteBooks.length > 0) {
      _books = remoteBooks;
    }
  }).catch(() => {});

  tryList('characters').then(remoteChars => {
    if (remoteChars && remoteChars.length > 0) {
      _characters = remoteChars;
    }
  }).catch(() => {});
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

// Profiles (migrated from 'users' table to 'profiles')
function mapProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    fullName: p.full_name,
    username: p.username,
    avatar: p.avatar,
    avatarImage: p.avatar_image,
    avatarCharId: p.avatar_char_id,
    isAdmin: !!p.is_admin,
    stats: p.stats,
    createdAt: p.created_at
  };
}
export const addUser = () => { throw new Error("Foydalanuvchilar faqat ro'yxatdan o'tish orqali qo'shiladi"); };
export const getUserByUsername = async (username) => { const d = await tryGet('profiles', { username }); return mapProfile(d); };
export const getUserById = async (id) => { const d = await tryGet('profiles', { id }); return mapProfile(d); };
export const updateUser = async (id, updates) => {
  const body = {};
  if (updates.fullName !== undefined) body.full_name = updates.fullName;
  if (updates.username !== undefined) body.username = updates.username;
  if (updates.avatar !== undefined) body.avatar = updates.avatar;
  if (updates.avatarImage !== undefined) body.avatar_image = updates.avatarImage;
  if (updates.avatarCharId !== undefined) body.avatar_char_id = updates.avatarCharId;
  if (updates.isAdmin !== undefined) body.is_admin = updates.isAdmin;
  if (updates.stats !== undefined) body.stats = updates.stats;
  const d = await supabaseRequest('PATCH', 'profiles', { where: { id }, body }).catch(() => null);
  return mapProfile(d);
};
export async function deleteUser(userId) {
  // Calls Edge Function — deletes from Auth, profiles, results, comments
  const token = await getAccessToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Foydalanuvchini o'chirishda xatolik");
  }
  return true;
}
export const getAllUsers = async () => { const d = await tryList('profiles'); return (d || []).map(mapProfile); };

// Books — always from memory (data.js), Supabase in background
export async function getBookById(id) {
  try {
    const remote = await supabaseRequest('GET', 'books', { where: { id }, single: true });
    if (remote) return remote;
  } catch(e) { console.error("Error in getAllBooks:", e); }
  if (!_books) { const d = await getDataModule(); _books = d.books; }
  return _books.find(b => b.id === id) || null;
}
export async function getAllBooks() {
  try {
    const remote = await supabaseRequest('GET', 'books');
    if (Array.isArray(remote)) {
      _books = remote;
      return _books;
    }
  } catch(e) { console.error("Error in getAllBooks:", e); }
  if (!_books) { const d = await getDataModule(); _books = d.books; }
  return _books;
}
export const addBook = async (d) => {
  const { data, error } = await supabase
    .from('books')
    .insert(d)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (_books) _books.push(data || d);
  return data || d;
};
export const updateBook = async (id, updates) => {
  const { error } = await supabase
    .from('books')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(error.message);
  if (_books) {
    const idx = _books.findIndex(b => b.id === id);
    if (idx !== -1) _books[idx] = { ..._books[idx], ...updates };
  }
};
export const deleteBook = async (id) => {
  const { error } = await supabase
    .from('books')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
  if (_books) _books = _books.filter(b => b.id !== id);
};

// Questions — always from memory (data.js)
export async function getQuestionsByBook(bookId) {
  try {
    const remote = await supabaseRequest('GET', 'questions', { where: { bookId } });
    if (Array.isArray(remote) && remote.length > 0) return remote;
  } catch(e) { console.error("Error in getAllBooks:", e); }
  if (!_questions) { const d = await getDataModule(); _questions = d.questions; }
  return _questions.filter(q => q.bookId === bookId);
}
export async function getAllQuestions() {
  try {
    const remote = await supabaseRequest('GET', 'questions');
    if (Array.isArray(remote)) {
      _questions = remote;
      return _questions;
    }
  } catch(e) { console.error("Error in getAllQuestions:", e); }
  if (!_questions) { const d = await getDataModule(); _questions = d.questions; }
  return _questions;
}
export const addQuestion = (d) => supabaseRequest('POST', 'questions', { body: d }).then(() => d).catch(e => { throw e; });
export const updateQuestion = (id, updates) => supabaseRequest('PATCH', 'questions', { where: { id }, body: updates }).catch(() => null);
export const deleteQuestion = (id) => supabaseRequest('DELETE', 'questions', { where: { id } }).catch(() => false);

// Results
export const addResult = (d) => supabaseRequest('POST', 'results', { body: d }).then(() => d).catch(e => { throw e; });
export const getResultsByUser = (userId) => tryList('results', { userId }).then(r => r.sort((a, b) => b.completedAt - a.completedAt));
export async function getResultById(id) { return tryGet('results', { id }); }
export const getAllResults = () => tryList('results');

// Comments
export const addComment = (d) => supabaseRequest('POST', 'comments', { body: d }).then(() => d).catch(e => { throw e; });
export const getCommentsByBook = (bookId) => tryList('comments', { bookId }).then(c => c.sort((a, b) => b.createdAt - a.createdAt));
export const getAllComments = () => tryList('comments');
export const updateComment = (id, updates) => supabaseRequest('PATCH', 'comments', { where: { id }, body: updates }).catch(() => null);
export const deleteComment = (id) => supabaseRequest('DELETE', 'comments', { where: { id } }).catch(() => false);

// Arena
export const addArenaMatch = (d) => supabaseRequest('POST', 'arena_matches', { body: d }).then(() => d).catch(e => { throw e; });
export const getArenaMatchesByUser = (userId) => tryList('arena_matches', { userId }).then(r => r.sort((a, b) => b.completedAt - a.completedAt));
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
  } catch(e) { console.error("Error in getAllBooks:", e); }
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

  // Fetch this user's results to compute up-to-date stats
  const userResults = await getResultsByUser(userId);
  const testsCompleted = userResults.length;
  let avgScore = 0;
  let bestScore = 0;

  if (testsCompleted > 0) {
    let totalScore = 0;
    userResults.forEach(r => {
      totalScore += r.score;
      if (r.score > bestScore) bestScore = r.score;
    });
    avgScore = Math.round(totalScore / testsCompleted) || 0;
  }

  if (!user.stats) user.stats = { testsCompleted: 0, avgScore: 0, bestScore: 0, currentStreak: 0, maxStreak: 0, lastQuizDate: '' };
  
  user.stats.testsCompleted = testsCompleted;
  user.stats.avgScore = avgScore;
  user.stats.bestScore = bestScore;

  if (user.stats.currentStreak === undefined) user.stats.currentStreak = 0;
  if (user.stats.maxStreak === undefined) user.stats.maxStreak = 0;
  if (user.stats.lastQuizDate === undefined) user.stats.lastQuizDate = '';

  const today = new Date().toLocaleDateString('en-CA');
  if (user.stats.lastQuizDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    if (user.stats.lastQuizDate === yesterday) {
      user.stats.currentStreak += 1;
    } else {
      user.stats.currentStreak = 1;
    }
    user.stats.maxStreak = Math.max(user.stats.maxStreak, user.stats.currentStreak);
    user.stats.lastQuizDate = today;
  }

  await updateUser(userId, { stats: user.stats });
  return user;
}

