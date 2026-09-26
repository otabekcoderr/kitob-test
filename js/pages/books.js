// ============================================================
// pages/books.js — Kitoblar katalogi (Progression & Lock integratsiyasi)
// ============================================================
import { getBooks } from '../db.js';
import { escapeHtml, truncate, renderBookCoverPlaceholder, getBookCoverUrl } from '../utils.js';
import { isBookUnlocked, evaluateMasteryTier, getUserLevel } from '../progression.js';

let _allBooks = [];
let _currentUser = null;
let _cleanup  = [];

function _getBookCover(book) {
  return getBookCoverUrl(book);
}

function _coverPlaceholder(book) {
  return renderBookCoverPlaceholder(book);
}

export async function render(container, { params, user }) {
  _currentUser = user;

  try {
    _allBooks = await getBooks();
  } catch {
    _allBooks = [];
  }

  const userLevel = getUserLevel(_currentUser?.score || 0);
  const isStudentPreview = (typeof localStorage !== 'undefined' && localStorage.getItem('kitobchi_preview_mode') === 'student');
  const isAdmin = _currentUser && (_currentUser.role === 'admin' && _currentUser.isAdmin === true);

  let unlockedCount = 0;
  let lockedCount = 0;
  _allBooks.forEach(b => {
    const u = isBookUnlocked(b, _currentUser);
    if (u.isUnlocked && (!u.isAdminBypass || !isStudentPreview)) {
      unlockedCount++;
    } else {
      lockedCount++;
    }
  });

  container.innerHTML = `
    <div class="page" id="books-page">
      <div class="container">

        <div style="margin-bottom:20px;">
          <h1 style="font-family:var(--font-display);font-size:clamp(1.7rem,3vw,2.7rem);font-weight:700;color:var(--ink);margin-bottom:6px;">Kitoblar</h1>
          <p style="color:var(--ink-muted);font-size:0.9375rem;">Bilimingizni sinab ko'ring — yangi darajalarga erishib, durdona asarlarni qulfdan chiqaring.</p>
        </div>

        <!-- Geymifikatsiya va Daraja Holati Banneri -->
        <div class="books-gamification-banner card animate-slide-up" style="margin-bottom:24px;padding:18px 22px;border:1.5px solid var(--ochre);background:var(--paper-alt);border-radius:var(--radius-lg);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
            <!-- Chap tomon: Foydalanuvchi darajasi va progress -->
            <div style="display:flex;align-items:center;gap:14px;min-width:240px;flex:1;">
              <div style="font-size:2rem;width:52px;height:52px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;border:2px solid var(--ochre);box-shadow:var(--shadow-sm);flex-shrink:0;">
                ${userLevel.emoji}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;flex-wrap:wrap;">
                  <h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;margin:0;color:var(--ink);">
                    ${user ? `${userLevel.level}-Daraja: ${escapeHtml(userLevel.title)}` : 'Mehmon rejimi (1-Daraja ochiq)'}
                  </h3>
                  ${user ? `<span class="badge badge-primary">${user.score || 0} XP</span>` : ''}
                </div>
                <p style="font-size:0.8125rem;color:var(--ink-muted);margin:0 0 6px 0;">
                  ${user ? userLevel.desc : 'Ro\'yxatdan o\'ting, testlar yechib XP to\'plang va yangi darajadagi kitoblarni oching!'}
                </p>
                ${user ? `
                  <div class="progress-bar" style="height:6px;max-width:320px;" role="progressbar" aria-valuenow="${userLevel.progressPct}" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar__fill" style="width:${userLevel.progressPct}%;background:linear-gradient(90deg,var(--ochre),var(--terracotta));"></div>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- O'ng tomon: Kitoblar qulf statistikasi va Admin rejimi tugmasi -->
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div class="gamification-stat-pill" style="display:flex;gap:10px;background:var(--surface);padding:8px 14px;border-radius:var(--radius-md);border:1px solid var(--divider);font-size:0.8125rem;">
                <span style="color:var(--success);font-weight:700;">🔓 ${unlockedCount} ta ochiq</span>
                <span style="color:var(--divider);">|</span>
                <span style="color:var(--ochre);font-weight:700;">🔒 ${lockedCount} ta qulflangan</span>
              </div>

              ${isAdmin ? `
                <button id="btn-toggle-preview-mode" class="btn btn-sm ${isStudentPreview ? 'btn-primary' : 'btn-outline'}" style="display:inline-flex;align-items:center;gap:6px;" title="O'quvchi va admin ko'rinishlari orasida almashish">
                  ${isStudentPreview ? '🎓 O\'quvchi ko\'rinishi (Faol)' : '👑 Admin ko\'rinishi'}
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Holat filtrlari (Ochiq / Qulflangan / Mastery) -->
        <div class="tabs books-status-tabs" id="status-tabs" role="tablist" aria-label="Holat bo'yicha" style="margin-bottom:16px;">
          <button class="tab tab--active status-tab" role="tab" data-status="all" aria-selected="true">Barchasi (${_allBooks.length})</button>
          <button class="tab status-tab" role="tab" data-status="unlocked" aria-selected="false">🔓 Ochiq (${unlockedCount})</button>
          <button class="tab status-tab" role="tab" data-status="locked" aria-selected="false">🔒 Qulflangan (${lockedCount})</button>
          ${user ? `<button class="tab status-tab" role="tab" data-status="mastery" aria-selected="false">⭐ Mening Mastery'm</button>` : ''}
        </div>

        <!-- Qidiruv va qiyinlik filtri -->
        <div class="books-filter-bar" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;align-items:flex-end;">
          <div style="flex:1;min-width:200px;">
            <label class="label" for="books-search">Qidirish</label>
            <input
              id="books-search"
              type="search"
              class="input"
              placeholder="Kitob nomi yoki muallif..."
              aria-label="Kitob qidirish"
              style="margin-top:6px;"
            >
          </div>
          <div>
            <label class="label" for="books-difficulty">Qiyinlik</label>
            <select id="books-difficulty" class="input" style="margin-top:6px;min-width:140px;">
              <option value="">Barchasi</option>
              <option value="Oson">Oson</option>
              <option value="O'rta">O'rta</option>
              <option value="Qiyin">Qiyin</option>
            </select>
          </div>
        </div>

        <!-- Kategoriyalar -->
        <div class="tabs books-category-tabs" id="category-tabs" role="tablist" aria-label="Kategoriyalar" style="margin-bottom:16px;">
          <button class="tab tab--active cat-tab" role="tab" data-category="all" aria-selected="true">Barcha janrlar</button>
          <button class="tab cat-tab" role="tab" data-category="badiiy"      aria-selected="false">Badiiy adabiyot</button>
          <button class="tab cat-tab" role="tab" data-category="tarixiy"     aria-selected="false">Tarixiy asarlar</button>
          <button class="tab cat-tab" role="tab" data-category="rivojlanish" aria-selected="false">Rivojlanish & Psixologiya</button>
          <button class="tab cat-tab" role="tab" data-category="jahon"       aria-selected="false">Jahon durdonalari</button>
          <button class="tab cat-tab" role="tab" data-category="mumtoz"      aria-selected="false">Mumtoz meros</button>
        </div>

        <!-- Natija soni -->
        <p id="books-count" style="font-size:0.8125rem;color:var(--ink-muted);margin-bottom:20px;"></p>

        <!-- Kitoblar gridi -->
        <div class="grid grid-auto" id="books-grid">
          ${_skeletonBookCards(8)}
        </div>

      </div>
    </div>
  `;

  _renderBooks(_getFilteredBooks());
  _bindEvents(container, { params, user });
}

function _renderBooks(books) {
  const grid     = document.getElementById('books-grid');
  const countEl  = document.getElementById('books-count');
  if (!grid) return;

  if (countEl) {
    countEl.textContent = books.length
      ? `${books.length} ta kitob topildi`
      : '';
  }

  if (!books.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>
        <p class="empty-state__title">Kitob topilmadi</p>
        <p class="empty-state__desc">Boshqa kalit so'z yoki filtr bilan qidiring.</p>
        <button id="clear-filter" class="btn btn-outline" style="margin-top:12px;">Filtrni tozalash</button>
      </div>
    `;
    document.getElementById('clear-filter')?.addEventListener('click', _clearFilter);
    return;
  }

  grid.innerHTML = books.map(book => _bookCardHTML(book, _currentUser)).join('');

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
  const isAdminBypass = !!unlock.isAdminBypass;

  // Foydalanuvchining ushbu kitob bo'yicha mastery darajasi
  let masteryBadge = '';
  if (user?.id) {
    try {
      const rawM = localStorage.getItem(`kitobchi_mastery_${user.id}`);
      if (rawM) {
        const mData = JSON.parse(rawM);
        const bM = mData[String(book.id)];
        if (bM && bM.bestPercentage > 0) {
          const tier = evaluateMasteryTier(bM.bestPercentage);
          masteryBadge = `<span class="badge badge-mastery ${tier.colorClass}" title="${tier.tier} (${bM.bestPercentage}%)">${tier.emoji} ${bM.bestPercentage}%</span>`;
        }
      }
    } catch {}
  }

  // Yuqori o'ng burchakdagi status nishoni
  let topBadge = '';
  if (isLocked) {
    topBadge = `
      <div class="book-card__lock-badge ${unlock.isMystery ? 'book-card__lock-badge--mystery' : ''}">
        <span>${unlock.isMystery ? '⚡ 7 kun streak' : `🔒 ${unlock.requiredLevel}-daraja`}</span>
      </div>
    `;
  } else if (isAdminBypass) {
    topBadge = `
      <div class="book-card__admin-badge" title="Admin ruxsati bilan ochilgan (Aslida ${unlock.requiredLevel}-daraja)">
        <span>👑 Admin (${unlock.requiredLevel}-d.)</span>
      </div>
    `;
  } else {
    topBadge = `
      <div class="book-card__unlocked-badge">
        <span>🔓 Ochiq</span>
      </div>
    `;
  }

  return `
    <article
      class="book-card ${isLocked ? 'book-card--locked' : 'book-card--unlocked'}"
      data-book-id="${escapeHtml(String(book.id))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(book.title)} — ${escapeHtml(book.author || '')}${isLocked ? ` (Qulflangan: ${unlock.requiredLevel}-daraja talab qilinadi)` : ''}"
    >
      <div class="book-card__cover">
        <div class="book-cover-fallback-wrap" style="position:absolute;inset:0;z-index:1;">
          ${renderBookCoverPlaceholder(book)}
        </div>
        ${cover ? `
          <img src="${escapeHtml(cover)}"
               alt="${escapeHtml(book.title)}"
               class="book-card__img"
               loading="lazy"
               decoding="async"
               style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;"
          />
        ` : ''}

        ${topBadge}

        ${isLocked ? `
          <div class="book-card__lock-overlay">
            <div style="height:20px;"></div>
            <div class="book-card__lock-center">
              <div class="book-card__lock-icon-circle">🔒</div>
              <span class="book-card__lock-req-text">${unlock.isMystery ? '7 kunlik streak talabi' : `${unlock.requiredLevel}-daraja talabi`}</span>
            </div>
            <div class="book-card__lock-progress">
              <div class="book-card__lock-hint">
                <span>${user ? `${user.score || 0} XP` : 'Mehmon'}</span>
                <span>${unlock.requiredXP} XP talab</span>
              </div>
              <div class="book-card__lock-progress-bar">
                <div class="book-card__lock-progress-fill" style="width:${unlock.progressPct}%"></div>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
      <div class="book-card__body">
        <div class="book-card__title">${escapeHtml(book.title)}</div>
        <div class="book-card__author">${escapeHtml(book.author || '')}</div>
        ${book.description
          ? `<p class="book-card__desc">${escapeHtml(truncate(book.description, 80))}</p>`
          : ''}
      </div>
      <div class="book-card__footer">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="badge">${escapeHtml(book.category || book.genre || 'Adabiyot')}</span>
          ${book.difficulty ? `<span class="badge">${escapeHtml(book.difficulty)}</span>` : ''}
          <span class="badge ${isLocked ? '' : 'badge-primary'}" style="font-size:0.72rem;">
            ${isLocked ? `🔒 ${unlock.requiredLevel}-d.` : (isAdminBypass ? '👑 Admin' : '✓ Ochiq')}
          </span>
        </div>
        ${masteryBadge}
      </div>
    </article>
  `;
}

function _getFilteredBooks() {
  const query       = (document.getElementById('books-search')?.value || '').toLowerCase().trim();
  const activeCat   = document.querySelector('.cat-tab.tab--active')?.dataset.category || 'all';
  const activeStatus= document.querySelector('.status-tab.tab--active')?.dataset.status || 'all';
  const difficulty  = document.getElementById('books-difficulty')?.value || '';

  // Mastery ma'lumotlari keshini tekshiramiz
  let userMasteryData = null;
  if (activeStatus === 'mastery' && _currentUser?.id) {
    try {
      const rawM = localStorage.getItem(`kitobchi_mastery_${_currentUser.id}`);
      if (rawM) userMasteryData = JSON.parse(rawM);
    } catch {}
  }

  return _allBooks.filter(book => {
    // 1. Status bo'yicha filtr (Ochiq / Qulflangan / Mastery)
    if (activeStatus === 'unlocked') {
      const unlock = isBookUnlocked(book, _currentUser);
      if (!unlock.isUnlocked) return false;
    } else if (activeStatus === 'locked') {
      const unlock = isBookUnlocked(book, _currentUser);
      if (unlock.isUnlocked) return false;
    } else if (activeStatus === 'mastery') {
      if (!userMasteryData) return false;
      const bM = userMasteryData[String(book.id)];
      if (!bM || !bM.bestPercentage || bM.bestPercentage <= 0) return false;
    }

    // 2. Kategoriya bo'yicha filtr
    const genre   = (book.genre || '').toLowerCase();
    const title   = (book.title || '').toLowerCase();
    const author  = (book.author || '').toLowerCase();
    const cat     = (book.category || '').toLowerCase();
    const allText = `${title} ${author} ${genre} ${cat}`;

    let matchCat = activeCat === 'all';
    if (!matchCat) {
      if (activeCat === 'badiiy') {
        matchCat = genre.includes('roman') || genre.includes('qissa') || genre.includes('hikoya') || genre.includes('satira') || cat.includes('adabiyot');
      } else if (activeCat === 'tarixiy') {
        matchCat = genre.includes('tarix') || allText.includes('temur') || allText.includes('bobur') || allText.includes('yulduzli tunlar') || allText.includes('ulug\'bek') || allText.includes('muqanna');
      } else if (activeCat === 'rivojlanish') {
        matchCat = genre.includes('rivojlanish') || genre.includes('psixologiya') || genre.includes('moliya') || genre.includes('salomatlik') || genre.includes('ilm');
      } else if (activeCat === 'jahon') {
        matchCat = genre.includes('distopiya') || genre.includes('ekzistensial') || allText.includes('orwell') || allText.includes('koelo') || allText.includes('dostoyevskiy') || allText.includes('ekzyuperi') || allText.includes('xaminguey') || allText.includes('london');
      } else if (activeCat === 'mumtoz') {
        matchCat = genre.includes('mumtoz') || genre.includes('doston') || genre.includes('pandnoma') || genre.includes('tasavvuf') || allText.includes('navoiy') || allText.includes('koshg\'ariy') || allText.includes('yugnakiy') || allText.includes('nizomiy');
      } else {
        matchCat = allText.includes(activeCat.toLowerCase());
      }
    }

    // 3. Qiyinlik bo'yicha filtr
    const matchDiff = !difficulty || book.difficulty === difficulty;

    // 4. Qidiruv so'rovi
    const matchQ = !query ||
      title.includes(query) ||
      author.includes(query) ||
      genre.includes(query);

    return matchCat && matchDiff && matchQ;
  });
}

function _clearFilter() {
  const searchEl = document.getElementById('books-search');
  const diffEl   = document.getElementById('books-difficulty');
  if (searchEl) searchEl.value = '';
  if (diffEl)   diffEl.value   = '';

  document.querySelectorAll('.cat-tab').forEach(t => {
    const isAll = t.dataset.category === 'all';
    t.classList.toggle('tab--active', isAll);
    t.setAttribute('aria-selected', String(isAll));
  });

  document.querySelectorAll('.status-tab').forEach(t => {
    const isAll = t.dataset.status === 'all';
    t.classList.toggle('tab--active', isAll);
    t.setAttribute('aria-selected', String(isAll));
  });

  _renderBooks(_allBooks);
}

function _bindEvents(container, context) {
  // Qidiruv
  document.getElementById('books-search')?.addEventListener('input', () => _renderBooks(_getFilteredBooks()));
  document.getElementById('books-difficulty')?.addEventListener('change', () => _renderBooks(_getFilteredBooks()));

  // Admin o'quvchi ko'rinishini almashtirish
  document.getElementById('btn-toggle-preview-mode')?.addEventListener('click', () => {
    const cur = localStorage.getItem('kitobchi_preview_mode');
    if (cur === 'student') {
      localStorage.removeItem('kitobchi_preview_mode');
    } else {
      localStorage.setItem('kitobchi_preview_mode', 'student');
    }
    render(container, context);
  });

  // Status tablar (Ochiq / Qulflangan / Mastery)
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach(t => {
        t.classList.remove('tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('tab--active');
      tab.setAttribute('aria-selected', 'true');
      _renderBooks(_getFilteredBooks());
    });
  });

  // Kategoriya tablar
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(t => {
        t.classList.remove('tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('tab--active');
      tab.setAttribute('aria-selected', 'true');
      _renderBooks(_getFilteredBooks());
    });
  });

  // Jonli kitoblar yangilanishini tinglash
  const onBooksUpdated = async () => {
    try {
      _allBooks = await getBooks(true);
      _renderBooks(_getFilteredBooks());
    } catch { /* ignore */ }
  };
  window.addEventListener('kitobchi_books_updated', onBooksUpdated);
  _cleanup.push(() => window.removeEventListener('kitobchi_books_updated', onBooksUpdated));
}

function _skeletonBookCards(n) {
  return Array.from({ length: n }, () => `
    <div class="book-card skeleton-card" style="cursor:default;pointer-events:none;">
      <div class="book-card__cover skeleton"></div>
      <div class="book-card__body">
        <div class="skeleton" style="height:14px;width:80%;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:12px;width:50%;"></div>
      </div>
    </div>
  `).join('');
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
  _allBooks = [];
  _currentUser = null;
}
