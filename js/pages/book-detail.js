// ============================================================
// pages/book-detail.js — Kitob tafsiloti (Editorial uslub)
// ============================================================
import { getBookById, getQuestions } from '../db.js';
import { escapeHtml }                from '../utils.js';
let _cleanup = [];

const FAVORITES_KEY = 'kitobchi_favorites';

function _getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}

function _toggleFavorite(bookId) {
  const favs = _getFavorites();
  const id   = String(bookId);
  const idx  = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(id);
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); } catch { /* ignore */ }
  return idx < 0; // true = added
}

function _getBookCover(book) {
  if (!book) return '';
  if (book.cover_url && (book.cover_url.startsWith('http') || book.cover_url.startsWith('data:'))) return book.cover_url;
  if (book.cover    && (book.cover.startsWith('http')    || book.cover.startsWith('data:')))    return book.cover;
  return book.coverImage || '';
}

export async function render(container, { params, user }) {
  const bookId = params?.id || params?.bookId || params?.slug;

  if (!bookId) {
    window.navigate('books');
    return;
  }

  container.innerHTML = `
    <div class="page" id="book-detail-page">
      <div class="container container--md">
        <a href="#books" class="back-link animate-fade-in">← Kitoblarga qaytish</a>
        <div id="book-content" class="animate-slide-up">
          ${_skeletonHTML()}
        </div>
      </div>
    </div>
  `;

  try {
    const [book, questions] = await Promise.all([
      getBookById(bookId),
      getQuestions(bookId),
    ]);

    const contentEl = container.querySelector('#book-content') || document.getElementById('book-content');
    if (!contentEl) return;

    if (!book) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Kitob topilmadi</p>
          <p class="empty-state__desc">Bu kitob mavjud emas yoki o'chirilgan.</p>
          <a href="#books" class="btn btn-primary" style="margin-top:16px;">Kitoblarga qaytish</a>
        </div>
      `;
      return;
    }

    _renderBook(contentEl, book, questions, user);
    _bindEvents(container, book, user);

  } catch (err) {
    console.error('[book-detail] Xato:', err);
    const contentEl = container.querySelector('#book-content') || document.getElementById('book-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Yuklashda xato</p>
          <p class="empty-state__desc">Sahifani yangilang yoki internet ulanishini tekshiring.</p>
        </div>
      `;
    }
  }
}

function _renderBook(contentEl, book, questions, user) {
  if (!contentEl) return;
  const cover  = _getBookCover(book);
  const qCount = questions.length;
  const isFav  = _getFavorites().includes(String(book.id));
  const initial = (book.title || '?')[0].toUpperCase();

  contentEl.innerHTML = `
    <div class="book-detail">

      <div class="book-detail__top">
        <!-- Muqova -->
        <div class="book-detail__cover-wrap">
          ${cover
            ? `<img src="${escapeHtml(cover)}"
                    alt="${escapeHtml(book.title)}"
                    class="book-detail__cover"
                    loading="eager"
                    onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'"
               />
               <div class="book-detail__cover-placeholder" style="display:none">
                 <span class="placeholder-initial">${escapeHtml(initial)}</span>
               </div>`
            : `<div class="book-detail__cover-placeholder">
                 <span class="placeholder-initial">${escapeHtml(initial)}</span>
               </div>`
          }
        </div>

        <!-- Ma'lumotlar -->
        <div class="book-detail__info">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <span class="badge">${escapeHtml(book.category || book.genre || 'Adabiyot')}</span>
            ${book.difficulty ? `<span class="badge">${escapeHtml(book.difficulty)}</span>` : ''}
            <!-- Sevimli belgisi -->
            <button
              id="fav-btn"
              aria-label="${isFav ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qo\'shish'}"
              title="${isFav ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qo\'shish'}"
              style="margin-left:auto;background:none;border:1px solid var(--divider);border-radius:var(--radius-sm);padding:4px 10px;cursor:pointer;font-size:0.875rem;color:var(--ink-muted);display:inline-flex;align-items:center;gap:5px;"
            >
              <span id="fav-icon">${isFav ? '♥' : '♡'}</span>
              <span id="fav-label" style="font-size:0.75rem;">${isFav ? 'Sevimli' : 'Qo\'shish'}</span>
            </button>
          </div>

          <h1 class="book-detail__title">${escapeHtml(book.title)}</h1>
          <p class="book-detail__author">${escapeHtml(book.author || 'Noma\'lum muallif')}</p>

          <div class="book-detail__meta">
            ${book.year ? `<div class="book-detail__meta-item"><span>${escapeHtml(String(book.year))}</span></div>` : ''}
            ${book.pages ? `<div class="book-detail__meta-item"><span>${escapeHtml(String(book.pages))} bet</span></div>` : ''}
            <div class="book-detail__meta-item">
              <span>${qCount} ta savol</span>
            </div>
          </div>

          <!-- Test CTA -->
          <div style="margin-top:8px;">
            ${qCount > 0
              ? user
                ? `<button id="start-quiz-btn" class="btn btn-primary btn-lg" data-book-id="${escapeHtml(String(book.id))}" style="width:100%;max-width:280px;">
                     Bilimingizni tekshiring
                   </button>`
                : `<div style="padding:16px;border:1px solid var(--divider);border-radius:var(--radius-md);background:var(--paper-alt);">
                     <p style="color:var(--ink-muted);margin-bottom:12px;font-size:0.9375rem;">Testni boshlash uchun tizimga kiring.</p>
                     <div style="display:flex;gap:8px;flex-wrap:wrap;">
                       <a href="#login"    class="btn btn-primary">Kirish</a>
                       <a href="#register" class="btn btn-outline">Ro'yxatdan o'tish</a>
                     </div>
                   </div>`
              : `<p style="color:var(--ink-muted);font-size:0.9375rem;padding:14px 0;">Bu kitob uchun hali savollar yo'q.</p>`
            }
          </div>
        </div>
      </div>

      <!-- Tavsif -->
      ${book.description
        ? `<div class="book-detail__desc">
             <h2 style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--ink);margin-bottom:12px;">Kitob haqida</h2>
             <p style="color:var(--ink-muted);line-height:1.8;white-space:pre-line;">${escapeHtml(book.description)}</p>
           </div>`
        : ''
      }

    </div>
  `;
}

function _bindEvents(container, book, user) {
  const startBtn = container.querySelector('#start-quiz-btn') || document.getElementById('start-quiz-btn');
  if (startBtn) {
    const onClick = () => window.navigate('quiz', { bookId: String(book.id) });
    startBtn.addEventListener('click', onClick);
    _cleanup.push(() => startBtn.removeEventListener('click', onClick));
  }

  const favBtn = container.querySelector('#fav-btn') || document.getElementById('fav-btn');
  if (favBtn) {
    const onFav = () => {
      const added = _toggleFavorite(book.id);
      const iconEl = container.querySelector('#fav-icon') || document.getElementById('fav-icon');
      const labelEl = container.querySelector('#fav-label') || document.getElementById('fav-label');
      if (iconEl) iconEl.textContent = added ? '♥' : '♡';
      if (labelEl) labelEl.textContent = added ? 'Sevimli' : 'Qo\'shish';
      favBtn.setAttribute('aria-label', added ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qo\'shish');
    };
    favBtn.addEventListener('click', onFav);
    _cleanup.push(() => favBtn.removeEventListener('click', onFav));
  }
}

function _skeletonHTML() {
  return `
    <div class="book-detail">
      <div class="book-detail__top">
        <div class="book-detail__cover-wrap" style="background:var(--paper-alt);aspect-ratio:3/4;"></div>
        <div class="book-detail__info">
          <div style="height:20px;background:var(--divider);border-radius:4px;width:60px;margin-bottom:16px;"></div>
          <div style="height:32px;background:var(--divider);border-radius:4px;width:90%;margin-bottom:12px;"></div>
          <div style="height:18px;background:var(--divider);border-radius:4px;width:50%;margin-bottom:24px;"></div>
          <div style="height:48px;background:var(--divider);border-radius:6px;width:200px;"></div>
        </div>
      </div>
    </div>
  `;
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
