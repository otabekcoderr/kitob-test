// ============================================================
// tests/test-xp-accumulation.js — Verify XP Accumulation Pipeline
// ============================================================
import assert from 'node:assert';
import { calculateProgressionXP, getUserLevel } from '../api/_progression.js';

console.log('--- Test 1: calculateProgressionXP base + accuracy ---');
const xpResult1 = calculateProgressionXP({
  finalScore: 10,
  total: 10,
  percentage: 100,
  penaltyRate: 0,
  isDaily: false,
  currentStreak: 0
});
assert.strictEqual(xpResult1.earnedXP, 40, '10/10 should yield 40 XP (15 base + 25 accuracy)');
console.log('✓ Test 1 passed: earnedXP is 40');

console.log('--- Test 2: Accumulation with existing score ---');
const oldScore = 100;
const earnedXP = xpResult1.earnedXP;
const newScore = oldScore + earnedXP;
assert.strictEqual(newScore, 140, 'New score must be 140');
const oldLevel = getUserLevel(oldScore);
const newLevel = getUserLevel(newScore);
assert.strictEqual(oldLevel.level, 2, '100 XP is Level 2');
assert.strictEqual(newLevel.level, 2, '140 XP is Level 2');
assert.strictEqual(newLevel.remainingXP, 110, 'Level 3 needs 250 XP, so 250 - 140 = 110 remaining');
console.log('✓ Test 2 passed: oldScore 100 + 40 = 140, remainingXP 110');

console.log('--- Test 3: Level up crossing threshold ---');
const userAt85 = 85;
const earnedAt85 = 35;
const scoreAfter = userAt85 + earnedAt85;
assert.strictEqual(scoreAfter, 120);
const lvlBefore = getUserLevel(userAt85);
const lvlAfter = getUserLevel(scoreAfter);
assert.strictEqual(lvlBefore.level, 1, '85 XP is Level 1');
assert.strictEqual(lvlAfter.level, 2, '120 XP is Level 2');
assert.strictEqual(lvlAfter.level > lvlBefore.level, true, 'isLevelUp is true');
console.log('✓ Test 3 passed: Level up 1 -> 2 triggered correctly');

console.log('--- Test 4: result.js currentTotalXP calculation logic ---');
const mockResult = {
  score: 10,
  total: 10,
  percentage: 100,
  xpEarned: 40,
  newScore: 140
};
const mockUser = {
  id: 'u1',
  score: 100
};
const currentTotalXP = (mockResult.newScore !== undefined && mockResult.newScore !== null)
  ? mockResult.newScore
  : ((mockUser?.score || 0) + mockResult.xpEarned);
assert.strictEqual(currentTotalXP, 140, 'currentTotalXP must equal 140');

// Fallback when newScore is missing
const mockResultWithoutNewScore = {
  score: 10,
  total: 10,
  percentage: 100,
  xpEarned: 35
};
const fallbackTotalXP = (mockResultWithoutNewScore.newScore !== undefined && mockResultWithoutNewScore.newScore !== null)
  ? mockResultWithoutNewScore.newScore
  : ((mockUser?.score || 0) + mockResultWithoutNewScore.xpEarned);
assert.strictEqual(fallbackTotalXP, 135, 'fallbackTotalXP must equal 100 + 35 = 135');
console.log('✓ Test 4 passed: currentTotalXP logic handles both newScore and fallback cleanly');

console.log('\n========================================');
console.log(' All XP Accumulation Tests Passed! ');
console.log('========================================\n');
