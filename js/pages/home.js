// ============================================================
// pages/home.js — Bosh sahifa / Editorial Dashboard
// ============================================================
import { getBooks, getLeaderboard, getUserResults, getStreakStatus } from '../db.js';
import { escapeHtml, truncate, today }                               from '../utils.js';
let _cleanup = [];

// ---- Deterministik kunlik sinov (sanaga asoslangan) ----
function _getDailyChallenge(books) {
  if (!books || !books.length) return null;
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return books[seed % books.length];
}

// ---- Muqova URL ----
function _getBookCover(book) {
  if (!book) return '';
  if (book.cover_url && (book.cover_url.startsWith('http') || book.cover_url.startsWith('data:'))) return book.cover_url;
  if (book.cover    && (book.cover.startsWith('http')    || book.cover.startsWith('data:')))    return book.cover;
  return book.coverImage || '';
}

// ---- CSS tipografik placeholder ----
function _coverPlaceholder(book) {
  const initial = (book.title || '?')[0].toUpperCase();
  return `<div class="book-card__cover-placeholder">
    <span class="placeholder-initial">${escapeHtml(initial)}</span>
    <span class="placeholder-label">${escapeHtml(truncate(book.title || '', 16))}</span>
  </div>`;
}

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page" id="home-page">
      <div class="container">

        <!-- Hero -->
        <section class="hero animate-fade-in">
          <p class="hero__eyebrow">O'zbek raqamli kutubxonasi</p>
          ${user
            ? `<h1 class="hero__title">${escapeHtml(user.fullName || user.username)}</h1>
               <p class="hero__desc">Bilimingizni mustahkamlang. Har kuni bir kitob.</p>`
            : `<h1 class="hero__title">Kitobchi</h1>
               <p class="hero__desc">O'zbek adabiyotini o'rganish, test yechish va bilimingizni o'lchash uchun platforma.</p>
               <div style="display:flex;gap:12px;flex-wrap:wrap;">
                 <a href="#register" class="btn btn-primary btn-lg">Boshlash</a>
                 <a href="#books"    class="btn btn-outline btn-lg">Kitoblar</a>
               </div>`
          }
        </section>

        <!-- Streak uzilganligi haqida bildirishnoma (agar kecha kirmagan bo'lsa) -->
        <div id="streak-broken-notice-wrap" role="region" aria-label="Streak xabarnomasi"></div>

        <!-- Kunlik Streak va Haftalik Faollik Tracker -->
        <section class="section" id="streak-section" aria-label="Kunlik streak va faollik">
          <div id="streak-widget-wrap">
            <div class="streak-card card">
              <div class="loading-state"><div class="spinner spinner--sm"></div><span>Streak yuklanmoqda...</span></div>
            </div>
          </div>
        </section>

        <!-- Bugungi sinov (skeleton) -->
        <section class="section" aria-label="Bugungi sinov">
          <h2 class="section-heading">Bugungi sinov</h2>
          <div id="daily-challenge-wrap">
            <div class="daily-challenge">
              <div>
                <div class="daily-challenge__label">Yuklanmoqda...</div>
                <div class="daily-challenge__title" style="color:var(--ink-faint)">—</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Progress (faqat kirgan foydalanuvchi) -->
        ${user ? `
        <section class="section" aria-label="Sizning natijalaringiz">
          <h2 class="section-heading">Natijalaringiz</h2>
          <div id="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;">
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Ball</div></div>
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Streak</div></div>
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Testlar</div></div>
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">O'rtacha</div></div>
          </div>
        </section>` : ''}

        <!-- Tanlangan kitoblar -->
        <section class="section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 class="section-heading" style="margin-bottom:0;border-bottom:none;padding-bottom:0;">Kitoblar</h2>
            <a href="#books" class="btn btn-ghost btn-sm">Barchasini ko'rish</a>
          </div>
          <div class="grid grid-auto" id="books-grid">
            ${_skeletonBookCards(6)}
          </div>
        </section>

        <!-- Mini Leaderboard -->
        <section class="section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 class="section-heading" style="margin-bottom:0;border-bottom:none;padding-bottom:0;">Reyting</h2>
            <a href="#leaderboard" class="btn btn-ghost btn-sm">To'liq jadval</a>
          </div>
          <div class="card" id="leaderboard-mini">
            <div class="loading-state"><div class="spinner spinner--sm"></div><span>Yuklanmoqda...</span></div>
          </div>
        </section>

      </div>
    </div>
  `;

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

    // Bugungi sinov
    const daily = _getDailyChallenge(booksList);
    _renderDailyChallenge(daily);

    // Kunlik streak holatini hisoblash va ko'rsatish
    const streakStatus = await getStreakStatus(user, resultList);
    _renderStreakWidget(streakStatus, user, daily);

    // Statistika
    if (user) _renderStats(user, resultList, streakStatus.currentStreak);

    // Kitoblar va Mini reyting
    _renderBooks(booksList.slice(0, 6));
    _renderLeaderboardMini(leaderList, user);

    // Jonli kitoblar yangilanishini tinglash
    const onBooksUpdated = async () => {
      try {
        const fresh = await getBooks(true);
        _renderBooks(fresh.slice(0, 6));
        _renderDailyChallenge(_getDailyChallenge(fresh));
      } catch { /* ignore */ }
    };
    window.addEventListener('kitobchi_books_updated', onBooksUpdated);
    _cleanup.push(() => window.removeEventListener('kitobchi_books_updated', onBooksUpdated));

  } catch (err) {
    console.error('[home] Yuklash xatosi:', err);
  }
}

// ---- KUNLIK STREAK WIDGET & ANIMATSIYA ----
function _renderStreakWidget(streakStatus, user, dailyBook) {
  const widgetWrap = document.getElementById('streak-widget-wrap');
  const brokenWrap = document.getElementById('streak-broken-notice-wrap');
  if (!widgetWrap) return;

  const dailyId = dailyBook ? String(dailyBook.id) : '';

  // 1. Agar streak buzilgan bo'lsa va hali ko'rsatilmagan bo'lsa — sokin, nafis xabarnoma chiqaramiz
  if (brokenWrap && streakStatus.isBroken && user) {
    const todayStr = today();
    const ackKey = `kitobchi_streak_broken_ack_${user.id}`;
    const alreadyAcked = localStorage.getItem(ackKey) === todayStr;

    if (!alreadyAcked) {
      brokenWrap.innerHTML = `
        <div class="streak-broken-banner" id="streak-broken-banner">
          <div class="streak-broken-banner__icon" aria-hidden="true">🕯️</div>
          <div style="flex:1;min-width:0;">
            <div class="streak-broken-banner__title">Yangi sahifa, yangi marra!</div>
            <div class="streak-broken-banner__desc">
              Kecha test yechish imkoni bo'lmadi va <strong>${streakStatus.brokenStreakAmount} kunlik</strong> streakingiz yangilandi. 
              Tushkunlikka o'rin yo'q — har bir sahifa yangi bilim va yangi g'alabalarga boshlaydi. Bugun yangi zanjirni boshlang!
            </div>
          </div>
          <div class="streak-broken-banner__actions">
            ${dailyId ? `<a href="#book?id=${escapeHtml(dailyId)}" id="btn-start-broken-streak" class="btn btn-primary btn-sm">Yangi streakni boshlash ✨</a>` : `<a href="#books" id="btn-start-broken-streak" class="btn btn-primary btn-sm">Kitob tanlash va boshlash ✨</a>`}
            <button class="btn btn-ghost btn-sm" id="btn-dismiss-broken-streak">Tushundim</button>
          </div>
        </div>
      `;

      const startBtn = document.getElementById('btn-start-broken-streak');
      if (startBtn) {
        startBtn.onclick = () => {
          localStorage.setItem(ackKey, todayStr);
          try {
            localStorage.removeItem(`kitobchi_broken_streak_${user.id}`);
          } catch {}
        };
      }

      const dismissBtn = document.getElementById('btn-dismiss-broken-streak');
      if (dismissBtn) {
        dismissBtn.onclick = () => {
          localStorage.setItem(ackKey, todayStr);
          try {
            localStorage.removeItem(`kitobchi_broken_streak_${user.id}`);
          } catch {}
          const banner = document.getElementById('streak-broken-banner');
          if (banner) {
            banner.style.transition = 'all 0.35s ease';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-10px)';
            setTimeout(() => { brokenWrap.innerHTML = ''; }, 350);
          }
        };
      }
    } else {
      brokenWrap.innerHTML = '';
    }
  } else if (brokenWrap) {
    brokenWrap.innerHTML = '';
  }

  // 2. Mehmon (Guest) foydalanuvchi ko'rinishi
  if (!user || streakStatus.isGuest) {
    widgetWrap.innerHTML = `
      <div class="streak-card card">
        <div class="streak-card__header">
          <div class="streak-card__flame-wrap">
            <div class="streak-card__flame streak-card__flame--idle">
              <span class="streak-card__flame-emoji">🔥</span>
            </div>
            <div>
              <div class="streak-card__title">
                <span class="streak-card__count">0</span>
                <span class="streak-card__unit">kunlik streak</span>
              </div>
              <div class="streak-card__subtitle">
                Har kuni kamida bitta kitobdan test yechib, o'z bilim zanjiringizni uzmasdan davom ettiring!
              </div>
            </div>
          </div>
          <div class="streak-card__action">
            <a href="#login" class="btn btn-primary btn-sm pulse-button">Kirish va boshlash 🔥</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // 3. Tizimga kirgan foydalanuvchi uchun to'liq interaktiv streak kartasi
  const streak = streakStatus.currentStreak;
  const isDone = streakStatus.isCompletedToday;

  // Streak o'sganda sakrab yangilanish (counterBounce)
  const todayStr = today();
  const bounceKey = `kitobchi_streak_bounced_date_${user.id}`;
  const alreadyBouncedToday = localStorage.getItem(bounceKey) === todayStr;
  const lastViewedKey = `kitobchi_viewed_streak_${user.id}`;
  const lastViewedStreak = localStorage.getItem(lastViewedKey);
  const didStreakGrow = lastViewedStreak !== null && streak > parseInt(lastViewedStreak, 10);
  const shouldBounce = (didStreakGrow || (isDone && streak > 0)) && !alreadyBouncedToday;
  if (shouldBounce) {
    try { localStorage.setItem(bounceKey, todayStr); } catch {}
  }
  localStorage.setItem(lastViewedKey, String(streak));

  let subtitleText = '';
  if (isDone) {
    subtitleText = '✨ Ajoyib! Bugungi kunlik sinov muvaffaqiyatli bajarildi. Ertaga streakni davom ettiring!';
  } else if (streak > 0) {
    subtitleText = `⚡ Bugun hali sinov yechilmadi! 1 ta test yechib, ${streak + 1}-kunlik streakka erishing va olovni saqlab qoling.`;
  } else {
    subtitleText = '📖 Bugun birinchi testni yeching va yangi g\'alabali streakingizni boshlang!';
  }

  widgetWrap.innerHTML = `
    <div class="streak-card ${isDone ? 'streak-card--completed' : ''} card">
      <div class="streak-card__header">
        <div class="streak-card__flame-wrap">
          <div class="streak-card__flame ${streak > 0 ? 'streak-card__flame--active' : 'streak-card__flame--idle'}">
            <span class="streak-card__flame-emoji">🔥</span>
            ${streak > 0 ? `
              <div class="streak-flame-sparks" aria-hidden="true">
                <span>✦</span>
                <span>✨</span>
                <span>✦</span>
              </div>
            ` : ''}
          </div>
          <div>
            <div class="streak-card__title">
              <span class="streak-card__count ${shouldBounce ? 'counter-bounce' : ''}">${streak}</span>
              <span class="streak-card__unit">kunlik streak</span>
            </div>
            <div class="streak-card__subtitle">${subtitleText}</div>
          </div>
        </div>
        <div class="streak-card__action">
          ${!isDone ? `
            <a href="${dailyId ? `#book?id=${escapeHtml(dailyId)}` : '#books'}" class="btn btn-primary btn-sm pulse-button">
              Bugungi sinovni yechish 🔥
            </a>
          ` : `
            <span class="streak-card__badge-done">
              <span style="font-weight:900;">✓</span> Bugun bajarildi
            </span>
          `}
        </div>
      </div>

      <div class="streak-card__divider"></div>

      <!-- 7 kunlik haftalik faollik (animatsiyali taqvim) -->
      <div class="streak-week">
        <div class="streak-week__label">Haftalik faollik (Dushanba — Yakshanba):</div>
        <div class="streak-week__grid">
          ${streakStatus.weekDays.map((d, idx) => `
            <div class="streak-day ${d.isActive ? 'streak-day--active' : ''} ${d.isToday ? 'streak-day--today' : ''} ${d.isPast && !d.isActive ? 'streak-day--missed' : ''}" style="animation-delay: ${idx * 65}ms;">
              <span class="streak-day__name">${d.name}</span>
              <div class="streak-day__circle" title="${d.fullName}, ${d.date}">
                ${d.isActive 
                  ? '<span class="streak-day__flame">🔥</span>' 
                  : d.isToday 
                    ? '<span class="streak-day__target">🎯</span>' 
                    : `<span class="streak-day__num">${d.dayNum}</span>`}
              </div>
              ${d.isToday ? '<span class="streak-day__today-indicator">Bugun</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ---- BUGUNGI SINOV ----
function _renderDailyChallenge(book) {
  const wrap = document.getElementById('daily-challenge-wrap');
  if (!wrap) return;

  if (!book) {
    wrap.innerHTML = `<div class="daily-challenge"><div><div class="daily-challenge__label">Bugungi sinov</div><div class="daily-challenge__title">Kitob topilmadi</div></div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="daily-challenge">
      <div style="flex:1;min-width:0;">
        <div class="daily-challenge__label">Bugungi sinov</div>
        <div class="daily-challenge__title">${escapeHtml(book.title)}</div>
        <div class="daily-challenge__author">${escapeHtml(book.author || '')}</div>
      </div>
      <a href="#book?id=${escapeHtml(String(book.id))}" class="btn btn-primary btn-sm" style="flex-shrink:0;">
        Boshlash
      </a>
    </div>
  `;
}

// ---- STAT CARDS ----
function _renderStats(user, results, currentStreak = null) {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const totalTests = results.length;
  const avgScore   = totalTests > 0
    ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / totalTests)
    : 0;

  const displayStreak = currentStreak !== null ? currentStreak : (user.streak ?? 0);

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__value">${user.score ?? 0}</div>
      <div class="stat-card__label">Umumiy ball</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__value">${displayStreak}</div>
      <div class="stat-card__label">Ketma-ket kun</div>
      ${displayStreak > 0 ? `<div class="progress-bar" style="margin-top:8px;"><div class="progress-bar__fill" style="width:${Math.min((displayStreak/30)*100,100)}%"></div></div>` : ''}
    </div>
    <div class="stat-card">
      <div class="stat-card__value">${totalTests}</div>
      <div class="stat-card__label">Yechilgan test</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__value">${avgScore}%</div>
      <div class="stat-card__label">O'rtacha natija</div>
    </div>
  `;
}

// ---- KITOBLAR ----
function _renderBooks(books) {
  const grid = document.getElementById('books-grid');
  if (!grid) return;

  if (!books.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><p class="empty-state__title">Kitoblar topilmadi</p></div>`;
    return;
  }

  grid.innerHTML = books.map(book => _bookCardHTML(book)).join('');

  grid.querySelectorAll('.book-card').forEach(card => {
    const id = card.dataset.bookId;
    const onClick = () => window.navigate('book', { id });
    const onKey   = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } };
    card.addEventListener('click',   onClick);
    card.addEventListener('keydown', onKey);
    _cleanup.push(
      () => card.removeEventListener('click',   onClick),
      () => card.removeEventListener('keydown', onKey),
    );
  });
}

function _bookCardHTML(book) {
  const cover = _getBookCover(book);
  return `
    <article
      class="book-card"
      data-book-id="${escapeHtml(String(book.id))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(book.title)}"
    >
      <div class="book-card__cover">
        ${cover
          ? `<img src="${escapeHtml(cover)}"
                  alt="${escapeHtml(book.title)}"
                  loading="lazy"
                  decoding="async"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
             />
             ${_coverPlaceholder(book).replace('display:flex', 'display:none').replace('class="book-card__cover-placeholder"', 'class="book-card__cover-placeholder" style="display:none"')}`
          : _coverPlaceholder(book)
        }
      </div>
      <div class="book-card__body">
        <div class="book-card__title">${escapeHtml(book.title)}</div>
        <div class="book-card__author">${escapeHtml(book.author || '')}</div>
      </div>
      <div class="book-card__footer">
        <span class="badge">${escapeHtml(book.category || 'Adabiyot')}</span>
        <span class="badge badge-primary">Test</span>
      </div>
    </article>
  `;
}

// ---- MINI LEADERBOARD ----
function _renderLeaderboardMini(leaders, currentUser) {
  const el = document.getElementById('leaderboard-mini');
  if (!el) return;

  if (!leaders.length) {
    el.innerHTML = `<div class="empty-state"><p class="empty-state__desc">Hali hech kim test yechmagan</p></div>`;
    return;
  }

  const sorted = [...leaders].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);

  el.innerHTML = `
    <table class="leaderboard-table" aria-label="Top 5 o'yinchilar">
      <tbody>
        ${sorted.map((u, i) => {
          const isMe    = currentUser && u.id === currentUser.id;
          const initial = (u.full_name || u.username || '?')[0].toUpperCase();
          return `
            <tr${isMe ? ' style="background:var(--ochre-light);"' : ''}>
              <td class="leaderboard__rank">${i + 1}</td>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:var(--paper-alt);border:1px solid var(--divider);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;color:var(--ochre);flex-shrink:0;">${escapeHtml(initial)}</div>
                  <span class="leaderboard__name">${escapeHtml(u.full_name || u.username)}${isMe ? ' <span class="badge badge-primary">Siz</span>' : ''}</span>
                </div>
              </td>
              <td class="leaderboard__score" style="text-align:right;">${u.score ?? 0}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ---- SKELETON ----
function _skeletonBookCards(n) {
  return Array.from({ length: n }, () => `
    <div class="book-card" style="cursor:default;pointer-events:none;">
      <div class="book-card__cover" style="background:var(--paper-alt);"></div>
      <div class="book-card__body">
        <div style="height:14px;background:var(--divider);border-radius:4px;width:80%;margin-bottom:8px;"></div>
        <div style="height:12px;background:var(--divider);border-radius:4px;width:50%;"></div>
      </div>
    </div>
  `).join('');
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
