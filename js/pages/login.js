// ============================================================
// pages/login.js — Tizimga kirish sahifasi
// ============================================================
import { login }                        from '../auth.js';
import { escapeHtml, setButtonLoading,
         showNotification }             from '../utils.js';
import { navigate }                     from '../app.js';

let _cleanup = [];

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page">
      <div class="container container--sm">

        <div class="auth-card card animate-slide-up">

          <!-- Logo -->
          <div class="auth-card__logo">
            <span class="auth-card__logo-icon" aria-hidden="true">📚</span>
            <h1 class="auth-card__title">Kitobchiga xush kelibsiz</h1>
            <p class="auth-card__sub">Hisobingizga kiring</p>
          </div>

          <!-- Forma -->
          <form id="login-form" class="auth-form" novalidate>

            <div class="input-group">
              <label for="login-username">Foydalanuvchi nomi</label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">👤</span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  class="input"
                  placeholder="username"
                  autocomplete="username"
                  autocapitalize="none"
                  required
                  maxlength="50"
                />
              </div>
              <span class="input-error" id="username-error" role="alert" aria-live="polite"></span>
            </div>

            <div class="input-group">
              <label for="login-password">Parol</label>
              <div class="input-wrapper">
                <span class="input-icon" aria-hidden="true">🔒</span>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  class="input"
                  placeholder="••••••••"
                  autocomplete="current-password"
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

            <!-- Global xato -->
            <div id="login-error" class="auth-error" role="alert" aria-live="polite" hidden></div>

            <button
              id="login-btn"
              type="submit"
              class="btn btn-primary w-full"
            >
              Kirish
            </button>

          </form>

          <p class="auth-card__footer-text">
            Hisobingiz yo'qmi?
            <a href="#register" class="auth-link">Ro'yxatdan o'ting</a>
          </p>

        </div>
      </div>
    </div>
  `;

  _addStyles();
  _bindEvents();
}

function _bindEvents() {
  const form        = document.getElementById('login-form');
  const usernameEl  = document.getElementById('login-username');
  const passwordEl  = document.getElementById('login-password');
  const toggleBtn   = document.getElementById('toggle-password');
  const submitBtn   = document.getElementById('login-btn');
  const globalError = document.getElementById('login-error');

  // Parolni ko'rsatish/yashirish
  const onToggle = () => {
    const isText = passwordEl.type === 'text';
    passwordEl.type        = isText ? 'password' : 'text';
    toggleBtn.textContent  = isText ? '👁️' : '🙈';
    toggleBtn.setAttribute('aria-label', isText ? 'Parolni ko\'rsatish' : 'Parolni yashirish');
  };
  toggleBtn.addEventListener('click', onToggle);
  _cleanup.push(() => toggleBtn.removeEventListener('click', onToggle));

  // Input validatsiya (real vaqt)
  const onUsernameInput = () => _clearError('username-error', usernameEl);
  const onPasswordInput = () => _clearError('password-error', passwordEl);
  usernameEl.addEventListener('input', onUsernameInput);
  passwordEl.addEventListener('input', onPasswordInput);
  _cleanup.push(
    () => usernameEl.removeEventListener('input', onUsernameInput),
    () => passwordEl.removeEventListener('input', onPasswordInput),
  );

  // Submit
  const onSubmit = async (e) => {
    e.preventDefault();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    // Mijoz validatsiyasi
    let valid = true;
    if (!username) {
      _showFieldError('username-error', usernameEl, 'Foydalanuvchi nomini kiriting.');
      valid = false;
    }
    if (!password) {
      _showFieldError('password-error', passwordEl, 'Parolni kiriting.');
      valid = false;
    }
    if (!valid) return;

    // Xatoni tozalash
    globalError.hidden = true;
    globalError.textContent = '';

    setButtonLoading(submitBtn, true);

    try {
      const result = await login(username, password);

      if (result.success) {
        showNotification(`Xush kelibsiz! 👋`, 'success');
        navigate('home');
      } else {
        _showGlobalError(globalError, result.error);
      }
    } finally {
      setButtonLoading(submitBtn, false, 'Kirish');
    }
  };

  form.addEventListener('submit', onSubmit);
  _cleanup.push(() => form.removeEventListener('submit', onSubmit));

  // Birinchi maydonni fokuslaymiz
  requestAnimationFrame(() => usernameEl.focus());
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
    .auth-card__title {
      font-size: 1.5rem;
      margin-bottom: 6px;
    }
    .auth-card__sub {
      color: var(--text-muted);
      font-size: .9375rem;
    }
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .input-icon-right {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 32px;
      height: 32px;
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
    .auth-link {
      color: var(--color-primary);
      font-weight: 600;
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
