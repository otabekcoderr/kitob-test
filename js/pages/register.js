// ============================================================
// pages/register.js — Ro'yxatdan o'tish sahifasi
// ============================================================
import { register }                      from '../auth.js';
import { escapeHtml, setButtonLoading,
         showNotification }              from '../utils.js';
let _cleanup = [];

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page">
      <div class="container container--sm">

        <div class="auth-card card animate-slide-up">

          <div class="auth-card__logo">
            <span class="auth-card__logo-icon" aria-hidden="true">📚</span>
            <h1 class="auth-card__title">Hisob yaratish</h1>
            <p class="auth-card__sub">Kitobchi jamoasiga qo'shiling</p>
          </div>

          <form id="register-form" class="auth-form" novalidate>

            <!-- To'liq ism -->
            <div class="input-group">
              <label for="reg-fullname">To'liq ism</label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">📝</span>
                <input
                  id="reg-fullname"
                  name="fullName"
                  type="text"
                  class="input"
                  placeholder="Ism Familiya"
                  autocomplete="name"
                  required
                  maxlength="100"
                />
              </div>
              <span class="input-error" id="fullname-error" role="alert" aria-live="polite"></span>
            </div>

            <!-- Username -->
            <div class="input-group">
              <label for="reg-username">Foydalanuvchi nomi</label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">👤</span>
                <input
                  id="reg-username"
                  name="username"
                  type="text"
                  class="input"
                  placeholder="username (harf, raqam, _)"
                  autocomplete="username"
                  autocapitalize="none"
                  required
                  maxlength="30"
                  pattern="[a-zA-Z0-9_]+"
                />
              </div>
              <span class="input-hint">Faqat lotin harflari, raqamlar va _ belgisi</span>
              <span class="input-error" id="username-error" role="alert" aria-live="polite"></span>
            </div>

            <!-- Parol -->
            <div class="input-group">
              <label for="reg-password">Parol</label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">🔒</span>
                <input
                  id="reg-password"
                  name="password"
                  type="password"
                  class="input"
                  placeholder="Kamida 6 belgi"
                  autocomplete="new-password"
                  required
                  minlength="6"
                />
                <button
                  type="button"
                  id="toggle-password"
                  class="input-icon-right btn-icon"
                  aria-label="Parolni ko'rsatish"
                  tabindex="-1"
                >👁️</button>
              </div>
              <span class="input-error" id="password-error" role="alert" aria-live="polite"></span>
            </div>

            <!-- Parolni tasdiqlash -->
            <div class="input-group">
              <label for="reg-confirm">Parolni tasdiqlang</label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">🔐</span>
                <input
                  id="reg-confirm"
                  name="confirmPassword"
                  type="password"
                  class="input"
                  placeholder="Parolni qayta kiriting"
                  autocomplete="new-password"
                  required
                />
              </div>
              <span class="input-error" id="confirm-error" role="alert" aria-live="polite"></span>
            </div>

            <!-- Parol kuchi ko'rsatgich -->
            <div class="password-strength" id="password-strength" aria-hidden="true">
              <div class="password-strength__bar">
                <div class="password-strength__fill" id="strength-fill"></div>
              </div>
              <span class="password-strength__label" id="strength-label"></span>
            </div>

            <!-- Global xato -->
            <div id="register-error" class="auth-error" role="alert" aria-live="polite" hidden></div>

            <button
              id="register-btn"
              type="submit"
              class="btn btn-primary w-full"
            >
              Ro'yxatdan o'tish
            </button>

          </form>

          <p class="auth-card__footer-text">
            Hisobingiz bormi?
            <a href="#login" class="auth-link">Kiring</a>
          </p>

        </div>
      </div>
    </div>
  `;

  _addStyles();
  _bindEvents();
}

function _bindEvents() {
  const form        = document.getElementById('register-form');
  const fullNameEl  = document.getElementById('reg-fullname');
  const usernameEl  = document.getElementById('reg-username');
  const passwordEl  = document.getElementById('reg-password');
  const confirmEl   = document.getElementById('reg-confirm');
  const toggleBtn   = document.getElementById('toggle-password');
  const submitBtn   = document.getElementById('register-btn');
  const globalError = document.getElementById('register-error');

  // Parol kuchi
  const onPasswordInput = () => {
    _clearError('password-error', passwordEl);
    _updatePasswordStrength(passwordEl.value);
  };
  passwordEl.addEventListener('input', onPasswordInput);
  _cleanup.push(() => passwordEl.removeEventListener('input', onPasswordInput));

  // Parolni ko'rsatish
  const onToggle = () => {
    const isText = passwordEl.type === 'text';
    passwordEl.type       = isText ? 'password' : 'text';
    confirmEl.type        = isText ? 'password' : 'text';
    toggleBtn.textContent = isText ? '👁️' : '🙈';
  };
  toggleBtn.addEventListener('click', onToggle);
  _cleanup.push(() => toggleBtn.removeEventListener('click', onToggle));

  // Input tozalash
  const clearFns = [
    [fullNameEl, 'fullname-error'],
    [usernameEl, 'username-error'],
    [confirmEl,  'confirm-error'],
  ].map(([el, errId]) => {
    const fn = () => _clearError(errId, el);
    el.addEventListener('input', fn);
    return () => el.removeEventListener('input', fn);
  });
  _cleanup.push(...clearFns);

  // Submit
  const onSubmit = async (e) => {
    e.preventDefault();

    const fullName = fullNameEl.value.trim();
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    const confirm  = confirmEl.value;

    // Validatsiya
    let valid = true;

    if (!fullName) {
      _showFieldError('fullname-error', fullNameEl, 'Ism-familiyani kiriting.');
      valid = false;
    }
    if (!username) {
      _showFieldError('username-error', usernameEl, 'Foydalanuvchi nomini kiriting.');
      valid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      _showFieldError('username-error', usernameEl,
        'Faqat lotin harflari, raqamlar va _ belgisi.');
      valid = false;
    }
    if (!password) {
      _showFieldError('password-error', passwordEl, 'Parolni kiriting.');
      valid = false;
    } else if (password.length < 6) {
      _showFieldError('password-error', passwordEl, 'Parol kamida 6 belgi bo\'lishi kerak.');
      valid = false;
    }
    if (password !== confirm) {
      _showFieldError('confirm-error', confirmEl, 'Parollar mos kelmaydi.');
      valid = false;
    }

    if (!valid) return;

    globalError.hidden = true;
    globalError.textContent = '';
    setButtonLoading(submitBtn, true);

    try {
      const result = await register(fullName, username, password);

      if (result.success) {
        showNotification('Muvaffaqiyatli ro\'yxatdan o\'tdingiz! 🎉', 'success');
        window.navigate('home');
      } else {
        _showGlobalError(globalError, result.error);
      }
    } finally {
      setButtonLoading(submitBtn, false, 'Ro\'yxatdan o\'tish');
    }
  };

  form.addEventListener('submit', onSubmit);
  _cleanup.push(() => form.removeEventListener('submit', onSubmit));

  requestAnimationFrame(() => fullNameEl.focus());
}

function _updatePasswordStrength(password) {
  const fillEl  = document.getElementById('strength-fill');
  const labelEl = document.getElementById('strength-label');
  if (!fillEl || !labelEl) return;

  let score = 0;
  if (password.length >= 6)  score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const levels = [
    { pct: '20%',  color: '#ef4444', label: 'Juda zaif' },
    { pct: '40%',  color: '#f97316', label: 'Zaif'      },
    { pct: '60%',  color: '#f59e0b', label: "O'rtacha"  },
    { pct: '80%',  color: '#84cc16', label: 'Yaxshi'    },
    { pct: '100%', color: '#10b981', label: 'A\'lo'     },
  ];
  const level = levels[Math.max(0, score - 1)] ?? levels[0];

  fillEl.style.width      = password ? level.pct   : '0%';
  fillEl.style.background = level.color;
  labelEl.textContent     = password ? level.label : '';
}

function _showFieldError(errorId, inputEl, message) {
  const el = document.getElementById(errorId);
  if (el) el.textContent = message;
  inputEl?.classList.add('input--error');
}

function _clearError(errorId, inputEl) {
  const el = document.getElementById(errorId);
  if (el) el.textContent = '';
  inputEl?.classList.remove('input--error');
}

function _showGlobalError(el, message) {
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _addStyles() {
  if (document.getElementById('auth-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'auth-page-styles';
  style.textContent = `
    .auth-card {
      padding: 40px;
      margin-top: 32px;
    }
    .auth-card__logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .auth-card__logo-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 12px;
      animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .auth-card__title { font-size: 1.5rem; margin-bottom: 6px; }
    .auth-card__sub   { color: var(--text-muted); font-size: .9375rem; }
    .auth-form        { display: flex; flex-direction: column; gap: 16px; }
    .input-icon-right {
      position: absolute;
      right: 10px; top: 50%;
      transform: translateY(-50%);
      width: 32px; height: 32px;
      font-size: .9rem;
      color: var(--text-muted);
    }
    .auth-error {
      background: var(--color-error-light);
      color: var(--color-error);
      border: 1px solid var(--color-error);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      font-size: .9rem;
      font-weight: 500;
    }
    .auth-card__footer-text {
      text-align: center;
      margin-top: 24px;
      color: var(--text-muted);
      font-size: .9375rem;
    }
    .auth-link { color: var(--color-primary); font-weight: 600; }
    .password-strength { display: flex; align-items: center; gap: 10px; }
    .password-strength__bar {
      flex: 1; height: 5px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .password-strength__fill {
      height: 100%; width: 0%;
      border-radius: var(--radius-full);
      transition: width 0.4s ease, background 0.4s ease;
    }
    .password-strength__label {
      font-size: .8rem; font-weight: 600;
      color: var(--text-muted);
      min-width: 56px; text-align: right;
    }
    @media (max-width: 480px) {
      .auth-card { padding: 24px 20px; margin-top: 16px; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
