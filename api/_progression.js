// ========================================================================
// api/_progression.js — Authoritative Progression & XP Engine (Levels 1–8)
// ========================================================================

/**
 * 8-Tier Level Progression System (mirrors js/progression.js).
 */
export const LEVELS = [
  { level: 1, xpRequired: 0, title: 'Yangi kitobxon', emoji: '🌱', badgeClass: 'badge-level-1', desc: 'Adabiy sayohat boshlanishi. Ilk sahifalar ochilmoqda.' },
  { level: 2, xpRequired: 100, title: 'Kitobxon', emoji: '📖', badgeClass: 'badge-level-2', desc: 'Ilk g\'alaba! Mumtoz va qiziqarli asarlar olamiga qadam.' },
  { level: 3, xpRequired: 250, title: 'Izlanuvchan', emoji: '🔎', badgeClass: 'badge-level-3', desc: 'Asarlar qatiga chuqurroq shoʻngʻiyotgan mutolaachi.' },
  { level: 4, xpRequired: 450, title: 'Mutolaa ixlosmandi', emoji: '🖋️', badgeClass: 'badge-level-4', desc: 'Muntazam oʻqiydigan, adabiyot zavqini his qilgan kitobxon.' },
  { level: 5, xpRequired: 700, title: 'Bilimdon', emoji: '🧠', badgeClass: 'badge-level-5', desc: 'Falsafiy, teran va murakkab asarlar tahlilchisi.' },
  { level: 6, xpRequired: 1000, title: 'Adabiyotshunos', emoji: '🏛️', badgeClass: 'badge-level-6', desc: 'Durdona asarlar tahlili va adabiy tafakkur egasi.' },
  { level: 7, xpRequired: 1400, title: 'Zukko kitobxon', emoji: '📚', badgeClass: 'badge-level-7', desc: 'Katta epopeyalar va jahon adabiyoti bilimdoni.' },
  { level: 8, xpRequired: 1900, title: 'Alloma', emoji: '👑', badgeClass: 'badge-level-8', desc: 'Platformaning eng oliy adabiy shohsupasi.' }
];

/**
 * Evaluates current level, next level threshold, and progress percentages.
 */
export function getUserLevel(rawXP = 0) {
  const xp = Math.max(0, Math.round(Number(rawXP) || 0));
  let currentTier = LEVELS[0];
  let nextTier = LEVELS[1] || null;

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) {
      currentTier = LEVELS[i];
      nextTier = LEVELS[i + 1] || null;
      break;
    }
  }

  if (!nextTier) {
    return {
      level: currentTier.level,
      title: currentTier.title,
      emoji: currentTier.emoji,
      badgeClass: currentTier.badgeClass,
      desc: currentTier.desc,
      currentLevelXP: currentTier.xpRequired,
      nextLevelXP: currentTier.xpRequired,
      progressXP: xp - currentTier.xpRequired,
      progressPct: 100,
      remainingXP: 0,
      isMaxLevel: true
    };
  }

  const range = nextTier.xpRequired - currentTier.xpRequired;
  const progressInLevel = xp - currentTier.xpRequired;
  const progressPct = Math.min(100, Math.max(0, Math.round((progressInLevel / range) * 100)));
  const remainingXP = Math.max(0, nextTier.xpRequired - xp);

  return {
    level: currentTier.level,
    title: currentTier.title,
    emoji: currentTier.emoji,
    badgeClass: currentTier.badgeClass,
    desc: currentTier.desc,
    currentLevelXP: currentTier.xpRequired,
    nextLevelXP: nextTier.xpRequired,
    progressXP: progressInLevel,
    progressPct,
    remainingXP,
    isMaxLevel: false
  };
}

/**
 * Calculates XP earned and granular breakdown with anti-cheat deductions.
 */
export function calculateProgressionXP({ finalScore = 0, total = 10, percentage = 0, penaltyRate = 0, isDaily = false, currentStreak = 0 }) {
  // 1. Base completion bonus
  const baseXP = 15;
  let grossXP = baseXP;

  // 2. Accuracy tier bonuses
  let accuracyXP = 0;
  if (percentage === 100) {
    accuracyXP = 25; // Mukammal natija (100%)
  } else if (percentage >= 90) {
    accuracyXP = 15; // A'lo natija (90%+)
  } else if (percentage >= 80) {
    accuracyXP = 10; // Yaxshi natija (80%+)
  } else if (percentage >= 60) {
    accuracyXP = 5;  // O'tish natijasi (60%+)
  }
  grossXP += accuracyXP;

  // 3. Daily challenge bonus
  const dailyXP = isDaily ? 20 : 0;
  grossXP += dailyXP;

  // 4. Streak retention bonus
  let streakXP = 0;
  if (currentStreak >= 7) {
    streakXP = 10; // 7+ kunlik seriya
  } else if (currentStreak >= 3) {
    streakXP = 5;  // 3-6 kunlik seriya
  }
  grossXP += streakXP;

  // 5. Anti-cheat penalty deduction
  let penaltyXP = 0;
  if (penaltyRate > 0) {
    penaltyXP = Math.round(grossXP * (penaltyRate / 100));
  }
  const netXP = Math.max(5, grossXP - penaltyXP);

  // 6. Hard safety clamping (floor: 5 XP, ceiling: 500 XP)
  const earnedXP = Math.max(5, Math.min(500, netXP));

  const xpBreakdown = {
    base: baseXP,
    accuracy: accuracyXP,
    accuracyBonus: accuracyXP,
    streak: streakXP,
    streakBonus: streakXP,
    daily: dailyXP,
    dailyBonus: dailyXP,
    penalty: penaltyXP,
    speedBonus: 0
  };

  return { earnedXP, xpBreakdown };
}
