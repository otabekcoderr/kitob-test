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
import { verifyQuizSession, evaluatePace, fingerprintQuestions } from './_session.js';
import { questions as staticQuestions, books as staticBooks } from '../js/data.js';

// In-memory rate limiting cache to prevent double-click / rapid replay race conditions
const SUBMISSION_COOLDOWN_MS = 2000;
const _recentSubmissions = new Map(); // key: userId -> timestamp

// Maximum questions in one exam. Mirrors the cap applied by GET /api/quiz and
// is the denominator used for the score percentage.
const EXAM_QUESTION_LIMIT = 10;

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
      isDaily = false,
      // Client-declared prior state. Only honoured for anonymous attempts,
      // where nothing is persisted; for authenticated users the `profiles`
      // row is the single source of truth (a client could otherwise inflate
      // its own streak and XP).
      currentStreak: rawCurrentStreak = 0,
      lastQuizDate: rawLastQuizDate = null
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

    // 7. Anti-cheat session is parsed here but fully validated in step 9.5,
    //    after identity is known, so the user-binding check has something to
    //    compare against. The legacy client-supplied `quizStartTime` is kept
    //    only as a weak best-effort replay guard: the client clock is
    //    attacker-controlled, so it can never prove legitimacy.
    if (!body.sessionToken && typeof quizStartTime === 'number') {
      const elapsedMs = Date.now() - quizStartTime;
      if (rawAnswers.length >= 5 && elapsedMs >= 0 && elapsedMs < 2000) {
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

    // 9.5 Session validation (server-authoritative timing + question binding)
    const targetBookId = String(bookId).trim();
    const targetBookSlug = slugify(targetBookId);

    const sessionCheck = verifyQuizSession(body.sessionToken);
    let sessionVerified = false;
    let sessionPace = null;

    if (sessionCheck.ok) {
      const { payload } = sessionCheck;

      if (slugify(String(payload.bid)) !== targetBookSlug) {
        return sendJson(res, 400, {
          success: false,
          error: 'Test sessiyasi boshqa kitobga tegishli.',
          code: 'SESSION_BOOK_MISMATCH'
        });
      }

      if (authenticatedUser && payload.uid && payload.uid !== authenticatedUser.id) {
        return sendJson(res, 403, {
          success: false,
          error: 'Test sessiyasi boshqa foydalanuvchiga tegishli.',
          code: 'SESSION_USER_MISMATCH'
        });
      }

      // The delivered question set is signed, so a caller cannot submit
      // answers for questions it was never served.
      if (Array.isArray(payload.qids) && payload.qids.length > 0) {
        if (fingerprintQuestions(payload.qids) !== payload.fp) {
          return sendJson(res, 400, {
            success: false,
            error: 'Test sessiyasi tasdiqlanmadi.',
            code: 'SESSION_TAMPERED'
          });
        }

        const delivered = new Set(payload.qids.map(String));
        const foreign = rawAnswers.filter(a => {
          const id = a?.questionId ?? a?.id;
          return id !== undefined && !delivered.has(String(id));
        });
        if (foreign.length > 0) {
          return sendJson(res, 400, {
            success: false,
            error: 'Yuborilgan savollar ushbu testga tegishli emas.',
            code: 'QUESTION_SET_MISMATCH'
          });
        }
      }

      sessionPace = evaluatePace(payload, rawAnswers.length);
      if (sessionPace.suspicious) {
        return sendJson(res, 400, {
          success: false,
          error: 'Test topshirish vaqti shubhali darajada qisqa. Avtomatlashtirilgan so\'rovlar taqiqlanadi.',
          code: 'SPEED_HACK_DETECTED'
        });
      }

      sessionVerified = true;
    }

    // 10. Load Authoritative Questions (js/data.js + Supabase)

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

    // BL-8 fix: the denominator must be the authoritative exam length, never
    // the number of answers the client chose to send. Previously
    // `rawAnswers.length` let a caller answer one question correctly, submit
    // it alone, and receive 100% plus the full 25 XP accuracy bonus.
    //
    // The exam length is capped at EXAM_QUESTION_LIMIT because that is what
    // GET /api/quiz delivers. Capping matters here: js/data.js and Supabase
    // use different question id schemes (`q_otkan-kunlar_1` vs `q-ot-1`), so
    // authMap legitimately holds ~20 entries for a 10-question book and an
    // uncapped count would halve every percentage.
    const totalQuestions = authQuestions.length > 0
      ? Math.min(authQuestions.length, EXAM_QUESTION_LIMIT)
      : Math.min(rawAnswers.length, EXAM_QUESTION_LIMIT);

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

    if (!authenticatedUser) {
      // Anonymous practice attempt: nothing is written, so the client-declared
      // streak can be used for the preview without affecting any stored data.
      oldStreak = Math.max(0, Number(rawCurrentStreak) || 0);
      lastQuizDate = typeof rawLastQuizDate === 'string' && rawLastQuizDate ? rawLastQuizDate : null;
    }

    if (authenticatedUser && dbClient) {
      // BL-1 fix: distinguish "row genuinely does not exist yet" from
      // "read failed". Treating a transient read failure as a fresh profile
      // made every write start from zero, wiping accumulated score and streak.
      let readSucceeded = false;
      try {
        const { data: prof, error: profErr } = await dbClient
          .from('profiles')
          // The live `profiles` table only has id, username, full_name, avatar,
          // avatar_image, avatar_char_id, is_admin, stats, created_at. There are
          // no `score` / `streak` / `last_quiz_date` columns, so selecting them
          // made every authenticated submission fail with
          // "column profiles.score does not exist". All progression state lives
          // in the `stats` jsonb blob.
          .select('id, stats')
          .eq('id', authenticatedUser.id)
          .maybeSingle();

        if (!profErr) {
          readSucceeded = true;
          if (prof) {
            profileData = prof;
            const stats = (prof.stats && typeof prof.stats === 'object') ? prof.stats : {};
            oldScore = Number(stats.totalScore ?? stats.score ?? stats.avgScore ?? 0);
            oldStreak = Number(stats.currentStreak ?? 0);
            oldMaxStreak = Number(stats.maxStreak || oldStreak || 0);
            lastQuizDate = stats.lastQuizDate || null;
          }
        } else {
          console.error('[api/quiz-submit] Profile read failed:', profErr.message);
        }
      } catch (e) {
        console.error('[api/quiz-submit] Profile read threw:', e.message);
      }

      if (!readSucceeded) {
        // Refuse to persist rather than overwrite unknown state with zeros.
        return sendJson(res, 503, {
          success: false,
          error: 'Natijani saqlash vaqtida vaqtinchalik xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko\'ring.',
          code: 'PROFILE_UNAVAILABLE',
          // The graded result is still returned so the client can show it as an
          // unverified practice attempt instead of silently discarding it.
          score: finalScore,
          rawScore,
          total: totalQuestions,
          percentage,
          persisted: false
        });
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
    let persisted = false;
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

        if (!profileData) {
          // Brand-new user: no row to compare against, so create it directly.
          const { error: insertError } = await dbClient.from('profiles').upsert({
            id: authenticatedUser.id,
            stats: updatedStats,
            created_at: new Date().toISOString()
          }, { onConflict: 'id' });

          if (insertError) {
            throw new Error(insertError.message);
          }
        } else {
          // BL-3 fix: compare-and-swap on the previously observed total score.
          // Two concurrent submissions on different lambda instances would
          // otherwise both compute `oldScore + earnedXP` from the same base,
          // and the second write would silently erase the first one's XP.
          //
          // The CAS predicate reads `stats->>'totalScore'` because the live
          // table has no dedicated score column.
          const { error: updateError, data: updatedRows } = await dbClient
            .from('profiles')
            .update({
              stats: updatedStats
            })
            .eq('id', authenticatedUser.id)
            .eq('stats->>totalScore', String(oldScore))
            .select('id');

          if (updateError) {
            throw new Error(updateError.message);
          }

          if (Array.isArray(updatedRows) && updatedRows.length === 0) {
            // Score moved underneath us — a concurrent submission won the race.
            console.warn('[api/quiz-submit] Optimistic lock conflict for user', authenticatedUser.id);
            return sendJson(res, 409, {
              success: false,
              error: 'Natijani saqlashda moslik xatosi yuz berdi. Iltimos, qayta urinib ko\'ring.',
              code: 'PROFILE_WRITE_CONFLICT',
              score: finalScore,
              total: totalQuestions,
              percentage,
              persisted: false
            });
          }
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

        persisted = true;
      } catch (dbErr) {
        console.error('[api/quiz-submit] Database persistence error:', dbErr.message);
      }
    }

    // 15. Deliver Verified Result Payload
    return sendJson(res, 200, {
      success: true,
      authenticated: Boolean(authenticatedUser),
      persisted,
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
      // Anti-cheat provenance so the client can label the attempt honestly.
      sessionVerified,
      elapsedMs: sessionPace ? sessionPace.elapsedMs : null,
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
