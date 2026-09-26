// ========================================================================
// api/_utils.js — Common Helpers & Security Utilities for Serverless API
// ========================================================================

export const ALLOWED_ORIGINS = [
  'https://kitobchi-uz.vercel.app',
  'https://kitobchi.uz',
  'https://www.kitobchi.uz',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

/**
 * Configure comprehensive CORS, Cache-Control, and Security Headers.
 */
export function setCorsHeaders(req, res, allowedMethods = 'GET, OPTIONS') {
  const origin = req.headers?.origin || req.headers?.Origin;
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  const allowOrigin = isAllowed
    ? origin
    : (process.env.NODE_ENV === 'production' ? 'https://kitobchi-uz.vercel.app' : '*');

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info, apikey');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');

  // Prevent browser & CDN caching of sensitive test data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Robust JSON response sender supporting Vercel and native Node.js HTTP.
 */
export function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  if (typeof res.json === 'function') {
    return res.json(data);
  }
  return res.end(JSON.stringify(data));
}

/**
 * Canonical URL slug transformation (mirrors js/db.js _slugify).
 */
export function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/['`’"']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Calculate current and previous calendar day in Asia/Tashkent (UTC+5).
 */
export function getTashkentDateStrings() {
  const now = new Date();
  // Tashkent is fixed at UTC+5 (300 minutes ahead of UTC)
  const tashkentOffsetMs = (5 * 60 + now.getTimezoneOffset()) * 60 * 1000;
  const todayDateObj = new Date(now.getTime() + tashkentOffsetMs);
  const yesterdayDateObj = new Date(now.getTime() + tashkentOffsetMs - 86400000);

  const todayStr = todayDateObj.toISOString().slice(0, 10);
  const yesterdayStr = yesterdayDateObj.toISOString().slice(0, 10);
  return { todayStr, yesterdayStr };
}

/**
 * Strict Whitelist Question Sanitizer (Zero-Leakage Anti-Cheat Projection).
 * Strictly removes all answer keys, correct option indexes, and explanations.
 */
export function sanitizeQuestionForClient(raw, defaultBookId) {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw.id || '').trim();
  if (!id) return null;

  const questionText = String(raw.question || raw.text || '').trim();
  if (!questionText) return null;

  let opts = [];
  if (Array.isArray(raw.options)) {
    opts = raw.options;
  } else if (Array.isArray(raw.variants)) {
    opts = raw.variants;
  } else if (Array.isArray(raw.choices)) {
    opts = raw.choices;
  } else if (raw.a && raw.b && raw.c && raw.d) {
    opts = [raw.a, raw.b, raw.c, raw.d];
  } else if (typeof raw.options === 'string') {
    try {
      const parsed = JSON.parse(raw.options);
      if (Array.isArray(parsed)) opts = parsed;
    } catch {
      opts = [];
    }
  }

  const cleanOptions = opts.map(o => String(o ?? '').trim()).filter(Boolean);
  const bookId = String(raw.bookId || raw.book_id || defaultBookId || '').trim();

  // Whitelist projection: ONLY 4 public properties
  const clean = {
    id,
    question: questionText,
    options: cleanOptions,
    bookId
  };

  // Defensive scrubbing assertion
  const forbiddenKeys = [
    'answer',
    'correctAnswer',
    'correct_answer',
    'explanation',
    'solution',
    'hint',
    'correct',
    'correct_index',
    'correctIndex',
    'correctOption',
    'correct_option',
    'correctOptionIndex',
    'isCorrect',
    'userAnswers',
    'gradingKey'
  ];

  for (const key of forbiddenKeys) {
    if (key in clean) {
      delete clean[key];
    }
  }

  return Object.freeze(clean);
}
