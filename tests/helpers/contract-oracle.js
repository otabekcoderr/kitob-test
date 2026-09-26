// ========================================================================
// tests/helpers/contract-oracle.js — Authoritative Specification Oracle
// ========================================================================
// Implements exact mathematical formulas, data sanitization algorithms,
// and interface contracts defined in PROJECT.md and js/progression.js.
// ========================================================================

import { questions as staticQuestions, books as staticBooks } from '../../js/data.js';
import { LEVELS, getUserLevel, calculateQuizXPEarned } from '../../js/progression.js';

export { LEVELS, getUserLevel, calculateQuizXPEarned };

// ------------------------------------------------------------------------
// Slugify Helper (matches js/db.js _slugify)
// ------------------------------------------------------------------------
export function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/['`’"']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ------------------------------------------------------------------------
// Strict Whitelist Question Sanitizer
// ------------------------------------------------------------------------
export const FORBIDDEN_KEYS = [
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
  'gradingKey',
];

export function sanitizeQuestion(raw, defaultBookId = '') {
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

  const clean = {
    id,
    question: questionText,
    options: cleanOptions,
    bookId,
  };

  for (const k of FORBIDDEN_KEYS) {
    delete clean[k];
  }

  return Object.freeze(clean);
}

// ------------------------------------------------------------------------
// Authoritative Book & Question Resolvers
// ------------------------------------------------------------------------
export function resolveBook(bookIdParam) {
  if (!bookIdParam) return null;
  const targetId = String(bookIdParam).trim();
  const targetSlug = slugify(targetId);

  if (Array.isArray(staticBooks)) {
    const found = staticBooks.find(
      (b, idx) =>
        String(b.id) === targetId ||
        slugify(b.id) === targetSlug ||
        slugify(b.title) === targetSlug ||
        String(idx + 1) === targetId
    );
    if (found) return found;
  }
  return null;
}

export function getQuestionsForBook(bookIdParam) {
  const targetId = String(bookIdParam || '').trim();
  const targetSlug = slugify(targetId);
  const resolvedBook = resolveBook(bookIdParam);
  const canonicalBookId = resolvedBook ? String(resolvedBook.id) : targetId;
  const canonicalSlug = slugify(canonicalBookId);

  if (!Array.isArray(staticQuestions)) return [];

  return staticQuestions.filter(q => {
    if (!q) return false;
    const qBookId = String(q.bookId || q.book_id || '');
    return (
      qBookId === canonicalBookId ||
      qBookId === targetId ||
      slugify(qBookId) === canonicalSlug ||
      slugify(qBookId) === targetSlug
    );
  });
}

// ------------------------------------------------------------------------
// Streak Calculation State Machine
// ------------------------------------------------------------------------
export function calculateStreakTransition({
  lastQuizDate,
  currentStreak = 0,
  todayStr,
  yesterdayStr,
}) {
  const oldStreak = Math.max(0, Number(currentStreak) || 0);
  if (!lastQuizDate) {
    return 1;
  }
  if (lastQuizDate === todayStr) {
    return Math.max(1, oldStreak);
  }
  if (lastQuizDate === yesterdayStr) {
    return oldStreak + 1;
  }
  return 1;
}

// ------------------------------------------------------------------------
// Specification Reference Serverless Handlers
// ------------------------------------------------------------------------
export async function oracleQuizHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Only GET requests are supported.',
    });
  }

  const bookId = req.query?.bookId;
  if (!bookId || typeof bookId !== 'string' || bookId.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid required query parameter: bookId.',
    });
  }

  const rawQuestions = getQuestionsForBook(bookId);
  if (rawQuestions.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Book not found or no questions available for the specified bookId.',
      bookId: bookId.trim(),
    });
  }

  const resolvedBook = resolveBook(bookId);
  const canonicalBookId = resolvedBook ? String(resolvedBook.id) : bookId.trim();
  const sanitized = rawQuestions.map(q => sanitizeQuestion(q, canonicalBookId)).filter(Boolean);

  return res.status(200).json({
    success: true,
    bookId: canonicalBookId,
    total: sanitized.length,
    questions: sanitized,
  });
}

export async function oracleSubmitHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Only POST requests are supported.',
    });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing JSON payload.',
    });
  }

  const bookId = body.bookId !== undefined ? String(body.bookId).trim() : '';
  if (!bookId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: bookId.',
    });
  }

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'answers array must be provided and cannot be empty.',
    });
  }

  if (body.answers.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'Exceeded maximum allowed answers (50).',
    });
  }

  // Auth header check
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let isAuthenticated = false;
  let verifiedUserId = null;

  if (authHeader && typeof authHeader === 'string') {
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Malformed Authorization header format. Must be Bearer <token>.',
      });
    }
    const token = authHeader.substring(7).trim();
    if (token === 'invalid.token.payload' || token.length < 10) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session token.',
      });
    }
    isAuthenticated = true;
    verifiedUserId = 'user_test_uuid';
  }

  const rawQuestions = getQuestionsForBook(bookId);
  const questionMap = new Map();
  rawQuestions.forEach(q => {
    if (q && q.id) questionMap.set(String(q.id), q);
  });

  const penalty = Math.max(0, Math.min(100, Math.round(Number(body.penalty) || 0)));
  const answersReview = [];
  let correctCount = 0;

  for (const ans of body.answers) {
    const qId = String(ans?.questionId || '');
    const q = questionMap.get(qId);

    if (!q) {
      answersReview.push({
        questionId: qId,
        questionText: 'Savol topilmadi',
        options: [],
        selectedOption: ans?.selectedOption ?? null,
        correctAnswer: null,
        isCorrect: false,
        explanation: '',
      });
      continue;
    }

    const opts = q.options || [];
    let correctIdx = -1;
    if (typeof q.correctAnswer === 'number') {
      correctIdx = q.correctAnswer;
    } else if (typeof q.correct_answer === 'number') {
      correctIdx = q.correct_answer;
    } else if (typeof q.correct_answer === 'string') {
      correctIdx = opts.indexOf(q.correct_answer);
    } else if (typeof q.answer === 'number') {
      correctIdx = q.answer;
    }

    const selected = ans.selectedOption;
    let selectedIdx = -1;
    if (typeof selected === 'number') {
      selectedIdx = selected;
    } else if (typeof selected === 'string') {
      selectedIdx = opts.indexOf(selected);
    }

    const isCorrect = correctIdx >= 0 && selectedIdx === correctIdx;
    if (isCorrect) correctCount++;

    answersReview.push({
      questionId: qId,
      question: q.question || '',
      questionText: q.question || '',
      options: opts,
      selectedOption: selectedIdx >= 0 ? selectedIdx : null,
      selectedOptionIndex: selectedIdx >= 0 ? selectedIdx : null,
      selectedText: selectedIdx >= 0 && opts[selectedIdx] ? opts[selectedIdx] : '',
      correctAnswer: correctIdx >= 0 ? correctIdx : 0,
      correctOptionIndex: correctIdx >= 0 ? correctIdx : 0,
      correctText: correctIdx >= 0 && opts[correctIdx] ? opts[correctIdx] : '',
      isCorrect,
      explanation: q.explanation || '',
    });
  }

  const total = rawQuestions.length > 0 ? rawQuestions.length : body.answers.length;
  const rawScore = correctCount;
  const penaltyDeduction = Math.round(rawScore * (penalty / 100));
  const finalScore = Math.max(0, rawScore - penaltyDeduction);
  const percentage = total > 0 ? Math.round((finalScore / total) * 100) : 0;

  const isDaily = Boolean(body.isDaily);
  const currentStreak = Math.max(0, Number(body.currentStreak) || 0);

  const xpResult = calculateQuizXPEarned({
    score: finalScore,
    total,
    percentage,
    penalty,
    isDaily,
    currentStreak,
  });

  const xpEarned = xpResult.totalXP;
  const oldLevel = getUserLevel(0);
  const newLevel = getUserLevel(xpEarned);
  const isLevelUp = newLevel.level > oldLevel.level;

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayDateObj = new Date(Date.now() - 86400000);
  const yesterdayStr = yesterdayDateObj.toISOString().slice(0, 10);
  const newStreak = calculateStreakTransition({
    lastQuizDate: body.lastQuizDate || '',
    currentStreak,
    todayStr,
    yesterdayStr,
  });

  const resolvedBook = resolveBook(bookId);
  const bookTitle = resolvedBook ? resolvedBook.title : bookId;

  // Exact shape expected by js/pages/result.js
  const resultPayload = {
    success: true,
    score: finalScore,
    rawScore,
    total,
    percentage,
    penalty,
    bookId,
    bookTitle,
    correctCount,
    wrongCount: Math.max(0, total - correctCount),
    xpEarned,
    xpBreakdown: {
      base: 15,
      accuracy: percentage === 100 ? 25 : percentage >= 90 ? 15 : percentage >= 80 ? 10 : percentage >= 60 ? 5 : 0,
      accuracyBonus: percentage === 100 ? 25 : percentage >= 90 ? 15 : percentage >= 80 ? 10 : percentage >= 60 ? 5 : 0,
      streak: currentStreak >= 7 ? 10 : currentStreak >= 3 ? 5 : 0,
      streakBonus: currentStreak >= 7 ? 10 : currentStreak >= 3 ? 5 : 0,
      daily: isDaily ? 20 : 0,
      dailyBonus: isDaily ? 20 : 0,
      penalty: penalty > 0 ? Math.round(xpEarned * (penalty / 100)) : 0,
      speedBonus: 0,
    },
    userLevel: newLevel,
    oldLevel,
    newLevel,
    isLevelUp,
    currentStreak: newStreak,
    newStreak,
    newScore: xpEarned,
    authenticated: isAuthenticated,
    persisted: isAuthenticated,
    verifiedUserId,
    answers: answersReview,
  };

  return res.status(200).json(resultPayload);
}
