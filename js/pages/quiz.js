// ============================================================
// pages/quiz.js — Test UI sahifasi
// ============================================================
// Bu fayl faqat UI bilan shug'ullanadi.
// Barcha mantiq root/quiz.js dan import qilinadi.
// ============================================================
import {
  startQuiz,
  submitAnswer,
  abortQuiz,
  getQuizState,
} from '../quiz.js';
import { getBookById }          from '../db.js';
import { escapeHtml }           from '../utils.js';
import { navigate }             from '../app.js';

let _callbacks  = {};
let _cleanup    = [];
let _quizActive = false;

export async function render(container, { params, user }) {
  const bookId = params.bookId;

  if (!bookId || !user) {
    navigate('books');
    return;
  }

  container.innerHTML = `
    <div class="page quiz-page" id="quiz-page">
      <div class="container container--md">

        <!-- Yuklash holati -->
        <div id="quiz-loading" class="loading-state animate-fade-in">
          <div class="spinner spinner--lg"></div>
          <span>Test tayyorlanmoqda...</span>
        </div>

        <!-- Test interfeysi (yashirin) -->
        <div id="quiz-ui" hidden>

          <!-- Header: progress + timer -->
          <div class="quiz-header animate-slide-up">
            <div class="quiz-progress">
              <div class="quiz-progress__bar" role="progressbar"
                   aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="quiz-progress__fill" id="progress-fill"></div>
              </div>
              <span class="quiz-progress__text" id="progress-text">1 / ?</span>
            </div>

            <div class="quiz-timer" id="quiz-timer" aria-live="polite" aria-label="Qolgan vaqt">
              <span class="quiz-timer__icon" aria-hidden="true">⏱️</span>
              <span class="quiz-timer__val" id="timer-value">30</span>
              <span class="quiz-timer__unit">s</span>
            </div>

            <button id="abort-btn" class="btn btn-ghost btn-sm" type="button">
              ✕ Tugatish
            </button>
          </div>

          <!-- Savol -->
          <div class="quiz-question-wrap animate-slide-up">
            <div class="quiz-book-name" id="quiz-book-name"></div>
            <div class="quiz-question" id="quiz-question" aria-live="polite"></div>
            <div class="quiz-options" id="quiz-options" role="list"></div>
          </div>

          <!-- Ogohlantirish (anti-cheat) -->
          <div class="quiz-violations" id="quiz-violations" aria-live="assertive" hidden>
            <span id="violations-text"></span>
          </div>

        </div>

      </div>
    </div>
  `;

  _addStyles();

  // Kitob nomini olish (ixtiyoriy)
  getBookById(bookId).then(book => {
    const nameEl = document.getElementById('quiz-book-name');
    if (nameEl && book) nameEl.textContent = book.title;
  }).catch(() => {});

  // Abort tugmasi
  const abortBtn = document.getElementById('abort-btn');
  const onAbort = () => {
    if (!_quizActive) return;
    if (confirm('Testni tugatmoqchimisiz? Natijangiz saqlanadi.')) {
      abortQuiz(_callbacks);
    }
  };
  abortBtn?.addEventListener('click', onAbort);
  _cleanup.push(() => abortBtn?.removeEventListener('click', onAbort));

  // Testni boshlash
  _callbacks = {
    onReady:    _onReady,
    onQuestion: _onQuestion,
    onTick:     _onTick,
    onAnswer:   _onAnswer,
    onFinish:   _onFinish,
    onError:    _onError,
  };

  _quizActive = true;
  await startQuiz({ bookId }, _callbacks);
}

// ---- CALLBACKS ----

function _onReady(questions) {
  document.getElementById('quiz-loading')?.setAttribute('hidden', '');
  document.getElementById('quiz-ui')?.removeAttribute('hidden');
}

function _onQuestion({ question, index, total, timeLeft }) {
  // Progress
  const pct = Math.round((index / total) * 100);
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  if (fill) { fill.style.width = `${pct}%`; fill.setAttribute('aria-valuenow', pct); }
  if (text) text.textContent = `${index + 1} / ${total}`;

  // Timer
  _onTick(timeLeft);

  // Savol matni
  const questionEl = document.getElementById('quiz-question');
  if (questionEl) questionEl.textContent = question.question || question.text || '';

  // Variantlar
  const optionsEl = document.getElementById('quiz-options');
  if (!optionsEl) return;

  const options = _getOptions(question);
  optionsEl.innerHTML = options.map((opt, i) => `
    <button
      class="quiz-option"
      role="listitem"
      data-value="${escapeHtml(String(opt))}"
      aria-label="Variant ${String.fromCharCode(65 + i)}: ${escapeHtml(String(opt))}"
    >
      <span class="quiz-option__letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
      <span class="quiz-option__text">${escapeHtml(String(opt))}</span>
    </button>
  `).join('');

  // Variant bosilganda
  optionsEl.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      _disableOptions();
      btn.classList.add('quiz-option--selected');
      submitAnswer(value, _callbacks);
    }, { once: true });
  });

  // Animatsiya: savol almashinishida
  const wrap = document.querySelector('.quiz-question-wrap');
  if (wrap) {
    wrap.classList.remove('animate-slide-up');
    void wrap.offsetWidth; // reflow
    wrap.classList.add('animate-slide-up');
  }
}

function _onTick(timeLeft) {
  const val   = document.getElementById('timer-value');
  const timer = document.getElementById('quiz-timer');
  if (val)   val.textContent = timeLeft;
  if (timer) {
    timer.classList.toggle('quiz-timer--warn',     timeLeft <= 10 && timeLeft > 5);
    timer.classList.toggle('quiz-timer--critical', timeLeft <= 5);
  }
}

function _onAnswer({ isCorrect, correctAnswer, selectedOption }) {
  // To'g'ri javobni ko'rsatish
  const options = document.querySelectorAll('.quiz-option');
  options.forEach(btn => {
    const val = btn.dataset.value;
    if (String(val) === String(correctAnswer)) {
      btn.classList.add('quiz-option--correct');
    }
    if (selectedOption !== null &&
        String(val) === String(selectedOption) &&
        !isCorrect) {
      btn.classList.add('quiz-option--wrong');
    }
  });
}

function _onFinish(result) {
  _quizActive = false;

  // Natija sahifasiga o'tkazamiz
  // Natijani sessionStorage orqali o'tkazamiz
  try {
    sessionStorage.setItem('quiz_result', JSON.stringify(result));
  } catch { /* ignore */ }

  navigate('result');
}

function _onError(message) {
  _quizActive = false;
  document.getElementById('quiz-loading')?.setAttribute('hidden', '');
  const page = document.getElementById('quiz-page');
  if (page) {
    page.innerHTML = `
      <div class="container container--md">
        <div class="empty-state" style="min-height:60vh">
          <div class="empty-state__icon">⚠️</div>
          <p class="empty-state__title">${escapeHtml(message)}</p>
          <a href="#books" class="btn btn-primary mt-4">Kitoblarga qaytish</a>
        </div>
      </div>
    `;
  }
}

// ---- YORDAMCHI ----

function _getOptions(question) {
  // Turli formatlarni qo'llab-quvvatlaydi
  if (Array.isArray(question.options))    return question.options;
  if (Array.isArray(question.variants))   return question.variants;
  if (Array.isArray(question.choices))    return question.choices;

  // { a, b, c, d } formatidagi obyekt
  const keys = ['a','b','c','d','e'];
  const opts = keys.map(k => question[k]).filter(v => v !== undefined && v !== '');
  if (opts.length) return opts;

  return [];
}

function _disableOptions() {
  document.querySelectorAll('.quiz-option').forEach(btn => {
    btn.disabled = true;
    btn.classList.add('quiz-option--disabled');
  });
}

function _addStyles() {
  if (document.getElementById('quiz-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'quiz-page-styles';
  style.textContent = `
    .quiz-page { padding-top: calc(var(--navbar-h) + 16px); }

    .quiz-header {
      display: flex; align-items: center; gap: 16px;
      margin-bottom: 28px; flex-wrap: wrap;
    }
    .quiz-progress { flex: 1; min-width: 140px; display: flex; align-items: center; gap: 12px; }
    .quiz-progress__bar {
      flex: 1; height: 8px; background: var(--bg-tertiary);
      border-radius: var(--radius-full); overflow: hidden;
    }
    .quiz-progress__fill {
      height: 100%; width: 0%; background: var(--color-primary);
      border-radius: var(--radius-full);
      transition: width 0.4s ease;
    }
    .quiz-progress__text { font-size: .875rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }

    .quiz-timer {
      display: flex; align-items: center; gap: 4px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      padding: 6px 14px;
      border: 2px solid var(--border-color);
      transition: var(--transition);
    }
    .quiz-timer__val  { font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; min-width: 28px; text-align: center; }
    .quiz-timer__unit { font-size: .8rem; color: var(--text-muted); }
    .quiz-timer--warn     { border-color: var(--color-warning); color: var(--color-warning); background: var(--color-warning-light); }
    .quiz-timer--critical { border-color: var(--color-error);   color: var(--color-error);   background: var(--color-error-light);
      animation: pulse 0.8s ease-in-out infinite; }

    .quiz-book-name {
      font-size: .875rem; font-weight: 600; color: var(--text-muted);
      margin-bottom: 12px; text-transform: uppercase; letter-spacing: .05em;
    }
    .quiz-question {
      font-size: clamp(1.0625rem, 2.5vw, 1.25rem);
      font-weight: 600; line-height: 1.5;
      color: var(--text-primary);
      margin-bottom: 24px;
      min-height: 64px;
    }
    .quiz-options { display: flex; flex-direction: column; gap: 12px; }

    .quiz-option {
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px;
      background: var(--bg-primary);
      border: 2px solid var(--border-color);
      border-radius: var(--radius-md);
      cursor: pointer; text-align: left;
      transition: var(--transition);
      font-size: .9375rem; width: 100%;
      font-family: var(--font-body);
      color: var(--text-primary);
    }
    .quiz-option:hover:not(:disabled) {
      border-color: var(--color-primary);
      background: var(--color-primary-light);
      transform: translateX(4px);
    }
    .quiz-option__letter {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg-tertiary); color: var(--text-muted);
      font-weight: 700; font-size: .875rem; flex-shrink: 0;
      transition: var(--transition);
    }
    .quiz-option:hover:not(:disabled) .quiz-option__letter {
      background: var(--color-primary);
      color: white;
    }
    .quiz-option__text { flex: 1; line-height: 1.4; }

    .quiz-option--selected {
      border-color: var(--color-primary);
      background: var(--color-primary-light);
    }
    .quiz-option--correct {
      border-color: var(--color-success) !important;
      background: var(--color-success-light) !important;
    }
    .quiz-option--correct .quiz-option__letter {
      background: var(--color-success); color: white;
    }
    .quiz-option--wrong {
      border-color: var(--color-error) !important;
      background: var(--color-error-light) !important;
    }
    .quiz-option--wrong .quiz-option__letter {
      background: var(--color-error); color: white;
    }
    .quiz-option--disabled { cursor: default; opacity: .85; }

    .quiz-violations {
      margin-top: 20px;
      background: var(--color-warning-light);
      border: 1px solid var(--color-warning);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      font-size: .9rem; font-weight: 500;
      color: var(--color-warning);
    }

    @media (max-width: 480px) {
      .quiz-header { gap: 8px; }
      .quiz-option { padding: 12px 14px; gap: 10px; }
      .quiz-option__letter { width: 28px; height: 28px; font-size: .8rem; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _quizActive = false;
  _callbacks  = {};
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
