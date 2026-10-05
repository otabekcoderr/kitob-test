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
import { escapeHtml, showNotification, LOGO_SVG }         from './utils.js';
import { initCrossDeviceSync, broadcastSyncEvent }        from './sync.js';

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
    title: 'Bosh sahifa — Kitobchi.uz',
  },
  {
    path:  'books',
    load:  () => import('./pages/books.js'),
    title: 'Kitoblar — Kitobchi.uz',
  },
  {
    path:  'book',       // #book?id=5
    load:  () => import('./pages/book-detail.js'),
    title: 'Kitob mutolaasi — Kitobchi.uz',
  },
  {
    path:  'quiz',       // #quiz?bookId=5
    load:  () => import('./pages/quiz.js'),
    auth:  true,
    title: 'Test — Kitobchi.uz',
  },
  {
    path:  'result',     // #result
    load:  () => import('./pages/result.js'),
    auth:  true,
    title: "Natija — Kitobchi.uz",
  },
  {
    path:  'leaderboard',
    load:  () => import('./pages/leaderboard.js'),
    title: 'Reyting — Kitobchi.uz',
  },
  {
    path:  'profile',
    load:  () => import('./pages/profile.js'),
    auth:  true,
    title: 'Profil — Kitobchi.uz',
  },
  {
    path:  'login',
    load:  () => import('./pages/login.js'),
    guest: true,
    title: 'Kirish — Kitobchi.uz',
  },
  {
    path:  'register',
    load:  () => import('./pages/register.js'),
    guest: true,
    title: "Ro'yxatdan o'tish — Kitobchi.uz",
  },
  {
    path:      'admin',
    load:      () => import('./pages/admin.js'),
    auth:      true,
    adminOnly: true,
    title:     'Admin panel — Kitobchi.uz',
  },
  {
    path:  '404',
    load:  () => import('./pages/not-found.js'),
    title: 'Sahifa topilmadi — Kitobchi.uz',
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

// Joriy yuklangan sahifa moduli (cleanup uchun)
let _currentPage = null;

// Marshrut modullari in-memory keshi (0ms yuklash)
const _moduleCache = new Map();

/**
 * Marshrut modulini keshdan yoki lazy import orqali yuklaydi.
 */
async function _loadRouteModule(route) {
  if (_moduleCache.has(route)) {
    return _moduleCache.get(route);
  }
  const module = await route.load();
  _moduleCache.set(route, module);
  return module;
}

let _progressTimer = null;
function _startProgressBar() {
  clearTimeout(_progressTimer);
  let bar = document.getElementById('route-progress-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'route-progress-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;height:2.5px;width:0%;background:linear-gradient(90deg,var(--ochre),var(--terracotta));z-index:99999;transition:width 0.25s ease,opacity 0.2s ease;pointer-events:none;';
    document.body.appendChild(bar);
  }
  bar.style.opacity = '1';
  bar.style.width = '25%';
  _progressTimer = setTimeout(() => {
    if (bar && bar.style.opacity === '1') {
      bar.style.width = '75%';
    }
  }, 70);
}

function _finishProgressBar() {
  clearTimeout(_progressTimer);
  const bar = document.getElementById('route-progress-bar');
  if (!bar) return;
  bar.style.width = '100%';
  setTimeout(() => {
    bar.style.opacity = '0';
    setTimeout(() => {
      if (bar) bar.style.width = '0%';
    }, 200);
  }, 100);
}

/**
 * Bo'sh vaqtda asosiy marshrutlarni oldindan xotiraga yuklab qo'yadi.
 *
 * The admin route is deliberately excluded: it is a dense curation surface that
 * almost no visitor ever opens, yet eagerly loading it pulled its whole module
 * graph (and through it `js/data.js`) into every session.
 */
function _preloadRoutes() {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
  idle(() => {
    ROUTES.forEach(r => {
      if (r.path === '404' || r.adminOnly) return;
      if (_moduleCache.has(r)) return;
      r.load().then(m => _moduleCache.set(r, m)).catch(() => {});
    });
  });
}

/**
 * Havolalar ustiga sichqoncha kelganda yoki tegilganda oldindan yuklash.
 */
function _bindPrefetchEvents() {
  const onIntent = (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const rawPath = href.replace(/^#/, '').split('?')[0];
    const r = ROUTES.find(x => x.path === rawPath);
    if (r && !_moduleCache.has(r)) {
      r.load().then(m => _moduleCache.set(r, m)).catch(() => {});
    }
  };
  document.addEventListener('mouseover', onIntent, { passive: true });
  document.addEventListener('touchstart', onIntent, { passive: true });
}

/**
 * Joriy hash dan yo'l va kalit parametrlarini ajratib oladi.
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
    const rawTarget = window.location.hash.slice(1);
    const returnUrl = encodeURIComponent(rawTarget || path);
    navigate(`${LOGIN_ROUTE}?redirect=${returnUrl}`);
    return;
  }
  if (route.guest && user) {
    navigate(HOME_ROUTE);
    return;
  }

  // R-access check
  if (route.adminOnly) {
    if (!user || user.role !== 'admin' || !user.isAdmin) {
      showNotification('Ushbu sahifaga faqat administrator kira oladi.', 'error');
      navigate(HOME_ROUTE);
      return;
    }
  }

  // Sahifa title
  document.title = route.title ?? 'Kitobchi';

  // Mobilda test paytida pastki tab-barni yashirish va to'liq diqqatni savollarga qaratish
  document.body.classList.toggle('in-quiz', path === 'quiz');

  // Navbar holat yangilash
  _updateNavbar();

  // Loading holati
  const appEl = document.getElementById('app');
  if (!appEl) return;

  const isInitialLoad = !appEl.hasChildNodes() || Boolean(appEl.querySelector('.page-loader')) || Boolean(appEl.querySelector('#initial-loader'));
  if (isInitialLoad) {
    appEl.innerHTML = `
      <div class="page-loader" aria-label="Yuklanmoqda...">
        <div class="page-loader__logo-anim" role="status" aria-label="Kitobchi yuklanmoqda">
          ${LOGO_SVG}
        </div>
      </div>
    `;
  } else {
    // Sahifalararo o'tishda ekranni bo'shatib oq qilib yubormaymiz — nozik progress bar
    _startProgressBar();
  }

  try {
    // Dynamic import — keshdan yoki lazy yuklash (0ms)
    const module = await _loadRouteModule(route);

    // Modul render() funksiyasiga ega bo'lishi kerak
    if (typeof module.render !== 'function') {
      throw new Error(`${path} sahifasida render() funksiyasi topilmadi.`);
    }

    // Yangi modul tayyor bo'lgach, avvalgi sahifani tozalash
    if (_currentPage && typeof _currentPage.cleanup === 'function') {
      try { _currentPage.cleanup(); } catch { /* ignore */ }
    }
    _currentPage = null;

    // Sahifani render qilish
    await module.render(appEl, { params, user });

    // Sahifani joriy sifatida saqlaymiz (cleanup uchun)
    _currentPage = module;

    // Aktiv nav havolasini belgilash
    _setActiveNavLink(path);

    _finishProgressBar();
    window.scrollTo({ top: 0, behavior: 'instant' });
    appEl.setAttribute('tabindex', '-1');
    try { appEl.focus({ preventScroll: true }); } catch {}

  } catch (err) {
    _finishProgressBar();
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
 * @param {Record<string,string>} [params] — parametrlar ro'yxati
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
function _applyTheme(theme, broadcast = true) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (broadcast) {
    try {
      broadcastSyncEvent('THEME_CHANGE', { theme });
    } catch {}
  }

  const SUN_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  const MOON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG;

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim');

  const mobileIcon = document.getElementById('mobile-theme-icon');
  if (mobileIcon) mobileIcon.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG;

  const mobileBtn = document.getElementById('mobile-theme-toggle');
  if (mobileBtn) mobileBtn.setAttribute('aria-label', theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim');
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

  // SVG ikonkalar
  const ICONS = {
    home:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    books:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
    leaderboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    admin:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
    profile:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  };

  const isAdmin = Boolean(user && (user.role === 'admin' && user.isAdmin === true));

  const adminLink = `
    <li id="nav-item-admin" style="${isAdmin ? '' : 'display:none;'}">
      <a href="#admin" class="nav__link nav__admin-link" data-path="admin">
        <span class="nav__link-icon">${ICONS.admin}</span>
        <span class="nav__link-label">Admin</span>
      </a>
    </li>`;

  const mobileProfileLink = `
    <li class="nav__item--mobile-only" id="nav-item-mobile-profile">
      <a href="#${user ? 'profile' : 'login'}" class="nav__link" data-path="${user ? 'profile' : 'login'}" id="nav-mobile-profile-link">
        <span class="nav__link-icon">${ICONS.profile}</span>
        <span class="nav__link-label" id="nav-mobile-profile-label">${user ? 'Profil' : 'Kirish'}</span>
      </a>
    </li>`;

  // Auth — profil yoki kirish/ro'yxat
  let avatarHTML = '';
  if (user) {
    const avatarImgSrc = user.avatarImage || (user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:image/') || user.avatar.startsWith('/')) ? user.avatar : null);
    const avatarEmoji = (!avatarImgSrc && user.avatar) ? user.avatar : null;
    const initial = (user.fullName || user.username || 'U')[0].toUpperCase();

    if (avatarImgSrc) {
      avatarHTML = `<img src="${escapeHtml(avatarImgSrc)}" alt="" class="nav__avatar-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else if (avatarEmoji) {
      avatarHTML = `<span class="nav__avatar-emoji">${escapeHtml(avatarEmoji)}</span>`;
    } else {
      avatarHTML = `<span class="nav__avatar-placeholder">${escapeHtml(initial)}</span>`;
    }
  }

  const authSection = user
    ? `<a href="#profile" class="nav__link nav__profile-link" data-path="profile" title="Profil">
        <span class="nav__avatar" aria-hidden="true">
          ${avatarHTML}
        </span>
        <span class="nav__auth-name">${escapeHtml(user.fullName || user.username)}</span>
      </a>
      <a href="#profile" class="nav__link nav__settings-link" data-path="profile" title="Profil sozlamalari">
        <span class="nav__link-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
        <span class="nav__link-label">Sozlamalar</span>
      </a>`
    : `<div class="nav__auth-guest">
        <a href="#login"    class="btn btn-outline btn-sm nav__link" data-path="login" style="margin:2px 8px;font-size:.8rem;">Kirish</a>
        <a href="#register" class="btn btn-primary  btn-sm nav__link" data-path="register" style="margin:2px 8px;font-size:.8rem;">Ro'yxatdan o'tish</a>
      </div>`;

  return `
    <!-- Mobil Topbar: faqat mobilda (<= 768px) ko'rinadi -->
    <!-- No role="banner": index.html already exposes a <header role="banner"> and
     this bar is visible at the same time on narrow viewports, so two banner
     landmarks were announced. It is a secondary nav strip inside the page. -->
<div class="mobile-topbar">
      <a href="#home" class="mobile-topbar__logo" aria-label="Kitobchi.uz — Bosh sahifa">
        <span class="mobile-topbar__mark" aria-hidden="true">${LOGO_SVG}</span>
        <span class="mobile-topbar__name">Kitobchi<span style="color:var(--ochre);">.uz</span></span>
      </a>
      <div class="mobile-topbar__actions">
        <div class="mobile-topbar__status" id="mobile-nav-status" title="Internet holati">
          <span class="nav__status-dot" id="mobile-status-dot"></span>
        </div>
        <button
          id="mobile-theme-toggle"
          class="mobile-topbar__btn"
          type="button"
          aria-label="Temani almashtirish"
          title="Temani almashtirish"
        >
          <span id="mobile-theme-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></span>
        </button>
      </div>
    </div>

    <nav class="navbar" role="navigation" aria-label="Asosiy menyu">
      <div class="navbar__inner">

        <!-- Logo -->
        <a href="#home" class="navbar__logo" aria-label="Kitobchi.uz — Bosh sahifa">
          <span class="navbar__logo-mark" aria-hidden="true">${LOGO_SVG}</span>
          <span class="navbar__logo-text">Kitobchi<span style="color:var(--ochre);">.uz</span></span>
        </a>

        <!-- Navigatsiya havolalar -->
        <ul class="nav__links" id="nav-links" role="list">
          <li>
            <a href="#home" class="nav__link" data-path="home">
              <span class="nav__link-icon">${ICONS.home}</span>
              <span class="nav__link-label">Bosh sahifa</span>
            </a>
          </li>
          <li>
            <a href="#books" class="nav__link" data-path="books">
              <span class="nav__link-icon">${ICONS.books}</span>
              <span class="nav__link-label">Kitoblar</span>
            </a>
          </li>
          <li>
            <a href="#leaderboard" class="nav__link" data-path="leaderboard">
              <span class="nav__link-icon">${ICONS.leaderboard}</span>
              <span class="nav__link-label">Reyting</span>
            </a>
          </li>
          ${adminLink}
          ${mobileProfileLink}
        </ul>

        <!-- Pastki qism: auth + tema + status -->
        <div class="navbar__actions">

          <!-- Online status -->
          <div class="nav__status" id="nav-status" aria-live="polite" title="Internet holati">
            <span class="nav__status-dot" id="nav-status-dot"></span>
            <span id="nav-status-text" class="text-xs" style="display:none;">Offline</span>
          </div>

          <!-- Tema toggle (faqat zamonaviy oy/quyosh ikonka, chapga tekislangan) -->
          <button
            id="theme-toggle"
            class="theme-toggle"
            type="button"
            aria-label="Temani almashtirish"
            title="Temani almashtirish"
          >
            <span class="nav__link-icon" id="theme-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></span>
          </button>

          <!-- Auth -->
          <div class="nav__auth" id="nav-auth">
            ${authSection}
          </div>

        </div>
      </div>
    </nav>
  `;
}

let _navbarMounted = false;

/**
 * Navbar ni DOM ga bir marta yozadi va hodisalarni ulaydi.
 */
function _mountNavbar() {
  const navEl = document.getElementById('navbar');
  if (!navEl || _navbarMounted) return;

  navEl.innerHTML = _buildNavbarHTML();
  _navbarMounted = true;

  _applyTheme(_getSavedTheme());

  // Tema toggle (desktop va mobil) — faqat bir marta ulanadi
  document.getElementById('theme-toggle')
    ?.addEventListener('click', _toggleTheme);
  document.getElementById('mobile-theme-toggle')
    ?.addEventListener('click', _toggleTheme);
}

/**
 * Navbar holatini DOM ni to'liq buzmasdan selektiv yangilaydi.
 */
function _updateNavbar() {
  if (!_navbarMounted) {
    _mountNavbar();
  }

  const user = getCurrentUser();
  const isAdmin = Boolean(user && (user.role === 'admin' && user.isAdmin === true));

  // 1. Admin linkini ko'rsatish / yashirish (DOM ni buzmasdan)
  const adminItem = document.getElementById('nav-item-admin');
  if (adminItem) {
    adminItem.style.display = isAdmin ? '' : 'none';
  }

  // 2. Mobil profil / kirish tugmasini yangilash
  const mobileProfileLink = document.getElementById('nav-mobile-profile-link');
  const mobileProfileLabel = document.getElementById('nav-mobile-profile-label');
  if (mobileProfileLink && mobileProfileLabel) {
    const targetPath = user ? 'profile' : 'login';
    mobileProfileLink.setAttribute('href', `#${targetPath}`);
    mobileProfileLink.setAttribute('data-path', targetPath);
    mobileProfileLabel.textContent = user ? 'Profil' : 'Kirish';
  }

  // 3. Desktop auth blokini (profil vs kirish tugmalari) faqat o'zgarganida yangilash
  const navAuth = document.getElementById('nav-auth');
  if (navAuth) {
    const newAuthHTML = _buildAuthLinksHTML(user);
    if (navAuth.innerHTML.trim() !== newAuthHTML.trim()) {
      navAuth.innerHTML = newAuthHTML;
    }
  }

  // 4. Joriy faol havolani belgilash
  const { path } = _parseHash();
  _setActiveNavLink(path);
}

/**
 * Auth havolalar HTML ni qaytaradi (sidebar uchun).
 * @param {object|null} user
 * @returns {string}
 */
function _buildAuthLinksHTML(user) {
  if (user) {
    const avatarImgSrc = user.avatarImage || (user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:image/') || user.avatar.startsWith('/')) ? user.avatar : null);
    const avatarEmoji = (!avatarImgSrc && user.avatar) ? user.avatar : null;
    const initial = (user.fullName || user.username || 'U')[0].toUpperCase();

    let avatarHTML = '';
    if (avatarImgSrc) {
      avatarHTML = `<img src="${escapeHtml(avatarImgSrc)}" alt="" class="nav__avatar-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else if (avatarEmoji) {
      avatarHTML = `<span class="nav__avatar-emoji">${escapeHtml(avatarEmoji)}</span>`;
    } else {
      avatarHTML = `<span class="nav__avatar-placeholder">${escapeHtml(initial)}</span>`;
    }

    return `
      <a href="#profile" class="nav__link nav__profile-link" data-path="profile">
        <span class="nav__avatar" aria-hidden="true">
          ${avatarHTML}
        </span>
        <span class="nav__auth-name">${escapeHtml(user.fullName || user.username)}</span>
      </a>
      <a href="#profile" class="nav__link nav__settings-link" data-path="profile" title="Profil sozlamalari">
        <span class="nav__link-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
        <span class="nav__link-label">Sozlamalar</span>
      </a>
    `;
  }
  return `
    <div class="nav__auth-guest">
      <a href="#login"    class="btn btn-outline btn-sm nav__link" data-path="login" style="margin:2px 8px;font-size:.8rem;">Kirish</a>
      <a href="#register" class="btn btn-primary  btn-sm nav__link" data-path="register" style="margin:2px 8px;font-size:.8rem;">Ro'yxatdan o'tish</a>
    </div>
  `;
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
 * Supabase sessiyasini tekshirib, localStorage ni yangilaydi.
 * auth.js dagi yagona _buildUserObject va _saveSession dan foydalanadi.
 */
async function _syncSession() {
  try {
    const { supabase } = await import('./supabase-client.js');
    const { _fetchProfile, _buildUserObject, _saveSession, getCurrentUser } = await import('./auth.js');

    let isTimedOut = false;
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise(resolve =>
        setTimeout(() => {
          isTimedOut = true;
          resolve({ data: { session: null } });
        }, 3500)
      ),
    ]);

    const session = result?.data?.session;

    if (!session?.user) {
      // Maxsus yoki offline sessiyalarda majburiy logout qilinmaydi
      const existing = getCurrentUser();
      if (
        existing?.offlineSession ||
        String(existing?.id || '').startsWith('admin-')
      ) {
        return;
      }
      if (!isTimedOut && result?.error === null) {
        _saveSession(null);
      }
      return;
    }

    // Sessiya bor — profilni deduplikatsiyalangan va timeoutli _fetchProfile orqali olamiz
    let profile = null;
    try {
      profile = await _fetchProfile(session.user.id);
    } catch { /* ignore */ }

    // auth.js dagi yagona funksiya orqali obyekt quriladi va sessiya saqlanadi
    const userObj = _buildUserObject(session.user, profile || {});
    _saveSession(userObj);
    _updateNavbar();

  } catch (err) {
    console.warn('[init] Sessiya sinxronlash xatosi:', err.message);
  }
}

// ============================================================
// CSP mos rasm yuklanish xatolari tinglovchisi (Capture phase)
// ============================================================
window.addEventListener('error', (e) => {
  if (e.target && e.target.tagName === 'IMG') {
    const img = e.target;
    img.style.display = 'none';
    const fallback = img.parentElement?.querySelector('.book-cover-fallback-wrap, .book-detail__cover-placeholder, .book-card__cover-placeholder');
    if (fallback) {
      fallback.style.display = 'flex';
    }
  }
}, true);

/**
 * Ilovani ishga tushuradi.
 */
async function _init() {
  _mountNavbar();
  _applyTheme(_getSavedTheme());
  _watchAuth();

  const footerYearEl = document.getElementById('footer-year');
  if (footerYearEl) {
    footerYearEl.textContent = String(new Date().getFullYear() || '2026');
  }

  // Multi-tab va cross-device sinxronizatsiya
  try {
    initCrossDeviceSync();
  } catch (err) {
    console.warn('[sync] Init failed:', err);
  }

  // Boshqa oynalardagi auth o'zgarishlarini tinglash
  window.addEventListener('kitobchi_auth_sync', (e) => {
    _updateNavbar();
    const { path } = _parseHash();
    const route = _findRoute(path);
    if (!e.detail?.user && route?.auth) {
      navigate(HOME_ROUTE);
    } else if (e.detail?.user && (path === 'login' || path === 'register')) {
      navigate(HOME_ROUTE);
    }
  });

  // Boshqa oynalardagi tema o'zgarishlarini tinglash
  window.addEventListener('kitobchi_theme_sync', (e) => {
    if (e.detail?.theme) {
      _applyTheme(e.detail.theme, false);
    }
  });

  window.addEventListener('hashchange', _loadPage);
  window.addEventListener('kitobchi_profile_updated', () => {
    _updateNavbar();
    const avatarEls = document.querySelectorAll('.nav__avatar');
    avatarEls.forEach(el => {
      el.classList.remove('avatar-swapping');
      void el.offsetWidth;
      el.classList.add('avatar-swapping');
      setTimeout(() => el.classList.remove('avatar-swapping'), 600);
    });
  });

  // Online / Offline holat belgisi
  function _updateOnlineStatus() {
    const dot     = document.getElementById('nav-status-dot');
    const mobDot  = document.getElementById('mobile-status-dot');
    const text    = document.getElementById('nav-status-text');
    const online  = navigator.onLine;
    if (dot) dot.classList.toggle('nav__status-dot--offline', !online);
    if (mobDot) mobDot.classList.toggle('nav__status-dot--offline', !online);
    if (text) {
      text.textContent = online ? '' : 'Offline';
      text.style.display = online ? 'none' : 'inline';
    }
  }
  window.addEventListener('online',  _updateOnlineStatus);
  window.addEventListener('offline', _updateOnlineStatus);
  _updateOnlineStatus();

  // 1. Keshdagi sessiya bilan sahifani zudlik bilan ochamiz (0ms initial loader)
  await _loadPage();

  // 2. Orqa fonda sessiyani asinxron va xavfsiz sinxronlashtiramiz (sahifani bloklamaydi)
  _syncSession().catch(() => {});

  // Orqa fonda barcha marshrutlar va ma'lumotlarni oldindan keshlab qo'yish (Instant 0ms routing)
  _preloadRoutes();
  _bindPrefetchEvents();
  try {
    const { prefetchCommonData } = await import('./db.js');
    prefetchCommonData();
  } catch {}
}

// DOM tayyor bo'lganda ishga tushurish
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}
