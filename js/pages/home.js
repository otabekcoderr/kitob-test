// ============================================================
// pages/home.js — Bosh sahifa / Dashboard
// ============================================================
import { getBooks, getLeaderboard, getUserResults } from '../db.js';
import { escapeHtml, truncate, safeCssUrl }         from '../utils.js';
let _cleanup = [];

export async function render(container, { params, user }) {
  // Skeleton ko'rsatamiz, keyin ma'lumot yuklangan so'ng almashtiradi
  container.innerHTML = `
    <div class="page" id="home-page">
      <div class="container">

        <!-- Hero -->
        <section class="home-hero animate-slide-up">
          ${user
            ? `<div class="home-hero__welcome">
                <h1 class="home-hero__title">
                  Xush kelibsiz, ${escapeHtml(user.fullName || user.username)}! 👋
                </h1>
                <p class="home-hero__sub">Bilimingizni sinab ko'ring va reytingda yuqoriga chiqing.</p>
               </div>`
            : `<div class="home-hero__welcome">
                <h1 class="home-hero__title">📚 Kitobchi</h1>
                <p class="home-hero__sub">O'zbek adabiyoti bo'yicha testlar platformasi</p>
                <div class="home-hero__actions">
                  <a href="#register" class="btn btn-primary btn-lg">Boshlash</a>
                  <a href="#books"    class="btn btn-outline btn-lg">Kitoblar</a>
                </div>
               </div>`
          }
        </section>

        <!-- Statistika (faqat kirgan foydalanuvchi uchun) -->
        ${user ? `
        <section class="home-section" aria-label="Statistikangiz">
          <div class="grid grid-4 stagger" id="stats-grid">
            ${_skeletonStatCards(4)}
          </div>
        </section>` : ''}

        <!-- Streak widget (faqat kirgan foydalanuvchi uchun) -->
        ${user ? `
        <section class="home-section" id="streak-section" aria-label="Streak">
          ${_renderStreakWidget(user)}
        </section>` : ''}

        <!-- Kitoblar -->
        <section class="home-section">
          <div class="home-section__header">
            <h2 class="home-section__title">Kitoblar</h2>
            <a href="#books" class="btn btn-ghost btn-sm">Barchasini ko'rish →</a>
          </div>
          <div class="grid grid-auto stagger" id="books-grid">
            ${_skeletonBookCards(6)}
          </div>
        </section>

        <!-- Mini Leaderboard -->
        <section class="home-section">
          <div class="home-section__header">
            <h2 class="home-section__title">🏆 Top o'yinchilar</h2>
            <a href="#leaderboard" class="btn btn-ghost btn-sm">To'liq jadval →</a>
          </div>
          <div class="card" id="leaderboard-mini">
            <div class="loading-state">
              <div class="spinner spinner--sm"></div>
              <span>Yuklanmoqda...</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  `;

  _addStyles();

  // Ma'lumotlarni parallel yuklash
  try {
    const [books, leaders, results] = await Promise.allSettled([
      getBooks(),
      getLeaderboard(5),
      user ? getUserResults(user.id) : Promise.resolve([]),
    ]);

    const booksList  = books.status   === 'fulfilled' ? books.value   : [];
    const leaderList = leaders.status === 'fulfilled' ? leaders.value : [];
    const resultList = results.status === 'fulfilled' ? results.value : [];

    // Statistikani render qilish
    if (user) {
      _renderStats(user, resultList);
    }

    // Kitoblarni render qilish
    _renderBooks(booksList.slice(0, 6));

    // Leaderboardni render qilish
    _renderLeaderboardMini(leaderList, user);

  } catch (err) {
    console.error('[home] Yuklash xatosi:', err);
  }
}

// ---- STAT CARDS ----
function _renderStats(user, results) {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const totalTests = results.length;
  const avgScore   = totalTests > 0
    ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / totalTests)
    : 0;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__icon">🏅</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${user.score ?? 0}</div>
        <div class="stat-card__label">Jami ball</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__icon" style="background:var(--color-warning-light)">🔥</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${user.streak ?? 0}</div>
        <div class="stat-card__label">Ketma-ket kun</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__icon" style="background:var(--color-success-light)">📝</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${totalTests}</div>
        <div class="stat-card__label">Yechilgan test</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-card__icon" style="background:var(--color-info-light)">📊</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${avgScore}%</div>
        <div class="stat-card__label">O'rtacha natija</div>
      </div>
    </div>
  `;
}

// ---- STREAK WIDGET ----
function _renderStreakWidget(user) {
  const streak = user.streak ?? 0;
  const flames  = Math.min(streak, 7);
  const flameHTML = Array.from({ length: 7 }, (_, i) =>
    `<span class="streak-flame ${i < flames ? 'streak-flame--active' : ''}"
           aria-hidden="true">🔥</span>`
  ).join('');

  return `
    <div class="streak-widget card">
      <div class="streak-widget__left">
        <div class="streak-widget__number">${streak}</div>
        <div class="streak-widget__label">kunlik streak</div>
      </div>
      <div class="streak-widget__flames">${flameHTML}</div>
      <div class="streak-widget__right">
        ${streak >= 7
          ? `<span class="badge badge-warning">🏆 Haftalik rekord!</span>`
          : `<span class="streak-widget__hint">
              Har kuni test yeching — streak oshadi!
             </span>`
        }
      </div>
    </div>
  `;
}

// ---- KITOBLAR ----
function _renderBooks(books) {
  const grid = document.getElementById('books-grid');
  if (!grid) return;

  if (!books.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📚</div>
        <p class="empty-state__title">Kitoblar topilmadi</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = books.map(book => _bookCardHTML(book)).join('');

  // Kartaga bosish
  grid.querySelectorAll('.book-card').forEach(card => {
    const id = card.dataset.bookId;
    const onClick = () => window.navigate('book', { id });
    card.addEventListener('click', onClick);
    _cleanup.push(() => card.removeEventListener('click', onClick));
  });
}

function _bookCardHTML(book) {
  const cover = book.cover_url || book.cover || '';
  return `
    <article
      class="book-card"
      data-book-id="${escapeHtml(String(book.id))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(book.title)} kitobini ochish"
    >
      <div class="book-card__cover">
        ${cover
          ? `<img src="${escapeHtml(cover)}"
                  alt="${escapeHtml(book.title)}"
                  loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
             />
             <div class="book-card__cover-placeholder" style="display:none">📖</div>`
          : `<div class="book-card__cover-placeholder">📖</div>`
        }
      </div>
      <div class="book-card__body">
        <div class="book-card__title">${escapeHtml(book.title)}</div>
        <div class="book-card__author">${escapeHtml(book.author || '')}</div>
      </div>
      <div class="book-card__footer">
        <span class="badge">${escapeHtml(book.category || 'Adabiyot')}</span>
        <span class="badge badge-primary">Test →</span>
      </div>
    </article>
  `;
}

// ---- MINI LEADERBOARD ----
function _renderLeaderboardMini(leaders, currentUser) {
  const el = document.getElementById('leaderboard-mini');
  if (!el) return;

  if (!leaders.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">🏆</div>
      <p class="empty-state__desc">Hali hech kim test yechmagan</p>
    </div>`;
    return;
  }

  el.innerHTML = `
    <ul class="lb-mini" role="list">
      ${leaders.map((u, i) => {
        const medals  = ['🥇','🥈','🥉'];
        const medal   = medals[i] ?? `${i + 1}.`;
        const isMe    = currentUser && u.id === currentUser.id;
        const initial = (u.full_name || u.username || '?')[0].toUpperCase();
        return `
          <li class="lb-mini__item ${isMe ? 'lb-mini__item--me' : ''}">
            <span class="lb-mini__rank">${medal}</span>
            <span class="lb-mini__avatar">${escapeHtml(initial)}</span>
            <span class="lb-mini__name">
              ${escapeHtml(u.full_name || u.username)}
              ${isMe ? '<span class="badge badge-primary" style="font-size:.7rem">Siz</span>' : ''}
            </span>
            <span class="lb-mini__score">${u.score ?? 0} ball</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

// ---- SKELETON ----
function _skeletonStatCards(n) {
  return Array.from({ length: n }, () => `
    <div class="stat-card">
      <div class="skeleton" style="width:52px;height:52px;border-radius:var(--radius-md);flex-shrink:0"></div>
      <div style="flex:1">
        <div class="skeleton skeleton-title" style="width:50%"></div>
        <div class="skeleton skeleton-text"  style="width:70%"></div>
      </div>
    </div>
  `).join('');
}

function _skeletonBookCards(n) {
  return Array.from({ length: n }, () => `
    <div class="book-card" style="cursor:default">
      <div class="skeleton skeleton-card"></div>
      <div style="padding:16px">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text" style="width:60%"></div>
      </div>
    </div>
  `).join('');
}

function _addStyles() {
  if (document.getElementById('home-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'home-page-styles';
  style.textContent = `
    .home-hero {
      padding: 48px 0 40px;
      text-align: center;
    }
    .home-hero__title {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      margin-bottom: 12px;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .home-hero__sub {
      color: var(--text-muted);
      font-size: 1.0625rem;
      max-width: 480px;
      margin: 0 auto 24px;
    }
    .home-hero__actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

    .home-section { margin-bottom: 48px; }
    .home-section__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .home-section__title { font-size: 1.25rem; }

    .streak-widget {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 20px 28px;
      background: linear-gradient(135deg,
        var(--color-primary-light),
        var(--bg-primary));
    }
    .streak-widget__left { text-align: center; }
    .streak-widget__number {
      font-family: var(--font-heading);
      font-size: 2.5rem;
      font-weight: 800;
      color: var(--color-primary);
      line-height: 1;
    }
    .streak-widget__label { font-size: .8125rem; color: var(--text-muted); }
    .streak-widget__flames { display: flex; gap: 4px; flex: 1; justify-content: center; }
    .streak-flame { font-size: 1.5rem; opacity: 0.25; transition: var(--transition); }
    .streak-flame--active { opacity: 1; animation: pulse 1.8s ease-in-out infinite; }
    .streak-widget__hint {
      font-size: .875rem;
      color: var(--text-muted);
      max-width: 160px;
      text-align: center;
    }

    .lb-mini { display: flex; flex-direction: column; gap: 0; }
    .lb-mini__item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-color);
      transition: var(--transition-fast);
    }
    .lb-mini__item:last-child { border-bottom: none; }
    .lb-mini__item--me { background: var(--color-primary-light); margin: 0 -24px; padding: 12px 24px; border-radius: var(--radius-md); }
    .lb-mini__rank { font-size: 1.25rem; width: 32px; text-align: center; flex-shrink: 0; }
    .lb-mini__avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      color: white; display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: .875rem; flex-shrink: 0;
    }
    .lb-mini__name { flex: 1; font-weight: 500; display: flex; align-items: center; gap: 8px; }
    .lb-mini__score { font-weight: 700; color: var(--color-primary); font-size: .9375rem; }

    @media (max-width: 768px) {
      .home-hero { padding: 32px 0 24px; }
      .streak-widget { flex-wrap: wrap; gap: 16px; padding: 16px 20px; }
      .streak-widget__right { width: 100%; text-align: center; }
    }
    @media (max-width: 480px) {
      .streak-widget__flames { gap: 2px; }
      .streak-flame { font-size: 1.25rem; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
