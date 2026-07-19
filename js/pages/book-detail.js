// ============================================================
// pages/book-detail.js — Kitob tafsiloti + test boshlash
// ============================================================
import { getBookById, getQuestions } from '../db.js';
import { escapeHtml }                from '../utils.js';
import { navigate }                  from '../app.js';

let _cleanup = [];

export async function render(container, { params, user }) {
  const bookId = params.id;

  if (!bookId) {
    navigate('books');
    return;
  }

  container.innerHTML = `
    <div class="page" id="book-detail-page">
      <div class="container container--md">

        <!-- Orqaga havolasi -->
        <a href="#books" class="back-link animate-fade-in">← Kitoblarga qaytish</a>

        <!-- Skeleton -->
        <div id="book-content" class="animate-slide-up">
          ${_skeletonHTML()}
        </div>

      </div>
    </div>
  `;

  _addStyles();

  try {
    const [book, questions] = await Promise.all([
      getBookById(bookId),
      getQuestions(bookId),
    ]);

    if (!book) {
      document.getElementById('book-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <p class="empty-state__title">Kitob topilmadi</p>
          <p class="empty-state__desc">Bu kitob mavjud emas yoki o'chirilgan.</p>
          <a href="#books" class="btn btn-primary mt-4">Kitoblarga qaytish</a>
        </div>
      `;
      return;
    }

    _renderBook(book, questions, user);
    _bindEvents(book, user);

  } catch (err) {
    console.error('[book-detail] Xato:', err);
    document.getElementById('book-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <p class="empty-state__title">Yuklashda xato</p>
        <p class="empty-state__desc">Sahifani yangilang yoki internet ulanishini tekshiring.</p>
      </div>
    `;
  }
}

function _renderBook(book, questions, user) {
  const cover    = book.cover_url || book.cover || '';
  const qCount   = questions.length;

  document.getElementById('book-content').innerHTML = `
    <div class="book-detail">

      <!-- Yuqori qism: muqova + asosiy ma'lumot -->
      <div class="book-detail__top">
        <div class="book-detail__cover-wrap">
          ${cover
            ? `<img src="${escapeHtml(cover)}"
                    alt="${escapeHtml(book.title)}"
                    class="book-detail__cover"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
               />
               <div class="book-detail__cover-placeholder" style="display:none">📖</div>`
            : `<div class="book-detail__cover-placeholder">📖</div>`
          }
        </div>

        <div class="book-detail__info">
          <span class="badge mb-2">${escapeHtml(book.category || 'Adabiyot')}</span>
          <h1 class="book-detail__title">${escapeHtml(book.title)}</h1>
          <p  class="book-detail__author">
            <span aria-hidden="true">✍️</span> ${escapeHtml(book.author || 'Noma\'lum muallif')}
          </p>

          <!-- Meta info -->
          <div class="book-detail__meta">
            ${book.year
              ? `<div class="book-detail__meta-item">
                   <span aria-hidden="true">📅</span>
                   <span>${escapeHtml(String(book.year))}</span>
                 </div>`
              : ''}
            ${book.pages
              ? `<div class="book-detail__meta-item">
                   <span aria-hidden="true">📄</span>
                   <span>${escapeHtml(String(book.pages))} bet</span>
                 </div>`
              : ''}
            <div class="book-detail__meta-item">
              <span aria-hidden="true">❓</span>
              <span>${qCount} savol</span>
            </div>
          </div>

          <!-- Test boshlash -->
          ${qCount > 0
            ? user
              ? `<button id="start-quiz-btn" class="btn btn-primary btn-lg" data-book-id="${escapeHtml(String(book.id))}">
                   🚀 Testni boshlash
                 </button>`
              : `<div class="book-detail__auth-warn">
                   <p>Testni boshlash uchun tizimga kiring.</p>
                   <a href="#login" class="btn btn-primary">Kirish</a>
                   <a href="#register" class="btn btn-outline">Ro'yxatdan o'tish</a>
                 </div>`
            : `<div class="book-detail__no-quiz">
                 <span aria-hidden="true">🚧</span>
                 Bu kitob uchun hali savollar yo'q.
               </div>`
          }
        </div>
      </div>

      <!-- Tavsif -->
      ${book.description
        ? `<div class="book-detail__desc card">
             <h2 class="book-detail__desc-title">Kitob haqida</h2>
             <p class="book-detail__desc-text">${escapeHtml(book.description)}</p>
           </div>`
        : ''}

    </div>
  `;
}

function _bindEvents(book, user) {
  const startBtn = document.getElementById('start-quiz-btn');
  if (!startBtn) return;

  const onClick = () => {
    navigate('quiz', { bookId: String(book.id) });
  };
  startBtn.addEventListener('click', onClick);
  _cleanup.push(() => startBtn.removeEventListener('click', onClick));
}

function _skeletonHTML() {
  return `
    <div class="book-detail">
      <div class="book-detail__top">
        <div class="book-detail__cover-wrap">
          <div class="skeleton" style="width:100%;height:360px;border-radius:var(--radius-lg)"></div>
        </div>
        <div class="book-detail__info">
          <div class="skeleton" style="width:80px;height:24px;margin-bottom:12px;border-radius:var(--radius-full)"></div>
          <div class="skeleton skeleton-title" style="width:90%"></div>
          <div class="skeleton skeleton-text"  style="width:55%"></div>
          <div class="skeleton" style="width:100%;height:48px;margin-top:24px;border-radius:var(--radius-md)"></div>
        </div>
      </div>
    </div>
  `;
}

function _addStyles() {
  if (document.getElementById('book-detail-styles')) return;
  const style = document.createElement('style');
  style.id = 'book-detail-styles';
  style.textContent = `
    .back-link {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--text-muted); font-size: .9375rem;
      margin-bottom: 24px;
      transition: var(--transition-fast);
    }
    .back-link:hover { color: var(--color-primary); }

    .book-detail__top {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 40px;
      margin-bottom: 32px;
    }
    .book-detail__cover-wrap {
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-lg);
      aspect-ratio: 2/3;
    }
    .book-detail__cover {
      width: 100%; height: 100%; object-fit: cover;
    }
    .book-detail__cover-placeholder {
      width: 100%; height: 100%; min-height: 320px;
      display: flex; align-items: center; justify-content: center;
      font-size: 5rem;
      background: linear-gradient(135deg, var(--color-primary-light), var(--bg-tertiary));
    }
    .book-detail__info {
      display: flex; flex-direction: column; gap: 12px;
      padding-top: 8px;
    }
    .book-detail__title {
      font-size: clamp(1.375rem, 3vw, 2rem);
      line-height: 1.2;
    }
    .book-detail__author { color: var(--text-muted); font-size: 1.0625rem; }
    .book-detail__meta {
      display: flex; gap: 20px; flex-wrap: wrap;
      margin: 4px 0 8px;
    }
    .book-detail__meta-item {
      display: flex; align-items: center; gap: 6px;
      font-size: .9375rem; color: var(--text-secondary);
    }
    .book-detail__auth-warn {
      display: flex; align-items: center; gap: 12px;
      flex-wrap: wrap;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      padding: 16px;
    }
    .book-detail__auth-warn p { color: var(--text-muted); flex: 1; min-width: 160px; }
    .book-detail__no-quiz {
      display: flex; align-items: center; gap: 8px;
      color: var(--text-muted); font-size: .9375rem;
      background: var(--bg-tertiary);
      padding: 14px 18px; border-radius: var(--radius-md);
    }
    .book-detail__desc {
      margin-top: 8px;
    }
    .book-detail__desc-title { font-size: 1.125rem; margin-bottom: 12px; }
    .book-detail__desc-text {
      color: var(--text-secondary);
      line-height: 1.8;
      white-space: pre-line;
    }

    @media (max-width: 768px) {
      .book-detail__top { grid-template-columns: 1fr; gap: 24px; }
      .book-detail__cover-wrap { max-width: 240px; margin: 0 auto; }
      .book-detail__info { align-items: center; text-align: center; }
      .book-detail__meta { justify-content: center; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
