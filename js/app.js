import { initDB, getAllBooks } from './db.js';
import { getCurrentUser, logout, initAdminAccount } from './auth.js';
import { renderBooksList, renderBookDetail } from './books.js';
import { renderQuiz } from './quiz.js';
import { renderResultDetail, renderResultsHistory, renderLeaderboard } from './results.js';
import { renderProfile } from './profile.js';
import { renderAdminPanel } from './admin.js';
import { renderDailyStack } from './daily-stack.js';
import { renderArena, renderArenaLeaderboard } from './arena.js';
import * as Auth from './auth.js';

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

function updateNavbar() {
  const navLinks = document.getElementById('nav-links');
  const navUser = document.getElementById('nav-user');
  const user = getCurrentUser();
  const isLightTheme = document.body.classList.contains('light-theme');
  
  const themeToggleHtml = `
    <button class="theme-toggle-btn" id="theme-toggle" title="Rejimni o'zgartirish">
      ${isLightTheme ? '🌙' : '☀️'}
    </button>
  `;

  if (!user) {
    if (navLinks) navLinks.innerHTML = '';
    if (navUser) {
      navUser.innerHTML = `
        ${themeToggleHtml}
        <a href="#/login" class="btn btn-ghost btn-sm">Kirish</a>
        <a href="#/register" class="btn btn-primary btn-sm">Ro'yxatdan o'tish</a>
      `;
    }
  } else {
    const hash = window.location.hash;
    if (navLinks) {
      let linksHtml = `
        <a href="#/daily-stack" class="nav-link ${hash === '#/daily-stack' ? 'active' : ''}">📅 Kunlik</a>
        <a href="#/arena" class="nav-link ${hash === '#/arena' || hash === '#/arena-leaderboard' ? 'active' : ''}">⚔️ Arena</a>
        <a href="#/dashboard" class="nav-link ${hash === '#/dashboard' || hash === '' ? 'active' : ''}">🏠 Dashboard</a>
        <a href="#/books" class="nav-link ${hash === '#/books' || hash.startsWith('#/book/') ? 'active' : ''}">📚 Kitoblar</a>
        <a href="#/results" class="nav-link ${hash === '#/results' || hash.startsWith('#/result/') ? 'active' : ''}">📊 Natijalar</a>
        <a href="#/leaderboard" class="nav-link ${hash === '#/leaderboard' ? 'active' : ''}">🏆 Reyting</a>
      `;

      if (user.isAdmin) {
        linksHtml += `
          <a href="#/admin" class="nav-link ${hash === '#/admin' ? 'active' : ''}" style="color: var(--color-accent); font-weight: 700;">👑 Admin</a>
        `;
      }

      navLinks.innerHTML = linksHtml;
    }
    
    if (navUser) {
      navUser.innerHTML = `
        ${themeToggleHtml}
        ${user.stats?.currentStreak ? `
          <a href="#/profile" class="nav-streak-badge" title="Joriy Streak: ${user.stats.currentStreak} kun" style="color: var(--color-accent); font-weight: 700; padding: 6px 10px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; text-decoration: none; font-size: 0.85rem; transition: var(--transition);">
            🔥 <span>${user.stats.currentStreak}</span>
          </a>
        ` : ''}
        <a href="#/profile" class="nav-link" style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.25rem;">${user.avatar}</span>
          <span class="nav-username-text">${user.fullName}</span>
        </a>
        <button class="btn btn-ghost btn-sm" id="logout-btn" style="color: var(--color-error); padding: 8px;">Chiqish</button>
      `;

      document.getElementById('logout-btn')?.addEventListener('click', () => {
        logout();
        navigate('/login');
        showNotification('Tizimdan chiqdingiz', 'info');
      });
    }
  }

  // Attach theme listener
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
}

function setupMobileNav() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    links?.classList.toggle('show');
  });

  // Close when clicking anywhere outside
  document.addEventListener('click', () => {
    links?.classList.remove('show');
  });
}

// Render Authentication Screens
function renderLogin(container) {
  container.innerHTML = `
    <div class="auth-page fade-in">
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
    const uName = document.getElementById('login-username').value.trim();
    const pWord = document.getElementById('login-password').value;

    try {
      await Auth.login(uName, pWord);
      showNotification("Muvaffaqiyatli kirdingiz! 🎉", "success");
      navigate('/dashboard');
    } catch (err) {
      showNotification(err.message, "error");
    }
  });
}

function renderRegister(container) {
  container.innerHTML = `
    <div class="auth-page fade-in">
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
    const fullName = document.getElementById('reg-fullname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;

    if (password !== passwordConfirm) {
      showNotification("Tasdiqlash paroli mos kelmadi!", "error");
      return;
    }

    try {
      await Auth.register(fullName, username, password);
      showNotification("Ro'yxatdan muvaffaqiyatli o'tdingiz! 🥳", "success");
      navigate('/dashboard');
    } catch (err) {
      showNotification(err.message, "error");
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

  const db = await import('./db.js');
    try {
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
        <div class="fade-in">
          <div class="hero-section" style="text-align: left; padding: 24px 0; margin-bottom: 12px;">
            <h1 class="hero-title" style="font-family: var(--font-heading); font-size: 2.2rem; font-weight: 800; line-height: 1.2; margin-bottom: 8px;">Salom, ${user.fullName}! ${user.avatar}</h1>
            <p class="hero-subtitle" style="font-size: 1.1rem; color: var(--text-secondary);">Bugun qaysi kitob bo'yicha bilimingizni sinab ko'rmoqchisiz?</p>
          </div>

          <!-- Streak Widget -->
          <div class="card streak-widget slide-up stagger-1" style="margin-bottom: 24px; padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 20px; background: ${hasDoneToday ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.06))' : 'var(--bg-secondary)'}; border: 1px solid ${hasDoneToday ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-color)'};">
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
            <div class="card stat-card slide-up stagger-1">
              <div class="stat-value">${totalTests}</div>
              <div class="stat-label">Urinishlar</div>
            </div>
            <div class="card stat-card slide-up stagger-2">
              <div class="stat-value">${avgScore}%</div>
              <div class="stat-label">O'rtacha ball</div>
            </div>
            <div class="card stat-card slide-up stagger-3">
              <div class="stat-value">${bestScore}%</div>
              <div class="stat-label">Eng yaxshi natija</div>
            </div>
            <div class="card stat-card slide-up stagger-4">
              <div class="stat-value">${booksCompletedCount}</div>
              <div class="stat-label">Yechilgan kitoblar</div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 class="section-title" style="margin-bottom: 0;">🌟 Tavsiya etiladigan kitoblar</h2>
            <a href="#/books" class="btn btn-ghost" style="font-size: 0.9rem;">Barchasi →</a>
          </div>

          <div class="grid grid-3 mb-lg">
            ${booksList.slice(0, 3).map((book, idx) => `
              <div class="card book-card slide-up stagger-${idx + 1}" onclick="window.location.hash='#/book/${book.id}'">
                  <div class="book-cover-premium" style="background: ${book.coverImage ? `url(${book.coverImage}) center/cover no-repeat, ${book.coverBg || 'var(--bg-tertiary)'}` : (book.coverBg || 'var(--bg-tertiary)')}; color: ${book.coverTitleColor || 'white'};">
                    ${!book.coverImage ? `<div class="book-cover-pattern" style="opacity: 0.15; background-image: radial-gradient(circle, currentColor 1.5px, transparent 1.5px);"></div>` : ''}
                    <div class="book-cover-badge">${book.genre}</div>
                    <div class="book-cover-main">
                      ${!book.coverImage ? `<div class="book-cover-icon">${book.cover}</div>` : ''}
                      <div class="book-cover-title-text">${book.title}</div>
                      <div class="book-cover-author-text">${book.author}</div>
                    </div>
                  </div>
                <div class="book-info">
                  <h3 class="book-title" style="margin-top:0;">${book.title}</h3>
                  <p class="book-author">${book.author}</p>
                  <div class="book-meta">
                    <span class="badge badge-primary">${book.questionCount || 0} savol</span>
                    <span class="badge ${book.difficulty === 'Oson' ? 'badge-success' : book.difficulty === "O'rta" ? 'badge-warning' : 'badge-error'}">${book.difficulty}</span>
                  </div>
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
                        <div class="results-history-item" onclick="window.location.hash='#/result/${r.id}'" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                          <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; background: ${scoreColor}20; color: ${scoreColor}; flex-shrink: 0;">
                              ${r.score}%
                            </div>
                            <div>
                              <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 2px;">${r.bookTitle}</h4>
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

      // Load Mini Leaderboard
      const [users, allResultsList] = await Promise.all([db.getAllUsers(), db.getAllResults()]);
      const filteredUsers = (users || []).filter(u => u.username !== 'admin');
      const stats = (filteredUsers || []).map(u => {
        const userResults = (allResultsList || []).filter(r => r.userId === u.id);
        let avg = 0;
        if (userResults.length > 0) {
          avg = Math.round(userResults.reduce((acc, r) => acc + r.score, 0) / userResults.length);
        }
        return { ...u, avg, count: userResults.length };
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
                  <span style="font-size: 1.25rem;">${u.avatar}</span>
                  <div>
                    <span style="font-weight: 600; font-size: 0.95rem;">${u.fullName}</span>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">@${u.username} • ${u.count} marta</p>
                  </div>
                </div>
                <span style="font-weight: 700; color: var(--color-secondary);">${u.avg}%</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

    } catch (err) {
      console.error(err);
      showNotification(err.message || "Xatolik yuz berdi", "error");
    }
  });
}

// Router Logic
async function handleRoute() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const hash = window.location.hash || '#/dashboard';
  const user = getCurrentUser();

  // Close mobile navigation drawer if open
  document.getElementById('nav-links')?.classList.remove('show');

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

  // Transition Page Out
  content.style.opacity = '0';
  content.style.transform = 'translateY(8px)';
  
  await new Promise(r => setTimeout(r, 150));

  // Render correct page
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
    case '/daily-stack':
      renderDailyStack(content);
      break;
    case '/arena':
      renderArena(content);
      break;
    case '/arena-leaderboard':
      renderArenaLeaderboard(content);
      break;
    case '/leaderboard':
      renderLeaderboard(content);
      break;
    case '/profile':
      renderProfile(content);
      break;
    case '/admin':
      renderAdminPanel(content);
      break;
    default:
      navigate('/dashboard');
  }

  // Transition Page In
  requestAnimationFrame(() => {
    content.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Global App Init
async function init() {
  try {
    initTheme(); // Initialize theme preference
    await initDB();
    await initAdminAccount(); // Seed admin user if not exists
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
