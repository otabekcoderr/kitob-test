// ============================================================
// pages/books.js — Kitoblar ro'yxati + filter + qidiruv
// ============================================================
import { getBooks }            from '../db.js';
import { escapeHtml, truncate } from '../utils.js';
import { navigate }             from '../app.js';

let _allBooks = [];
let _cleanup  = [];

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page" id="books-page">
      <div class="container">

        <div class="books-header animate-slide-up">
          <h1 class="books-header__title">📚 Kitoblar</h1>
          <p class="books-header__sub">Kitobni tanlang va bilimingizni sinab ko'ring</p>
        </div>

        <!-- Filter va qidiruv -->
        <div class="books-toolbar animate-slide-up">
          <div class="input-wrapper books-toolbar__search">
            <span class="input-icon" aria-hidden="true">🔍</span>
            <input
              id="books-search"
              type="search"
              class="input"
              placeholder="Kitob yoki muallif qidirish..."
              aria-label="Kitob qidirish"
              maxlength="100"
            />
          </div>

          <div class="tabs books-toolbar__tabs" id="category-tabs" role="tablist" aria-label="Kategoriya filter">
            <button class="tab tab--active" role="tab" data-category="all" aria-selected="true">Barchasi</button>
          </div>
        </div>

        <!-- Natijalar soni -->
        <p class="books-count" id="books-count" aria-live="polite"></p>

        <!-- Kitoblar grid -->
        <div class="grid grid-auto stagger" id="books-grid" aria-label="Kitoblar ro'yxati">
          ${_skeletonCards(8)}
        </div>

      </div>
    </div>
  `;

  _addStyles();

  try {
    _allBooks = await getBooks();
    _renderCategoryTabs(_allBooks);
    _renderBooks(_allBooks);
    _bindEvents();
  } catch (err) {
    console.error('[books] Yuklash xatosi:', err);
    document.getElementById('books-grid').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <p class="empty-state__title">Kitoblar yuklanmadi</p>
        <p class="empty-state__desc">Internet ulanishini tekshiring va sahifani yangilang.</p>
      </div>
    `;
  }
}

function _renderCategoryTabs(books) {
  const tabsEl = document.getElementById('category-tabs');
  if (!tabsEl) return;

  // Noyob kategoriyalar
  const categories = [...new Set(
    books.map(b => b.category || 'Adabiyot').filter(Boolean)
  )].sort();

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className    = 'tab';
    btn.role         = 'tab';
    btn.dataset.category = cat;
    btn.textContent  = cat;
    btn.setAttribute('aria-selected', 'false');
    tabsEl.appendChild(btn);
  });
}

function _renderBooks(books) {
  const grid    = document.getElementById('books-grid');
  const countEl = document.getElementById('books-count');
  if (!grid) return;

  if (countEl) {
    countEl.textContent = books.length
      ? `${books.length} ta kitob topildi`
      : '';
  }

  if (!books.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon">🔍</div>
        <p class="empty-state__title">Kitob topilmadi</p>
        <p class="empty-state__desc">Boshqa kalit so'z bilan qidiring yoki filtrni tozalang.</p>
        <button id="clear-filter" class="btn btn-outline mt-4">Filterni tozalash</button>
      </div>
    `;
    document.getElementById('clear-filter')?.addEventListener('click', _clearFilter);
    return;
  }

  grid.innerHTML = books.map(book => _bookCardHTML(book)).join('');

  grid.querySelectorAll('.book-card').forEach(card => {
    const id = card.dataset.bookId;
    const onClick = () => navigate('book', { id });
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
  const cover = book.cover_url || book.cover || '';
  return `
    <article
      class="book-card"
      data-book-id="${escapeHtml(String(book.id))}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(book.title)} — ${escapeHtml(book.author || '')}"
    >
      <div class="book-card__cover">
        ${cover
          ? `<img src="${escapeHtml(cover)}"
                  alt=""
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
        ${book.description
          ? `<p class="book-card__desc">${escapeHtml(truncate(book.description, 80))}</p>`
          : ''}
      </div>
      <div class="book-card__footer">
        <span class="badge">${escapeHtml(book.category || 'Adabiyot')}</span>
        <span class="badge badge-primary">Test →</span>
      </div>
    </article>
  `;
}

function _getFilteredBooks() {
  const query    = (document.getElementById('books-search')?.value || '').toLowerCase().trim();
  const activeTab = document.querySelector('.tab--active')?.dataset.category || 'all';

  return _allBooks.filter(book => {
    const matchCat   = activeTab === 'all' || book.category === activeTab;
    const matchQuery = !query ||
      book.title?.toLowerCase().includes(query) ||
      book.author?.toLowerCase().includes(query);
    return matchCat && matchQuery;
  });
}

function _clearFilter() {
  const searchEl = document.getElementById('books-search');
  if (searchEl) searchEl.value = '';

  document.querySelectorAll('.tab').forEach(t => {
    const isAll = t.dataset.category === 'all';
    t.classList.toggle('tab--active', isAll);
    t.setAttribute('aria-selected', String(isAll));
  });

  _renderBooks(_allBooks);
}

function _bindEvents() {
  // Qidiruv
  let searchTimer;
  const onSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => _renderBooks(_getFilteredBooks()), 250);
  };
  const searchEl = document.getElementById('books-search');
  searchEl?.addEventListener('input', onSearch);
  _cleanup.push(() => {
    searchEl?.removeEventListener('input', onSearch);
    clearTimeout(searchTimer);
  });

  // Kategoriya tablar
  const tabsEl = document.getElementById('category-tabs');
  const onTabClick = (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('tab--active', t === btn);
      t.setAttribute('aria-selected', String(t === btn));
    });
    _renderBooks(_getFilteredBooks());
  };
  tabsEl?.addEventListener('click', onTabClick);
  _cleanup.push(() => tabsEl?.removeEventListener('click', onTabClick));
}

function _skeletonCards(n) {
  return Array.from({ length: n }, () => `
    <div class="book-card" style="cursor:default;pointer-events:none">
      <div class="skeleton skeleton-card"></div>
      <div style="padding:16px">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text" style="width:60%"></div>
      </div>
    </div>
  `).join('');
}

function _addStyles() {
  if (document.getElementById('books-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'books-page-styles';
  style.textContent = `
    .books-header { margin-bottom: 28px; }
    .books-header__title { font-size: 2rem; margin-bottom: 6px; }
    .books-header__sub { color: var(--text-muted); }
    .books-toolbar {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .books-toolbar__search { flex: 1; min-width: 200px; max-width: 360px; }
    .books-toolbar__tabs   { flex: 1; overflow-x: auto; }
    .books-count { font-size: .875rem; color: var(--text-muted); margin-bottom: 20px; }
    .book-card__desc {
      font-size: .8125rem;
      color: var(--text-muted);
      margin-top: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    @media (max-width: 480px) {
      .books-toolbar { flex-direction: column; align-items: stretch; }
      .books-toolbar__search { max-width: none; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup  = [];
  _allBooks = [];
}
