// ========================================================================
// api/_session.js — Server-Signed Quiz Session Tokens (Anti-Cheat Core)
// ========================================================================
// The previous implementation trusted a client-supplied `quizStartTime`
// timestamp, which made the anti-cheat trivially bypassable: a caller could
// send `Date.now() + 1e9` and the elapsed-time check would be skipped
// entirely because `elapsedMs > 0` evaluated to false.
//
// This module issues an HMAC-signed session token from GET /api/quiz so the
// server — not the browser — owns the authoritative start time, the question
// set that was actually delivered, and the exam duration. POST /api/quiz-submit
// verifies the signature before grading.
// ========================================================================

import crypto from 'node:crypto';

const TOKEN_TTL_MS = 60 * 60 * 1000;        // 1 hour hard expiry
export const MAX_EXAM_SECONDS = 15 * 60;    // 15 minutes per 10-question exam

/**
 * HMAC secret. Prefers a dedicated env var, then the service-role key.
 * Falls back to the publishable anon key so local/dev environments still work
 * (documented as a weaker-but-functional default).
 */
function getSigningSecret() {
  return (
    process.env.QUIZ_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'kitobchi-dev-session-secret'
  );
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
}

/**
 * Deterministic fingerprint of the delivered question set.
 * Binds the session to exactly the questions the server handed out, so a
 * caller cannot submit answers for a different book or a larger set.
 */
export function fingerprintQuestions(questions = []) {
  const ids = questions.map(q => String(q?.id ?? '')).sort();
  return crypto.createHash('sha256').update(ids.join('|')).digest('hex').slice(0, 32);
}

/**
 * Issues a signed quiz session token.
 *
 * @param {object}  params
 * @param {string}  params.bookId      Canonical book identifier.
 * @param {string[]} params.questionIds Delivered question ids.
 * @param {string|null} [params.userId] Authenticated user id, when known.
 * @returns {string} Compact `payload.signature` token.
 */
export function issueQuizSession({ bookId, questionIds = [], userId = null }) {
  const now = Date.now();
  const payload = {
    v: 1,
    sid: crypto.randomBytes(12).toString('hex'),
    bid: String(bookId),
    // Question ids are already delivered to the client in the response body,
    // so recording them adds no new exposure. The fingerprint commits to the
    // exact delivered set so it cannot be swapped for a different one.
    qids: questionIds.map(String),
    fp: fingerprintQuestions(questionIds),
    n: questionIds.length,
    uid: userId,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };

  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verifies signature + expiry. Does NOT check replay — single-use enforcement
 * lives in the per-user daily cap inside quiz-submit.js.
 *
 * @param {string} token
 * @returns {{ok: true, payload: object} | {ok: false, reason: string}}
 */
export function verifyQuizSession(token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'MISSING_SESSION' };
  }

  const dot = token.lastIndexOf('.');
  if (dot <= 0) {
    return { ok: false, reason: 'MALFORMED_SESSION' };
  }

  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'MALFORMED_SESSION' };
  }

  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'MALFORMED_SESSION' };
  }
  if (Date.now() > payload.exp) {
    return { ok: false, reason: 'EXPIRED_SESSION' };
  }

  return { ok: true, payload };
}

/**
 * Server-authoritative speed verdict for a verified session.
 *
 * Minimum wall-clock time scales with the number of graded answers so a
 * 10-question exam cannot be completed instantly. The verdict is derived only
 * from server-owned `iat`, never from client input.
 *
 * @param {object} payload   Verified session payload.
 * @param {number} answerCount Number of submitted answers.
 * @returns {{suspicious: boolean, elapsedMs: number, minMs: number}}
 */
export function evaluatePace(payload, answerCount) {
  const elapsedMs = Math.max(0, Date.now() - Number(payload.iat));
  const minMs = Math.max(2000, answerCount * 1200);
  return {
    suspicious: answerCount >= 5 && elapsedMs > 0 && elapsedMs < minMs,
    elapsedMs,
    minMs,
  };
}
