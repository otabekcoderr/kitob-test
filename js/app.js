import { initDB, getAllBooks } from './db.js';
import { getCurrentUser, initAuth, login as authLogin, register as authRegister } from './auth.js';
import { renderBooksList, renderBookDetail } from './books.js';
import { renderQuiz } from './quiz.js';
import { renderResultDetail, renderResultsHistory, renderLeaderboard } from './results.js';
import { escapeHtml, safeCssUrl, cssUrl } from './utils.js';

export function navigate(path) {
  window.location.hash = path;
}

export function showNotification(message, type = 'info') {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = message;
  el.className = `notification notification-${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function showLoading(container, message = 'Yuklanmoqda...') {
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>${message}</p></div>`;
}
function showError(container, message = 'Xatolik yuz berdi') {
  container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p class="empty-state-text">${message}</p></div>`;
}

export function showQuizRulesModal(bookId, options = {}) {
  const { onCancel } = options;
  const existing = document.querySelector('.modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop show';
  backdrop.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">🔒 Xavfsizlik va Anti-Cheat Tizimi</h2>
      <div class="modal-text">
        <p style="margin-bottom: 12px; font-weight: 600; color: var(--color-error);">DIQQAT! Ushbu testda xavfsizlik rejimi yoqilgan:</p>
        <ul style="list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 8px;">
          <li>⚠️ <strong>Tab / Oyna almashtirish taqiqlanadi</strong> (har bir urinish uchun yakuniy balldan <strong>10% jarima</strong> chegiriladi).</li>
          <li>🚫 Sichqoncha o'ng tugmasini bosish yoki F12 (kodlarni ochish) tugmasi taqiqlangan.</li>
          <li>🚨 Qoidalarni buzish jarimaga yoki testni 0 ball bilan avtomatik topshirilishiga olib keladi.</li>
        </ul>
        <p style="margin-top: 16px; font-weight: 500;">Testni boshlashga tayyormisiz?</p>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="btn btn-outline" id="quiz-rules-cancel">Yo'q, qaytish</button>
        <button class="btn btn-primary" id="quiz-rules-confirm">Ha, tayyorman! 🚀</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  function closeModal() {
    backdrop.classList.remove('show');
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 300);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      closeModal();
      if (typeof onCancel === 'function') onCancel();
    }
  }

  document.getElementById('quiz-rules-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
    if (typeof onCancel === 'function') onCancel();
  });

  document.getElementById('quiz-rules-confirm').addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
    navigate(`/test/${bookId}`);
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
      if (typeof onCancel === 'function') onCancel();
    }
  });

  document.addEventListener('keydown', onKey);
}

// Light & Dark theme toggle handling
function initTheme() {
  const savedTheme = localStorage.getItem('kitobtest_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('kitobtest_theme', isLight ? 'light' : 'dark');
  updateNavbar();
}

function closeAllDropdowns() {
  document.querySelectorAll('.nav-dropdown-menu.show').forEach(m => m.classList.remove('show'));
  document.querySelectorAll('.nav-avatar-trigger.is-open').forEach(t => t.classList.remove('is-open'));
}

function updateNavbar() {
  const navLinks = document.getElementById('nav-links');
  const navUser = document.getElementById('nav-user');
  const user = getCurrentUser();
  const isLightTheme = document.body.classList.contains('light-theme');
  const hash = window.location.hash;
  
  const themeToggleHtml = `
    <button class="theme-toggle-btn" id="theme-toggle" title="Rejimni o'zgartirish" aria-label="Rang rejimini o'zgartirish">
      ${isLightTheme ? '🌙' : '☀️'}
    </button>
  `;

  if (!user) {
    if (navLinks) {
      navLinks.innerHTML = '';
    }
    const mobileBottomNav = document.getElementById('mobile-bottom-nav');
    if (mobileBottomNav) {
      mobileBottomNav.innerHTML = '';
    }
    if (navUser) {
      navUser.innerHTML = `
        ${themeToggleHtml}
        <a href="#/login" class="btn btn-ghost btn-sm nav-auth-action">Kirish</a>
        <a href="#/register" class="btn btn-primary btn-sm nav-auth-action">Ro'yxatdan o'tish</a>
      `;
    }
  } else {
    const today = new Date().toLocaleDateString('en-CA');
    const hasDoneToday = user.stats?.lastQuizDate === today;
    const streakCount = user.stats?.currentStreak || 0;

    if (navLinks) {
      let linksHtml = `
        <a href="#/dashboard" class="nav-link ${hash === '#/dashboard' || hash === '' ? 'active' : ''}"><span class="nav-link-icon">🏠</span><span>Dashboard</span></a>
        <a href="#/books" class="nav-link ${hash === '#/books' || hash.startsWith('#/book/') ? 'active' : ''}"><span class="nav-link-icon">📚</span><span>Kitoblar</span></a>
        <a href="#/daily-stack" class="nav-link ${hash === '#/daily-stack' ? 'active' : ''}"><span class="nav-link-icon">📅</span><span>Kunlik</span></a>
        <a href="#/arena" class="nav-link ${hash === '#/arena' || hash === '#/arena-leaderboard' ? 'active' : ''}"><span class="nav-link-icon">⚔️</span><span>Arena</span></a>
        <a href="#/results" class="nav-link ${hash === '#/results' || hash.startsWith('#/result/') ? 'active' : ''}"><span class="nav-link-icon">📊</span><span>Natijalar</span></a>
        <a href="#/leaderboard" class="nav-link ${hash === '#/leaderboard' ? 'active' : ''}"><span class="nav-link-icon">🏆</span><span>Reyting</span></a>
      `;

      if (user.isAdmin) {
        linksHtml += `
          <a href="#/admin" class="nav-link nav-link-admin ${hash === '#/admin' ? 'active' : ''}"><span class="nav-link-icon">👑</span><span>Admin</span></a>
        `;
      }

      navLinks.innerHTML = linksHtml;
    }

    const mobileBottomNav = document.getElementById('mobile-bottom-nav');
    if (mobileBottomNav) {
      mobileBottomNav.innerHTML = `
        <a href="#/dashboard" class="mobile-nav-item ${hash === '#/dashboard' || hash === '' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          <span>Bosh</span>
        </a>
        <a href="#/books" class="mobile-nav-item ${hash === '#/books' || hash.startsWith('#/book/') ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          <span>Kutubxona</span>
        </a>
        <a href="#/daily-stack" class="mobile-nav-item ${hash === '#/daily-stack' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          <span>Maqsad</span>
        </a>
        <a href="#/leaderboard" class="mobile-nav-item ${hash === '#/leaderboard' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10"></path><path d="M17 4v8a5 5 0 0 1-10 0V4"></path><path d="M7 8H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h3"></path><path d="M17 8h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"></path></svg>
          <span>Reyting</span>
        </a>
        <a href="#/profile" class="mobile-nav-item ${hash === '#/profile' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span>Profil</span>
        </a>
      `;
    }
    
    if (navUser) {
      navUser.innerHTML = `
        ${themeToggleHtml}
        <button class="btn btn-ghost btn-sm" id="daily-stack-info-btn" title="Kunlik Streak" style="padding: 6px 8px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--color-accent); font-weight: 700; transition: var(--transition); cursor: pointer; white-space: nowrap;">
          🔥 <span>${streakCount}</span>
        </button>
        <div class="nav-avatar-dropdown">
          <button class="nav-avatar-trigger" id="nav-avatar-trigger" aria-label="Profil menyusi" aria-haspopup="true">
            <span class="avatar-emoji"${safeCssUrl(user.avatarImage) ? ` style="${safeCssUrl(user.avatarImage)} width: 28px; height: 28px; border-radius: 50%; display: inline-block;"` : ''}>${user.avatarImage ? '' : escapeHtml(user.avatar)}</span>
            <span class="avatar-chevron">▾</span>
          </button>
          <div class="nav-dropdown-menu" id="nav-dropdown-menu" role="menu">
            <div class="nav-dropdown-header">
              <span class="dropdown-avatar"${safeCssUrl(user.avatarImage) ? ` style="${safeCssUrl(user.avatarImage)} width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;"` : ''}>${user.avatarImage ? '' : escapeHtml(user.avatar)}</span>
              <div>
                <div class="dropdown-name">${escapeHtml(user.fullName)}</div>
                <div class="dropdown-username">@${escapeHtml(user.username)}</div>
              </div>
            </div>
            <a href="#/profile" class="nav-dropdown-item" role="menuitem">
              <span>👤</span> Profil
            </a>
            ${user.isAdmin ? `<a href="#/admin" class="nav-dropdown-item" role="menuitem"><span>👑</span> Admin panel</a>` : ''}
            <button class="nav-dropdown-item danger" id="nav-dropdown-logout" role="menuitem">
              <span>🚪</span> Chiqish
            </button>
          </div>
        </div>
      `;

      // Avatar dropdown toggle
      const trigger = document.getElementById('nav-avatar-trigger');
      const menu = document.getElementById('nav-dropdown-menu');
      if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = menu.classList.contains('show');
          closeAllDropdowns();
          if (!isOpen) {
            menu.classList.add('show');
            trigger.classList.add('is-open');
          }
        });
      }

      // Streak info button
      document.getElementById('daily-stack-info-btn')?.addEventListener('click', () => {
        showDailyStackInfo(user, hasDoneToday);
      });

      // Dropdown streak
      document.getElementById('nav-dropdown-streak')?.addEventListener('click', () => {
        closeAllDropdowns();
        showDailyStackInfo(user, hasDoneToday);
      });

      // Dropdown logout
      document.getElementById('nav-dropdown-logout')?.addEventListener('click', () => {
        closeAllDropdowns();
        import('./auth.js').then(mod => {
          mod.logout();
          navigate('/login');
          showNotification('Tizimdan chiqdingiz', 'info');
        }).catch(() => {
          navigate('/login');
        });
      });
    }
  }

  // Attach theme listener
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const isDropdown = e.target.closest('.nav-avatar-dropdown');
  const isStreakBtn = e.target.closest('#daily-stack-info-btn');
  const isNavToggle = e.target.closest('#nav-toggle');
  if (!isDropdown && !isStreakBtn && !isNavToggle) {
    closeAllDropdowns();
  }
});

function showDailyStackInfo(user, hasDoneToday) {
  const existing = document.getElementById('daily-stack-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop show';
  overlay.id = 'daily-stack-modal';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">📅 Kunlik Stack</div>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6;">
          Har kuni bitta savol. Ketma-ketlikni uzmang va bilimingizni mustahkamlang!
        </p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div class="card" style="flex: 1; text-align: center; padding: 16px; min-width: 120px;">
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--color-accent);">${user.stats?.currentStreak || 0}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Joriy Streak</div>
          </div>
          <div class="card" style="flex: 1; text-align: center; padding: 16px; min-width: 120px;">
            <div style="font-size: 1.8rem; font-weight: 800; color: ${hasDoneToday ? 'var(--color-success)' : 'var(--text-muted)'};">${hasDoneToday ? '✅' : '⏳'}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${hasDoneToday ? "Bugun bajarilgan" : "Bajarilmagan"}</div>
          </div>
          <div class="card" style="flex: 1; text-align: center; padding: 16px; min-width: 120px;">
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--color-secondary);">${user.stats?.maxStreak || 0}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Maksimal Streak</div>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button class="btn btn-ghost" id="daily-modal-close">Yopish</button>
        <a href="#/daily-stack" class="btn btn-primary">Kunlik Stackga o'tish →</a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#daily-modal-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function setupMobileNav() {
  const getElements = () => {
    return {
      toggle: document.getElementById('nav-toggle'),
      links: document.getElementById('nav-links'),
      navbar: document.getElementById('navbar')
    };
  };

  const closeMenu = (toggle, links) => {
    links.classList.remove('show');
    document.body.classList.remove('nav-open');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menuni ochish');
  };

  const openMenu = (toggle, links) => {
    links.classList.add('show');
    document.body.classList.add('nav-open');
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menuni yopish');
  };

  document.addEventListener('click', (e) => {
    const { toggle, links, navbar } = getElements();
    if (!toggle || !links) return;

    const toggleButton = e.target.closest('#nav-toggle');
    if (toggleButton) {
      e.preventDefault();
      e.stopPropagation();
      links.classList.contains('show') ? closeMenu(toggle, links) : openMenu(toggle, links);
      return;
    }

    // Close menu when clicking a nav-link inside it
    if (e.target.closest('.nav-link') && links.contains(e.target)) {
      closeMenu(toggle, links);
      return;
    }

    if (navbar && !navbar.contains(e.target)) {
      closeMenu(toggle, links);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const { toggle, links } = getElements();
      if (toggle && links) closeMenu(toggle, links);
    }
  });
}

// Render Authentication Screens
function renderLogin(container) {
  container.innerHTML = `
    <div class="auth-page ">
      <div class="card auth-card">
        <h1 class="auth-title">Xush kelibsiz! 👋</h1>
        <p class="auth-subtitle">Platformaga kirish uchun ma'lumotlaringizni kiriting</p>
        
        <form id="login-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="login-username">Foydalanuvchi nomi (Login)</label>
            <input type="text" id="login-username" class="input" placeholder="Masalan: kitobxon12" required>
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="login-password">Parol</label>
            <input type="password" id="login-password" class="input" placeholder="Parolingizni kiriting" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top: 8px;">Kirish</button>
        </form>
        
        <p class="auth-footer">Hisobingiz yo'qmi? <a href="#/register">Ro'yxatdan o'tish</a></p>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = "Kutilmoqda...";

    const uName = document.getElementById('login-username').value.trim();
    const pWord = document.getElementById('login-password').value;

    try {
      await authLogin(uName, pWord);
      showNotification("Muvaffaqiyatli kirdingiz! 🎉", "success");
      navigate('/dashboard');
    } catch (err) {
      showNotification(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

function renderRegister(container) {
  container.innerHTML = `
    <div class="auth-page ">
      <div class="card auth-card">
        <h1 class="auth-title">Ro'yxatdan o'tish 🚀</h1>
        <p class="auth-subtitle">Yangi hisob yarating va testlarni yechishni boshlang</p>
        
        <form id="register-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="reg-fullname">Ism va Familiya</label>
            <input type="text" id="reg-fullname" class="input" placeholder="Masalan: Ali Valiyev" required>
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="reg-username">Foydalanuvchi nomi (Username)</label>
            <input type="text" id="reg-username" class="input" placeholder="Kamida 3 ta belgi" required minlength="3">
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="reg-password">Parol</label>
            <input type="password" id="reg-password" class="input" placeholder="Kamida 4 ta belgi" required minlength="4">
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="reg-password-confirm">Parolni tasdiqlang</label>
            <input type="password" id="reg-password-confirm" class="input" placeholder="Parolni qayta kiriting" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top: 8px;">Hisob yaratish</button>
        </form>
        
        <p class="auth-footer">Hisobingiz bormi? <a href="#/login">Kirish</a></p>
      </div>
    </div>
  `;

  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    const fullName = document.getElementById('reg-fullname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;

    if (password !== passwordConfirm) {
      showNotification("Tasdiqlash paroli mos kelmadi!", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Kutilmoqda...";

    try {
      await authRegister(fullName, username, password);
      showNotification("Ro'yxatdan muvaffaqiyatli o'tdingiz! 🥳", "success");
      navigate('/dashboard');
    } catch (err) {
      showNotification(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

async function renderDashboard(container) {
  const user = getCurrentUser();
  if (!user) {
    navigate('/login');
    return;
  }

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Dashboard yuklanmoqda...</p>
    </div>
  `;

  try {
    const db = await import('./db.js');
      let dbUser = await db.getUserById(user.id);
      if (dbUser) {
        if (!dbUser.stats) {
          dbUser.stats = { testsCompleted: 0, avgScore: 0, bestScore: 0, currentStreak: 0, maxStreak: 0, lastQuizDate: '' };
        }
        const today = new Date().toLocaleDateString('en-CA');
        const lastDate = dbUser.stats.lastQuizDate || '';
        let streakReset = false;
        
        if (lastDate) {
          const yesterdayObj = new Date();
          yesterdayObj.setDate(yesterdayObj.getDate() - 1);
          const yesterday = yesterdayObj.toLocaleDateString('en-CA');
          
          if (lastDate !== today && lastDate !== yesterday) {
            dbUser.stats.currentStreak = 0;
            streakReset = true;
          }
        } else {
          dbUser.stats.currentStreak = 0;
          streakReset = true;
        }
        
        if (streakReset) {
          await db.updateUser(user.id, { stats: dbUser.stats }).catch(() => {});
          const sessionUser = JSON.parse(localStorage.getItem('kitobtest_session') || '{}');
          sessionUser.stats = dbUser.stats;
          localStorage.setItem('kitobtest_session', JSON.stringify(sessionUser));
          user.stats = dbUser.stats;
        } else {
          user.stats = dbUser.stats;
        }
      }

      const results = await db.getResultsByUser(user.id);
      const booksList = await db.getAllBooks();
      // Recommend books not yet attempted
      const sortedBooks = [...booksList].sort((a, b) => {
        const aDone = results.some(r => r.bookId === a.id);
        const bDone = results.some(r => r.bookId === b.id);
        return aDone - bDone; // Unattempted first
      });
      
      const totalTests = results.length;
      const avgScore = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests) : 0;
      const bestScore = totalTests > 0 ? Math.max(...results.map(r => r.score)) : 0;
      
      const bookScoresMap = {};
      results.forEach(r => {
        if (!bookScoresMap[r.bookId] || r.score > bookScoresMap[r.bookId]) {
          bookScoresMap[r.bookId] = r.score;
        }
      });
      const booksCompletedCount = Object.keys(bookScoresMap).length;
      const recentResults = results.slice(0, 4);

      const todayDateStr = new Date().toLocaleDateString('en-CA');
      const hasDoneToday = user.stats?.lastQuizDate === todayDateStr;

      container.innerHTML = `
        <div class="">
          <div class="hero-section" style="text-align: left; padding: 24px 0; margin-bottom: 12px;">
            <h1 class="hero-title" style="font-family: var(--font-heading); font-size: 2.2rem; font-weight: 800; line-height: 1.2; margin-bottom: 8px;">Salom, ${escapeHtml(user.fullName)}! ${escapeHtml(user.avatar)}</h1>
            <p class="hero-subtitle" style="font-size: 1.1rem; color: var(--text-secondary);">Bugun qaysi kitob bo'yicha bilimingizni sinab ko'rmoqchisiz?</p>
          </div>

          <!-- Streak Widget -->
          <div class="card streak-widget " style="margin-bottom: 24px; padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 20px; background: ${hasDoneToday ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.06))' : 'var(--bg-secondary)'}; border: 1px solid ${hasDoneToday ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-color)'};">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div class="streak-fire ${hasDoneToday ? 'active' : ''}" style="font-size: 2.5rem; filter: ${hasDoneToday ? 'none' : 'grayscale(100%) opacity(0.6)'}; line-height: 1;">
                🔥
              </div>
              <div>
                <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; color: var(--text-primary);">
                  Kunlik Marra: <span style="color: var(--color-accent); font-size: 1.25rem;">${user.stats?.currentStreak || 0} kun</span>
                </h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">
                  ${hasDoneToday 
                    ? "Bugungi maqsad bajarildi! Ertaga ham davom eting! 🎉" 
                    : "Bugun hali test yechilmadi. Streakingizni saqlash yoki yangi streak boshlash uchun 1 ta test yeching! ⚡"}
                </p>
              </div>
            </div>
            <div>
              <a href="#/books" class="btn ${hasDoneToday ? 'btn-secondary' : 'btn-primary'} btn-sm">
                ${hasDoneToday ? 'Yana yechish' : 'Hozir yechish! 🎯'}
              </a>
            </div>
          </div>

          <div class="grid grid-4 mb-lg">
            <div class="card stat-card ">
              <div class="stat-value">${totalTests}</div>
              <div class="stat-label">Urinishlar</div>
            </div>
            <div class="card stat-card ">
              <div class="stat-value">${avgScore}%</div>
              <div class="stat-label">O'rtacha ball</div>
            </div>
            <div class="card stat-card ">
              <div class="stat-value">${bestScore}%</div>
              <div class="stat-label">Eng yaxshi natija</div>
            </div>
            <div class="card stat-card ">
              <div class="stat-value">${booksCompletedCount}</div>
              <div class="stat-label">Yechilgan kitoblar</div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 class="section-title" style="margin-bottom: 0;">🌟 Tavsiya etiladigan kitoblar</h2>
            <a href="#/books" class="btn btn-ghost" style="font-size: 0.9rem;">Barchasi →</a>
          </div>

           <div class="grid grid-5 mb-lg">
             ${sortedBooks.slice(0, 5).map((book, idx) => `
              <div class="card book-card slide-up stagger-${idx + 1}">
                <div class="book-cover-link" onclick="window.location.hash='#/book/${encodeURIComponent(book.id)}'" style="cursor: pointer;">
                   <div class="book-cover-premium" style="background: ${book.coverImage ? `${cssUrl(book.coverImage)} center/cover no-repeat, ${escapeHtml(book.coverBg) || 'var(--bg-tertiary)'}` : (escapeHtml(book.coverBg) || 'var(--bg-tertiary)')}; color: ${escapeHtml(book.coverTitleColor) || 'white'};">
                    ${!book.coverImage ? `<div class="book-cover-pattern" style="opacity: 0.15; background-image: radial-gradient(circle, currentColor 1.5px, transparent 1.5px);"></div>` : ''}
                    <div class="book-cover-badge">${escapeHtml(book.genre)}</div>
                  </div>
                </div>
                <div class="book-info">
                  <div class="book-meta">
                    <span class="badge badge-primary">${book.questionCount || 0} savol</span>
                    <span class="badge ${book.difficulty === 'Oson' ? 'badge-success' : book.difficulty === "O'rta" ? 'badge-warning' : 'badge-error'}">${escapeHtml(book.difficulty)}</span>
                  </div>
                  <button class="btn btn-primary btn-sm btn-start-quiz-dash" data-book-id="${escapeHtml(book.id)}" style="margin-top: 12px; width: 100%;">🚀 Boshlash</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="grid grid-2 mb-lg" style="align-items: start; gap: 24px;">
            <div>
              <h2 class="section-title">📊 Oxirgi natijalaringiz</h2>
              <div class="card" style="padding: 0;">
                ${recentResults.length > 0 ? `
                  <div style="display: flex; flex-direction: column;">
                    ${recentResults.map(r => {
                      let scoreColor = 'var(--color-error)';
                      if (r.score >= 80) scoreColor = 'var(--color-success)';
                      else if (r.score >= 60) scoreColor = 'var(--color-primary-hover)';
                      return `
                        <div class="results-history-item" onclick="window.location.hash='#/result/${encodeURIComponent(r.id)}'" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                          <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; background: ${scoreColor}20; color: ${scoreColor}; flex-shrink: 0;">
                              ${r.score}%
                            </div>
                            <div>
                              <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 2px;">${escapeHtml(r.bookTitle)}</h4>
                              <p style="font-size: 0.75rem; color: var(--text-muted);">${r.correctAnswers}/${r.totalQuestions} to'g'ri • ${new Date(r.completedAt).toLocaleDateString('uz')}</p>
                            </div>
                          </div>
                          <span style="color: var(--text-muted);">→</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : `
                  <div class="text-center" style="padding: 30px 20px; color: var(--text-secondary);">
                    Hali hech qanday test topshirmagansiz. Kitoblardan birini tanlang va boshlang!
                  </div>
                `}
              </div>
            </div>

            <div>
              <h2 class="section-title">🏆 Top kitobxonlar</h2>
              <div id="dashboard-leaderboard" class="card" style="padding: 0;">
                <div class="loading-state" style="padding: 20px 0;">
                  <div class="spinner"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Load Mini Leaderboard from precomputed user stats
      const users = await db.getAllUsers() || [];
      const filteredUsers = users.filter(u => u.username !== 'admin');
      const stats = filteredUsers.map(u => {
        const uStats = u.stats || { testsCompleted: 0, avgScore: 0, bestScore: 0 };
        return {
          ...u,
          avg: uStats.avgScore || 0,
          count: uStats.testsCompleted || 0
        };
      });
      const topUsers = stats.filter(u => u.count > 0).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 3);

      const leaderEl = document.getElementById('dashboard-leaderboard');
      if (!leaderEl) return;

      leaderEl.innerHTML = topUsers.length === 0 ? `
        <div class="text-center" style="padding: 30px 20px; color: var(--text-secondary);">
          Hozircha reyting jadvali bo'sh.
        </div>
      ` : `
        <div style="display: flex; flex-direction: column;">
          ${topUsers.map((u, i) => {
            const rankEmoji = ['🥇', '🥈', '🥉'][i] || '';
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 1.25rem;">${rankEmoji}</span>
                  <span style="font-size: 1.25rem;">${escapeHtml(u.avatar)}</span>
                  <div>
                    <span style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(u.fullName)}</span>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">@${escapeHtml(u.username)} • ${u.count} marta</p>
                  </div>
                </div>
                <span style="font-weight: 700; color: var(--color-secondary);">${u.avg}%</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

      document.querySelectorAll('.btn-start-quiz-dash').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          showQuizRulesModal(btn.dataset.bookId, {
            onCancel: () => navigate('/books')
          });
        });
      });

    } catch (err) {
      console.error(err);
      showNotification(err.message || "Xatolik yuz berdi", "error");
    }
}

// Router Logic
async function handleRoute() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const hash = window.location.hash || '#/dashboard';
  const user = getCurrentUser();

  // Close mobile navigation drawer and avatar dropdown if open
  closeAllDropdowns();
  document.getElementById('nav-links')?.classList.remove('show');
  document.body.classList.remove('nav-open');
  document.getElementById('nav-toggle')?.classList.remove('is-open');
  document.getElementById('nav-toggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('nav-toggle')?.setAttribute('aria-label', 'Menuni ochish');

  // Parse path & parameters
  const parts = hash.slice(2).split('/');
  const path = '/' + (parts[0] || 'dashboard');
  const param = parts[1] || null;

  // Authentication guards
  if (!user && path !== '/login' && path !== '/register') {
    navigate('/login');
    return;
  }
  if (user && (path === '/login' || path === '/register')) {
    navigate('/dashboard');
    return;
  }

  // Admin page guard
  if (path === '/admin' && (!user || !user.isAdmin)) {
    showNotification("Bu sahifaga kirish uchun sizda ruxsat yo'q!", "error");
    navigate('/dashboard');
    return;
  }

  // Update navbar state
  updateNavbar();

  // Render correct page (core routes static, heavy routes lazy-loaded)
  switch (path) {
    case '/login':
      renderLogin(content);
      break;
    case '/register':
      renderRegister(content);
      break;
    case '/dashboard':
      renderDashboard(content);
      break;
    case '/books':
      renderBooksList(content);
      break;
    case '/book':
      if (param) renderBookDetail(content, param);
      else navigate('/books');
      break;
    case '/test':
    case '/quiz':
      if (param) renderQuiz(content, param);
      else navigate('/books');
      break;
    case '/result':
      if (param) renderResultDetail(content, param);
      else navigate('/results');
      break;
    case '/results':
      renderResultsHistory(content);
      break;
    case '/leaderboard':
      renderLeaderboard(content);
      break;
    case '/daily-stack':
      showLoading(content, 'Kunlik stack yuklanmoqda...');
      try {
        const { renderDailyStack } = await import('./daily-stack.js');
        renderDailyStack(content);
      } catch (e) { showError(content, 'Kunlik stack yuklanmadi'); }
      break;
    case '/arena':
      showLoading(content, 'Arena yuklanmoqda...');
      try {
        const { renderArena } = await import('./arena.js');
        renderArena(content);
      } catch (e) { showError(content, 'Arena yuklanmadi'); }
      break;
    case '/arena-leaderboard':
      showLoading(content, 'Arena reytingi yuklanmoqda...');
      try {
        const { renderArenaLeaderboard } = await import('./arena.js');
        renderArenaLeaderboard(content);
      } catch (e) { showError(content, 'Arena reytingi yuklanmadi'); }
      break;
    case '/profile':
      showLoading(content, 'Profil yuklanmoqda...');
      try {
        const { renderProfile } = await import('./profile.js');
        renderProfile(content);
      } catch (e) { showError(content, 'Profil yuklanmadi'); }
      break;
    case '/admin':
      showLoading(content, 'Admin panel yuklanmoqda...');
      try {
        const { renderAdminPanel } = await import('./admin.js');
        renderAdminPanel(content);
      } catch (e) { showError(content, 'Admin panel yuklanmadi'); }
      break;
    default:
      navigate('/dashboard');
  }

  // Page rendering complete

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Global App Init
async function init() {
  try {
    initTheme(); // Initialize theme preference
    initAuth(); // Subscribe to Supabase auth state changes
    await initDB();
    // Seed admin user if not exists
    setupMobileNav();
    window.addEventListener('hashchange', handleRoute);
    
    // Initial route handling
    handleRoute();
  } catch (err) {
    console.error("Initialization error:", err);
    const content = document.getElementById('main-content');
    if (content) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">Ilova yuklanishida xatolik</div>
          <p class="empty-state-text">Ma'lumotlar bazasini ishga tushirib bo'lmadi. Iltimos, sahifani qayta yuklang.</p>
        </div>
      `;
    }
  }
}

// Start Application
init();
