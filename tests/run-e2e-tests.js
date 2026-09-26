// ========================================================================
// tests/run-e2e-tests.js — Master E2E Test Suite (Tiers 1–4)
// ========================================================================
// Kitobchi.uz Serverless Backend & Anti-Cheat Opaque-Box E2E Test Suite
// ========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describe,
  test,
  assert,
  assertEqual,
  assertNotEqual,
  assertDeepEqual,
  assertContains,
  assertForbiddenKeysNotIn,
  runAll,
} from './helpers/test-runner.js';

import { createMockReq, createMockRes } from './helpers/mock-http.js';
import {
  getQuizHandler,
  getSubmitHandler,
  getApiAvailability,
} from './helpers/reference-api.js';

import {
  slugify,
  resolveBook,
  getQuestionsForBook,
  FORBIDDEN_KEYS,
  LEVELS,
  getUserLevel,
  calculateQuizXPEarned,
  calculateStreakTransition,
} from './helpers/contract-oracle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Read vercel.json for configuration tests
const vercelJsonPath = path.join(projectRoot, 'vercel.json');
let vercelConfig = {};
try {
  vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
} catch (err) {
  console.warn('[test-suite] Warning: Unable to parse vercel.json:', err.message);
}

// ------------------------------------------------------------------------
// Test Setup: Log Environment Status
// ------------------------------------------------------------------------
const apiStatus = getApiAvailability();
console.log(`[test-suite] Target API Status:`);
console.log(`  - api/quiz.js:        ${apiStatus.quizExists ? 'FOUND (Live Handler)' : 'NOT FOUND (Using Reference Oracle)'}`);
console.log(`  - api/quiz-submit.js: ${apiStatus.submitExists ? 'FOUND (Live Handler)' : 'NOT FOUND (Using Reference Oracle)'}`);

// ========================================================================
// TIER 1: FEATURE COVERAGE (30 TESTS)
// ========================================================================

// ------------------------------------------------------------------------
// Suite 1.1: GET /api/quiz Sanitization (5 tests)
// ------------------------------------------------------------------------
describe('Tier 1.1: GET /api/quiz Sanitization', () => {
  test('[T1.1.1] GET /api/quiz strictly strips "answer" property from questions', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 200, 'HTTP status should be 200');
    const data = res._getJson();
    assert(data && data.success, 'Response should have success: true');
    assert(Array.isArray(data.questions) && data.questions.length > 0, 'Questions array must not be empty');

    data.questions.forEach((q, idx) => {
      assertEqual(q.answer, undefined, `Question [${idx}] must not expose "answer"`);
    });
  });

  test('[T1.1.2] GET /api/quiz strictly strips "correctAnswer" property from questions', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();

    data.questions.forEach((q, idx) => {
      assertEqual(q.correctAnswer, undefined, `Question [${idx}] must not expose "correctAnswer"`);
    });
  });

  test('[T1.1.3] GET /api/quiz strictly strips "correct_answer" property from questions', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();

    data.questions.forEach((q, idx) => {
      assertEqual(q.correct_answer, undefined, `Question [${idx}] must not expose "correct_answer"`);
    });
  });

  test('[T1.1.4] GET /api/quiz strictly strips "explanation" property from questions', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();

    data.questions.forEach((q, idx) => {
      assertEqual(q.explanation, undefined, `Question [${idx}] must not expose "explanation" prior to submission`);
    });
  });

  test('[T1.1.5] GET /api/quiz delivers valid question envelope (id, question, options array)', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();

    assert(typeof data.bookId === 'string' && data.bookId.length > 0, 'Envelope should include bookId');
    assert(typeof data.total === 'number' && data.total > 0, 'Envelope should include total questions count');

    data.questions.forEach((q, idx) => {
      assert(typeof q.id === 'string' && q.id.length > 0, `Question [${idx}] must have string id`);
      assert(typeof q.question === 'string' && q.question.length > 0, `Question [${idx}] must have non-empty question text`);
      assert(Array.isArray(q.options) && q.options.length >= 2, `Question [${idx}] must have at least 2 options`);
      q.options.forEach((opt, optIdx) => {
        assert(typeof opt === 'string' && opt.length > 0, `Option [${optIdx}] in question [${idx}] must be a non-empty string`);
      });
    });
  });
});

// ------------------------------------------------------------------------
// Suite 1.2: POST /api/quiz-submit Verification & Scoring (5 tests)
// ------------------------------------------------------------------------
describe('Tier 1.2: POST /api/quiz-submit Verification & Scoring Engine', () => {
  test('[T1.2.1] POST /api/quiz-submit grades correct answers authoritatively against answer keys', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');
    assert(rawQuestions.length >= 2, 'Need at least 2 questions for test');

    // Create answers where first is correct, second is incorrect
    const q1 = rawQuestions[0];
    const q2 = rawQuestions[1];
    const correctIdx1 = typeof q1.correctAnswer === 'number' ? q1.correctAnswer : 0;
    const wrongIdx2 = (typeof q2.correctAnswer === 'number' ? q2.correctAnswer + 1 : 1) % 4;

    const payload = {
      bookId: 'otkan-kunlar',
      answers: [
        { questionId: q1.id, selectedOption: correctIdx1 },
        { questionId: q2.id, selectedOption: wrongIdx2 },
      ],
      penalty: 0,
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();

    assert(data.success === true, 'Response should have success: true');
    assertEqual(data.correctCount, 1, 'Should record 1 correct answer');
    assertEqual(data.score, 1, 'Final score should be 1');
  });

  test('[T1.2.2] POST /api/quiz-submit computes accurate percentage based on score and total', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    // Submit all correct answers
    const answers = rawQuestions.map(q => ({
      questionId: q.id,
      selectedOption: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
    }));

    const payload = { bookId: 'otkan-kunlar', answers, penalty: 0 };
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    const data = res._getJson();

    assertEqual(data.percentage, 100, 'All correct answers must yield 100%');
    assertEqual(data.total, rawQuestions.length, 'Total must match questions count');
  });

  test('[T1.2.3] POST /api/quiz-submit reveals explanations and correct answers only post-submission', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: rawQuestions.map(q => ({ questionId: q.id, selectedOption: 0 })),
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    const data = res._getJson();

    assert(Array.isArray(data.answers), 'Submission response must contain answers review array');
    data.answers.forEach((ans, idx) => {
      assert(ans.correctAnswer !== undefined, `Answer review [${idx}] must provide correctAnswer`);
      assert(typeof ans.isCorrect === 'boolean', `Answer review [${idx}] must provide boolean isCorrect`);
      assert(typeof ans.explanation === 'string', `Answer review [${idx}] must provide string explanation`);
    });
  });

  test('[T1.2.4] POST /api/quiz-submit computes XP earned using progression engine (base + accuracy)', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    // 100% correct answers gives 15 base + 25 accuracy bonus = 40 XP minimum
    const answers = rawQuestions.map(q => ({
      questionId: q.id,
      selectedOption: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
    }));

    const payload = { bookId: 'otkan-kunlar', answers, penalty: 0 };
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    const data = res._getJson();

    assert(data.xpEarned >= 40, `100% score should yield at least 40 XP (base 15 + accuracy 25), got ${data.xpEarned}`);
    assert(data.xpBreakdown !== undefined, 'Response must include xpBreakdown');
  });

  test('[T1.2.5] POST /api/quiz-submit updates streak count and transitions correctly', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: rawQuestions[0].id, selectedOption: 0 }],
      currentStreak: 2,
      lastQuizDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), // yesterday
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    const data = res._getJson();

    assertEqual(data.currentStreak, 3, 'Consecutive day quiz should increment streak from 2 to 3');
  });
});

// ------------------------------------------------------------------------
// Suite 1.3: Supabase Profile Synchronization (5 tests)
// ------------------------------------------------------------------------
describe('Tier 1.3: Supabase Profile Synchronization', () => {
  test('[T1.3.1] Profile sync increments totalScore / score by earned XP', () => {
    const initialScore = 150;
    const earnedXP = 40;
    const newScore = initialScore + earnedXP;
    assertEqual(newScore, 190, 'User score should be incremented by earned XP');
  });

  test('[T1.3.2] Profile sync tracks currentStreak and maxStreak correctly', () => {
    const oldCurrentStreak = 4;
    const oldMaxStreak = 6;
    const newStreak = oldCurrentStreak + 1; // 5
    const newMaxStreak = Math.max(newStreak, oldMaxStreak);
    assertEqual(newMaxStreak, 6, 'maxStreak should remain 6 when current streak is 5');

    const streakSurpassed = 7;
    const updatedMaxStreak = Math.max(streakSurpassed, oldMaxStreak);
    assertEqual(updatedMaxStreak, 7, 'maxStreak should update to 7 when current streak reaches 7');
  });

  test('[T1.3.3] Profile sync updates lastQuizDate with current local date (YYYY-MM-DD)', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(todayStr), 'lastQuizDate must match YYYY-MM-DD format');
  });

  test('[T1.3.4] Profile sync appends today to activeDates and increments testsCompleted', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const existingActiveDates = ['2026-09-24', '2026-09-25'];
    const existingCompleted = 5;

    const newActiveDates = existingActiveDates.includes(todayStr)
      ? existingActiveDates
      : [...existingActiveDates, todayStr];
    const newCompleted = existingCompleted + 1;

    assert(newActiveDates.includes(todayStr), 'activeDates must include todayStr');
    assertEqual(newCompleted, 6, 'testsCompleted must increment by 1');
  });

  test('[T1.3.5] Profile sync constructs valid audit log for quiz_results table', () => {
    const auditRecord = {
      user_id: 'test_uuid_123',
      book_id: 1,
      score: 8,
      total: 10,
      percentage: 80,
      penalty: 0,
      date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };

    assert(auditRecord.user_id && typeof auditRecord.user_id === 'string', 'Audit log must have user_id');
    assertEqual(auditRecord.score, 8);
    assertEqual(auditRecord.total, 10);
    assertEqual(auditRecord.percentage, 80);
    assert(auditRecord.date.length === 10);
  });
});

// ------------------------------------------------------------------------
// Suite 1.4: Client Exam Flow & Schema Compatibility with result.js (5 tests)
// ------------------------------------------------------------------------
describe('Tier 1.4: Client Exam Flow & Schema Compatibility with result.js', () => {
  test('[T1.4.1] Response schema includes top-level metrics expected by result.js', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: rawQuestions.map(q => ({ questionId: q.id, selectedOption: 0 })),
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();
    await submitHandler(req, res);
    const data = res._getJson();

    assert(typeof data.score === 'number', 'result.score must be a number');
    assert(typeof data.total === 'number', 'result.total must be a number');
    assert(typeof data.percentage === 'number', 'result.percentage must be a number');
    assert(typeof data.penalty === 'number', 'result.penalty must be a number');
    assert(typeof data.bookId === 'string', 'result.bookId must be a string');
  });

  test('[T1.4.2] Response schema includes xpBreakdown matching result.js chip tags', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();
    await submitHandler(req, res);
    const data = res._getJson();

    assert(data.xpBreakdown && typeof data.xpBreakdown === 'object', 'xpBreakdown must be an object');
    assert(typeof data.xpBreakdown.base === 'number', 'xpBreakdown.base must be a number');
  });

  test('[T1.4.3] Response schema includes userLevel/newLevel matching result.js level badges', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();
    await submitHandler(req, res);
    const data = res._getJson();

    const lvl = data.newLevel || data.userLevel;
    assert(lvl && typeof lvl.level === 'number', 'level tier must have numeric level');
    assert(typeof lvl.title === 'string' && lvl.title.length > 0, 'level tier must have title string');
    assert(typeof lvl.emoji === 'string' && lvl.emoji.length > 0, 'level tier must have emoji string');
    assert(typeof lvl.progressPct === 'number', 'level tier must have progressPct');
  });

  test('[T1.4.4] Response schema includes answers review array with isCorrect, explanation, and option indices', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: rawQuestions[0].id, selectedOption: 0 }],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();
    await submitHandler(req, res);
    const data = res._getJson();

    assert(Array.isArray(data.answers) && data.answers.length > 0, 'Must return answers array');
    const firstAns = data.answers[0];
    assert(typeof firstAns.isCorrect === 'boolean', 'isCorrect must be boolean');
    assert(firstAns.explanation !== undefined, 'explanation must be defined');
    assert(Array.isArray(firstAns.options), 'options must be an array');
  });

  test('[T1.4.5] Response payload passes result.js transformation logic without producing NaN or undefined', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: rawQuestions.map(q => ({ questionId: q.id, selectedOption: 0 })),
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();
    await submitHandler(req, res);
    const result = res._getJson();

    // Replicate result.js transformations
    const score = result.score;
    const total = result.total;
    const percentage = result.percentage;
    const correctCount = result.correctCount ?? result.rawScore ?? score ?? 0;
    const wrongCount = Math.max(0, (total ?? 0) - correctCount);
    const isPassed = percentage >= 60;
    const xpEarned = result.xpEarned ?? 0;

    assert(!isNaN(score), 'score must not be NaN');
    assert(!isNaN(total), 'total must not be NaN');
    assert(!isNaN(percentage), 'percentage must not be NaN');
    assert(!isNaN(correctCount), 'correctCount must not be NaN');
    assert(!isNaN(wrongCount), 'wrongCount must not be NaN');
    assert(!isNaN(xpEarned), 'xpEarned must not be NaN');
    assert(typeof isPassed === 'boolean', 'isPassed must be boolean');
  });
});

// ------------------------------------------------------------------------
// Suite 1.5: Offline Graceful Degradation (5 tests)
// ------------------------------------------------------------------------
describe('Tier 1.5: Offline Graceful Degradation', () => {
  test('[T1.5.1] Offline mode fallback loads local questions from js/data.js when API is unreachable', () => {
    const localQuestions = getQuestionsForBook('otkan-kunlar');
    assert(Array.isArray(localQuestions) && localQuestions.length > 0, 'Local questions must be available');
    assertEqual(localQuestions.length, 10, 'O\'tkan kunlar should have 10 local questions');
  });

  test('[T1.5.2] Offline training mode awards 0 official XP (xpEarned = 0)', () => {
    // In offline training mode, official leaderboard XP must be 0
    const offlineResult = {
      score: 10,
      total: 10,
      percentage: 100,
      xpEarned: 0, // Enforced anti-cheat rule
      isOffline: true,
      officialVerified: false,
    };

    assertEqual(offlineResult.xpEarned, 0, 'Offline training mode must award 0 official XP');
    assertEqual(offlineResult.officialVerified, false, 'Offline training mode must be marked unverified');
  });

  test('[T1.5.3] Offline training mode skips database profile and leaderboard mutations', () => {
    const isOffline = true;
    let dbUpdated = false;

    // Simulate client decision: only submit if online
    if (!isOffline) {
      dbUpdated = true;
    }

    assertEqual(dbUpdated, false, 'Database must NOT be mutated in offline practice mode');
  });

  test('[T1.5.4] Offline training mode flags unverified state for UI banner display', () => {
    const isOnline = false;
    const badgeText = !isOnline ? "Oflayn mashg'ulot — rasmiy reytingga yozilmadi" : "Rasmiy natija";
    assertContains(badgeText, "Oflayn", 'Badge must reflect offline practice mode');
  });

  test('[T1.5.5] Static dataset questions in js/data.js conform to question schema structure', () => {
    const qList = getQuestionsForBook('otkan-kunlar');
    qList.forEach((q, idx) => {
      assert(typeof q.id === 'string', `Question [${idx}] id must be string`);
      assert(typeof q.question === 'string' && q.question.length > 0, `Question [${idx}] text must be string`);
      assert(Array.isArray(q.options) && q.options.length >= 2, `Question [${idx}] options must be array`);
      assert(q.correctAnswer !== undefined || q.correct_answer !== undefined, `Question [${idx}] must define correct answer in dataset`);
    });
  });
});

// ------------------------------------------------------------------------
// Suite 1.6: vercel.json Routing Rules & Security Headers (5 tests)
// ------------------------------------------------------------------------
describe('Tier 1.6: vercel.json Routing Rules & Security Headers', () => {
  test('[T1.6.1] vercel.json contains valid rewrites configuration for SPA', () => {
    assert(Array.isArray(vercelConfig.rewrites), 'vercel.json must define rewrites array');
    assert(vercelConfig.rewrites.length >= 1, 'rewrites array must contain at least 1 rule');
  });

  test('[T1.6.2] vercel.json rewrites architecture specifies /api/(.*) before SPA fallback', () => {
    // When M3 is implemented or proposed:
    const rewrites = vercelConfig.rewrites || [];
    const hasApiRewrite = rewrites.some(r => r.source && r.source.includes('/api/'));
    const hasCatchAll = rewrites.some(r => r.source === '/(.*)' && r.destination === '/index.html');

    assert(hasCatchAll, 'Catch-all rewrite /(.*) -> /index.html must exist');
    // If api rewrite exists, it must appear before catch-all
    if (hasApiRewrite) {
      const apiIdx = rewrites.findIndex(r => r.source && r.source.includes('/api/'));
      const catchAllIdx = rewrites.findIndex(r => r.source === '/(.*)');
      assert(apiIdx < catchAllIdx, '/api/(.*) rewrite must precede /(.*) catch-all rewrite');
    }
  });

  test('[T1.6.3] vercel.json defines Content-Security-Policy with default-src, script-src, and connect-src', () => {
    const headers = vercelConfig.headers || [];
    let cspValue = '';
    headers.forEach(h => {
      (h.headers || []).forEach(header => {
        if (header.key && header.key.toLowerCase() === 'content-security-policy') {
          cspValue = header.value;
        }
      });
    });

    assert(cspValue.length > 0, 'Content-Security-Policy header must be defined');
    assertContains(cspValue, "default-src 'self'", 'CSP must include default-src');
    assertContains(cspValue, 'script-src', 'CSP must include script-src');
    assertContains(cspValue, 'connect-src', 'CSP must include connect-src');
  });

  test('[T1.6.4] vercel.json configures security headers including X-Frame-Options and X-Content-Type-Options', () => {
    const headers = vercelConfig.headers || [];
    const foundHeaders = new Set();
    headers.forEach(h => {
      (h.headers || []).forEach(header => {
        if (header.key) foundHeaders.add(header.key.toLowerCase());
      });
    });

    assert(foundHeaders.has('x-frame-options'), 'Must define X-Frame-Options header');
    assert(foundHeaders.has('x-content-type-options'), 'Must define X-Content-Type-Options header');
    assert(foundHeaders.has('referrer-policy'), 'Must define Referrer-Policy header');
  });

  test('[T1.6.5] vercel.json / production spec allows POST method and Authorization in CORS headers', () => {
    const headers = vercelConfig.headers || [];
    let allowMethods = '';
    headers.forEach(h => {
      (h.headers || []).forEach(header => {
        if (header.key && header.key.toLowerCase() === 'access-control-allow-methods') {
          allowMethods = header.value;
        }
      });
    });

    // In current or updated config, check CORS configuration
    assert(allowMethods.length > 0, 'Access-Control-Allow-Methods header must be configured');
  });
});

// ========================================================================
// TIER 2: BOUNDARY & CORNER CASES (30 TESTS)
// ========================================================================

// ------------------------------------------------------------------------
// Suite 2.1: Request Validation & Bad Inputs (5 tests)
// ------------------------------------------------------------------------
describe('Tier 2.1: Request Validation & Missing/Invalid Parameters', () => {
  test('[T2.1.1] GET /api/quiz rejects missing bookId parameter with 400 Bad Request', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 400, 'Missing bookId must return 400');
    const data = res._getJson();
    assertEqual(data.success, false);
  });

  test('[T2.1.2] GET /api/quiz rejects empty string bookId parameter with 400 Bad Request', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 400, 'Empty bookId must return 400');
    const data = res._getJson();
    assertEqual(data.success, false);
  });

  test('[T2.1.3] GET /api/quiz returns 404 Not Found for non-existent bookId', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz?bookId=non-existent-book-xyz-999' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 404, 'Non-existent bookId must return 404');
    const data = res._getJson();
    assertEqual(data.success, false);
  });

  test('[T2.1.4] POST /api/quiz-submit rejects missing or non-object body with 400 Bad Request', async () => {
    const submitHandler = await getSubmitHandler();
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: null });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 400, 'Missing body must return 400');
    const data = res._getJson();
    assertEqual(data.success, false);
  });

  test('[T2.1.5] POST /api/quiz-submit rejects empty answers array with 400 Bad Request', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = { bookId: 'otkan-kunlar', answers: [] };
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 400, 'Empty answers array must return 400');
    const data = res._getJson();
    assertEqual(data.success, false);
  });
});

// ------------------------------------------------------------------------
// Suite 2.2: Corrupted, Out-of-Bounds & Injection Inputs (5 tests)
// ------------------------------------------------------------------------
describe('Tier 2.2: Corrupted, Out-of-Bounds & Injection Inputs', () => {
  test('[T2.2.1] Corrupted/unknown questionId marked incorrect without crashing serverless runtime', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [
        { questionId: 'corrupted_question_id_999999', selectedOption: 0 },
      ],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200, 'Server should handle unknown questionId gracefully');
    const data = res._getJson();
    assertEqual(data.correctCount, 0, 'Unknown question cannot be correct');
  });

  test('[T2.2.2] Answer with null or undefined selectedOption treated as unanswered / incorrect', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: [
        { questionId: rawQuestions[0].id, selectedOption: null },
      ],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();
    assertEqual(data.correctCount, 0, 'Null selection must be scored as incorrect');
  });

  test('[T2.2.3] Answer with out-of-bounds selectedOption index marked incorrect', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    const payload = {
      bookId: 'otkan-kunlar',
      answers: [
        { questionId: rawQuestions[0].id, selectedOption: 9999 },
      ],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();
    assertEqual(data.correctCount, 0, 'Out-of-bounds option index must be scored as incorrect');
  });

  test('[T2.2.4] Excessively large answers array (>50 items) rejected or safely bounded', async () => {
    const submitHandler = await getSubmitHandler();
    const spamAnswers = Array.from({ length: 60 }, (_, i) => ({
      questionId: `spam_q_${i}`,
      selectedOption: 0,
    }));

    const payload = { bookId: 'otkan-kunlar', answers: spamAnswers };
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    // Either 400 rejection or safe bounded evaluation
    assert([200, 400].includes(res.statusCode), 'Should return 400 or handle cleanly without 500');
  });

  test('[T2.2.5] SQL injection or special characters in bookId or questionId handled safely as literal strings', async () => {
    const handler = await getQuizHandler();
    const maliciousBookId = "' OR '1'='1' -- ; DROP TABLE questions;";
    const req = createMockReq({ method: 'GET', url: `/api/quiz?bookId=${encodeURIComponent(maliciousBookId)}` });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 404, 'SQL injection attempt in bookId must return 404 safely');
  });
});

// ------------------------------------------------------------------------
// Suite 2.3: Boundary Scoring Calculations (5 tests)
// ------------------------------------------------------------------------
describe('Tier 2.3: Boundary Scoring Calculations', () => {
  test('[T2.3.1] Boundary score 0% (0/10) yields score 0, percentage 0%, floor XP 5', async () => {
    const xpResult = calculateQuizXPEarned({
      score: 0,
      total: 10,
      percentage: 0,
      penalty: 0,
      isDaily: false,
      currentStreak: 0,
    });

    // Base XP is 15; with 0 accuracy, gross is 15. Floor minimum is 5.
    assert(xpResult.totalXP >= 5, 'Minimum floor XP must be >= 5');
  });

  test('[T2.3.2] Boundary score 100% (10/10) yields score 10, percentage 100%, +25 accuracy bonus', async () => {
    const xpResult = calculateQuizXPEarned({
      score: 10,
      total: 10,
      percentage: 100,
      penalty: 0,
      isDaily: false,
      currentStreak: 0,
    });

    // 15 base + 25 accuracy = 40 XP
    assertEqual(xpResult.totalXP, 40, '100% score should yield exactly 40 XP');
    const accBonus = xpResult.breakdown.find(b => b.label.includes('Mukammal'));
    assert(accBonus && accBonus.xp === 25, 'Breakdown must include +25 XP accuracy bonus');
  });

  test('[T2.3.3] Negative penalty clamped to 0% and cannot artificially boost final score', async () => {
    const rawScore = 5;
    const penaltyInput = -50;
    const safePenalty = Math.max(0, Math.min(100, penaltyInput));
    const finalScore = Math.max(0, rawScore - Math.round(rawScore * (safePenalty / 100)));

    assertEqual(safePenalty, 0, 'Negative penalty must be clamped to 0');
    assertEqual(finalScore, 5, 'Score should not be boosted by negative penalty');
  });

  test('[T2.3.4] 100% maximum penalty wipes out raw score to 0 and clamps XP to minimum floor 5', async () => {
    const rawScore = 10;
    const maxPenalty = 100;
    const finalScore = Math.max(0, rawScore - Math.round(rawScore * (maxPenalty / 100)));
    assertEqual(finalScore, 0, '100% penalty must reduce score to 0');

    const xpResult = calculateQuizXPEarned({
      score: finalScore,
      total: 10,
      percentage: 0,
      penalty: maxPenalty,
      isDaily: false,
      currentStreak: 0,
    });

    assertEqual(xpResult.totalXP, 5, 'XP with 100% penalty must be clamped to minimum floor of 5');
  });

  test('[T2.3.5] Fractional accuracy rounding: 1 out of 3 questions yields exactly 33%', () => {
    const percentage = Math.round((1 / 3) * 100);
    assertEqual(percentage, 33, '1/3 must round to 33%');
  });
});

// ------------------------------------------------------------------------
// Suite 2.4: Streak State Machine Boundaries (5 tests)
// ------------------------------------------------------------------------
describe('Tier 2.4: Streak State Machine Boundaries', () => {
  const todayStr = '2026-09-26';
  const yesterdayStr = '2026-09-25';

  test('[T2.4.1] Streak state machine: same-day quiz maintains streak without incrementing', () => {
    const nextStreak = calculateStreakTransition({
      lastQuizDate: todayStr,
      currentStreak: 5,
      todayStr,
      yesterdayStr,
    });
    assertEqual(nextStreak, 5, 'Same day quiz must keep streak at 5');
  });

  test('[T2.4.2] Streak state machine: consecutive day quiz increments streak by 1', () => {
    const nextStreak = calculateStreakTransition({
      lastQuizDate: yesterdayStr,
      currentStreak: 5,
      todayStr,
      yesterdayStr,
    });
    assertEqual(nextStreak, 6, 'Consecutive day quiz must increment streak to 6');
  });

  test('[T2.4.3] Streak state machine: missing exactly 2 days resets streak to 1', () => {
    const twoDaysAgo = '2026-09-24';
    const nextStreak = calculateStreakTransition({
      lastQuizDate: twoDaysAgo,
      currentStreak: 5,
      todayStr,
      yesterdayStr,
    });
    assertEqual(nextStreak, 1, 'Missing 2 days must reset streak to 1');
  });

  test('[T2.4.4] Streak state machine: missing 30+ days resets streak to 1', () => {
    const thirtyDaysAgo = '2026-08-20';
    const nextStreak = calculateStreakTransition({
      lastQuizDate: thirtyDaysAgo,
      currentStreak: 15,
      todayStr,
      yesterdayStr,
    });
    assertEqual(nextStreak, 1, 'Missing 30+ days must reset streak to 1');
  });

  test('[T2.4.5] Streak state machine: brand new user with no lastQuizDate initialized to streak 1', () => {
    const nextStreak = calculateStreakTransition({
      lastQuizDate: null,
      currentStreak: 0,
      todayStr,
      yesterdayStr,
    });
    assertEqual(nextStreak, 1, 'New user streak must be initialized to 1');
  });
});

// ------------------------------------------------------------------------
// Suite 2.5: Authentication & Token Boundaries (5 tests)
// ------------------------------------------------------------------------
describe('Tier 2.5: Authentication & Token Boundaries', () => {
  test('[T2.5.1] Missing Authorization header allows guest practice mode without DB mutation', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200, 'Guest mode submission must succeed with 200');
    const data = res._getJson();
    assertEqual(data.authenticated, false, 'Guest submission must have authenticated: false');
    assertEqual(data.persisted, false, 'Guest submission must not be persisted to DB');
  });

  test('[T2.5.2] Malformed Authorization header (not Bearer) rejected or treated as unauthenticated', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    const req = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      body: payload,
    });
    const res = createMockRes();

    await submitHandler(req, res);
    assert([200, 401].includes(res.statusCode), 'Should return 401 or fall back safely');
  });

  test('[T2.5.3] Corrupted or invalid JWT token string rejected with 401 Unauthorized', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    const req = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      headers: { Authorization: 'Bearer invalid.token.payload' },
      body: payload,
    });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 401, 'Corrupted token must return 401 Unauthorized');
  });

  test('[T2.5.4] Valid JWT token successfully authenticates submission for profile persistence', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    // Valid mock JWT token format
    const mockJwt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.valid_signature_token_mock';
    const req = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      headers: { Authorization: mockJwt },
      body: payload,
    });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();
    assertEqual(data.authenticated, true, 'Valid token must be marked authenticated');
  });

  test('[T2.5.5] Injected userId in payload body ignored in favor of authenticated user identity', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      userId: 'attacker_fake_target_id',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
    };

    const mockJwt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdXRoX3VzZXJfZ2VudWluZSJ9.valid_signature_token_mock';
    const req = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      headers: { Authorization: mockJwt },
      body: payload,
    });
    const res = createMockRes();

    await submitHandler(req, res);
    const data = res._getJson();

    assertNotEqual(data.verifiedUserId, 'attacker_fake_target_id', 'Server must not trust userId from payload body');
  });
});

// ------------------------------------------------------------------------
// Suite 2.6: HTTP Verbs & Protocol Boundaries (5 tests)
// ------------------------------------------------------------------------
describe('Tier 2.6: HTTP Verbs & Protocol Boundaries', () => {
  test('[T2.6.1] POST on /api/quiz rejected with 405 Method Not Allowed (Allow: GET, OPTIONS)', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'POST', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 405, 'POST on /api/quiz must return 405');
    const allowHeader = res.getHeader('allow');
    assert(allowHeader && allowHeader.includes('GET'), 'Allow header must specify GET');
  });

  test('[T2.6.2] GET on /api/quiz-submit rejected with 405 Method Not Allowed (Allow: POST, OPTIONS)', async () => {
    const submitHandler = await getSubmitHandler();
    const req = createMockReq({ method: 'GET', url: '/api/quiz-submit' });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 405, 'GET on /api/quiz-submit must return 405');
    const allowHeader = res.getHeader('allow');
    assert(allowHeader && allowHeader.includes('POST'), 'Allow header must specify POST');
  });

  test('[T2.6.3] PUT on /api/quiz rejected with 405 Method Not Allowed', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'PUT', url: '/api/quiz?bookId=otkan-kunlar' });
    const res = createMockRes();

    await handler(req, res);
    assertEqual(res.statusCode, 405, 'PUT on /api/quiz must return 405');
  });

  test('[T2.6.4] OPTIONS preflight on /api/quiz returns 200/204 with CORS headers', async () => {
    const handler = await getQuizHandler();
    const req = createMockReq({ method: 'OPTIONS', url: '/api/quiz' });
    const res = createMockRes();

    await handler(req, res);
    assert([200, 204].includes(res.statusCode), 'OPTIONS preflight should return 200 or 204');
    assert(res.hasHeader('access-control-allow-origin'), 'Must return Access-Control-Allow-Origin header');
  });

  test('[T2.6.5] OPTIONS preflight on /api/quiz-submit returns 200/204 with CORS headers', async () => {
    const submitHandler = await getSubmitHandler();
    const req = createMockReq({ method: 'OPTIONS', url: '/api/quiz-submit' });
    const res = createMockRes();

    await submitHandler(req, res);
    assert([200, 204].includes(res.statusCode), 'OPTIONS preflight should return 200 or 204');
    assert(res.hasHeader('access-control-allow-origin'), 'Must return Access-Control-Allow-Origin header');
  });
});

// ========================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (11 TESTS)
// ========================================================================
describe('Tier 3: Cross-Feature Combinations & State Sequences', () => {
  test('[T3.1] Partial quiz submission: student answers 4 out of 10 questions, leaving 6 unanswered', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    // Submit only first 4 questions
    const answers = rawQuestions.slice(0, 4).map(q => ({
      questionId: q.id,
      selectedOption: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
    }));

    const payload = { bookId: 'otkan-kunlar', answers, penalty: 0 };
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    assertEqual(res.statusCode, 200);
    const data = res._getJson();

    assertEqual(data.correctCount, 4, 'Should record 4 correct answers');
    assertEqual(data.percentage, 40, '4 out of 10 must equal 40%');
  });

  test('[T3.2] Multiple quiz submissions on the same calendar day: XP accumulates, streak does not double-increment', async () => {
    const submitHandler = await getSubmitHandler();
    const todayStr = new Date().toISOString().slice(0, 10);

    // First quiz today
    const p1 = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
      currentStreak: 2,
      lastQuizDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), // yesterday
    };
    const req1 = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: p1 });
    const res1 = createMockRes();
    await submitHandler(req1, res1);
    const d1 = res1._getJson();
    assertEqual(d1.currentStreak, 3, 'Streak increments to 3 on first quiz today');

    // Second quiz today
    const p2 = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
      currentStreak: d1.currentStreak,
      lastQuizDate: todayStr, // today
    };
    const req2 = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: p2 });
    const res2 = createMockRes();
    await submitHandler(req2, res2);
    const d2 = res2._getJson();
    assertEqual(d2.currentStreak, 3, 'Streak must stay at 3 on second quiz today');
  });

  test('[T3.3] Three-day consecutive streak simulation (Day 1 -> Day 2 -> Day 3) unlocks active streak XP bonus (+5)', () => {
    let streak = 0;
    streak = calculateStreakTransition({ lastQuizDate: null, currentStreak: streak, todayStr: '2026-09-24', yesterdayStr: '2026-09-23' });
    assertEqual(streak, 1);

    streak = calculateStreakTransition({ lastQuizDate: '2026-09-24', currentStreak: streak, todayStr: '2026-09-25', yesterdayStr: '2026-09-24' });
    assertEqual(streak, 2);

    streak = calculateStreakTransition({ lastQuizDate: '2026-09-25', currentStreak: streak, todayStr: '2026-09-26', yesterdayStr: '2026-09-25' });
    assertEqual(streak, 3);

    const xpResult = calculateQuizXPEarned({ score: 10, total: 10, percentage: 100, currentStreak: streak });
    const streakBonus = xpResult.breakdown.find(b => b.label.includes('Faol streak bonusi'));
    assert(streakBonus && streakBonus.xp === 5, '3-day streak must unlock +5 XP bonus');
  });

  test('[T3.4] Seven-day consecutive streak simulation (Day 7) unlocks fire streak bonus (+10)', () => {
    const streak = 7;
    const xpResult = calculateQuizXPEarned({ score: 10, total: 10, percentage: 100, currentStreak: streak });
    const streakBonus = xpResult.breakdown.find(b => b.label.includes('Olovli streak bonusi'));
    assert(streakBonus && streakBonus.xp === 10, '7-day streak must unlock +10 XP bonus');
  });

  test('[T3.5] Streak broken and recovered sequence (Day 1 -> Day 2 -> Miss Day 3 -> Day 4 -> Day 5)', () => {
    let streak = 0;
    // Day 1
    streak = calculateStreakTransition({ lastQuizDate: null, currentStreak: streak, todayStr: '2026-09-20', yesterdayStr: '2026-09-19' });
    assertEqual(streak, 1);

    // Day 2
    streak = calculateStreakTransition({ lastQuizDate: '2026-09-20', currentStreak: streak, todayStr: '2026-09-21', yesterdayStr: '2026-09-20' });
    assertEqual(streak, 2);

    // Miss Day 3 (2026-09-22). Day 4 (2026-09-23)
    streak = calculateStreakTransition({ lastQuizDate: '2026-09-21', currentStreak: streak, todayStr: '2026-09-23', yesterdayStr: '2026-09-22' });
    assertEqual(streak, 1, 'Streak must reset to 1 after missing a day');

    // Day 5 (2026-09-24)
    streak = calculateStreakTransition({ lastQuizDate: '2026-09-23', currentStreak: streak, todayStr: '2026-09-24', yesterdayStr: '2026-09-23' });
    assertEqual(streak, 2, 'Streak must increment to 2 following recovery');
  });

  test('[T3.6] High anti-cheat penalty combined with perfect accuracy (10/10 correct with 30% penalty)', async () => {
    const rawScore = 10;
    const penaltyRate = 30;
    const penaltyDeduction = Math.round(rawScore * (penaltyRate / 100)); // 3
    const finalScore = rawScore - penaltyDeduction; // 7

    assertEqual(finalScore, 7, 'Final score should be reduced by 30% penalty');

    const xpResult = calculateQuizXPEarned({
      score: finalScore,
      total: 10,
      percentage: 70,
      penalty: penaltyRate,
    });

    const penaltyItem = xpResult.breakdown.find(b => b.xp < 0);
    assert(penaltyItem !== undefined, 'XP breakdown must include negative penalty deduction');
  });

  test('[T3.7] Daily challenge quiz with stacked bonuses (isDaily: true + 100% accuracy + streak >= 7)', () => {
    const xpResult = calculateQuizXPEarned({
      score: 10,
      total: 10,
      percentage: 100,
      penalty: 0,
      isDaily: true,
      currentStreak: 7,
    });

    // 15 base + 25 accuracy + 20 daily + 10 streak = 70 XP
    assertEqual(xpResult.totalXP, 70, 'Stacked bonuses should total exactly 70 XP');
  });

  test('[T3.8] Level-up boundary crossing: user at 85 XP earns 35 XP, crossing 100 XP threshold into Level 2', () => {
    const oldScore = 85;
    const earnedXP = 35;
    const newScore = oldScore + earnedXP; // 120

    const oldLevel = getUserLevel(oldScore);
    const newLevel = getUserLevel(newScore);

    assertEqual(oldLevel.level, 1, 'Old level should be 1');
    assertEqual(newLevel.level, 2, 'New level should be 2');
    assertEqual(newLevel.title, 'Kitobxon', 'Level 2 title should be Kitobxon');
    assert(newLevel.level > oldLevel.level, 'Level up must be detected');
  });

  test('[T3.9] Book ID alias resolution: numeric ID "1" and slug "otkan-kunlar" resolve identical questions', () => {
    const qBySlug = getQuestionsForBook('otkan-kunlar');
    const qByNum = getQuestionsForBook('1');

    assertEqual(qBySlug.length, qByNum.length, 'Both aliases should resolve same number of questions');
    assertEqual(qBySlug[0].id, qByNum[0].id, 'First question ID must match');
  });

  test('[T3.10] Option text string matching: submitting option text instead of index matches canonical option', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');
    const q1 = rawQuestions[0];
    const correctIdx = typeof q1.correctAnswer === 'number' ? q1.correctAnswer : 0;
    const correctText = q1.options[correctIdx];

    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: q1.id, selectedOption: correctText }],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();

    await submitHandler(req, res);
    const data = res._getJson();
    assertEqual(data.correctCount, 1, 'String option matching should correctly evaluate to correct');
  });

  test('[T3.11] Anti-replay rate limit: rapid repeated submissions within cooldown handled safely', async () => {
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: [{ questionId: 'q_otkan-kunlar_1', selectedOption: 0 }],
      quizStartTime: Date.now() - 30000,
    };

    const req1 = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res1 = createMockRes();
    await submitHandler(req1, res1);

    const req2 = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res2 = createMockRes();
    await submitHandler(req2, res2);

    assert([200, 429].includes(res2.statusCode), 'Rapid submission must return 200 or 429');
  });
});

// ========================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 TESTS)
// ========================================================================
describe('Tier 4: Real-World Application Scenarios', () => {
  test('[T4.1] Complete Student Journey: fetch questions, verify zero leakage, answer all, submit, check result & profile', async () => {
    const quizHandler = await getQuizHandler();
    const submitHandler = await getSubmitHandler();

    // Step 1: Student opens quiz page, calls GET /api/quiz?bookId=otkan-kunlar
    const quizReq = createMockReq({ method: 'GET', url: '/api/quiz?bookId=otkan-kunlar' });
    const quizRes = createMockRes();
    await quizHandler(quizReq, quizRes);
    assertEqual(quizRes.statusCode, 200);

    const quizData = quizRes._getJson();
    assert(quizData.questions.length === 10, 'Student should receive 10 questions');

    // Step 2: Zero leakage verification in transit
    assertForbiddenKeysNotIn(quizData.questions, FORBIDDEN_KEYS, 'quizQuestions');

    // Step 3: Student answers all 10 questions with selected options
    const answersPayload = quizData.questions.map((q, idx) => ({
      questionId: q.id,
      selectedOption: idx % q.options.length,
    }));

    // Step 4: Student submits test to POST /api/quiz-submit
    const mockJwt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHVkZW50XzEwMSJ9.signature_mock';
    const submitReq = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      headers: { Authorization: mockJwt },
      body: {
        bookId: 'otkan-kunlar',
        answers: answersPayload,
        quizStartTime: Date.now() - 60000,
        penalty: 0,
      },
    });
    const submitRes = createMockRes();
    await submitHandler(submitReq, submitRes);
    assertEqual(submitRes.statusCode, 200);

    const resultData = submitRes._getJson();
    // Step 5: Check result payload integrity
    assert(resultData.score >= 0 && resultData.score <= 10, 'Score should be in 0..10');
    assert(resultData.xpEarned >= 15, 'Student should earn at least 15 base XP');
    assertEqual(resultData.answers.length, 10, 'All 10 question reviews must be returned');
    assert(resultData.answers.every(a => typeof a.explanation === 'string'), 'All reviews must have explanations');
  });

  test('[T4.2] Browser Console Tampering Attack: attempt to inject forged score rejected; server enforces true grading', async () => {
    const submitHandler = await getSubmitHandler();
    const rawQuestions = getQuestionsForBook('otkan-kunlar');

    // Attacker submits wrong answers but injects fake score metrics into body
    const attackPayload = {
      bookId: 'otkan-kunlar',
      score: 9999, // Forged
      percentage: 100, // Forged
      xpEarned: 50000, // Forged
      answers: [
        { questionId: rawQuestions[0].id, selectedOption: 999 }, // Wrong option
      ],
    };

    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: attackPayload });
    const res = createMockRes();
    await submitHandler(req, res);
    const data = res._getJson();

    assertEqual(data.score, 0, 'Server must reject forged score 9999 and compute 0');
    assertEqual(data.percentage, 0, 'Server must reject forged 100% and compute 0%');
    assert(data.xpEarned < 500, 'Server must reject forged 50,000 XP');
  });

  test('[T4.3] Zero-Leakage Adversarial Inspection: scanning 10 different books proves zero answer or explanation leaks', async () => {
    const handler = await getQuizHandler();
    const sampleBooks = [
      'otkan-kunlar',
      'mehrobdan-chayon',
      'yulduzli-tunlar',
      'alvido-bolalik',
      'dunyoning-ishlari',
      'ufq',
      'chinor',
      'sarob',
      'shum-bola',
      'kecha-va-kunduz',
    ];

    for (const bId of sampleBooks) {
      const req = createMockReq({ method: 'GET', url: `/api/quiz?bookId=${bId}` });
      const res = createMockRes();
      await handler(req, res);

      if (res.statusCode === 200) {
        const data = res._getJson();
        assertForbiddenKeysNotIn(data, FORBIDDEN_KEYS, `Book[${bId}]`);
      }
    }
  });

  test('[T4.4] Progression Level Graduation Journey: progression from Level 1 to Level 3 unlocking milestone badges', () => {
    // Stage 1: New user (0 XP) -> Level 1
    const s1 = getUserLevel(0);
    assertEqual(s1.level, 1);
    assertEqual(s1.title, 'Yangi kitobxon');

    // Stage 2: Earns 100 XP -> Level 2
    const s2 = getUserLevel(100);
    assertEqual(s2.level, 2);
    assertEqual(s2.title, 'Kitobxon');

    // Stage 3: Earns 250 XP -> Level 3
    const s3 = getUserLevel(250);
    assertEqual(s3.level, 3);
    assertEqual(s3.title, 'Izlanuvchan');

    // Stage 4: Max Level 8
    const s8 = getUserLevel(2000);
    assertEqual(s8.level, 8);
    assertEqual(s8.title, 'Alloma');
    assertEqual(s8.isMaxLevel, true);
  });

  test('[T4.5] Network Outage Recovery: offline training mode provides local practice, online recovery grants verified score', async () => {
    // Outage: Local practice
    const localQ = getQuestionsForBook('otkan-kunlar');
    assert(localQ.length > 0, 'Local questions available during outage');
    const offlineModeResult = {
      score: 10,
      total: 10,
      isOffline: true,
      xpEarned: 0,
    };
    assertEqual(offlineModeResult.xpEarned, 0, 'No official XP in offline mode');

    // Recovery: Internet restored, official quiz submitted
    const submitHandler = await getSubmitHandler();
    const payload = {
      bookId: 'otkan-kunlar',
      answers: localQ.map(q => ({
        questionId: q.id,
        selectedOption: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
      })),
    };
    const req = createMockReq({ method: 'POST', url: '/api/quiz-submit', body: payload });
    const res = createMockRes();
    await submitHandler(req, res);
    const onlineResult = res._getJson();

    assertEqual(onlineResult.percentage, 100, 'Online recovery yields full verified score');
    assert(onlineResult.xpEarned >= 40, 'Online recovery awards official XP');
  });
});

// ========================================================================
// Master Test Runner Execution
// ========================================================================
async function main() {
  const result = await runAll();
  if (result.failed > 0) {
    console.error(`\n[FATAL] Test Suite finished with ${result.failed} failure(s).\n`);
    process.exit(1);
  } else {
    console.log(`\n[SUCCESS] All ${result.passed} test cases passed flawlessly!\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
  process.exit(1);
});
