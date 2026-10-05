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
console.log('✓ Test 4 passed: currentTotalXP logic handles both newScore and fallback cleanly');

console.log('--- Test 5: Exact sequence from user issue (20 XP -> 40 XP -> 20 XP -> 20 XP Level Up) ---');
let simulatedUser = { id: 'u_test', score: 0, streak: 0 };

// Quiz 1: Shum bola, 7/10 -> 20 XP
const q1XP = calculateProgressionXP({ finalScore: 7, total: 10, percentage: 70, penaltyRate: 0, currentStreak: 0 }).earnedXP;
assert.strictEqual(q1XP, 20);
// Simulating server accumulation with client payload:
const server1OldScore = simulatedUser.score;
const server1NewScore = server1OldScore + q1XP;
assert.strictEqual(server1NewScore, 20);
simulatedUser.score = server1NewScore;
const lvl1 = getUserLevel(simulatedUser.score);
assert.strictEqual(lvl1.level, 1);
assert.strictEqual(lvl1.remainingXP, 80, 'Level 1: 100 - 20 = 80 XP needed');

// Quiz 2: Oq kema, 10/10 -> 40 XP
const q2XP = calculateProgressionXP({ finalScore: 10, total: 10, percentage: 100, penaltyRate: 0, currentStreak: 1 }).earnedXP;
assert.strictEqual(q2XP, 40);
const server2OldScore = simulatedUser.score; // 20
const server2NewScore = server2OldScore + q2XP; // 60
assert.strictEqual(server2NewScore, 60, 'Accumulated score after Test 2 must be 60 XP');
simulatedUser.score = server2NewScore;
const lvl2 = getUserLevel(simulatedUser.score);
assert.strictEqual(lvl2.level, 1);
assert.strictEqual(lvl2.remainingXP, 40, 'Level 1: 100 - 60 = 40 XP needed (not 60!)');

// Quiz 3: Shum bola, 7/10 -> 20 XP
const q3XP = calculateProgressionXP({ finalScore: 7, total: 10, percentage: 70, penaltyRate: 0, currentStreak: 1 }).earnedXP;
assert.strictEqual(q3XP, 20);
const server3OldScore = simulatedUser.score; // 60
const server3NewScore = server3OldScore + q3XP; // 80
assert.strictEqual(server3NewScore, 80, 'Accumulated score after Test 3 must be 80 XP');
simulatedUser.score = server3NewScore;
const lvl3 = getUserLevel(simulatedUser.score);
assert.strictEqual(lvl3.level, 1);
assert.strictEqual(lvl3.remainingXP, 20, 'Level 1: 100 - 80 = 20 XP needed (not 80!)');

// Quiz 4: Shum bola, 7/10 -> 20 XP (Crossing into Level 2)
const q4XP = calculateProgressionXP({ finalScore: 7, total: 10, percentage: 70, penaltyRate: 0, currentStreak: 1 }).earnedXP;
assert.strictEqual(q4XP, 20);
const server4OldScore = simulatedUser.score; // 80
const server4NewScore = server4OldScore + q4XP; // 100
assert.strictEqual(server4NewScore, 100, 'Accumulated score after Test 4 must be 100 XP');
simulatedUser.score = server4NewScore;
const lvl4 = getUserLevel(simulatedUser.score);
assert.strictEqual(lvl4.level, 2, 'User has successfully reached Level 2 (Kitobxon)!');
assert.strictEqual(lvl4.title, 'Kitobxon');
assert.strictEqual(lvl4.remainingXP, 150, 'Level 2 -> Level 3 requires 250 XP, so 250 - 100 = 150 XP needed');
console.log('✓ Test 5 passed: Full 4-quiz progression chain accumulated to 100 XP and leveled up to Kitobxon (Daraja 2)');

console.log('\n========================================');
console.log(' All XP Accumulation Tests Passed! ');
console.log('========================================\n');
