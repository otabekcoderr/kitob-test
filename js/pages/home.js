// ============================================================
// pages/home.js — Bosh sahifa / Editorial Dashboard
// ============================================================
import { getBooks, getLeaderboard, getUserResults, getStreakStatus } from '../db.js';
import { escapeHtml, truncate, today } from '../utils.js';
import { getUserLevel, getNextUnlockTarget, getDailyMissions, isBookUnlocked } from '../progression.js';

let _cleanup = [];
let _currentUser = null;

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
  _currentUser = user;
  const userLevel = getUserLevel(user?.score || 0);

  container.innerHTML = `
    <div class="page" id="home-page">
      <div class="container">

        <!-- Hero & Level Bar -->
        <section class="hero animate-fade-in" style="margin-bottom:28px;">
          ${user
            ? `<div class="hero__user-row" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
                 <div>
                   <p class="hero__eyebrow">Xush kelibsiz, kitobxon</p>
                   <h1 class="hero__title" style="margin-bottom:4px;">${escapeHtml(user.fullName || user.username)}</h1>
                   <p class="hero__desc" style="margin:0;">Adabiy sayohatingiz davom etmoqda. Bilimingizni mustahkamlang.</p>
                 </div>
                 <div class="user-level-badge-card" style="padding:10px 16px;border:1px solid var(--ochre);border-radius:var(--radius-md);background:var(--surface);display:flex;align-items:center;gap:10px;box-shadow:var(--shadow-sm);">
                   <span style="font-size:1.75rem;">${userLevel.emoji}</span>
                   <div>
                     <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--ochre);font-weight:700;">${userLevel.level}-Daraja</div>
                     <div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;color:var(--ink);">${escapeHtml(userLevel.title)}</div>
                   </div>
                 </div>
               </div>

               <!-- Level XP Progress Bar -->
               <div class="user-xp-bar-wrap" style="margin-top:20px;padding:16px;border:1px solid var(--divider);border-radius:var(--radius-md);background:var(--paper-alt);">
                 <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.875rem;margin-bottom:6px;">
                   <span style="color:var(--ink);font-weight:600;">Daraja progressi</span>
                   <span style="color:var(--ochre);font-weight:700;">${user.score || 0} / ${userLevel.isMaxLevel ? userLevel.currentLevelXP : userLevel.nextLevelXP} XP</span>
                 </div>
                 <div class="progress-bar" style="height:8px;margin-bottom:6px;" role="progressbar" aria-valuenow="${userLevel.progressPct}" aria-valuemin="0" aria-valuemax="100">
                   <div class="progress-bar__fill" style="width:${userLevel.progressPct}%;background:linear-gradient(90deg,var(--ochre),var(--terracotta));"></div>
                 </div>
                 <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--ink-muted);">
                   <span>${userLevel.desc}</span>
                   <span>${userLevel.isMaxLevel ? 'Eng oliy daraja!' : `Keyingi darajagacha yana ${userLevel.remainingXP} XP`}</span>
                 </div>
               </div>`
            : `<p class="hero__eyebrow">Adabiyot va test platformasi</p>
               <h1 class="hero__title">Kitobchi</h1>
               <p class="hero__desc">O'zbek adabiyotini o'rganish, test yechish va darajangizni oshirish uchun zamonaviy platforma.</p>
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;">
                 <a href="#register" class="btn btn-primary btn-lg">Boshlash</a>
                 <a href="#books"    class="btn btn-outline btn-lg">Kitoblar</a>
               </div>`
          }
        </section>

        <!-- Keyingi ochiladigan kitob (Next Unlock Navigator) -->
        <div id="next-unlock-wrap"></div>

        <!-- Kunlik Missiyalar -->
        <div id="daily-missions-wrap"></div>

        <!-- Streak uzilganligi haqida bildirishnoma -->
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
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Ball / XP</div></div>
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Streak</div></div>
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Testlar</div></div>
            <div class="stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">O'rtacha</div></div>
          </div>
        </section>` : ''}

        <!-- Tanlangan kitoblar -->
        <section class="section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 class="section-heading" style="margin-bottom:0;border-bottom:none;padding-bottom:0;">Kitoblar</h2>
            <a href="#books" class="btn btn-ghost btn-sm">Barchasini ko'rish →</a>
          </div>
          <div class="grid grid-auto" id="books-grid">
            ${_skeletonBookCards(6)}
          </div>
        </section>

        <!-- Mini Leaderboard -->
        <section class="section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 class="section-heading" style="margin-bottom:0;border-bottom:none;padding-bottom:0;">Reyting</h2>
            <a href="#leaderboard" class="btn btn-ghost btn-sm">To'liq jadval →</a>
          </div>
          <div class="card" id="leaderboard-mini">
            <div class="loading-state"><div class="spinner spinner--sm"></div><span>Yuklanmoqda...</span></div>
          </div>
        </section>

      </div>
    </div>
  `;

  // Ma'lumotlarni mustaqil va tezkor yuklash
  try {
    // 1. Kunlik missiyalarni 0ms kechikishsiz darhol chiqarish
    try {
      const missions = getDailyMissions(user);
      _renderDailyMissions(missions, user);
    } catch (err) {
      console.warn('[home] missions render xatosi:', err);
    }

    // 2. Kitoblar, Keyingi ochiladigan asar va Bugungi sinovni zudlik bilan render qilish
    getBooks().then(booksList => {
      if (!booksList || !booksList.length) return;
      const nextTarget = getNextUnlockTarget(booksList, user);
      _renderNextUnlock(nextTarget, user);

      const daily = _getDailyChallenge(booksList);
      _renderDailyChallenge(daily);

      _renderBooks(booksList.slice(0, 6), user);
    }).catch(err => {
      console.warn('[home] books render xatosi:', err);
    });

    // 3. Streak va Foydalanuvchi statistikasini yuklash
    (user ? getUserResults(user.id).catch(() => []) : Promise.resolve([])).then(async (resultList) => {
      try {
        const booksList = await getBooks().catch(() => []);
        const daily = _getDailyChallenge(booksList);
        const streakStatus = await getStreakStatus(user, resultList);
        _renderStreakWidget(streakStatus, user, daily);
        if (user) _renderStats(user, resultList, streakStatus.currentStreak);
      } catch (err) {
        console.warn('[home] streak render xatosi:', err);
      }
    });

    // 4. Mini reyting jadvalini mustaqil yuklash
    getLeaderboard(5).then(leaderList => {
      _renderLeaderboardMini(leaderList, user);
    }).catch(err => {
      console.warn('[home] leaderboard render xatosi:', err);
      _renderLeaderboardMini([], user);
    });

    // Jonli kitoblar yangilanishini tinglash
    const onBooksUpdated = async () => {
      try {
        const fresh = await getBooks(true);
        _renderBooks(fresh.slice(0, 6), user);
        _renderDailyChallenge(_getDailyChallenge(fresh));
        _renderNextUnlock(getNextUnlockTarget(fresh, user), user);
      } catch { /* ignore */ }
    };
    window.addEventListener('kitobchi_books_updated', onBooksUpdated);
    _cleanup.push(() => window.removeEventListener('kitobchi_books_updated', onBooksUpdated));

    // Jonli reyting yangilanishini tinglash
    const onLeaderboardUpdated = (e) => {
      const fresh = Array.isArray(e.detail) ? e.detail : [];
      if (fresh.length > 0) {
        _renderLeaderboardMini(fresh, user);
      }
    };
    window.addEventListener('kitobchi_leaderboard_updated', onLeaderboardUpdated);
    _cleanup.push(() => window.removeEventListener('kitobchi_leaderboard_updated', onLeaderboardUpdated));

  } catch (err) {
    console.error('[home] Yuklash xatosi:', err);
  }
}

// ---- KEYINGI OCHILADIGAN KITOB (NEXT UNLOCK) ----
function _renderNextUnlock(target, user) {
  const wrap = document.getElementById('next-unlock-wrap');
  if (!wrap) return;

  if (!target || !target.book) {
    wrap.innerHTML = '';
    return;
  }

  const { book, status } = target;
  const cover = _getBookCover(book);
  const initial = (book.title || '?')[0].toUpperCase();

  wrap.innerHTML = `
    <section class="section animate-slide-up" id="next-unlock-section" aria-label="Keyingi ochiladigan asar" style="margin-bottom:28px;">
      <div class="next-unlock-card card" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:22px 24px;border:1.5px solid var(--ochre);background:var(--paper-alt);">
        <div class="next-unlock__cover" style="width:72px;height:104px;border-radius:var(--radius-sm);overflow:hidden;flex-shrink:0;box-shadow:var(--shadow-sm);background:var(--surface);display:flex;align-items:center;justify-content:center;">
          ${cover
            ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(book.title)}" style="width:100%;height:100%;object-fit:cover;">`
            : `<div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--ochre);">${escapeHtml(initial)}</div>`
          }
        </div>
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <span class="badge badge-primary">🔓 Keyingi maqsad</span>
            <span style="font-size:0.8125rem;color:var(--ochre);font-weight:700;">${status.requiredLevel}-daraja talabi</span>
          </div>
          <h3 style="font-family:var(--font-display);font-size:1.2rem;font-weight:700;margin:0 0 4px 0;color:var(--ink);">${escapeHtml(book.title)}</h3>
          <p style="font-size:0.875rem;color:var(--ink-muted);margin:0 0 12px 0;">${escapeHtml(book.author || '')}</p>
          <div class="progress-bar" style="height:8px;margin-bottom:6px;" role="progressbar" aria-valuenow="${status.progressPct}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar__fill" style="width:${status.progressPct}%;background:linear-gradient(90deg,var(--ochre),var(--terracotta));"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8125rem;color:var(--ink-muted);">
            <span>Sizda: <strong>${user ? (user.score || 0) : 0} XP</strong> / ${status.requiredXP} XP</span>
            <span style="color:var(--ochre);font-weight:700;">Yana <strong>${status.remainingXP} XP</strong> kerak</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="#book?id=${escapeHtml(String(book.id))}" class="btn btn-primary btn-sm">Asar haqida bilish</a>
          <a href="#books" class="btn btn-ghost btn-sm">Boshqa ochiq kitoblar</a>
        </div>
      </div>
    </section>
  `;
}

// ---- KUNLIK MISSIYALAR (DAILY MISSIONS) ----
function _renderDailyMissions(missions, user) {
  const wrap = document.getElementById('daily-missions-wrap');
  if (!wrap) return;

  if (!missions || !missions.length) {
    wrap.innerHTML = '';
    return;
  }

  const completedCount = missions.filter(m => m.completed).length;

  wrap.innerHTML = `
    <section class="section animate-slide-up" id="daily-missions-section" aria-label="Kunlik missiyalar" style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <h2 class="section-heading" style="margin-bottom:0;border-bottom:none;padding-bottom:0;">Kunlik missiyalar</h2>
          <span class="badge ${completedCount === 3 ? 'badge-success' : ''}" style="font-size:0.75rem;">${completedCount}/3 bajarildi</span>
        </div>
        <span style="font-size:0.8125rem;color:var(--ink-muted);">Har kuni yangilanadi</span>
      </div>
      <div class="missions-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
        ${missions.map(m => `
          <div class="mission-card card ${m.completed ? 'mission-card--completed' : ''}" style="padding:16px 18px;display:flex;align-items:center;gap:14px;border:1px solid ${m.completed ? 'var(--success)' : 'var(--divider)'};background:var(--surface);">
            <div class="mission-icon" style="font-size:1.4rem;width:42px;height:42px;border-radius:50%;background:${m.completed ? 'var(--success-light)' : 'var(--paper-alt)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${m.completed ? '✓' : m.icon}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                <h4 style="font-size:0.9375rem;font-weight:700;margin:0;color:var(--ink);">${escapeHtml(m.title)}</h4>
                <span class="badge ${m.completed ? 'badge-success' : 'badge-primary'}" style="font-size:0.7rem;">+${m.xpReward} XP</span>
              </div>
              <p style="font-size:0.8125rem;color:var(--ink-muted);margin:0;line-height:1.4;">${escapeHtml(m.desc)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

// ---- KUNLIK STREAK WIDGET & ANIMATSIYA ----
function _renderStreakWidget(streakStatus, user, dailyBook) {
  const widgetWrap = document.getElementById('streak-widget-wrap');
  const brokenWrap = document.getElementById('streak-broken-notice-wrap');
  if (!widgetWrap) return;

  const dailyId = dailyBook ? String(dailyBook.id) : '';

  // 1. Agar streak buzilgan bo'lsa va hali ko'rsatilmagan bo'lsa
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

      const dismissBtn = document.getElementById('btn-dismiss-broken-streak');
      const bannerEl = document.getElementById('streak-broken-banner');
      if (dismissBtn && bannerEl) {
        dismissBtn.addEventListener('click', () => {
          localStorage.setItem(ackKey, todayStr);
          bannerEl.style.opacity = '0';
          bannerEl.style.transform = 'translateY(-8px)';
          setTimeout(() => bannerEl.remove(), 250);
        });
      }
    }
  }

  const streakDays = streakStatus.weekDays && streakStatus.weekDays.length ? streakStatus.weekDays : _buildDefaultWeekDays(streakStatus);
  const currentStreak = streakStatus.currentStreak;
  const isCompletedToday = streakStatus.isCompletedToday;

  let streakTitle = '0 kunlik zanjir';
  let streakDesc = 'Bugungi testni yeching va zanjirni boshlang!';

  if (currentStreak > 0) {
    streakTitle = `${currentStreak} kunlik faol streak 🔥`;
    streakDesc = isCompletedToday
      ? 'Bugungi zanjir uzilmadi! Ajoyib matonat ko\'rsatdingiz.'
      : 'Bugun hali test yechilmadi. Zanjirni saqlab qolish uchun 1 ta test yeching!';
  }

  widgetWrap.innerHTML = `
    <div class="streak-card card ${isCompletedToday ? 'streak-card--completed' : ''} animate-slide-up">
      <div class="streak-card__header">
        <div class="streak-card__flame-wrap">
          <div class="streak-card__flame ${currentStreak > 0 ? 'streak-card__flame--active' : 'streak-card__flame--idle'}">
            <span class="streak-card__flame-emoji">${currentStreak > 0 ? '🔥' : '🕯️'}</span>
            ${currentStreak > 0 ? `
              <div class="streak-flame-sparks" aria-hidden="true">
                <span>✦</span><span>✦</span><span>✦</span>
              </div>` : ''}
          </div>
          <div>
            <h3 class="streak-card__title">
              <span class="streak-card__count ${currentStreak > 0 ? 'counter-bounce' : ''}">${currentStreak}</span>
              <span class="streak-card__unit">kunlik faol streak</span>
            </h3>
            <p class="streak-card__subtitle">${escapeHtml(streakDesc)}</p>
          </div>
        </div>
        <div class="streak-card__action">
          ${isCompletedToday ? `
            <span class="streak-card__badge-done">BUGUN YAKUNLANDI ✓</span>
          ` : `
            <a href="${dailyId ? `#book?id=${escapeHtml(dailyId)}` : '#books'}" class="btn btn-primary btn-sm pulse-button">
              Testni boshlash
            </a>
          `}
        </div>
      </div>

      <div class="streak-card__divider"></div>

      <div class="streak-week">
        <div class="streak-week__label">Haftalik faollik taqvimi</div>
        <div class="streak-week__grid" role="list" aria-label="Haftalik faollik taqvimi">
          ${streakDays.map((day, idx) => {
            const isActive = Boolean(day.isActive || day.isCompleted);
            const isToday = Boolean(day.isToday);
            const isMissed = Boolean(day.isMissed || (day.isPast && !isActive));
            const dayLabel = day.name || day.label || '';
            const dayNumber = day.dayNum !== undefined ? day.dayNum : '';
            const dateStr = day.date || '';

            let titleAttr = `${dateStr}: Reja`;
            if (isActive) titleAttr = `${dateStr}: Test muvaffaqiyatli topshirilgan ✓`;
            else if (isToday) titleAttr = `${dateStr}: Bugungi test kutilmoqda`;
            else if (isMissed) titleAttr = `${dateStr}: Test yechilmagan`;

            return `
              <div class="streak-day ${isActive ? 'streak-day--active' : ''} ${isToday ? 'streak-day--today' : ''} ${isMissed ? 'streak-day--missed' : ''}"
                   style="animation-delay: ${idx * 0.05}s;"
                   role="listitem">
                <span class="streak-day__name">${escapeHtml(dayLabel)}</span>
                <div class="streak-day__circle" title="${escapeHtml(titleAttr)}">
                  ${isActive ? '<span class="streak-day__flame">🔥</span>' : escapeHtml(String(dayNumber))}
                </div>
                ${isToday ? '<span class="streak-day__today-indicator">Bugun</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function _buildDefaultWeekDays(streakStatus) {
  const days = [];
  const dayNames = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  const fullDayNames = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMon);

  const todayStr = today();
  const activeDates = Array.isArray(streakStatus?.activeDates) ? streakStatus.activeDates : [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = formatDate(d);

    const isToday = dStr === todayStr;
    const isCompleted = activeDates.includes(dStr) || (isToday && streakStatus?.isCompletedToday);
    const isPast = dStr < todayStr;
    const isMissed = isPast && !isCompleted;

    days.push({
      date: dStr,
      name: dayNames[i],
      fullName: fullDayNames[i],
      label: dayNames[i],
      dayNum: d.getDate(),
      isToday,
      isActive: isCompleted,
      isCompleted,
      isMissed,
      isPast
    });
  }
  return days;
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
      <div class="daily-challenge__body">
        <div class="daily-challenge__label">Bugungi sinov</div>
        <div class="daily-challenge__title">${escapeHtml(book.title)}</div>
        <div class="daily-challenge__author">${escapeHtml(book.author || '')}</div>
      </div>
      <a href="#book?id=${escapeHtml(String(book.id))}" class="btn btn-primary btn-sm">
        Sinovni boshlash
      </a>
    </div>
  `;
}

// ---- STATISTIKA ----
function _renderStats(user, results, currentStreak) {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const totalTests = results.length;
  const avgScore = totalTests > 0
    ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / totalTests)
    : 0;

  const displayStreak = currentStreak !== null ? currentStreak : (user.streak ?? 0);

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card__value">${user.score ?? 0}</div>
      <div class="stat-card__label">Umumiy ball / XP</div>
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
function _renderBooks(books, user) {
  const grid = document.getElementById('books-grid');
  if (!grid) return;

  if (!books.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><p class="empty-state__title">Kitoblar topilmadi</p></div>`;
    return;
  }

  grid.innerHTML = books.map(book => _bookCardHTML(book, user)).join('');

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

function _bookCardHTML(book, user) {
  const cover = _getBookCover(book);
  const unlock = isBookUnlocked(book, user);
  const isLocked = !unlock.isUnlocked;

  return `
    <article
      class="book-card ${isLocked ? 'book-card--locked' : ''}"
      data-book-id="${escapeHtml(String(book.id))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(book.title)}${isLocked ? ` (Qulflangan: ${unlock.requiredLevel}-daraja)` : ''}"
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

        ${isLocked ? `
          <div class="book-card__lock-overlay">
            <div class="book-card__lock-badge">
              <span class="lock-icon">🔒</span>
              <span class="lock-text">${unlock.isMystery ? '7 kun streak' : `${unlock.requiredLevel}-daraja`}</span>
            </div>
            <div class="book-card__lock-progress">
              <div class="book-card__lock-progress-bar" style="width:${unlock.progressPct}%"></div>
            </div>
            <span class="book-card__lock-hint">${user ? `${user.score || 0}/${unlock.requiredXP} XP` : 'Tizimga kiring'}</span>
          </div>
        ` : ''}
      </div>
      <div class="book-card__body">
        <div class="book-card__title">${escapeHtml(book.title)}</div>
        <div class="book-card__author">${escapeHtml(book.author || '')}</div>
      </div>
      <div class="book-card__footer">
        <span class="badge">${escapeHtml(book.category || book.genre || 'Adabiyot')}</span>
        <span class="badge ${isLocked ? '' : 'badge-primary'}">${isLocked ? '🔒 Qulflangan' : 'Test'}</span>
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
          const isMe      = currentUser && (u.id === currentUser.id || (u.username && u.username === currentUser.username));
          const initial   = (u.full_name || u.username || '?')[0].toUpperCase();
          const avatarImg = u.avatarImage || (u.avatar_url && (u.avatar_url.startsWith('http') || u.avatar_url.startsWith('data:image/')) ? u.avatar_url : null);
          const rank = i + 1;
          const rankBadge = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
          return `
            <tr${isMe ? ' style="background:var(--ochre-light);font-weight:600;"' : ''}>
              <td class="leaderboard__rank" style="width:36px;text-align:center;">${rankBadge}</td>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:var(--paper-alt);border:1px solid ${isMe ? 'var(--ochre)' : 'var(--divider)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;color:var(--ochre);flex-shrink:0;overflow:hidden;">
                    ${avatarImg
                      ? `<img src="${escapeHtml(avatarImg)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
                      : (u.avatar || u.avatar_url || escapeHtml(initial))
                    }
                  </div>
                  <span class="leaderboard__name">${escapeHtml(u.full_name || u.username)}${isMe ? ' <span class="badge badge-primary" style="font-size:.65rem;margin-left:4px;">Siz</span>' : ''}</span>
                </div>
              </td>
              <td class="leaderboard__score" style="text-align:right;font-weight:700;color:var(--ochre);">${u.score ?? 0} ball</td>
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
  _currentUser = null;
}
