// ============================================================
// pages/login.js — Tizimga kirish sahifasi (Editorial uslub)
// ============================================================
import { login }                        from '../auth.js';
import { escapeHtml, setButtonLoading,
         showNotification }             from '../utils.js';
let _cleanup = [];

const EYE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page">
      <div class="container container--sm">

        <div class="auth-card card animate-slide-up">

          <!-- Logo -->
          <div class="auth-card__logo">
            <div style="width:48px;height:48px;background:var(--ochre);border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
              <span style="font-family:Georgia,serif;font-size:1.5rem;font-weight:700;color:#fff;">K</span>
            </div>
            <h1 class="auth-card__title">Kitobchiga xush kelibsiz</h1>
            <p class="auth-card__sub">Hisobingizga kiring</p>
          </div>

          <!-- Forma -->
          <form id="login-form" class="auth-form" novalidate>

            <div class="input-group">
              <label for="login-username">Foydalanuvchi nomi</label>
              <div style="position: relative; display: flex; align-items: center;">
                <span style="position: absolute; left: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-muted);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  class="input" style="padding-left: 38px;"
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
              <div style="position: relative; display: flex; align-items: center;">
                <span style="position: absolute; left: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-muted);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </span>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  class="input" style="padding-left: 38px; padding-right: 42px;"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  required
                  minlength="6"
                />
                <button
                  type="button"
                  id="toggle-password"
                  class="btn-icon"
                  style="position: absolute; right: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--ink-muted); background: none; border: none; cursor: pointer;"
                  aria-label="Parolni ko'rsatish"
                  tabindex="-1"
                >${EYE_SVG}</button>
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
    toggleBtn.innerHTML    = isText ? EYE_SVG : EYE_OFF_SVG;
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

    globalError.hidden = true;
    globalError.textContent = '';

    setButtonLoading(submitBtn, true);

    try {
      const result = await login(username, password);

      if (result.success) {
        showNotification(`Xush kelibsiz! 👋`, 'success');
        window.navigate('home');
      } else {
        _showGlobalError(globalError, result.error);
      }
    } catch (err) {
      _showGlobalError(globalError, 'Tizimga kirishda kutilmagan xatolik.');
    } finally {
      setButtonLoading(submitBtn, false, 'Kirish');
    }
  };

  form.addEventListener('submit', onSubmit);
  _cleanup.push(() => form.removeEventListener('submit', onSubmit));

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
    .auth-error {
      background: var(--error-light);
      color: var(--error);
      border: 1px solid var(--error);
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
