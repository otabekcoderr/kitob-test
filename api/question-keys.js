// ========================================================================
// api/question-keys.js — Admin-only Answer Key Retrieval
// ========================================================================
// Why this exists: `questions.correctAnswer` and `questions.explanation` are
// readable by anyone holding the anon key, so the quiz can be solved from the
// browser console. The fix is a column-level REVOKE on those two columns,
// which in turn means the admin question editor can no longer prefill the
// correct answer through PostgREST.
//
// This endpoint restores that capability without reopening the hole:
// it requires a valid Supabase session whose profile has is_admin = true, and
// it reads from the `question_keys` table using the service-role key, which
// bypasses RLS by design.
//
// REQUIRES the SUPABASE_SERVICE_ROLE_KEY environment variable. Without it the
// endpoint returns 503 rather than silently falling back to a client that RLS
// would block.
//
// GET  /api/question-keys[?bookId=…]  → admin-only key listing
// POST /api/question-keys             → admin-only key upsert (kept in sync by
//                                       js/db.js saveQuestion)
// ========================================================================

import { setCorsHeaders, sendJson } from './_utils.js';
import {
  getSupabaseAdmin,
  getSupabaseAnon,
  extractBearerToken,
  verifyAuthUser,
  SUPABASE_SERVICE_ROLE_KEY,
} from './_supabase.js';

const MAX_KEYS = 200;

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(res, 503, {
        success: false,
        error: 'Server konfiguratsiyasi yetishmaydi: SUPABASE_SERVICE_ROLE_KEY o‘rnatilmagan.',
        code: 'SERVICE_ROLE_MISSING'
      });
    }

    // 1. Authenticate
    const token = extractBearerToken(req);
    if (!token) {
      return sendJson(res, 401, {
        success: false,
        error: 'Autentifikatsiya talab qilinadi.',
        code: 'UNAUTHORIZED'
      });
    }

    const { user, error: authError } = await verifyAuthUser(token);
    if (authError || !user) {
      return sendJson(res, 401, {
        success: false,
        error: 'Sessiya muddati tugagan yoki token yaroqsiz.',
        code: 'UNAUTHORIZED'
      });
    }

    // 2. Authorize — admin only, resolved server-side from the profiles row
    const anon = getSupabaseAnon();
    const { data: profile, error: profErr } = await anon
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr) {
      console.error('[api/question-keys] Profile lookup failed:', profErr.message);
      return sendJson(res, 503, {
        success: false,
        error: 'Ruxsat tekshiruvi vaqtincha bajarilmadi.',
        code: 'PROFILE_UNAVAILABLE'
      });
    }

    if (!profile || profile.is_admin !== true) {
      return sendJson(res, 403, {
        success: false,
        error: 'Bu endpoint faqat administratorlar uchun.',
        code: 'FORBIDDEN'
      });
    }

    const admin = getSupabaseAdmin();

    // 3a. POST — upsert one key (admin editor writes here)
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      if (!body || typeof body !== 'object') {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid JSON body.',
          code: 'INVALID_BODY'
        });
      }

      const questionId = String(body.questionId || body.id || '').trim();
      if (!questionId) {
        return sendJson(res, 400, {
          success: false,
          error: 'questionId is required.',
          code: 'INVALID_QUESTION_ID'
        });
      }

      const payload = {
        question_id: questionId,
        correct_answer: String(body.correctAnswer ?? body.correct_answer ?? ''),
        explanation: String(body.explanation ?? ''),
        updated_at: new Date().toISOString()
      };

      const { error } = await admin
        .from('question_keys')
        .upsert(payload, { onConflict: 'question_id' });

      if (error) {
        console.error('[api/question-keys] Upsert failed:', error.message);
        return sendJson(res, 500, {
          success: false,
          error: 'Javob kalitini saqlab bo‘lmadi.',
          code: 'KEYS_WRITE_FAILED'
        });
      }

      return sendJson(res, 200, { success: true, questionId });
    }

    // 3b. GET — list keys
    const bookId = req.query?.bookId;

    let query = admin
      .from('question_keys')
      .select('question_id, correct_answer, explanation')
      .limit(MAX_KEYS);

    if (bookId) {
      query = query.eq('question_id', bookId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[api/question-keys] Read failed:', error.message);
      return sendJson(res, 500, {
        success: false,
        error: 'Javob kalitlarini o‘qib bo‘lmadi.',
        code: 'KEYS_READ_FAILED'
      });
    }

    // Shape matches js/db.js _formatQuestion so the admin form needs no change.
    const keys = (data || []).map(row => ({
      id: row.question_id,
      correct_answer: row.correct_answer ?? '',
      explanation: row.explanation ?? ''
    }));

    return sendJson(res, 200, {
      success: true,
      total: keys.length,
      keys
    });

  } catch (error) {
    console.error('[api/question-keys] Unhandled error:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Ichki server xatosi.'
    });
  }
}
