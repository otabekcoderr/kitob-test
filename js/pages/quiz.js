// ============================================================
// pages/quiz.js — Test UI sahifasi (Editorial uslub)
// ============================================================
import {
  startQuiz,
  submitAnswer,
  abortQuiz,
  getQuizState,
} from '../quiz.js';
import { getBookById } from '../db.js';
import { escapeHtml }  from '../utils.js';

let _callbacks  = {};
let _cleanup    = [];
let _quizActive = false;

export async function render(container, { params, user }) {
  const bookId = params.bookId;

  if (!bookId || !user) {
    window.navigate('books');
    return;
  }

  container.innerHTML = `
    <div class="page" id="quiz-page" style="padding-top:calc(var(--navbar-h) + 16px);">
      <div class="container container--md">

        <!-- Yuklash holati -->
        <div id="quiz-loading" class="loading-state animate-fade-in">
          <div class="spinner"></div>
          <span>Test tayyorlanmoqda...</span>
        </div>

        <!-- Test interfeysi (yashirin) -->
        <div id="quiz-ui" hidden>

          <!-- Header: progress + timer + yakunlash -->
          <div id="quiz-header" style="display:flex;align-items:center;gap:16px;margin-bottom:28px;flex-wrap:wrap;max-width:680px;margin-left:auto;margin-right:auto;">
            <div style="flex:1;display:flex;align-items:center;gap:12px;">
              <div class="progress-bar" style="flex:1;" role="progressbar"
                   aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="progress-bar__fill" id="progress-fill" style="width:0%"></div>
              </div>
              <span class="quiz-counter" id="progress-text" aria-live="polite">1 / ?</span>
            </div>

            <div id="quiz-timer" aria-live="polite" aria-label="Qolgan vaqt"
                 style="display:flex;align-items:center;gap:4px;font-family:var(--font-display);font-size:1.125rem;font-weight:700;color:var(--ink);padding:4px 12px;border:1.5px solid var(--divider);border-radius:var(--radius-md);background:var(--surface);transition:border-color .15s ease,color .15s ease;">
              <span id="timer-value">30</span>
              <span style="font-size:0.75rem;color:var(--ink-muted);">s</span>
            </div>

            <button id="abort-btn" class="btn btn-ghost btn-sm" type="button">
              Yakunlash
            </button>
          </div>

          <!-- Savol yuzasi -->
          <div class="quiz-surface" id="quiz-question-wrap">
            <p class="label" id="quiz-book-name" style="margin-bottom:16px;"></p>
            <p class="quiz-question" id="quiz-question" aria-live="polite"></p>
            <div class="quiz-options" id="quiz-options" role="list"></div>
            <div class="explanation-panel" id="quiz-explanation"
                 aria-live="polite" hidden></div>
            <div id="quiz-next-wrap" hidden style="margin-top:20px;">
              <button id="next-btn" class="btn btn-primary">Keyingi savol</button>
            </div>
          </div>

          <!-- Ogohlantirish (anti-cheat) -->
          <div id="quiz-violations" aria-live="assertive" hidden
               style="margin-top:16px;padding:12px 16px;border:1px solid var(--warning);border-radius:var(--radius-md);background:var(--warning-light);font-size:.9rem;color:var(--warning);">
            <span id="violations-text"></span>
          </div>

        </div>

      </div>
    </div>
  `;

  // Kitob nomini olish
  getBookById(bookId).then(book => {
    const nameEl = document.getElementById('quiz-book-name');
    if (nameEl && book) nameEl.textContent = `Asar: ${book.title}`;
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
  const loadingEl = document.getElementById('quiz-loading');
  const uiEl      = document.getElementById('quiz-ui');
  if (loadingEl) { loadingEl.hidden = true; loadingEl.style.display = 'none'; }
  if (uiEl)      { uiEl.hidden = false;     uiEl.removeAttribute('hidden'); }
}

function _onQuestion({ question, index, total, timeLeft }) {
  // Progress
  const pct  = Math.round((index / total) * 100);
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  if (fill) { fill.style.width = `${pct}%`; fill.setAttribute('aria-valuenow', pct); }
  if (text) text.textContent = `${index + 1} / ${total}`;

  _onTick(timeLeft);

  // Badge va savol matni
  const questionEl = document.getElementById('quiz-question');
  if (questionEl) {
    const badges = ['🎯 Falsafiy tahlil', '🧠 Qahramon ruhiyati', '📖 Syujet va mantiq', '💡 Asar tagmatni'];
    const badgeText = badges[index % badges.length];
    questionEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <span class="badge" style="font-size:0.75rem;padding:3px 10px;background:var(--ochre-light);color:var(--ochre);border:1px solid var(--ochre);font-weight:600;">
          ${badgeText}
        </span>
      </div>
      <span>${escapeHtml(question.question || question.text || '')}</span>
    `;
  }

  // Variantlar
  const optionsEl = document.getElementById('quiz-options');
  if (!optionsEl) return;

  // Izoh va keyingi tugmani yashirish
  const explanationEl = document.getElementById('quiz-explanation');
  if (explanationEl) { explanationEl.hidden = true; explanationEl.innerHTML = ''; }
  const nextWrap = document.getElementById('quiz-next-wrap');
  if (nextWrap) nextWrap.hidden = true;

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

  optionsEl.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      _disableOptions();
      submitAnswer(value, _callbacks);
    }, { once: true });
  });

  // Animatsiya
  const wrap = document.getElementById('quiz-question-wrap');
  if (wrap) {
    wrap.classList.remove('animate-slide-up');
    void wrap.offsetWidth;
    wrap.classList.add('animate-slide-up');
  }
}

function _onTick(timeLeft) {
  const val   = document.getElementById('timer-value');
  const timer = document.getElementById('quiz-timer');
  if (val) val.textContent = timeLeft;
  if (timer) {
    const isWarn     = timeLeft <= 10 && timeLeft > 5;
    const isCritical = timeLeft <= 5;
    timer.style.borderColor = isCritical ? 'var(--error)' : isWarn ? 'var(--warning)' : 'var(--divider)';
    timer.style.color       = isCritical ? 'var(--error)' : isWarn ? 'var(--warning)' : 'var(--ink)';
  }
}

function _onAnswer({ isCorrect, correctAnswer, selectedOption, explanation }) {
  // Variantlarni belgilash
  document.querySelectorAll('.quiz-option').forEach(btn => {
    const val = btn.dataset.value;
    if (String(val) === String(correctAnswer)) {
      btn.classList.add('correct');
    }
    if (selectedOption !== null &&
        String(val) === String(selectedOption) &&
        !isCorrect) {
      btn.classList.add('wrong');
    }
  });

  // Darhol boyitilgan izoh paneli
  const explanationEl = document.getElementById('quiz-explanation');
  if (explanationEl) {
    const titleText = isCorrect ? "To'g'ri javob! Chuqur tahlil:" : "Mantiqiy tahlil va izoh:";
    explanationEl.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="font-size:1.3rem;line-height:1;flex-shrink:0;">💡</span>
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--ink);margin-bottom:6px;font-size:0.9375rem;">
            ${titleText}
          </div>
          <div style="font-size:0.875rem;line-height:1.65;color:var(--ink);">
            ${escapeHtml(explanation || "Ushbu asar inson ruhiyati va hayotiy qonuniyatlarni chuqur mushohada qilishga undaydi.")}
          </div>
        </div>
      </div>
    `;
    explanationEl.hidden = false;
  }

  // Keyingi tugma
  const nextWrap = document.getElementById('quiz-next-wrap');
  if (nextWrap) {
    nextWrap.hidden = false;
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
      nextBtn.innerHTML = `Keyingi savolga o'tish →`;
      nextBtn.onclick = () => {
        nextWrap.hidden = true;
        if (explanationEl) explanationEl.hidden = true;
      };
    }
  }
}

function _onFinish(result) {
  _quizActive = false;
  try {
    sessionStorage.setItem('quiz_result', JSON.stringify(result));
    localStorage.setItem('last_quiz_result', JSON.stringify(result));
  } catch { /* ignore */ }
  window.navigate('result');
}

function _onError(message) {
  _quizActive = false;
  const page = document.getElementById('quiz-page');
  if (page) {
    page.innerHTML = `
      <div class="container container--md">
        <div class="empty-state" style="min-height:60vh">
          <p class="empty-state__title">${escapeHtml(message)}</p>
          <a href="#books" class="btn btn-primary" style="margin-top:16px;">Kitoblarga qaytish</a>
        </div>
      </div>
    `;
  }
}

// ---- YORDAMCHI ----

function _getOptions(question) {
  if (Array.isArray(question.options))  return question.options;
  if (Array.isArray(question.variants)) return question.variants;
  if (Array.isArray(question.choices))  return question.choices;
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const opts = keys.map(k => question[k]).filter(v => v !== undefined && v !== '');
  if (opts.length) return opts;
  return [];
}

function _disableOptions() {
  document.querySelectorAll('.quiz-option').forEach(btn => {
    btn.disabled = true;
  });
}

export function cleanup() {
  _quizActive = false;
  _callbacks  = {};
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
