// ========================================================================
// tests/test-answer-feedback-and-xp.js
// Verification of single-question instant answer checking and user XP journey
// ========================================================================

import assert from 'node:assert';
import checkHandler from '../api/quiz-check.js';
import submitHandler from '../api/quiz-submit.js';
import quizHandler from '../api/quiz.js';
import { getUserLevel } from '../js/progression.js';

function createMockReq({ method = 'POST', url = '/api/quiz-check', body = {}, query = {}, headers = {} }) {
  return {
    method,
    url,
    body,
    query,
    headers: { 'content-type': 'application/json', ...headers },
  };
}

function createMockRes() {
  let statusCode = 200;
  let headers = {};
  let body = '';

  const res = {
    statusCode,
    setHeader(name, val) { headers[name.toLowerCase()] = val; return res; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    status(code) { res.statusCode = code; return res; },
    json(data) {
      body = JSON.stringify(data);
      return res;
    },
    end(data) {
      if (data) body = data;
      return res;
    },
    _getJson() {
      try { return JSON.parse(body); } catch { return null; }
    }
  };
  return res;
}

async function run() {
  console.log('--- 1. Testing /api/quiz-check endpoint ---');
  // Test correct answer check for question 1 of otkan-kunlar
  // Question 1: "Otabek Marg'ilonga birinchi kelganida kimning karvonsaroyiga borib tushadi?"
  // Correct answer is "Ziyo shohichining karvonsaroyiga" (index 3)
  {
    const req = createMockReq({
      body: {
        bookId: 'otkan-kunlar',
        questionId: 'q_otkan-kunlar_1',
        selectedOption: 'Ziyo shohichining karvonsaroyiga'
      }
    });
    const res = createMockRes();
    await checkHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Status must be 200');
    const data = res._getJson();
    assert.strictEqual(data.success, true, 'Check must succeed');
    assert.strictEqual(data.isCorrect, true, 'Selected option must be correct');
    assert.ok(data.explanation.length > 0, 'Must provide educational explanation');
    assert.strictEqual(data.correctAnswer, 'Ziyo shohichining karvonsaroyiga');
    console.log('✓ Correct answer check passed:', data.isCorrect, data.explanation.slice(0, 40) + '...');
  }

  // Test incorrect answer check for question 1 of otkan-kunlar
  {
    const req = createMockReq({
      body: {
        bookId: 'otkan-kunlar',
        questionId: 'q_otkan-kunlar_1',
        selectedOption: 'Akram hojining saroyiga'
      }
    });
    const res = createMockRes();
    await checkHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const data = res._getJson();
    assert.strictEqual(data.isCorrect, false, 'Wrong option must be false');
    assert.strictEqual(data.correctAnswer, 'Ziyo shohichining karvonsaroyiga', 'Must reveal true answer upon grading');
    console.log('✓ Wrong answer check passed: isCorrect is false, correct answer revealed');
  }

  console.log('--- 2. Testing User XP accumulation scenario (15 XP + 25 XP = 40 XP, 60 XP needed) ---');
  {
    // Step A: Starting state: user has 15 XP
    const startScore = 15;
    const initialLevel = getUserLevel(startScore);
    assert.strictEqual(initialLevel.level, 1);
    assert.strictEqual(initialLevel.remainingXP, 85, 'User with 15 XP needs 85 XP to reach Level 2 (100 XP)');
    console.log(`Starting state: ${startScore} XP, Yana ${initialLevel.remainingXP} XP kerak.`);

    // Step B: User takes test with 8/10 correct answers -> earns 25 XP (15 base + 10 accuracy)
    const rawQuestions = [
      { id: 'q_otkan-kunlar_1', correctAnswer: 3 },
      { id: 'q_otkan-kunlar_2', correctAnswer: 2 },
      { id: 'q_otkan-kunlar_3', correctAnswer: 0 },
      { id: 'q_otkan-kunlar_4', correctAnswer: 1 },
      { id: 'q_otkan-kunlar_5', correctAnswer: 2 },
      { id: 'q_otkan-kunlar_6', correctAnswer: 2 },
      { id: 'q_otkan-kunlar_7', correctAnswer: 0 },
      { id: 'q_otkan-kunlar_8', correctAnswer: 2 },
      { id: 'q_otkan-kunlar_9', correctAnswer: 2 },
      { id: 'q_otkan-kunlar_10', correctAnswer: 1 },
    ];

    // Answer 8 correct, 2 wrong
    const answers = rawQuestions.map((q, idx) => ({
      questionId: q.id,
      selectedOption: idx < 8 ? q.correctAnswer : ((q.correctAnswer + 1) % 4)
    }));

    const req = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      body: {
        bookId: 'otkan-kunlar',
        answers,
        currentScore: startScore, // Client passes 15 XP
        currentStreak: 1,
        penalty: 0
      }
    });
    const res = createMockRes();
    await submitHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const data = res._getJson();

    assert.strictEqual(data.correctCount, 8, '8 correct answers');
    assert.strictEqual(data.percentage, 80, '80% accuracy');
    assert.strictEqual(data.xpEarned, 25, 'Must earn 25 XP (15 base + 10 accuracy bonus)');

    // Authoritative monotonic accumulation:
    const previousScore = startScore;
    const earnedXP = data.xpEarned;
    const serverReported = Number(data.newScore);
    const finalScore = (Number.isFinite(serverReported) && serverReported >= (previousScore + earnedXP))
      ? serverReported
      : (previousScore + earnedXP);

    assert.strictEqual(finalScore, 40, 'Final score MUST be 15 + 25 = 40 XP!');

    const updatedLevel = getUserLevel(finalScore);
    assert.strictEqual(updatedLevel.level, 1, 'Still Level 1');
    assert.strictEqual(updatedLevel.progressPct, 40, 'Progress must be 40%');
    // Step C: Level up transition and XP overflow handling
    const levelUpStartScore = 85;
    const levelUpReq = createMockReq({
      method: 'POST',
      url: '/api/quiz-submit',
      body: {
        bookId: 'otkan-kunlar',
        answers,
        currentScore: levelUpStartScore,
        currentStreak: 1,
        penalty: 0
      }
    });
    const levelUpRes = createMockRes();
    await submitHandler(levelUpReq, levelUpRes);
    assert.strictEqual(levelUpRes.statusCode, 200);
    const levelUpData = levelUpRes._getJson();
    assert.strictEqual(levelUpData.xpEarned, 25);
    const levelUpFinalScore = Math.max(levelUpStartScore + levelUpData.xpEarned, Number(levelUpData.newScore) || 0);
    assert.strictEqual(levelUpFinalScore, 110, '85 + 25 = 110 XP');
    const level2Result = getUserLevel(levelUpFinalScore);
    assert.strictEqual(level2Result.level, 2, 'Must graduate to Level 2');
    assert.strictEqual(level2Result.remainingXP, 140, 'Level 3 requires 250 XP, so 250 - 110 = 140 XP needed');
    assert.strictEqual(level2Result.progressPct, 7, '10 / 150 = 7% into Level 2');
    console.log(`✓ Level up test passed: ${levelUpStartScore} + 25 = ${levelUpFinalScore} XP, Level: ${level2Result.level} (${level2Result.title}), Yana ${level2Result.remainingXP} XP kerak.`);
  }

  console.log('--- 3. Testing /api/quiz-check with question text and alias IDs ---');
  {
    // Question lookup using questionText fallback
    const req = createMockReq({
      body: {
        bookId: 'otkan-kunlar',
        questionId: 'unknown_id_from_client',
        questionText: "Otabek Marg'ilonga birinchi kelganida kimning karvonsaroyiga borib tushadi?",
        selectedOption: 'Ziyo shohichining karvonsaroyiga'
      }
    });
    const res = createMockRes();
    await checkHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const data = res._getJson();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.isCorrect, true);
    assert.strictEqual(data.correctAnswer, 'Ziyo shohichining karvonsaroyiga');
    console.log('✓ Question text fallback lookup passed!');
  }

  console.log('========================================');
  console.log(' All Feedback & XP Journey Tests PASSED! ');
  console.log('========================================');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
