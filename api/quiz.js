// ========================================================================
// api/quiz.js — Sanitized Quiz Delivery API (Vercel Serverless ES Module)
// ========================================================================
// Requirement R1: Delivers questions with STRICT stripping of answer keys,
// correct option indexes, and explanations to prevent client-side cheating.
// ========================================================================

import { setCorsHeaders, sendJson, slugify, sanitizeQuestionForClient } from './_utils.js';
import { getSupabaseAnon, extractBearerToken, verifyAuthUser } from './_supabase.js';
import { issueQuizSession } from './_session.js';
import { questions as staticQuestions, books as staticBooks } from '../js/data.js';

/**
 * Best-effort identity resolution for session binding. Never rejects: a
 * missing or invalid token simply yields an anonymous session.
 */
async function resolveOptionalUser(req) {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    const { user } = await verifyAuthUser(token);
    return user || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // 1. Configure CORS & Security Headers
  setCorsHeaders(req, res, 'GET, OPTIONS');

  // 2. Handle OPTIONS Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // 3. Reject non-GET requests with HTTP 405
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed. Only GET requests are supported.'
    });
  }

  try {
    // 4. Extract and validate bookId query parameter
    let bookId = req.query?.bookId;
    if (!bookId && req.url) {
      try {
        const parsedUrl = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
        bookId = parsedUrl.searchParams.get('bookId');
      } catch {
        bookId = null;
      }
    }

    if (!bookId || typeof bookId !== 'string' || bookId.trim() === '') {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing or invalid required query parameter: bookId.'
      });
    }

    const targetId = bookId.trim();
    const targetSlug = slugify(targetId);

    // 5. Resolve canonical book identifier from catalog
    let canonicalBookId = targetId;
    if (Array.isArray(staticBooks)) {
      const foundBook = staticBooks.find((b, idx) =>
        String(b.id) === targetId ||
        slugify(b.id) === targetSlug ||
        slugify(b.title) === targetSlug ||
        String(idx + 1) === targetId
      );
      if (foundBook && foundBook.id) {
        canonicalBookId = String(foundBook.id);
      }
    }
    const canonicalSlug = slugify(canonicalBookId);

    // 6. Step A: Fast retrieval from static dataset (0ms latency fallback)
    let localMatches = [];
    if (Array.isArray(staticQuestions)) {
      localMatches = staticQuestions.filter(q => {
        if (!q) return false;
        const qBookId = String(q.bookId || q.book_id || '');
        return qBookId === canonicalBookId ||
               qBookId === targetId ||
               slugify(qBookId) === canonicalSlug ||
               slugify(qBookId) === targetSlug;
      });
    }

    // 7. Step B: Query Supabase questions table with bounded 2000ms timeout
    let dbMatches = [];
    try {
      const client = getSupabaseAnon();
      if (client) {
        const searchIds = Array.from(new Set([targetId, canonicalBookId, targetSlug, canonicalSlug].filter(Boolean)));
        let dbQuery = client.from('questions').select('id, bookId, question, options');

        if (searchIds.length > 1) {
          dbQuery = dbQuery.in('bookId', searchIds);
        } else {
          dbQuery = dbQuery.eq('bookId', searchIds[0]);
        }

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Supabase query timeout after 2000ms')), 2000)
        );

        const { data, error } = await Promise.race([dbQuery, timeoutPromise]);
        if (!error && Array.isArray(data) && data.length > 0) {
          dbMatches = data;
        }
      }
    } catch (dbErr) {
      // Graceful fallback to static dataset without failing the client request
      console.warn('[api/quiz] Supabase questions query skipped/timed out:', dbErr.message);
    }

    // 8. Select questions (Priority: Supabase questions; fallback seamlessly to static dataset)
    let rawList = [];
    if (dbMatches.length >= 10) {
      // Supabase has a complete live question set for this book
      rawList = dbMatches.slice(0, 10);
    } else if (dbMatches.length > 0) {
      // Merge Supabase questions with local fallback
      const questionMap = new Map();
      localMatches.forEach(q => {
        if (q && q.id) questionMap.set(String(q.id), q);
      });
      dbMatches.forEach(q => {
        if (q && q.id) {
          const existing = questionMap.get(String(q.id)) || {};
          questionMap.set(String(q.id), { ...existing, ...q });
        }
      });
      rawList = Array.from(questionMap.values());
      if (rawList.length > 10) {
        rawList = rawList.slice(0, 10);
      }
    } else {
      rawList = localMatches;
    }

    // 9. Return 404 if no questions exist for this book
    if (rawList.length === 0) {
      return sendJson(res, 404, {
        success: false,
        error: 'Book not found or no questions available for the specified bookId.',
        bookId: targetId
      });
    }

    // 10. Strictly sanitize questions (Zero-Leakage Guarantee)
    const sanitizedQuestions = rawList
      .map(q => sanitizeQuestionForClient(q, canonicalBookId))
      .filter(Boolean);

    if (sanitizedQuestions.length === 0) {
      return sendJson(res, 404, {
        success: false,
        error: 'No valid questions could be prepared for this book.',
        bookId: targetId
      });
    }

    // 11. Issue a server-signed session so POST /api/quiz-submit can verify
    //     timing and question-set integrity without trusting the client.
    let sessionToken = null;
    try {
      const sessionUser = await resolveOptionalUser(req);
      sessionToken = issueQuizSession({
        bookId: canonicalBookId,
        questionIds: sanitizedQuestions.map(q => q.id),
        userId: sessionUser?.id || null
      });
    } catch (sessionErr) {
      console.warn('[api/quiz] Session issuance skipped:', sessionErr.message);
    }

    // 12. Deliver sanitized envelope matching interface contract
    return sendJson(res, 200, {
      success: true,
      bookId: targetId,
      total: sanitizedQuestions.length,
      questions: sanitizedQuestions,
      sessionToken
    });

  } catch (err) {
    console.error('[api/quiz] Unhandled Server Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal server error occurred while retrieving questions.'
    });
  }
}
