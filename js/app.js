// ============================================================
// app.js — Asosiy ilova: Router · Navbar · Tema · Navigatsiya
// ============================================================
// Vazifalar:
//   1. Hash-based router — sahifalarni lazy import bilan yuklash
//   2. Navbar — login/logout holati, hamburger menu, tema toggle
//   3. navigate(path) — dasturiy navigatsiya
//   4. showNotification — global bildirishnoma
//
// Bu fayl HTML da birinchi yuklanadi:
//   <script type="module" src="app.js"></script>
// ============================================================

import { getCurrentUser, isLoggedIn, initAuth, logout } from './auth.js';
import { escapeHtml, showNotification }                  from './utils.js';

// ============================================================
// 1. MARSHRUT (ROUTE) KONFIGURATSIYASI
// ============================================================

/**
 * Har bir marshrut:
 *   path     — URL hash qismi  (#home, #login, ...)
 *   load     — dynamic import: sahifa modulini qaytaradi
 *   auth     — true: faqat tizimga kirgan foydalanuvchi
 *   guest    — true: faqat tizimga kirmagan foydalanuvchi
 *   title    — <title> tegidir
 */
const ROUTES = [
  {
    path:  'home',
    load:  () => import('./pages/home.js'),
    title: 'Bosh sahifa — Kitobchi',
  },
  {
    path:  'books',
    load:  () => import('./pages/books.js'),
    title: 'Kitoblar — Kitobchi',
  },
  {
    path:  'book',       // #book?id=5
    load:  () => import('./pages/book-detail.js'),
    title: 'Kitob — Kitobchi',
  },
  {
    path:  'quiz',       // #quiz?bookId=5
    load:  () => import('./pages/quiz.js'),
    auth:  true,
    title: 'Test — Kitobchi',
  },
  {
    path:  'result',     // #result
    load:  () => import('./pages/result.js'),
    auth:  true,
    title: "Natija — Kitobchi",
  },
  {
    path:  'leaderboard',
    load:  () => import('./pages/leaderboard.js'),
    title: 'Reyting — Kitobchi',
  },
  {
    path:  'profile',
    load:  () => import('./pages/profile.js'),
    auth:  true,
    title: 'Profil — Kitobchi',
  },
  {
    path:  'login',
    load:  () => import('./pages/login.js'),
    guest: true,
    title: 'Kirish — Kitobchi',
  },
  {
    path:  'register',
    load:  () => import('./pages/register.js'),
    guest: true,
    title: "Ro'yxatdan o'tish — Kitobchi",
  },
  {
    path:  'admin',
    load:  () => import('./pages/admin.js'),
    auth:  true,
    title: 'Admin panel — Kitobchi',
  },
  {
    path:  '404',
    load:  () => import('./pages/not-found.js'),
    title: 'Topilmadi — Kitobchi',
  },
];

/** Standart marshrut (hash bo'sh bo'lganda) */
const DEFAULT_ROUTE = 'home';

/** Tizimga kirish kerak bo'lganda yo'naltiriladigan marshrut */
const LOGIN_ROUTE   = 'login';

/** Tizimga kirgan bo'lsa yo'naltiriladigan marshrut */
const HOME_ROUTE    = 'home';

// ============================================================
// 2. ROUTER
// ============================================================

/** Joriy yuklangan sahifa moduli (cleanup uchun) */
let _currentPage = null;

/**
 * Joriy hash dan path va query parametrlarini ajratib oladi.
 *
 * @example
 *   #quiz?bookId=3  →  { path: 'quiz', params: { bookId: '3' } }
 *
 * @returns {{ path: string, params: Record<string, string> }}
 */
function _parseHash() {
  const raw    = window.location.hash.slice(1) || DEFAULT_ROUTE; // '#' olib tashlanadi
  const [pathPart, queryPart] = raw.split('?');
  const params = {};

  if (queryPart) {
    new URLSearchParams(queryPart).forEach((val, key) => {
      params[key] = val;
    });
  }

  return { path: pathPart || DEFAULT_ROUTE, params };
}

/**
 * Marshrut obyektini path bo'yicha topadi.
 * Topilmasa — 404 marhrut.
 *
 * @param {string} path
 * @returns {object}
 */
function _findRoute(path) {
  return ROUTES.find(r => r.path === path) ?? ROUTES.find(r => r.path === '404');
}

/**
 * Sahifani yuklaydi va #app elementiga render qiladi.
 * Avvalgi sahifaning cleanup() funksiyasi chaqiriladi.
 */
async function _loadPage() {
  const { path, params } = _parseHash();
  const route            = _findRoute(path);
  const user             = getCurrentUser();

  // Auth tekshiruvi
  if (route.auth && !user) {
    navigate(LOGIN_ROUTE);
    return;
  }
  if (route.guest && user) {
    navigate(HOME_ROUTE);
    return;
  }

  // Sahifa title
  document.title = route.title ?? 'Kitobchi';

  // Navbar holat yangilash
  _updateNavbar();

  // Joriy sahifani tozalash
  if (_currentPage && typeof _currentPage.cleanup === 'function') {
    try { _currentPage.cleanup(); } catch { /* ignore */ }
  }
  _currentPage = null;

  // Loading holati
  const appEl = document.getElementById('app');
  if (!appEl) return;

  appEl.innerHTML = `
    <div class="page-loader" aria-label="Yuklanmoqda...">
      <div class="page-loader__spinner"></div>
    </div>
  `;

  try {
    // Dynamic import — lazy yuklash
    const module = await route.load();

    // Modul render() funksiyasiga ega bo'lishi kerak
    if (typeof module.render !== 'function') {
      throw new Error(`${path} sahifasida render() funksiyasi topilmadi.`);
    }

    // Sahifani render qilish
    await module.render(appEl, { params, user });

    // Sahifani joriy sifatida saqlaymiz (cleanup uchun)
    _currentPage = module;

    // Aktiv nav havolasini belgilash
    _setActiveNavLink(path);

  } catch (err) {
    console.error(`[router] Sahifa yuklanmadi (${path}):`, err);

    appEl.innerHTML = `
      <div class="error-page">
        <h2>Sahifa yuklanmadi</h2>
        <p>Xatolik yuz berdi. Sahifani yangilang yoki bosh sahifaga qayting.</p>
        <a href="#home" class="btn btn-primary">Bosh sahifaga</a>
      </div>
    `;
  }
}

// ============================================================
// 3. NAVIGATSIYA
// ============================================================

/**
 * Dasturiy navigatsiya — sahifaga yo'naltiradi.
 *
 * @param {string}               path    — marshrut nomi ('home', 'quiz', ...)
 * @param {Record<string,string>} [params] — query parametrlar
 *
 * @example
 *   navigate('quiz', { bookId: '3' });  →  #quiz?bookId=3
 *   navigate('home');                    →  #home
 */
export function navigate(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = query ? `${path}?${query}` : path;
}
// Pages sikliy import qilmasligi uchun global ham e'lon qilamiz
window.navigate = navigate;

// ============================================================
// 4. TEMA (DARK / LIGHT)
// ============================================================

/** localStorage kalit nomi */
const THEME_KEY = 'kitobchi_theme';

/**
 * Ilovaga tema qo'llaydi.
 * @param {'dark'|'light'} theme
 */
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  // Toggle tugma ikonasini yangilash
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-label',
      theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'
    );
  }
}

/**
 * Saqlangan temani o'qiydi, aks holda tizim sozlamasini ishlatadi.
 * @returns {'dark'|'light'}
 */
function _getSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;

  // Tizim sozlamasi
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Temani almashturadi (dark ↔ light).
 */
function _toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') ?? 'light';
  _applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================================
// 5. NAVBAR
// ============================================================

/**
 * Navbar HTML ni qaytaradi.
 * Login/logout holati getCurrentUser() ga qarab belgilanadi.
 *
 * @returns {string}
 */
function _buildNavbarHTML() {
  const user = getCurrentUser();

  const authLinks = user
    ? `
      <a href="#profile" class="nav__link" data-path="profile">
        <span class="nav__avatar" aria-hidden="true">
          ${user.avatar
              ? `<img src="${escapeHtml(user.avatar)}" alt="" class="nav__avatar-img">`
              : `<span class="nav__avatar-placeholder">${escapeHtml(user.fullName?.[0] ?? 'U')}</span>`
          }
        </span>
        <span>${escapeHtml(user.fullName || user.username)}</span>
      </a>
      <button id="logout-btn" class="btn btn-outline nav__logout" type="button">
        Chiqish
      </button>
    `
    : `
      <a href="#login"    class="btn btn-outline nav__link" data-path="login">Kirish</a>
      <a href="#register" class="btn btn-primary nav__link"  data-path="register">Ro'yxatdan o'tish</a>
    `;

  return `
    <nav class="navbar" role="navigation" aria-label="Asosiy menyu">
      <div class="navbar__inner">

        <!-- Logo -->
        <a href="#home" class="navbar__logo" aria-label="Kitobchi — Bosh sahifa">
          <span class="navbar__logo-icon" aria-hidden="true">📚</span>
          <span class="navbar__logo-text">Kitobchi</span>
        </a>

        <!-- Asosiy havolalar -->
        <ul class="nav__links" id="nav-links" role="list">
          <li><a href="#home"        class="nav__link" data-path="home">Bosh sahifa</a></li>
          <li><a href="#books"       class="nav__link" data-path="books">Kitoblar</a></li>
          <li><a href="#leaderboard" class="nav__link" data-path="leaderboard">Reyting</a></li>
        </ul>

        <!-- O'ng tomon: auth + tema + hamburger -->
        <div class="navbar__actions">

          <!-- Auth havolalar -->
          <div class="nav__auth" id="nav-auth">
            ${authLinks}
          </div>

          <!-- Tema toggle -->
          <button
            id="theme-toggle"
            class="btn-icon theme-toggle"
            type="button"
            aria-label="Tungi rejim"
            title="Temani almashtirish"
          >
            <span id="theme-icon" aria-hidden="true">🌙</span>
          </button>

          <!-- Hamburger (mobile) -->
          <button
            id="hamburger"
            class="btn-icon hamburger"
            type="button"
            aria-label="Menyuni ochish"
            aria-expanded="false"
            aria-controls="mobile-menu"
          >
            <span class="hamburger__line" aria-hidden="true"></span>
            <span class="hamburger__line" aria-hidden="true"></span>
            <span class="hamburger__line" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <!-- Mobile menyu -->
      <div id="mobile-menu" class="mobile-menu" aria-hidden="true">
        <ul class="mobile-menu__links" role="list">
          <li><a href="#home"        class="nav__link" data-path="home">Bosh sahifa</a></li>
          <li><a href="#books"       class="nav__link" data-path="books">Kitoblar</a></li>
          <li><a href="#leaderboard" class="nav__link" data-path="leaderboard">Reyting</a></li>
          <li class="mobile-menu__auth" id="mobile-auth">
            ${authLinks}
          </li>
        </ul>
      </div>
    </nav>
  `;
}

/**
 * Navbar ni DOM ga yozadi va hodisalarni ulaydi.
 */
function _mountNavbar() {
  const navEl = document.getElementById('navbar');
  if (!navEl) return;

  navEl.innerHTML = _buildNavbarHTML();
  _applyTheme(_getSavedTheme());

  // Tema toggle
  document.getElementById('theme-toggle')
    ?.addEventListener('click', _toggleTheme);

  // Logout
  _bindLogoutBtn();

  // Hamburger
  _bindHamburger();
}

/**
 * Navbar auth qismini yangilaydi (login/logout o'zgarganida).
 * Butun navbalni qayta render qilmasdan faqat auth qismini almashtiradi.
 */
function _updateNavbar() {
  const user        = getCurrentUser();
  const authLinks   = _buildAuthLinksHTML(user);

  // Desktop auth
  const navAuth     = document.getElementById('nav-auth');
  if (navAuth)     navAuth.innerHTML     = authLinks;

  // Mobile auth
  const mobileAuth  = document.getElementById('mobile-auth');
  if (mobileAuth)  mobileAuth.innerHTML  = authLinks;

  // Logout listener qayta ulash
  _bindLogoutBtn();
}

/**
 * Auth havolalar HTML ni qaytaradi (desktop va mobile uchun bir xil).
 * @param {object|null} user
 * @returns {string}
 */
function _buildAuthLinksHTML(user) {
  if (user) {
    return `
      <a href="#profile" class="nav__link" data-path="profile">
        <span class="nav__avatar" aria-hidden="true">
          ${user.avatar
              ? `<img src="${escapeHtml(user.avatar)}" alt="" class="nav__avatar-img">`
              : `<span class="nav__avatar-placeholder">${escapeHtml(user.fullName?.[0] ?? 'U')}</span>`
          }
        </span>
        <span>${escapeHtml(user.fullName || user.username)}</span>
      </a>
      <button id="logout-btn" class="btn btn-outline nav__logout" type="button">
        Chiqish
      </button>
    `;
  }
  return `
    <a href="#login"    class="btn btn-outline nav__link" data-path="login">Kirish</a>
    <a href="#register" class="btn btn-primary  nav__link" data-path="register">Ro'yxatdan o'tish</a>
  `;
}

/**
 * Logout tugmasi hodisasini ulaydi.
 * innerHTML yangilanganda tugma yangi element bo'ladi —
 * shuning uchun har safar qayta ulaymiz.
 */
function _bindLogoutBtn() {
  document.getElementById('logout-btn')
    ?.addEventListener('click', async () => {
      await logout();
      showNotification('Tizimdan chiqdingiz.', 'info');
      navigate(HOME_ROUTE);
    });
}

/**
 * Hamburger menyu hodisalarini ulaydi.
 */
function _bindHamburger() {
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.getAttribute('aria-expanded') === 'true';

    hamburger.setAttribute('aria-expanded', String(!isOpen));
    mobileMenu.setAttribute('aria-hidden',   String(isOpen));
    hamburger.classList.toggle('hamburger--open', !isOpen);
    mobileMenu.classList.toggle('mobile-menu--open', !isOpen);
  });

  // Havola bosilganda menyuni yopish
  mobileMenu.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden',   'true');
      hamburger.classList.remove('hamburger--open');
      mobileMenu.classList.remove('mobile-menu--open');
    });
  });

  // Tashqarini bosish → yopish
  document.addEventListener('click', (e) => {
    const navbar = document.getElementById('navbar');
    if (navbar && !navbar.contains(e.target)) {
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.setAttribute('aria-hidden',   'true');
      hamburger.classList.remove('hamburger--open');
      mobileMenu.classList.remove('mobile-menu--open');
    }
  });
}

/**
 * Joriy sahifaga mos nav havolasini aktiv qiladi.
 * @param {string} activePath
 */
function _setActiveNavLink(activePath) {
  document.querySelectorAll('.nav__link[data-path]').forEach(link => {
    const isActive = link.dataset.path === activePath;
    link.classList.toggle('nav__link--active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

// ============================================================
// 6. AUTH HOLAT KUZATUVI
// ============================================================

/**
 * Auth o'zgarishlarini tinglaydi va UI ni yangilaydi.
 */
function _watchAuth() {
  initAuth({
    onLogin:  () => {
      _updateNavbar();
      // Agar login/register sahifasida bo'lsa — home ga yo'naltirish
      const { path } = _parseHash();
      if (path === 'login' || path === 'register') {
        navigate(HOME_ROUTE);
      }
    },
    onLogout: () => {
      _updateNavbar();
      // Himoyalangan sahifada bo'lsa — home ga yo'naltirish
      const { path } = _parseHash();
      const route = _findRoute(path);
      if (route?.auth) {
        navigate(HOME_ROUTE);
      }
    },
  });
}

// ============================================================
// 7. ILOVANI ISHGA TUSHURISH
// ============================================================

/**
 * Ilovani ishga tushuradi.
 * HTML da bitta marta chaqiriladi.
 */
async function _init() {
  // Navbar
  _mountNavbar();

  // Temani boshlang'ich holga keltirish (applyTheme ichida ham bor,
  // lekin _mountNavbar oldidan chaqirishdan oldin ham kerak bo'lishi mumkin)
  _applyTheme(_getSavedTheme());

  // Auth kuzatuv
  _watchAuth();

  // Hash o'zgarishini tinglash
  window.addEventListener('hashchange', _loadPage);

  // Birinchi yuklash
  await _loadPage();
}

// DOM tayyor bo'lganda ishga tushurish
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}
