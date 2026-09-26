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

import { getQuestions, getBookById, saveQuizResult, updateStreakAndScore, fetchQuizQuestions, submitQuizAnswers } from './db.js';
import { getCurrentUser }  from './auth.js';
import {
  shuffle,
  escapeHtml,
  showNotification,
  setButtonLoading,
  today,
  playQuizSound,
} from './utils.js';
import {
  calculateQuizXPEarned,
  getUserLevel,
  checkAndUpdateDailyMissions,
  verifyAndConsumeQuizSession,
} from './progression.js';

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
  isAcceptingAnswer: false, // Joriy savol javob qabul qilyaptimi?
  startTime:    null,   // Test boshlangan vaqt
  sessionNonce: null,   // Bir martalik sessiya kaliti (anti-replay)
  isDaily:      false,  // Bugungi sinovmi?
  userAnswers:  [],     // Foydalanuvchi bergan javoblar va xatolar tahlili
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

let _hiddenAt = 0;
const VISIBILITY_GRACE_MS = 1500;

// To'g'ri javoblarni himoyalangan private xotirada saqlash (DevTools inspect orqali ko'rib olishdan himoya)
let _secureAnswerKeys = [];
let _secureExplanations = [];

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
      `Ogohlantirish! ${remaining} ta ogohlantirish qoldi. Jarima: ${state.penaltyTotal}%`,
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
      _hiddenAt = Date.now();
      return;
    }

    if (_hiddenAt && Date.now() - _hiddenAt > VISIBILITY_GRACE_MS) {
      _registerViolation('test oynasidan uzoq vaqt chiqish');
    }
    _hiddenAt = 0;
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

    if (state.timeLeft <= 5 && state.timeLeft > 0) {
      playQuizSound('tick');
    }

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
  const penaltyRate = forceZero ? 100 : state.penaltyTotal;

  // 1. Javoblarni serverless backendga yuborish (/api/quiz-submit)
  const payload = {
    bookId: state.bookId,
    answers: state.userAnswers.map(ans => ({
      questionId: String(ans.questionId),
      selectedOption: ans.selectedOption
    })),
    quizStartTime: state.startTime,
    penalty: penaltyRate,
    isDaily: state.isDaily
  };

  let result = null;
  try {
    result = await submitQuizAnswers(payload);
  } catch (err) {
    console.warn('[quiz] submitQuizAnswers error, using fallback:', err);
  }

  // 2. Default natija xavfsizlik himoyasi
  if (!result || typeof result.score === 'undefined') {
    result = {
      bookId: state.bookId,
      score: 0,
      total: totalQuestions,
      percentage: 0,
      penalty: penaltyRate,
      xpEarned: 0,
      answers: []
    };
  }

  // 3. Level-up ovoz effekti
  if (result.isLevelUp) {
    playQuizSound('levelup');
  }

  // 4. Sessiya va lokal xotiraga saqlash
  try {
    sessionStorage.setItem('quiz_result', JSON.stringify(result));
    localStorage.setItem('last_quiz_result', JSON.stringify(result));
  } catch {}

  return result;
}

// ============================================================
// ASOSIY QUIZ CONTROLLERI
// ============================================================

/**
 * Savol variantlarini tasodifiy aralashtiradi va correctAnswer indeksini moslashtiradi.
 * @param {object} question
 * @returns {object}
 */
export function shuffleOptions(question) {
  if (!question || !Array.isArray(question.options)) return question;

  const originalOptions = [...question.options];
  let correctText = question.correct_answer ?? question.correctAnswer;
  if (typeof correctText === 'number' && originalOptions[correctText] !== undefined) {
    correctText = originalOptions[correctText];
  }

  // Variantlarni aralashtiramiz
  const shuffled = shuffle(originalOptions);
  const newCorrectIndex = shuffled.indexOf(correctText);

  return {
    ...question,
    options: shuffled,
    correct_answer: String(correctText ?? ''),
    correctAnswer: newCorrectIndex >= 0 ? newCorrectIndex : 0,
  };
}

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
    isAcceptingAnswer: false,
    startTime:    Date.now(),
    sessionNonce: 'qz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    isDaily:      !!config.isDaily,
    userAnswers:  [],
    isOffline:    false,
  });

  try {
    // 1. Savollarni xavfsiz yuklash (/api/quiz orqali)
    const { questions: raw, isOffline } = await fetchQuizQuestions(bookId);
    state.isOffline = Boolean(isOffline);

    if (!raw || raw.length === 0) {
      if (typeof onError === 'function') {
        onError('Bu kitob uchun savollar topilmadi.');
      }
      return;
    }

    // 2. Savollarni tayyorlash
    _secureAnswerKeys = [];
    _secureExplanations = [];

    const shuffledQuestions = shuffle([...raw]);
    state.questions = shuffledQuestions.map((q, idx) => {
      // Faqat oflayn rejimda bo'lsagina mahalliy javob kalitlarini ajratamiz
      if (state.isOffline && (q._localCorrectAnswer !== undefined || q.correct_answer !== undefined || q.correctAnswer !== undefined)) {
        const correctVal = String(q._localCorrectAnswer ?? q.correct_answer ?? q.correctAnswer ?? '');
        _secureAnswerKeys[idx] = correctVal;
        _secureExplanations[idx] = String(q._localExplanation ?? q.explanation ?? '');
      }

      // Klientda javob va izohlarni aslo ochiq qoldirmaymiz (Anti-cheat)
      const cleanQ = {
        id: String(q.id),
        bookId: String(q.bookId || q.book_id || bookId),
        question: q.question || q.text || '',
        options: Array.isArray(q.options) ? q.options : [],
      };
      return Object.freeze(cleanQ);
    });
    state.isRunning = true;

    // 3. Anti-cheat yoqish
    _enableAntiCheat();

    if (typeof onReady === 'function') onReady(state.questions);

    // 4. Birinchi savolni ko'rsatish
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
  state.isAcceptingAnswer = true;

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
  if (!state.isRunning || state.isFinished || !state.isAcceptingAnswer) return;

  _stopTimer();
  _nextQuestion(selectedOption, callbacks);
}

/**
 * Javobni tekshirib, keyingi savolga o'tkazadi.
 * @private
 */
function _nextQuestion(selectedOption, callbacks) {
  const { onAnswer, onFinish } = callbacks;
  if (!state.isAcceptingAnswer) return;
  state.isAcceptingAnswer = false;

  const question       = state.questions[state.currentIndex];
  const correctVal     = _secureAnswerKeys[state.currentIndex] || '';
  const explanationVal = _secureExplanations[state.currentIndex] || '';

  const isOffline = Boolean(state.isOffline);
  const hasLocalKey = isOffline && Boolean(correctVal);

  const isCorrect = hasLocalKey ? (selectedOption !== null &&
                    String(selectedOption).trim().toLowerCase() === String(correctVal).trim().toLowerCase()) : null;

  if (isCorrect === true) {
    state.score += 1;
    playQuizSound('correct');
  } else if (isCorrect === false) {
    playQuizSound('wrong');
  } else {
    playQuizSound('click');
  }

  const opts = Array.isArray(question.options) ? question.options : [];
  const selectedIdx = opts.findIndex(o => String(o) === String(selectedOption));
  const correctIdx = hasLocalKey ? opts.findIndex(o => String(o) === String(correctVal)) : null;

  // Savol va javoblar tahlili uchun to'liq saqlaymiz
  state.userAnswers.push({
    questionId: question.id,
    question: question.question || question.text || '',
    questionText: question.question || question.text || '',
    options: opts,
    selectedOption: selectedOption,
    selectedText: selectedOption ? String(selectedOption) : null,
    selectedOptionIndex: selectedIdx >= 0 ? selectedIdx : null,
    correctAnswer: hasLocalKey ? correctVal : null,
    correctText: hasLocalKey ? correctVal : null,
    correctOptionIndex: correctIdx !== null && correctIdx >= 0 ? correctIdx : null,
    isCorrect: isCorrect,
    explanation: hasLocalKey ? explanationVal : null
  });

  if (typeof onAnswer === 'function') {
    onAnswer({
      isCorrect,
      selectedOption,
      correctAnswer: hasLocalKey ? correctVal : null,
      explanation:   hasLocalKey ? explanationVal : null,
      score:         state.score,
      index:         state.currentIndex,
      isOffline:     state.isOffline,
    });
  }

  state.currentIndex += 1;

  // Izohni o'qish yoki keyingi savolga silliq o'tish
  _clearAdvanceTimer();
  _advanceTimer = setTimeout(() => {
    _proceedToNext(callbacks);
  }, hasLocalKey ? 4500 : 700);
}

let _advanceTimer = null;

function _clearAdvanceTimer() {
  if (_advanceTimer) {
    clearTimeout(_advanceTimer);
    _advanceTimer = null;
  }
}

function _proceedToNext(callbacks) {
  _clearAdvanceTimer();
  if (state.isFinished) return;

  const { onFinish } = callbacks;
  if (state.currentIndex >= state.questions.length) {
    _finishQuiz(false).then(result => {
      if (typeof onFinish === 'function') onFinish(result);
    });
  } else {
    _showQuestion(callbacks);
  }
}

/**
 * Foydalanuvchi "Keyingi savol" tugmasini bosganda kutmasdan darhol o'tkazish.
 */
export function advanceNextQuestion(callbacks = {}) {
  _proceedToNext(callbacks);
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
