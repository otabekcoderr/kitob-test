// ========================================================================
// api/quiz-submit.js — Authoritative Quiz Verification & Grading API
// ========================================================================
// Requirement R2: Authenticates submission, verifies answers server-side
// against authoritative keys, calculates score, XP, streak, and level tiers,
// and atomically updates Supabase profiles and quiz_results audit logs.
// ========================================================================

import { setCorsHeaders, sendJson, slugify, getTashkentDateStrings } from './_utils.js';
import { getUserLevel, calculateProgressionXP } from './_progression.js';
import { getSupabaseAnon, getSupabaseAdmin, extractBearerToken, verifyAuthUser } from './_supabase.js';
import { questions as staticQuestions, books as staticBooks } from '../js/data.js';

// In-memory rate limiting cache to prevent double-click / rapid replay race conditions
const SUBMISSION_COOLDOWN_MS = 2000;
const _recentSubmissions = new Map(); // key: userId -> timestamp

function checkSubmissionRateLimit(userId) {
  if (!userId) return true;
  const now = Date.now();
  const lastTime = _recentSubmissions.get(userId) || 0;
  if (now - lastTime < SUBMISSION_COOLDOWN_MS) {
    return false;
  }
  _recentSubmissions.set(userId, now);

  // Periodically clean up cache entries older than 60 seconds
  if (_recentSubmissions.size > 2000) {
    const cutoff = now - 60000;
    for (const [uid, time] of _recentSubmissions.entries()) {
      if (time < cutoff) _recentSubmissions.delete(uid);
    }
  }
  return true;
}

export default async function handler(req, res) {
  // 1. Configure CORS & Security Headers
  setCorsHeaders(req, res, 'POST, OPTIONS');

  // 2. Handle OPTIONS Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // 3. Reject non-POST requests with HTTP 405
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed. Only POST requests are supported.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    // 4. Parse request body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid JSON request body format.',
          code: 'INVALID_JSON'
        });
      }
    }

    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing required request body.',
        code: 'MISSING_BODY'
      });
    }

    const {
      bookId,
      answers: rawAnswers = [],
      quizStartTime,
      penalty: rawPenalty = 0,
      isDaily = false
    } = body;

    // 5. Validate bookId
    if (!bookId || typeof bookId !== 'string' || bookId.trim() === '') {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing or invalid required field: bookId.',
        code: 'INVALID_BOOK_ID'
      });
    }

    // 6. Validate answers array
    if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing or empty required field: answers must be a non-empty array.',
        code: 'INVALID_ANSWERS'
      });
    }

    if (rawAnswers.length > 50) {
      return sendJson(res, 400, {
        success: false,
        error: 'Answers array exceeds maximum permitted question limit (50).',
        code: 'EXCESSIVE_ANSWERS'
      });
    }

    // 7. Anti-cheat speed check
    if (quizStartTime && typeof quizStartTime === 'number') {
      const elapsedMs = Date.now() - quizStartTime;
      if (rawAnswers.length >= 5 && elapsedMs > 0 && elapsedMs < 2000) {
        return sendJson(res, 400, {
          success: false,
          error: 'Test topshirish vaqti shubhali darajada qisqa. Avtomatlashtirilgan so\'rovlar taqiqlanadi.',
          code: 'SPEED_HACK_DETECTED'
        });
      }
    }

    // 8. Sanitize penalty percentage (0–100)
    const penaltyRate = Math.max(0, Math.min(100, Math.round(Number(rawPenalty) || 0)));

    // 9. Authenticate user via Bearer token
    let authenticatedUser = null;
    const token = extractBearerToken(req);

    if (token) {
      const { user, error: authError } = await verifyAuthUser(token);
      if (authError || !user) {
        return sendJson(res, 401, {
          success: false,
          error: 'Sessiya muddati tugagan yoki token yaroqsiz.',
          code: 'UNAUTHORIZED'
        });
      }
      authenticatedUser = user;

      // Rate limit check for authenticated users
      if (!checkSubmissionRateLimit(authenticatedUser.id)) {
        return sendJson(res, 429, {
          success: false,
          error: 'Iltimos, qayta topshirishdan oldin bir necha soniya kuting.',
          code: 'TOO_MANY_REQUESTS'
        });
      }
    }

    // 10. Load Authoritative Questions (js/data.js + Supabase)
    const targetBookId = String(bookId).trim();
    const targetBookSlug = slugify(targetBookId);

    // Resolve canonical book details
    let canonicalBookId = targetBookId;
    let resolvedBookTitle = '';
    if (Array.isArray(staticBooks)) {
      const foundBook = staticBooks.find((b, idx) =>
        String(b.id) === targetBookId ||
        slugify(b.id) === targetBookSlug ||
        slugify(b.title) === targetBookSlug ||
        String(idx + 1) === targetBookId
      );
      if (foundBook) {
        canonicalBookId = String(foundBook.id);
        resolvedBookTitle = foundBook.title || '';
      }
    }
    const canonicalSlug = slugify(canonicalBookId);

    const authMap = new Map();

    // Fast static questions loading (0ms)
    if (Array.isArray(staticQuestions)) {
      staticQuestions.forEach(q => {
        if (!q) return;
        const qBookId = String(q.bookId || q.book_id || '');
        if (
          qBookId === canonicalBookId ||
          qBookId === targetBookId ||
          slugify(qBookId) === canonicalSlug ||
          slugify(qBookId) === targetBookSlug
        ) {
          authMap.set(String(q.id), q);
        }
      });
    }

    // Supabase questions query with 2000ms safety timeout
    try {
      const anonClient = getSupabaseAnon();
      if (anonClient) {
        const searchIds = Array.from(new Set([targetBookId, canonicalBookId, targetBookSlug, canonicalSlug].filter(Boolean)));
        let dbQuery = anonClient.from('questions').select('*');
        if (searchIds.length > 1) {
          dbQuery = dbQuery.in('bookId', searchIds);
        } else {
          dbQuery = dbQuery.eq('bookId', searchIds[0]);
        }

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Supabase query timeout')), 2000)
        );

        const { data: dbQuestions, error: dbErr } = await Promise.race([dbQuery, timeoutPromise]);
        if (!dbErr && Array.isArray(dbQuestions) && dbQuestions.length > 0) {
          dbQuestions.forEach(q => {
            if (q && q.id) {
              const existing = authMap.get(String(q.id)) || {};
              authMap.set(String(q.id), { ...existing, ...q });
            }
          });
        }
      }
    } catch (err) {
      console.warn('[api/quiz-submit] Supabase question query warning:', err.message);
    }

    const authQuestions = Array.from(authMap.values());
    const totalQuestions = rawAnswers.length > 0 ? rawAnswers.length : authQuestions.length;

    // 11. Authoritative Grading Engine
    let rawScore = 0;
    const verifiedAnswers = [];

    rawAnswers.forEach((item, index) => {
      const qId = String(item.questionId || item.id || `q_${index}`).trim();
      const authQ = authMap.get(qId);

      if (!authQ) {
        // Fallback for unresolvable question ID
        verifiedAnswers.push({
          questionId: qId,
          question: item.question || item.questionText || 'Savol',
          questionText: item.question || item.questionText || 'Savol',
          options: Array.isArray(item.options) ? item.options : [],
          selectedOption: item.selectedOption ?? null,
          selectedText: item.selectedText ?? (item.selectedOption !== undefined ? String(item.selectedOption) : null),
          selectedOptionIndex: null,
          correctAnswer: null,
          correctText: '',
          correctOptionIndex: null,
          isCorrect: false,
          explanation: 'Savol ma\'lumotlar bazasidan topilmadi.'
        });
        return;
      }

      // Normalize authoritative options
      let options = [];
      if (Array.isArray(authQ.options)) {
        options = authQ.options;
      } else if (Array.isArray(authQ.variants)) {
        options = authQ.variants;
      } else if (Array.isArray(authQ.choices)) {
        options = authQ.choices;
      } else if (authQ.a && authQ.b && authQ.c && authQ.d) {
        options = [authQ.a, authQ.b, authQ.c, authQ.d];
      } else if (typeof authQ.options === 'string') {
        try {
          const parsed = JSON.parse(authQ.options);
          if (Array.isArray(parsed)) options = parsed;
        } catch {
          options = [];
        }
      }

      // Resolve authoritative correct answer key
      let correctOptionIndex = null;
      let correctAnswerText = '';

      if (typeof authQ.correctAnswer === 'number' && authQ.correctAnswer >= 0 && authQ.correctAnswer < options.length) {
        correctOptionIndex = authQ.correctAnswer;
        correctAnswerText = String(options[correctOptionIndex] ?? '');
      } else if (authQ.correct_answer !== undefined && authQ.correct_answer !== null) {
        correctAnswerText = String(authQ.correct_answer).trim();
        correctOptionIndex = options.findIndex(opt =>
          String(opt).trim().toLowerCase() === correctAnswerText.toLowerCase()
        );
        if (correctOptionIndex === -1) correctOptionIndex = null;
      } else if (typeof authQ.correctAnswer === 'string') {
        correctAnswerText = authQ.correctAnswer.trim();
        correctOptionIndex = options.findIndex(opt =>
          String(opt).trim().toLowerCase() === correctAnswerText.toLowerCase()
        );
        if (correctOptionIndex === -1) correctOptionIndex = null;
      }

      // Resolve student submitted selection
      const rawSelected = item.selectedOption !== undefined ? item.selectedOption : (item.selectedText ?? null);
      let selectedOptionIndex = null;
      let selectedOptionText = null;

      if (rawSelected !== null && rawSelected !== undefined) {
        if (typeof rawSelected === 'number' && rawSelected >= 0 && rawSelected < options.length) {
          selectedOptionIndex = rawSelected;
          selectedOptionText = String(options[selectedOptionIndex] ?? '');
        } else if (typeof rawSelected === 'string') {
          const trimmedSelection = rawSelected.trim();
          selectedOptionText = trimmedSelection;
          selectedOptionIndex = options.findIndex(opt =>
            String(opt).trim().toLowerCase() === trimmedSelection.toLowerCase()
          );

          // If not matched verbatim, check if it was a numeric string index like "2"
          if (selectedOptionIndex === -1 && /^\d+$/.test(trimmedSelection)) {
            const parsedIdx = parseInt(trimmedSelection, 10);
            if (parsedIdx >= 0 && parsedIdx < options.length) {
              selectedOptionIndex = parsedIdx;
              selectedOptionText = String(options[parsedIdx] ?? '');
            }
          }
          if (selectedOptionIndex === -1) selectedOptionIndex = null;
        }
      }

      // Evaluate correctness
      let isCorrect = false;
      if (selectedOptionIndex !== null && correctOptionIndex !== null) {
        isCorrect = (selectedOptionIndex === correctOptionIndex);
      } else if (selectedOptionText && correctAnswerText) {
        isCorrect = (selectedOptionText.trim().toLowerCase() === correctAnswerText.trim().toLowerCase());
      }

      if (isCorrect) {
        rawScore += 1;
      }

      const questionText = authQ.question || authQ.text || 'Savol';

      verifiedAnswers.push({
        questionId: authQ.id,
        question: questionText,
        questionText: questionText,
        options,
        selectedOption: rawSelected,
        selectedText: selectedOptionText,
        selectedOptionIndex,
        correctAnswer: correctOptionIndex !== null ? correctOptionIndex : correctAnswerText,
        correctText: correctAnswerText,
        correctOptionIndex,
        isCorrect,
        explanation: authQ.explanation || ''
      });
    });

    // 12. Score & Penalty Calculations
    const penaltyScoreAmount = Math.round(rawScore * (penaltyRate / 100));
    const finalScore = Math.max(0, rawScore - penaltyScoreAmount);
    const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0;
    const correctCount = rawScore;
    const wrongCount = Math.max(0, totalQuestions - correctCount);

    // 13. Timezone Dates & Streak State Transitions
    const { todayStr, yesterdayStr } = getTashkentDateStrings();

    let oldScore = 0;
    let oldStreak = 0;
    let oldMaxStreak = 0;
    let lastQuizDate = null;
    let profileData = null;

    const dbClient = getSupabaseAdmin(token);

    if (authenticatedUser && dbClient) {
      try {
        const { data: prof, error: profErr } = await dbClient
          .from('profiles')
          .select('id, score, streak, stats, last_quiz_date')
          .eq('id', authenticatedUser.id)
          .maybeSingle();

        if (!profErr && prof) {
          profileData = prof;
          const stats = (prof.stats && typeof prof.stats === 'object') ? prof.stats : {};
          oldScore = Number(prof.score ?? stats.totalScore ?? stats.score ?? 0);
          oldStreak = Number(prof.streak ?? stats.currentStreak ?? 0);
          oldMaxStreak = Number(stats.maxStreak || oldStreak || 0);
          lastQuizDate = prof.last_quiz_date || stats.lastQuizDate || null;
        }
      } catch (e) {
        console.warn('[api/quiz-submit] Profile retrieval warning:', e.message);
      }
    }

    // Calculate XP Progression
    const { earnedXP, xpBreakdown } = calculateProgressionXP({
      finalScore,
      total: totalQuestions,
      percentage,
      penaltyRate,
      isDaily: Boolean(isDaily),
      currentStreak: oldStreak
    });

    // Determine Streak Transitions (Asia/Tashkent)
    let newStreak = 1;
    if (lastQuizDate === todayStr) {
      // Already completed a test today: retain current streak
      newStreak = Math.max(1, oldStreak);
    } else if (lastQuizDate === yesterdayStr) {
      // Consecutive calendar day: increment streak
      newStreak = oldStreak + 1;
    } else {
      // First test or broken streak: reset to 1
      newStreak = 1;
    }
    const newMaxStreak = Math.max(newStreak, oldMaxStreak);

    // Calculate Levels & Transitions
    const newScore = oldScore + earnedXP;
    const oldLevel = getUserLevel(oldScore);
    const newLevel = getUserLevel(newScore);
    const isLevelUp = newLevel.level > oldLevel.level;

    // 14. Commit Database Mutations (if authenticated)
    if (authenticatedUser && dbClient) {
      try {
        const existingStats = (profileData?.stats && typeof profileData.stats === 'object') ? profileData.stats : {};
        const activeDates = Array.isArray(existingStats.activeDates) ? [...existingStats.activeDates] : [];
        if (!activeDates.includes(todayStr)) {
          activeDates.push(todayStr);
        }
        const trimmedActiveDates = activeDates.slice(-60); // Keep last 60 active calendar days
        const testsCompleted = (Number(existingStats.testsCompleted) || 0) + 1;

        const updatedStats = {
          ...existingStats,
          totalScore: newScore,
          score: newScore,
          avgScore: newScore,
          bestScore: Math.max(newScore, Number(existingStats.bestScore || 0), percentage),
          currentStreak: newStreak,
          maxStreak: newMaxStreak,
          lastQuizDate: todayStr,
          activeDates: trimmedActiveDates,
          testsCompleted
        };

        // Update profiles table
        const { error: updateError } = await dbClient
          .from('profiles')
          .update({
            score: newScore,
            streak: newStreak,
            last_quiz_date: todayStr,
            stats: updatedStats
          })
          .eq('id', authenticatedUser.id);

        if (updateError && !profileData) {
          // Attempt upsert if profile row did not exist yet
          await dbClient.from('profiles').upsert({
            id: authenticatedUser.id,
            score: newScore,
            streak: newStreak,
            last_quiz_date: todayStr,
            stats: updatedStats,
            created_at: new Date().toISOString()
          }, { onConflict: 'id' });
        }

        // Insert audit log row into quiz_results
        const numericBookId = (targetBookId && /^\d+$/.test(targetBookId))
          ? parseInt(targetBookId, 10)
          : null;

        const auditPayload = {
          user_id: authenticatedUser.id,
          score: finalScore,
          total: totalQuestions,
          percentage,
          penalty: penaltyRate,
          date: todayStr,
          created_at: new Date().toISOString()
        };

        if (numericBookId !== null) {
          auditPayload.book_id = numericBookId;
        }

        await dbClient.from('quiz_results').insert(auditPayload);

      } catch (dbErr) {
        console.error('[api/quiz-submit] Database persistence error:', dbErr.message);
      }
    }

    // 15. Deliver Verified Result Payload
    return sendJson(res, 200, {
      success: true,
      authenticated: Boolean(authenticatedUser),
      persisted: Boolean(authenticatedUser),
      score: finalScore,
      rawScore,
      total: totalQuestions,
      percentage,
      penalty: penaltyRate,
      bookId: targetBookId,
      bookTitle: resolvedBookTitle,
      correctCount,
      wrongCount,
      xpEarned: earnedXP,
      xpBreakdown,
      userLevel: newLevel,
      oldLevel,
      newLevel,
      isLevelUp,
      currentStreak: newStreak,
      newStreak,
      newScore,
      answers: verifiedAnswers
    });

  } catch (error) {
    console.error('[api/quiz-submit] Unhandled grading error:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal server error occurred while grading quiz submission.'
    });
  }
}
