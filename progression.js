// ============================================================
// js/progression.js — Kitobchi Rivojlanish & Geymifikatsiya Tizimi
// ============================================================
// Ushbu modul foydalanuvchining adabiy rivojlanishini boshqaradi:
//   1. XP Iqtisodiyoti va 1–8 Darajalar (Levels 1–8)
//   2. Kitoblarni bosqichma-bosqich qulfdan chiqarish (Book Unlock System)
//   3. Keyingi marra (Next Unlock Teaser & Navigator)
//   4. Kunlik missiyalar (Daily Missions)
//   5. Asar o'zlashtirish darajasi (Book Mastery)
//   6. Yutuqlar (Achievements)
//   7. Anti-cheat / Takroriy ball olishdan himoya (Anti-replay guard)
// ============================================================

import { today, yesterday, formatDate } from './utils.js';

// ============================================================
// 1. DARAJALAR (LEVELS) KONFIGURATSIYASI
// ============================================================
export const LEVELS = [
  {
    level: 1,
    xpRequired: 0,
    title: 'Yangi kitobxon',
    emoji: '🌱',
    badgeClass: 'badge-level-1',
    desc: 'Adabiy sayohat boshlanishi. Ilk sahifalar ochilmoqda.',
  },
  {
    level: 2,
    xpRequired: 100,
    title: 'Kitobxon',
    emoji: '📖',
    badgeClass: 'badge-level-2',
    desc: 'Ilk g\'alaba! Mumtoz va qiziqarli asarlar olamiga qadam.',
  },
  {
    level: 3,
    xpRequired: 250,
    title: 'Izlanuvchan',
    emoji: '🔎',
    badgeClass: 'badge-level-3',
    desc: 'Asarlar qatiga chuqurroq shoʻngʻiyotgan mutolaachi.',
  },
  {
    level: 4,
    xpRequired: 450,
    title: 'Mutolaa ixlosmandi',
    emoji: '🖋️',
    badgeClass: 'badge-level-4',
    desc: 'Muntazam oʻqiydigan, adabiyot zavqini his qilgan kitobxon.',
  },
  {
    level: 5,
    xpRequired: 700,
    title: 'Bilimdon',
    emoji: '🧠',
    badgeClass: 'badge-level-5',
    desc: 'Falsafiy, teran va murakkab asarlar tahlilchisi.',
  },
  {
    level: 6,
    xpRequired: 1000,
    title: 'Adabiyotshunos',
    emoji: '🏛️',
    badgeClass: 'badge-level-6',
    desc: 'Durdona asarlar tahlili va adabiy tafakkur egasi.',
  },
  {
    level: 7,
    xpRequired: 1400,
    title: 'Zukko kitobxon',
    emoji: '📚',
    badgeClass: 'badge-level-7',
    desc: 'Katta epopeyalar va jahon adabiyoti bilimdoni.',
  },
  {
    level: 8,
    xpRequired: 1900,
    title: 'Alloma',
    emoji: '👑',
    badgeClass: 'badge-level-8',
    desc: 'Platformaning eng oliy adabiy shohsupasi.',
  },
];

/**
 * Foydalanuvchining XP balli bo'yicha joriy darajasi va progressini hisoblaydi.
 *
 * @param {number} rawXP — foydalanuvchining jami to'plagan XP balli
 * @returns {{
 *   level: number,
 *   title: string,
 *   emoji: string,
 *   desc: string,
 *   currentLevelXP: number,
 *   nextLevelXP: number,
 *   progressXP: number,
 *   progressPct: number,
 *   remainingXP: number,
 *   isMaxLevel: boolean
 * }}
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
    // Eng yuqori daraja
    return {
      level: currentTier.level,
      title: currentTier.title,
      emoji: currentTier.emoji,
      desc: currentTier.desc,
      currentLevelXP: currentTier.xpRequired,
      nextLevelXP: currentTier.xpRequired,
      progressXP: xp - currentTier.xpRequired,
      progressPct: 100,
      remainingXP: 0,
      isMaxLevel: true,
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
    desc: currentTier.desc,
    currentLevelXP: currentTier.xpRequired,
    nextLevelXP: nextTier.xpRequired,
    progressXP: progressInLevel,
    progressPct: progressPct,
    remainingXP: remainingXP,
    isMaxLevel: false,
  };
}

// ============================================================
// 2. KITOBLARNING QULF XARITASI (BOOK UNLOCK SPECIFICATION)
// ============================================================
// Aniq asarlar bo'yicha darajalar va talablar (74 ta mavjud kitob)
export const BOOK_UNLOCK_MAP = {
  // --- LEVEL 1: Boshlang'ich Ochiq Kitoblar (0 XP) ---
  'shum-bola':             { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'kichkina-shohzoda':     { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'sariq-devni-minib':     { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'dunyoning-ishlari':     { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'oq-kema':               { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'alkimyogar':            { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'jamila':                { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'choliqushi':            { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'atom-odatlar':          { level: 1, xp: 0, tier: 'Boshlang\'ich' },
  'ikigai':                { level: 1, xp: 0, tier: 'Boshlang\'ich' },

  // --- LEVEL 2: Kitobxon (100 XP) ---
  'otkan-kunlar':          { level: 2, xp: 100, tier: 'Klassika' },
  'ikki-eshik-orasi':      { level: 2, xp: 100, tier: 'Klassika' },
  'bahor-qaytmaydi':       { level: 2, xp: 100, tier: 'Qissa' },
  'mork-postinli-madonna': { level: 2, xp: 100, tier: 'Jahon' },
  'molxona':               { level: 2, xp: 100, tier: 'Satira' },
  'dengiz-sadosi':         { level: 2, xp: 100, tier: 'Dramatik' },
  'baxtiyor-oila':         { level: 2, xp: 100, tier: 'Ma\'naviyat' },
  'halol-luqma':           { level: 2, xp: 100, tier: 'Ibrat' },

  // --- LEVEL 3: Izlanuvchan (250 XP) ---
  'mehrobdan-chayon':      { level: 3, xp: 250, tier: 'Tarixiy Roman' },
  'kecha-va-kunduz':       { level: 3, xp: 250, tier: 'Mumtoz Roman' },
  'sarob':                 { level: 3, xp: 250, tier: 'Psixologik' },
  'shaytanat':             { level: 3, xp: 250, tier: 'Detektiv' },
  'temur-tuzuklari':       { level: 3, xp: 250, tier: 'Tarixiy Meros' },
  'ulugbek-xazinasi':      { level: 3, xp: 250, tier: 'Tarixiy' },
  'tushda-kechgan-umrlar': { level: 3, xp: 250, tier: 'Dramatik' },
  'ruhiy-tarbiya':         { level: 3, xp: 250, tier: 'Tafakkur' },

  // --- LEVEL 4: Mutolaa ixlosmandi (450 XP) ---
  'yulduzli-tunlar':       { level: 4, xp: 450, tier: 'Tarixiy Epopeya' },
  'ufq':                   { level: 4, xp: 450, tier: 'Trilogiya' },
  'boburnoma':             { level: 4, xp: 450, tier: 'Tarixiy Asar' },
  'evrilish':              { level: 4, xp: 450, tier: 'Falsafiy' },
  'orwell-1984':           { level: 4, xp: 450, tier: 'Distopiya' },
  'otamdan-qolgan-dalalar':{ level: 4, xp: 450, tier: 'Roman' },
  'ichimizdagi-shayton':   { level: 4, xp: 450, tier: 'Psixologik' },

  // --- LEVEL 5: Bilimdon (700 XP / Yoki 7 kunlik Streak) ---
  'halqa':                 { level: 5, xp: 700, streakAlt: 7, isMystery: true, tier: 'Durdona' },
  'qorqma':                { level: 5, xp: 700, streakAlt: 7, isMystery: true, tier: 'Tarixiy Dramatik' },
  'dard':                  { level: 5, xp: 700, tier: 'Dramatik' },
  'javob':                 { level: 5, xp: 700, tier: 'Falsafiy' },
  'shamol-ortidan-yugurib':{ level: 5, xp: 700, tier: 'Jahon Bestselleri' },
  'ming-quyosh-shulasi':   { level: 5, xp: 700, tier: 'Jahon Bestselleri' },
  'asrga-tatigulik-kun':   { level: 5, xp: 700, tier: 'Falsafiy Roman' },
  'jimjitlik':             { level: 5, xp: 700, tier: 'Roman' },
  'lolazor':               { level: 5, xp: 700, tier: 'Roman' },

  // --- LEVEL 6: Adabiyotshunos (1000 XP) ---
  'jinoyat-va-jazo':       { level: 6, xp: 1000, tier: 'Falsafiy Klassika' },
  'aka-uka-karamazovlar':  { level: 6, xp: 1000, tier: 'Jahon Durdonasi' },
  'farengeyt-451':         { level: 6, xp: 1000, tier: 'Distopiya' },
  'begona':                { level: 6, xp: 1000, tier: 'Ekzistensial' },
  'sapiens':               { level: 6, xp: 1000, tier: 'Ilmiy-Ommabop' },
  'pul-psixologiyasi':     { level: 6, xp: 1000, tier: 'Psixologiya' },
  'kafansiz-komilganlar':  { level: 6, xp: 1000, tier: 'Tarixiy Hujjatli' },
  'saodat-asri':           { level: 6, xp: 1000, tier: 'Tarixiy Qissa' },
};

/**
 * Berilgan kitob qulf talablarini aniqlaydi.
 *
 * @param {object} book
 * @returns {{ level: number, xp: number, streakAlt: number|null, isMystery: boolean, tier: string }}
 */
export function getBookUnlockReq(book) {
  if (!book) return { level: 1, xp: 0, streakAlt: null, isMystery: false, tier: 'Boshlang\'ich' };

  const id = String(book.id || '').toLowerCase();
  if (BOOK_UNLOCK_MAP[id]) {
    return BOOK_UNLOCK_MAP[id];
  }

  // Agar aniq xaritada bo'lmasa, qiyinlik va sahifalar soniga asoslangan dinamik qoida
  const diff = String(book.difficulty || '').toLowerCase();
  if (diff.includes('qiyin') || diff.includes('advanced')) {
    return { level: 4, xp: 450, streakAlt: null, isMystery: false, tier: 'Qiyin' };
  }
  if (diff.includes('o\'rta') || diff.includes('orta') || diff.includes('medium')) {
    return { level: 2, xp: 100, streakAlt: null, isMystery: false, tier: 'O\'rta' };
  }

  return { level: 1, xp: 0, streakAlt: null, isMystery: false, tier: 'Boshlang\'ich' };
}

/**
 * Kitob foydalanuvchi uchun ochiq yoki qulflanganligini tekshiradi.
 *
 * @param {object} book
 * @param {object|null} user
 * @returns {{
 *   isUnlocked: boolean,
 *   requiredLevel: number,
 *   requiredXP: number,
 *   requiredStreak: number|null,
 *   remainingXP: number,
 *   progressPct: number,
 *   isMystery: boolean,
 *   reason: string
 * }}
 */
export function isBookUnlocked(book, user) {
  if (!book) return { isUnlocked: true, requiredLevel: 1, requiredXP: 0, remainingXP: 0, progressPct: 100, isMystery: false, reason: '' };

  // 1. Admin har doim barcha kitoblarni ochiq ko'radi
  const isAdmin = user && (
    user.role === 'admin' ||
    user.isAdmin === true ||
    user.is_admin === true ||
    String(user.username || '').toLowerCase() === 'admin' ||
    String(user.email || '').toLowerCase().startsWith('admin@')
  );
  if (isAdmin) {
    return { isUnlocked: true, requiredLevel: 1, requiredXP: 0, remainingXP: 0, progressPct: 100, isMystery: false, reason: 'Admin ruxsati' };
  }

  const req = getBookUnlockReq(book);

  // Level 1 kitoblar har doim hamma (hatto mehmonlar) uchun ham ochiq
  if (req.level <= 1 || req.xp <= 0) {
    return { isUnlocked: true, requiredLevel: 1, requiredXP: 0, remainingXP: 0, progressPct: 100, isMystery: false, reason: 'Boshlang\'ich asar' };
  }

  // Mehmon foydalanuvchi uchun faqat Level 1 ochiq
  if (!user) {
    return {
      isUnlocked: false,
      requiredLevel: req.level,
      requiredXP: req.xp,
      requiredStreak: req.streakAlt || null,
      remainingXP: req.xp,
      progressPct: 0,
      isMystery: !!req.isMystery,
      reason: 'Tizimga kiring va testlar yechib oching'
    };
  }

  const userXP = Number(user.score || 0);
  const userStreak = Number(user.streak || 0);

  // Streak alternativi orqali ochilish (Masalan: Halqa yoki Qorqma 7 kunlik streak bilan)
  if (req.streakAlt && userStreak >= req.streakAlt) {
    return {
      isUnlocked: true,
      requiredLevel: req.level,
      requiredXP: req.xp,
      requiredStreak: req.streakAlt,
      remainingXP: 0,
      progressPct: 100,
      isMystery: !!req.isMystery,
      reason: `${req.streakAlt} kunlik uzluksiz streak orqali ochildi`
    };
  }

  // XP talabi tekshiruvi
  if (userXP >= req.xp) {
    return {
      isUnlocked: true,
      requiredLevel: req.level,
      requiredXP: req.xp,
      requiredStreak: req.streakAlt || null,
      remainingXP: 0,
      progressPct: 100,
      isMystery: !!req.isMystery,
      reason: `${req.level}-darajaga erishildi`
    };
  }

  // Hali qulflangan
  const remaining = Math.max(0, req.xp - userXP);
  const pct = Math.min(100, Math.max(0, Math.round((userXP / req.xp) * 100)));

  return {
    isUnlocked: false,
    requiredLevel: req.level,
    requiredXP: req.xp,
    requiredStreak: req.streakAlt || null,
    remainingXP: remaining,
    progressPct: pct,
    isMystery: !!req.isMystery,
    reason: `${req.level}-daraja yoki ${req.xp} XP talab qilinadi`
  };
}

/**
 * Foydalanuvchining keyingi ochiladigan (navbatdagi eng yaqin) kitobini topadi.
 * Home sahifadagi "Keyingi maqsad" kartasi uchun.
 *
 * @param {object[]} books
 * @param {object|null} user
 * @returns {object|null}
 */
export function getNextUnlockTarget(books = [], user = null) {
  if (!books || !books.length) return null;

  const lockedBooks = books
    .map(book => {
      const status = isBookUnlocked(book, user);
      return { book, status };
    })
    .filter(item => !item.status.isUnlocked);

  if (lockedBooks.length === 0) return null;

  // Eng kam XP yetishmayotgan kitobni birinchi navbatga qo'yamiz
  lockedBooks.sort((a, b) => a.status.remainingXP - b.status.remainingXP);

  const best = lockedBooks[0];
  return {
    book: best.book,
    status: best.status,
    remainingXP: best.status.remainingXP,
    xpNeeded: best.status.remainingXP,
    progressPct: best.status.progressPct,
    unlockReq: {
      level: best.status.requiredLevel,
      requiredLevel: best.status.requiredLevel,
      xp: best.status.requiredXP
    }
  };
}

// ============================================================
// 3. XP MUKOFOTLARI VA HISOB-KITOBLAR
// ============================================================

/**
 * Yechilgan test natijasiga ko'ra olinadigan XP va taqsimotni hisoblaydi.
 *
 * @param {object} params
 * @param {number} params.score — to'g'ri javoblar soni
 * @param {number} params.total — jami savollar
 * @param {number} params.percentage — foiz (0–100)
 * @param {number} [params.penalty=0] — jarima foizi
 * @param {boolean} [params.isDaily=false] — bugungi sinovmi?
 * @param {number} [params.currentStreak=0] — joriy streak
 * @returns {{
 *   totalXP: number,
 *   breakdown: Array<{ label: string, xp: number }>
 * }}
 */
export function calculateQuizXPEarned({
  score = 0,
  total = 0,
  percentage = 0,
  penalty = 0,
  isDaily = false,
  currentStreak = 0
}) {
  const breakdown = [];

  // 1. Asosiy test topshirish bonusi
  const baseXP = 15;
  breakdown.push({ label: 'Testni yakunlash', xp: baseXP });
  let totalXP = baseXP;

  // 2. Natijaga qarab qo'shimcha mahorat XP
  if (percentage === 100) {
    breakdown.push({ label: 'Mukammal natija (100%)', xp: 25 });
    totalXP += 25;
  } else if (percentage >= 90) {
    breakdown.push({ label: 'A\'lo natija (90%+)', xp: 15 });
    totalXP += 15;
  } else if (percentage >= 80) {
    breakdown.push({ label: 'Yaxshi natija (80%+)', xp: 10 });
    totalXP += 10;
  } else if (percentage >= 60) {
    breakdown.push({ label: 'O\'tish natijasi (60%+)', xp: 5 });
    totalXP += 5;
  }

  // 3. Kunlik sinov bonusi
  if (isDaily) {
    breakdown.push({ label: 'Bugungi sinov bonusi', xp: 20 });
    totalXP += 20;
  }

  // 4. Streak rag'batlantirish bonusi (Retention)
  if (currentStreak >= 7) {
    breakdown.push({ label: `Olovli streak bonusi (${currentStreak} kun)`, xp: 10 });
    totalXP += 10;
  } else if (currentStreak >= 3) {
    breakdown.push({ label: `Faol streak bonusi (${currentStreak} kun)`, xp: 5 });
    totalXP += 5;
  }

  // 5. Jarima ayirmasi (agar bo'lsa)
  if (penalty > 0) {
    const penaltyXP = Math.round(totalXP * (penalty / 100));
    if (penaltyXP > 0) {
      breakdown.push({ label: `Anti-cheat jarimasi (-${penalty}%)`, xp: -penaltyXP });
      totalXP = Math.max(5, totalXP - penaltyXP);
    }
  }

  return {
    totalXP: Math.max(5, totalXP),
    breakdown,
  };
}

// ============================================================
// 4. KUNLIK MISSIYALAR (DAILY MISSIONS)
// ============================================================

/**
 * Foydalanuvchining bugungi kunlik missiyalarini oladi yoki yaratadi.
 *
 * @param {object|null} user
 * @param {string} [todayStr=today()]
 * @returns {Array<{
 *   id: string,
 *   title: string,
 *   desc: string,
 *   target: number,
 *   current: number,
 *   completed: boolean,
 *   xpReward: number,
 *   icon: string
 * }>}
 */
export function getDailyMissions(user, todayStr = today()) {
  const defaultMissions = [
    {
      id: 'm1_solve_one',
      title: 'Kunlik mutolaa',
      desc: 'Bugun ixtiyoriy 1 ta kitob testini yeching',
      target: 1,
      current: 0,
      completed: false,
      xpReward: 15,
      icon: '📖',
    },
    {
      id: 'm2_high_score',
      title: 'Zukko tahlil',
      desc: 'Testda kamida 80% yoki undan yuqori natija ko\'rsating',
      target: 1,
      current: 0,
      completed: false,
      xpReward: 20,
      icon: '🎯',
    },
    {
      id: 'm3_try_book',
      title: 'Yangi ufqlarni kashf etish',
      desc: 'Bugungi sinov yoki yangi asar testini sinab ko\'ring',
      target: 1,
      current: 0,
      completed: false,
      xpReward: 15,
      icon: '✨',
    }
  ];

  if (!user || !user.id) return defaultMissions;

  const key = `kitobchi_missions_${user.id}_${todayStr}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length === 3) {
        return saved;
      }
    }
  } catch {}

  // Yangi kunlik holatni saqlash
  try {
    localStorage.setItem(key, JSON.stringify(defaultMissions));
  } catch {}

  return defaultMissions;
}

/**
 * Yechilgan test natijasi bo'yicha kunlik missiyalarni yangilaydi.
 *
 * @param {object} user
 * @param {object} quizResult
 * @param {boolean} [isDailyBook=false]
 * @returns {{
 *   missions: Array<object>,
 *   newlyCompleted: Array<object>,
 *   bonusXP: number
 * }}
 */
export function checkAndUpdateDailyMissions(user, quizResult, isDailyBook = false) {
  if (!user || !user.id || !quizResult) {
    return { missions: getDailyMissions(user), newlyCompleted: [], bonusXP: 0 };
  }

  const todayStr = today();
  const missions = getDailyMissions(user, todayStr);
  const newlyCompleted = [];
  let bonusXP = 0;

  const percentage = quizResult.percentage || 0;

  missions.forEach(m => {
    if (m.completed) return;

    if (m.id === 'm1_solve_one') {
      m.current = Math.min(m.target, m.current + 1);
      if (m.current >= m.target) {
        m.completed = true;
        newlyCompleted.push(m);
        bonusXP += m.xpReward;
      }
    } else if (m.id === 'm2_high_score') {
      if (percentage >= 80) {
        m.current = 1;
        m.completed = true;
        newlyCompleted.push(m);
        bonusXP += m.xpReward;
      }
    } else if (m.id === 'm3_try_book') {
      if (isDailyBook || percentage >= 60) {
        m.current = 1;
        m.completed = true;
        newlyCompleted.push(m);
        bonusXP += m.xpReward;
      }
    }
  });

  // Saqlash
  const key = `kitobchi_missions_${user.id}_${todayStr}`;
  try {
    localStorage.setItem(key, JSON.stringify(missions));
  } catch {}

  return { missions, newlyCompleted, bonusXP };
}

// ============================================================
// 5. ASARNI O'ZLASHTIRISH (BOOK MASTERY)
// ============================================================

/**
 * Kitob mastery darajasini baholaydi.
 *
 * @param {number} percentage — eng yaxshi ko'rsatilgan foiz
 * @returns {{
 *   pct: number,
 *   tier: string,
 *   emoji: string,
 *   colorClass: string
 * }}
 */
export function evaluateMasteryTier(percentage = 0) {
  const p = Math.max(0, Math.min(100, Math.round(percentage)));

  if (p >= 100) return { pct: p, tier: 'Mukammal', emoji: '👑', colorClass: 'mastery-perfect' };
  if (p >= 80)  return { pct: p, tier: 'Usta', emoji: '🏆', colorClass: 'mastery-expert' };
  if (p >= 60)  return { pct: p, tier: 'Tahlilchi', emoji: '🔎', colorClass: 'mastery-adept' };
  if (p >= 40)  return { pct: p, tier: 'Biluvchi', emoji: '🧠', colorClass: 'mastery-know' };
  if (p >= 20)  return { pct: p, tier: 'Tanish', emoji: '📖', colorClass: 'mastery-familiar' };
  return { pct: p, tier: 'Boshlang\'ich', emoji: '🌱', colorClass: 'mastery-novice' };
}

/**
 * Foydalanuvchining barcha kitoblar bo'yicha mastery xaritasini oladi.
 *
 * @param {string} userId
 * @param {Array<object>} userResults
 * @returns {Record<string, { bestPercentage: number, attempts: number, tier: object }>}
 */
export function calculateAllBooksMastery(userId, userResults = []) {
  const masteryMap = {};

  if (!Array.isArray(userResults)) return masteryMap;

  userResults.forEach(r => {
    if (!r.bookId && !r.book_id) return;
    const bId = String(r.bookId || r.book_id);
    const pct = Number(r.percentage || 0);

    if (!masteryMap[bId]) {
      masteryMap[bId] = {
        bestPercentage: pct,
        attempts: 1,
      };
    } else {
      masteryMap[bId].bestPercentage = Math.max(masteryMap[bId].bestPercentage, pct);
      masteryMap[bId].attempts += 1;
    }
  });

  Object.keys(masteryMap).forEach(bId => {
    masteryMap[bId].tier = evaluateMasteryTier(masteryMap[bId].bestPercentage);
  });

  return masteryMap;
}

// ============================================================
// 6. YUTUQLAR (ACHIEVEMENTS)
// ============================================================

export const ACHIEVEMENTS = [
  {
    id: 'first_step',
    title: 'Birinchi qadam',
    desc: 'Platformada ilk testni muvaffaqiyatli yakunlang',
    emoji: '🥉',
    check: ({ totalTests }) => totalTests >= 1,
  },
  {
    id: 'book_worm_5',
    title: 'Kitobxon',
    desc: 'Kamida 5 ta turli asar bo\'yicha test yeching',
    emoji: '📚',
    check: ({ uniqueBooks }) => uniqueBooks >= 5,
  },
  {
    id: 'fiery_week',
    title: 'Olovli hafta',
    desc: 'Ketma-ket 7 kunlik faol streakka erishing',
    emoji: '🔥',
    check: ({ streak }) => streak >= 7,
  },
  {
    id: 'perfectionist',
    title: 'Mukammallik',
    desc: 'Biror asar testini 100% xatosiz yeching',
    emoji: '🧠',
    check: ({ maxScorePct }) => maxScorePct >= 100,
  },
  {
    id: 'literary_voyager',
    title: 'Mutolaa sayohatchisi',
    desc: '10 ta turli asar testini muvaffaqiyatli topshiring',
    emoji: '📖',
    check: ({ uniqueBooks }) => uniqueBooks >= 10,
  },
  {
    id: 'scholar_1000',
    title: 'Bilimdon',
    desc: '1000 XP daraja balliga erishing',
    emoji: '🏛️',
    check: ({ xp }) => xp >= 1000,
  },
  {
    id: 'grand_master_3000',
    title: 'Alloma',
    desc: '3000 XP to\'plang va eng oliy darajani zabt eting',
    emoji: '👑',
    check: ({ xp }) => xp >= 3000,
  },
];

/**
 * Foydalanuvchining ochilgan yutuqlarini tekshiradi.
 *
 * @param {object} user
 * @param {Array<object>} results
 * @returns {Array<object>}
 */
export function checkUserAchievements(user, results = []) {
  if (!user) return ACHIEVEMENTS.map(a => ({ ...a, unlocked: false }));

  const uniqueBooks = new Set();
  let maxScorePct = 0;

  (results || []).forEach(r => {
    if (r.bookId || r.book_id) uniqueBooks.add(String(r.bookId || r.book_id));
    if (r.percentage) maxScorePct = Math.max(maxScorePct, Number(r.percentage));
  });

  const ctx = {
    totalTests: (results || []).length,
    uniqueBooks: uniqueBooks.size,
    streak: Number(user.streak || 0),
    maxScorePct: maxScorePct,
    xp: Number(user.score || 0),
  };

  return ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: a.check(ctx),
  }));
}

// ============================================================
// 7. ANTI-REPLAY / DUPLICATE REWARD GUARD
// ============================================================

/**
 * Test natijasi sessiya kalitini tekshiradi va takroriy XP hisoblanishini oldini oladi.
 *
 * @param {string} sessionNonce — test boshlanganda yaratilgan noyob token
 * @returns {boolean} — true: yangi va qabul qilindi; false: allaqachon topshirilgan
 */
export function verifyAndConsumeQuizSession(sessionNonce) {
  if (!sessionNonce) return true;
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return true;
  const key = `kitobchi_consumed_quiz_${sessionNonce}`;
  try {
    if (sessionStorage.getItem(key) || localStorage.getItem(key)) {
      return false; // Allaqachon qabul qilingan
    }
    sessionStorage.setItem(key, '1');
    localStorage.setItem(key, String(Date.now()));
  } catch {}
  return true;
}
