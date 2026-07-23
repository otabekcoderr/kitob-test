// ============================================================
// quiz.js — Test o'tkazish va anti-cheat tizimi
// ============================================================
// Vazifalar:
//   1. Savollarni yuklash va aralashtirish
//   2. Test sessiyasini boshqarish (timer, holat)
//   3. Anti-cheat: tab/F12/o'ng tugma kuzatuvi + jarima
//   4. Natijani hisoblash va saqlash
//   5. Streak yangilash
//
// Import: db.js · auth.js · utils.js
// ============================================================

import { getQuestions, saveQuizResult, updateStreakAndScore } from './db.js';
import { getCurrentUser }  from './auth.js';
import {
  shuffle,
  escapeHtml,
  showNotification,
  setButtonLoading,
  today,
} from './utils.js';

// ============================================================
// KONSTANTALAR
// ============================================================

/** Har bir savolga ajratilgan vaqt (soniya) */
const QUESTION_TIME  = 30;

/** Anti-cheat: nechta qoida buzilganda test tugaydi */
const MAX_VIOLATIONS = 3;

/** Anti-cheat: bir qoida buzilganda jarima foizi */
const PENALTY_PERCENT = 10;

// ============================================================
// QUIZ HOLATI (STATE)
// ============================================================

/**
 * Butun test davomida saqlanadigan holat.
 * Tashqaridan to'g'ridan-to'g'ri o'zgartirilmaydi —
 * faqat shu fayl ichidagi funksiyalar orqali.
 */
const state = {
  bookId:       null,   // Joriy kitob ID
  questions:    [],     // Savollar massivi (aralashtirilgan)
  currentIndex: 0,      // Joriy savol raqami
  score:        0,      // To'plangan ball
  violations:   0,      // Qoida buzilishlar soni
  penaltyTotal: 0,      // Jami jarima foizi
  timer:        null,   // setInterval ref
  timeLeft:     0,      // Joriy savolda qolgan vaqt
  isRunning:    false,  // Test davom etayaptimi?
  isFinished:   false,  // Test tuganganmi?
  startTime:    null,   // Test boshlangan vaqt
};

// ============================================================
// ANTI-CHEAT TIZIMI
// ============================================================

/**
 * Anti-cheat handlerlar — removeEventListener uchun saqlanadi.
 * @private
 */
const _handlers = {
  visibilityChange: null,
  contextMenu:      null,
  keydown:          null,
};

/**
 * Qoida buzilishini qayd etadi va ogohlantiradi.
 * 3 marta buzilsa — test 0 ball bilan tugaydi.
 *
 * @param {string} reason — buzilish sababi (log uchun)
 */
function _registerViolation(reason) {
  if (!state.isRunning || state.isFinished) return;

  state.violations  += 1;
  state.penaltyTotal = Math.min(state.violations * PENALTY_PERCENT, 100);

  const remaining = MAX_VIOLATIONS - state.violations;

  console.warn(`[anti-cheat] Qoida buzildi: ${reason}. Jami: ${state.violations}`);

  if (state.violations >= MAX_VIOLATIONS) {
    // Test tugaydi — 0 ball
    showNotification(
      '3 marta qoida buzildi! Test 0 ball bilan tugatildi.',
      'error',
      5000
    );
    _finishQuiz(true); // forceZero = true
  } else {
    showNotification(
      `⚠️ Ogohlantirish! ${remaining} ta ogohlantirish qoldi. Jarima: ${state.penaltyTotal}%`,
      'warning',
      4000
    );
  }
}

/**
 * Anti-cheat kuzatuvini yoqadi.
 * Test boshlanganida chaqiriladi.
 */
function _enableAntiCheat() {
  // 1. Tab / oyna almashtirish
  _handlers.visibilityChange = () => {
    if (document.hidden) {
      _registerViolation('tab/oyna almashtirish');
    }
  };
  document.addEventListener('visibilitychange', _handlers.visibilityChange);

  // 2. O'ng tugmani taqiqlash
  _handlers.contextMenu = (e) => {
    e.preventDefault();
    if (state.isRunning && !state.isFinished) {
      _registerViolation("o'ng tugma bosish");
    }
  };
  document.addEventListener('contextmenu', _handlers.contextMenu);

  // 3. F12 va DevTools klavishlarini taqiqlash
  _handlers.keydown = (e) => {
    const blocked =
      e.key === 'F12'                                      ||  // DevTools
      (e.ctrlKey && e.shiftKey && e.key === 'I')          ||  // Chrome DevTools
      (e.ctrlKey && e.shiftKey && e.key === 'J')          ||  // Console
      (e.ctrlKey && e.shiftKey && e.key === 'C')          ||  // Inspector
      (e.ctrlKey && e.key === 'U');                            // View source

    if (blocked) {
      e.preventDefault();
      if (state.isRunning && !state.isFinished) {
        _registerViolation('F12/DevTools kombinatsiyasi');
      }
    }
  };
  document.addEventListener('keydown', _handlers.keydown);
}

/**
 * Anti-cheat kuzatuvini o'chiradi.
 * Test tugaganida chaqiriladi.
 */
function _disableAntiCheat() {
  if (_handlers.visibilityChange) {
    document.removeEventListener('visibilitychange', _handlers.visibilityChange);
    _handlers.visibilityChange = null;
  }
  if (_handlers.contextMenu) {
    document.removeEventListener('contextmenu', _handlers.contextMenu);
    _handlers.contextMenu = null;
  }
  if (_handlers.keydown) {
    document.removeEventListener('keydown', _handlers.keydown);
    _handlers.keydown = null;
  }
}

// ============================================================
// TIMER
// ============================================================

/**
 * Savol uchun timerni boshlaydi.
 * Vaqt tugasa — keyingi savolga o'tadi.
 *
 * @param {Function} onTick   — (timeLeft: number) => void  [UI yangilash]
 * @param {Function} onExpire — () => void  [vaqt tugaganda]
 */
function _startTimer(onTick, onExpire) {
  _stopTimer();
  state.timeLeft = QUESTION_TIME;

  state.timer = setInterval(() => {
    state.timeLeft -= 1;

    if (typeof onTick === 'function') onTick(state.timeLeft);

    if (state.timeLeft <= 0) {
      _stopTimer();
      if (typeof onExpire === 'function') onExpire();
    }
  }, 1000);
}

/**
 * Timerni to'xtatadi.
 */
function _stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

// ============================================================
// QUIZ YAKUNLASH
// ============================================================

/**
 * Testni yakunlaydi, natijani hisoblaydi va saqlaydi.
 *
 * @param {boolean} [forceZero=false] — true: 0 ball (anti-cheat)
 * @returns {Promise<object>} — natija obyekti
 */
async function _finishQuiz(forceZero = false) {
  if (state.isFinished) return {};

  state.isFinished = true;
  state.isRunning  = false;

  _stopTimer();
  _disableAntiCheat();

  const totalQuestions = state.questions.length;
  const rawScore       = forceZero ? 0 : state.score;

  // Jarima hisoblash
  const penaltyAmount = Math.round(rawScore * (state.penaltyTotal / 100));
  const finalScore    = Math.max(0, rawScore - penaltyAmount);
  const percentage    = totalQuestions > 0
    ? Math.round((finalScore / totalQuestions) * 100)
    : 0;

  const result = {
    bookId:     state.bookId,
    score:      finalScore,
    total:      totalQuestions,
    percentage: percentage,
    penalty:    state.penaltyTotal,
    date:       today(),
  };

  // Natijani fonda (background) DB ga saqlaymiz — UI qotib qolmasligi uchun
  try {
    const user = getCurrentUser();
    if (user) {
      saveQuizResult(result).catch(err => console.warn('[quiz] saveQuizResult warning:', err));
      updateStreakAndScore(finalScore, today()).catch(err => console.warn('[quiz] updateStreak warning:', err));
    }
  } catch (err) {
    console.warn('[quiz] Natija saqlash fonda bajarilmadi:', err);
  }

  return result;
}

// ============================================================
// ASOSIY QUIZ CONTROLLERI
// ============================================================

/**
 * Yangi test sessiyasini boshlaydi.
 *
 * @param {object}   config
 * @param {string|number} config.bookId     — kitob ID
 * @param {object}   callbacks              — UI callback funksiyalari
 * @param {Function} callbacks.onReady      — (questions[]) test tayyor
 * @param {Function} callbacks.onQuestion   — ({question, index, total, timeLeft}) savol ko'rsatish
 * @param {Function} callbacks.onTick       — (timeLeft) timer yangilash
 * @param {Function} callbacks.onAnswer     — ({isCorrect, score, index}) javob natijasi
 * @param {Function} callbacks.onFinish     — (result) test tugadi
 * @param {Function} callbacks.onError      — (message) xato
 * @returns {Promise<void>}
 */
export async function startQuiz(config, callbacks = {}) {
  const { bookId } = config;
  const { onReady, onQuestion, onTick, onAnswer, onFinish, onError } = callbacks;

  // Holat tozalash
  Object.assign(state, {
    bookId:       bookId,
    questions:    [],
    currentIndex: 0,
    score:        0,
    violations:   0,
    penaltyTotal: 0,
    timer:        null,
    timeLeft:     0,
    isRunning:    false,
    isFinished:   false,
    startTime:    Date.now(),
  });

  try {
    // Savollarni yuklash
    const raw = await getQuestions(bookId);

    if (!raw || raw.length === 0) {
      if (typeof onError === 'function') {
        onError('Bu kitob uchun savollar topilmadi.');
      }
      return;
    }

    // Aralashtirish
    state.questions = shuffle(raw);
    state.isRunning = true;

    // Anti-cheat yoqish
    _enableAntiCheat();

    if (typeof onReady === 'function') onReady(state.questions);

    // Birinchi savol
    _showQuestion(callbacks);

  } catch (err) {
    console.error('[quiz] startQuiz xatosi:', err);
    if (typeof onError === 'function') {
      onError('Test yuklanishda xatolik. Qayta urinib ko\'ring.');
    }
  }
}

/**
 * Joriy savolni ko'rsatadi va timerni boshlaydi.
 * @private
 */
function _showQuestion(callbacks) {
  const { onQuestion, onTick, onFinish } = callbacks;

  if (state.currentIndex >= state.questions.length) {
    // Barcha savollar tugadi
    _finishQuiz(false).then(result => {
      if (typeof onFinish === 'function') onFinish(result);
    });
    return;
  }

  const question = state.questions[state.currentIndex];

  if (typeof onQuestion === 'function') {
    onQuestion({
      question,
      index: state.currentIndex,
      total: state.questions.length,
      timeLeft: QUESTION_TIME,
    });
  }

  // Timer boshlash
  _startTimer(
    (timeLeft) => {
      if (typeof onTick === 'function') onTick(timeLeft);
    },
    () => {
      // Vaqt tugadi — noto'g'ri javob sifatida o'tkazamiz
      _nextQuestion(null, callbacks);
    }
  );
}

/**
 * Foydalanuvchi javob berganida chaqiriladi.
 *
 * @param {string|number} selectedOption — tanlangan javob
 * @param {object}        callbacks
 */
export function submitAnswer(selectedOption, callbacks = {}) {
  if (!state.isRunning || state.isFinished) return;

  _stopTimer();
  _nextQuestion(selectedOption, callbacks);
}

/**
 * Javobni tekshirib, keyingi savolga o'tkazadi.
 * @private
 */
function _nextQuestion(selectedOption, callbacks) {
  const { onAnswer, onFinish } = callbacks;

  const question   = state.questions[state.currentIndex];
  const isCorrect  = selectedOption !== null &&
                     String(selectedOption) === String(question.correct_answer ?? question.answer);

  if (isCorrect) state.score += 1;

  if (typeof onAnswer === 'function') {
    onAnswer({
      isCorrect,
      selectedOption,
      correctAnswer: question.correct_answer ?? question.answer,
      score:         state.score,
      index:         state.currentIndex,
    });
  }

  state.currentIndex += 1;

  // Qisqa pauza — foydalanuvchi javob natijasini ko'rsin
  setTimeout(() => {
    if (state.isFinished) return;

    if (state.currentIndex >= state.questions.length) {
      _finishQuiz(false).then(result => {
        if (typeof onFinish === 'function') onFinish(result);
      });
    } else {
      _showQuestion(callbacks);
    }
  }, 1200);
}

/**
 * Testni vaqtidan oldin tugatadi (foydalanuvchi o'zi tugataoladi).
 *
 * @param {object} callbacks
 * @returns {Promise<void>}
 */
export async function abortQuiz(callbacks = {}) {
  if (!state.isRunning || state.isFinished) return;

  const result = await _finishQuiz(false);
  if (typeof callbacks.onFinish === 'function') {
    callbacks.onFinish(result);
  }
}

// ============================================================
// HOLAT O'QISH (READ-ONLY)
// ============================================================

/**
 * Joriy quiz holatini qaytaradi (o'zgartirish mumkin emas).
 *
 * @returns {Readonly<object>}
 */
export function getQuizState() {
  return Object.freeze({ ...state });
}
