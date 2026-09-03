// ============================================================
// pages/books.js — Kitoblar katalogi
// ============================================================
import { getBooks }               from '../db.js';
import { escapeHtml, truncate }    from '../utils.js';
let _allBooks = [];
let _cleanup  = [];

function _getBookCover(book) {
  if (!book) return '';
  if (book.cover_url && (book.cover_url.startsWith('http') || book.cover_url.startsWith('data:'))) return book.cover_url;
  if (book.cover    && (book.cover.startsWith('http')    || book.cover.startsWith('data:')))    return book.cover;
  return book.coverImage || '';
}

function _coverPlaceholder(book) {
  const initial = (book.title || '?')[0].toUpperCase();
  return `<div class="book-card__cover-placeholder">
    <span class="placeholder-initial">${escapeHtml(initial)}</span>
    <span class="placeholder-label">${escapeHtml(truncate(book.title || '', 14))}</span>
  </div>`;
}

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page" id="books-page">
      <div class="container">

        <div style="margin-bottom:32px;">
          <h1 style="font-family:var(--font-display);font-size:clamp(1.7rem,3vw,2.7rem);font-weight:700;color:var(--ink);margin-bottom:8px;">Kitoblar</h1>
          <p style="color:var(--ink-muted);font-size:0.9375rem;">Bilimingizni sinab ko'ring — testlarni yeching</p>
        </div>

        <!-- Qidiruv va filtlar -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;align-items:flex-end;">
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
        <div class="tabs" role="tablist" aria-label="Kategoriyalar" style="margin-bottom:16px;">
          <button class="tab tab--active" role="tab" data-category="all" aria-selected="true">Barchasi</button>
          <button class="tab" role="tab" data-category="badiiy"      aria-selected="false">Badiiy adabiyot</button>
          <button class="tab" role="tab" data-category="tarixiy"     aria-selected="false">Tarixiy asarlar</button>
          <button class="tab" role="tab" data-category="rivojlanish" aria-selected="false">Rivojlanish & Psixologiya</button>
          <button class="tab" role="tab" data-category="jahon"       aria-selected="false">Jahon durdonalari</button>
          <button class="tab" role="tab" data-category="mumtoz"      aria-selected="false">Mumtoz meros</button>
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

  try {
    _allBooks = await getBooks();
  } catch {
    _allBooks = [];
  }

  _renderBooks(_allBooks);
  _bindEvents();
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
      aria-label="${escapeHtml(book.title)} — ${escapeHtml(book.author || '')}"
    >
      <div class="book-card__cover">
        ${cover
          ? `<img src="${escapeHtml(cover)}"
                  alt="${escapeHtml(book.title)}"
                  loading="lazy"
                  decoding="async"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
             />
             <div class="book-card__cover-placeholder" style="display:none">
               <span class="placeholder-initial">${escapeHtml((book.title || '?')[0].toUpperCase())}</span>
               <span class="placeholder-label">${escapeHtml(truncate(book.title || '', 14))}</span>
             </div>`
          : _coverPlaceholder(book)
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
        <span class="badge">${escapeHtml(book.category || book.genre || 'Adabiyot')}</span>
        ${book.difficulty ? `<span class="badge">${escapeHtml(book.difficulty)}</span>` : ''}
      </div>
    </article>
  `;
}

function _getFilteredBooks() {
  const query      = (document.getElementById('books-search')?.value || '').toLowerCase().trim();
  const activeTab  = document.querySelector('.tab--active')?.dataset.category || 'all';
  const difficulty = document.getElementById('books-difficulty')?.value || '';

  return _allBooks.filter(book => {
    const genre   = (book.genre || '').toLowerCase();
    const title   = (book.title || '').toLowerCase();
    const author  = (book.author || '').toLowerCase();
    const cat     = (book.category || '').toLowerCase();
    const allText = `${title} ${author} ${genre} ${cat}`;

    let matchCat = activeTab === 'all';
    if (!matchCat) {
      if (activeTab === 'badiiy') {
        matchCat = genre.includes('roman') || genre.includes('qissa') || genre.includes('hikoya') || genre.includes('satira') || cat.includes('adabiyot');
      } else if (activeTab === 'tarixiy') {
        matchCat = genre.includes('tarix') || allText.includes('temur') || allText.includes('bobur') || allText.includes('yulduzli tunlar') || allText.includes('ulug\'bek') || allText.includes('muqanna');
      } else if (activeTab === 'rivojlanish') {
        matchCat = genre.includes('rivojlanish') || genre.includes('psixologiya') || genre.includes('moliya') || genre.includes('salomatlik') || genre.includes('ilm');
      } else if (activeTab === 'jahon') {
        matchCat = genre.includes('distopiya') || genre.includes('ekzistensial') || allText.includes('orwell') || allText.includes('koelo') || allText.includes('dostoyevskiy') || allText.includes('ekzyuperi') || allText.includes('xaminguey') || allText.includes('london');
      } else if (activeTab === 'mumtoz') {
        matchCat = genre.includes('mumtoz') || genre.includes('doston') || genre.includes('pandnoma') || genre.includes('tasavvuf') || allText.includes('navoiy') || allText.includes('koshg\'ariy') || allText.includes('yugnakiy') || allText.includes('nizomiy');
      } else {
        matchCat = allText.includes(activeTab.toLowerCase());
      }
    }

    const matchDiff = !difficulty || book.difficulty === difficulty;
    const matchQ    = !query ||
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

  document.querySelectorAll('.tab').forEach(t => {
    const isAll = t.dataset.category === 'all';
    t.classList.toggle('tab--active', isAll);
    t.setAttribute('aria-selected', String(isAll));
  });

  _renderBooks(_allBooks);
}

function _bindEvents() {
  // Qidiruv
  document.getElementById('books-search')?.addEventListener('input', () => _renderBooks(_getFilteredBooks()));
  document.getElementById('books-difficulty')?.addEventListener('change', () => _renderBooks(_getFilteredBooks()));

  // Kategoriya tablar
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => {
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
  _allBooks = [];
}
