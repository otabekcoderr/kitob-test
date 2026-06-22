import { 
  getAllBooks, getBookById, getResultsByUser, 
  getCommentsByBook, addComment, updateComment 
} from './db.js';
import { getCurrentUser } from './auth.js';
import { navigate, showNotification } from './app.js';
import { escapeHtml, formatDateTime } from './utils.js';

let currentSearchQuery = '';
let currentDifficultyFilter = 'Hammasi';
let allLoadedBooks = [];

export async function renderBooksList(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Kitoblar ro'yxati yuklanmoqda...</p>
    </div>
  `;

  try {
    allLoadedBooks = await getAllBooks();

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header">
          <h1 class="page-title">📚 Kitoblar Kutubxonasi</h1>
          <p class="page-subtitle">O'zingiz o'qigan kitobni tanlang va bilimingizni sinab ko'ring</p>
        </div>

        <div class="card mb-lg" style="padding: 20px;">
          <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
            <div class="search-bar" style="flex: 1; min-width: 250px; position: relative;">
              <span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted);">🔍</span>
              <input type="text" id="book-search" class="input" style="padding-left: 40px;" placeholder="Kitob nomi yoki muallifini qidiring..." value="${currentSearchQuery}">
            </div>
          </div>
          
          <div class="tabs" style="margin-top: 16px; margin-bottom: 0;">
            <button class="tab ${currentDifficultyFilter === 'Hammasi' ? 'active' : ''}" data-filter="Hammasi">Hammasi</button>
            <button class="tab ${currentDifficultyFilter === 'Oson' ? 'active' : ''}" data-filter="Oson">Oson</button>
            <button class="tab ${currentDifficultyFilter === "O'rta" ? 'active' : ''}" data-filter="O'rta">O'rta</button>
            <button class="tab ${currentDifficultyFilter === 'Qiyin' ? 'active' : ''}" data-filter="Qiyin">Qiyin</button>
          </div>
        </div>

        <div id="books-grid" class="grid grid-3">
          <!-- Books filled by filter function -->
        </div>
      </div>
    `;

    // Attach search and filter event listeners
    const searchInput = document.getElementById('book-search');
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim();
      filterAndRenderBooks();
    });

    const tabButtons = container.querySelectorAll('.tab');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDifficultyFilter = btn.dataset.filter;
        filterAndRenderBooks();
      });
    });

    // Initial render
    filterAndRenderBooks();

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="text-error text-center">Kitoblarni yuklashda xatolik.</div>`;
  }
}

function filterAndRenderBooks() {
  const grid = document.getElementById('books-grid');
  if (!grid) return;

  const query = currentSearchQuery.toLowerCase();
  
  const filtered = allLoadedBooks.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(query) || 
                          book.author.toLowerCase().includes(query) ||
                          book.genre.toLowerCase().includes(query);
    const matchesDiff = currentDifficultyFilter === 'Hammasi' || book.difficulty === currentDifficultyFilter;
    return matchesSearch && matchesDiff;
  });

  if (filtered.length === 0) {
    grid.style.display = 'block';
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔎</div>
        <div class="empty-state-title">Hech qanday kitob topilmadi</div>
        <div class="empty-state-text">Qidiruv so'zini o'zgartirib yoki boshqa qiyinchilik darajasini tanlab ko'ring.</div>
      </div>
    `;
    return;
  }

  grid.style.display = 'grid';
  grid.innerHTML = filtered.map((book, i) => `
    <div class="card book-card slide-up stagger-${(i % 4) + 1}" onclick="window.location.hash='#/book/${book.id}'">
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
        <div class="book-title" style="margin-top:0;">${book.title}</div>
        <div class="book-author">${book.author}</div>
        <div class="book-meta">
          <span class="badge badge-primary">${book.questionCount || 0} savol</span>
          <span class="badge ${book.difficulty === 'Oson' ? 'badge-success' : book.difficulty === "O'rta" ? 'badge-warning' : 'badge-error'}">${book.difficulty}</span>
        </div>
      </div>
    </div>
  `).join('');
}

export async function renderBookDetail(container, bookId) {
  // Show loading
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Kitob ma'lumotlari yuklanmoqda...</p>
    </div>
  `;

  try {
    const book = await getBookById(bookId);
    if (!book) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">❌</div>
          <div class="empty-state-title">Kitob topilmadi</div>
          <p class="empty-state-text">Qidirilayotgan kitob mavjud emas yoki o'chirilgan.</p>
          <a href="#/books" class="btn btn-primary mt-md">Kutubxonaga qaytish</a>
        </div>
      `;
      return;
    }

    const currentUser = getCurrentUser();
    const results = await getResultsByUser(currentUser.id);
    const bookResults = results.filter(r => r.bookId === book.id);
    const bestScore = bookResults.length > 0 ? Math.max(...bookResults.map(r => r.score)) : null;

    container.innerHTML = `
      <div class="fade-in">
        <div class="card glass-card mb-lg">
          <div class="book-detail-header">
            <div class="book-detail-cover-premium" style="background: ${book.coverImage ? `url(${book.coverImage}) center/cover no-repeat, ${book.coverBg || 'var(--bg-tertiary)'}` : (book.coverBg || 'var(--bg-tertiary)')}; color: ${book.coverTitleColor || 'white'};">
              ${!book.coverImage ? '<div class="book-cover-pattern"></div>' : ''}
              ${!book.coverImage ? `<div class="book-cover-icon">${book.cover}</div>` : ''}
              <div class="book-cover-title-text">${book.title}</div>
            </div>
            <div class="book-detail-info">
              <h1 class="book-detail-title">${book.title}</h1>
              <p class="book-detail-author">Muallif: <strong>${book.author}</strong></p>
              
              <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
                <span class="badge badge-primary">${book.genre}</span>
                <span class="badge ${book.difficulty === 'Oson' ? 'badge-success' : book.difficulty === "O'rta" ? 'badge-warning' : 'badge-error'}">Qiyinchilik: ${book.difficulty}</span>
                <span class="badge badge-primary">${book.year}-yil</span>
              </div>

              <p class="book-detail-description">${book.description}</p>

              ${bestScore !== null ? `
                <div style="margin: 16px 0; padding: 12px; border-radius: var(--radius-md); background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 1.5rem;">🏆</span>
                  <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Sizning eng yuqori natijangiz:</div>
                    <div style="font-weight: 600; color: var(--color-success);">${bestScore}% ball (${bookResults.length} marta yechilgan)</div>
                  </div>
                </div>
              ` : ''}

              <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px;">
                <button class="btn btn-primary btn-lg" id="start-quiz-btn" ${!book.questionCount ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
                  ${!book.questionCount ? 'Savollar yo\'q' : bestScore !== null ? '🔁 Qayta yechish' : '🚀 Testni boshlash'}
                </button>
                <a href="#/books" class="btn btn-outline btn-lg">← Kutubxona</a>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-2" style="align-items: start; gap: 24px;">
          <!-- Left side: previous attempts -->
          <div>
            <div class="section-title">📊 Sizning urinishlaringiz</div>
            <div class="card">
              ${bookResults.length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                  ${bookResults.map(r => `
                    <div class="results-history-item" onclick="window.location.hash='#/result/${r.id}'" style="background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: 0;">
                      <div class="result-circle-sm" style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; background: ${r.score >= 80 ? 'rgba(34, 197, 94, 0.2)' : r.score >= 60 ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${r.score >= 80 ? 'var(--color-success)' : r.score >= 60 ? 'var(--color-primary-hover)' : 'var(--color-error)'};">
                        ${r.score}%
                      </div>
                      <div style="flex: 1;">
                        <div style="font-weight: 600;">${r.correctAnswers}/${r.totalQuestions} to'g'ri</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${new Date(r.completedAt).toLocaleDateString('uz')} • ${Math.floor(r.timeSpent / 60)}m ${r.timeSpent % 60}s</div>
                      </div>
                      <span style="color: var(--text-muted);">→</span>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="text-center" style="padding: 20px 0; color: var(--text-secondary);">
                  <p>Siz hali bu kitob bo'yicha test yechmagansiz.</p>
                </div>
              `}
            </div>
          </div>

          <!-- Right side: comments -->
          <div>
            <div class="section-title">💬 Kitobxonlar muhokamasi</div>
            <div class="card comments-section">
              <form id="comment-form" class="comment-form">
                <textarea id="comment-text" class="input" placeholder="Kitob yoki test haqida fikringizni yozing..." required></textarea>
                <button type="submit" class="btn btn-secondary mt-sm" style="align-self: flex-end;">Fikr bildirish</button>
              </form>
              <div id="comments-list" style="display: flex; flex-direction: column; gap: 16px;">
                <!-- Comments populated by function -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (book.questionCount > 0) {
      document.getElementById('start-quiz-btn').addEventListener('click', () => {
        navigate(`/quiz/${book.id}`);
      });
    }

    // Handle comments rendering and submission
    renderComments(book.id);

    document.getElementById('comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const textarea = document.getElementById('comment-text');
      const text = textarea.value.trim();
      if (!text) return;

      const newComment = {
        id: crypto.randomUUID(),
        bookId: book.id,
        userId: currentUser.id,
        userName: currentUser.fullName,
        userAvatar: currentUser.avatar,
        text,
        likesCount: 0,
        likedBy: [],
        createdAt: Date.now()
      };

      try {
        await addComment(newComment);
        textarea.value = '';
        showNotification("Fikringiz qo'shildi! 💬", "success");
        renderComments(book.id);
      } catch (err) {
        showNotification("Fikr qo'shishda xatolik yuz berdi", "error");
      }
    });

  } catch (err) {
    console.error(err);
    showNotification("Ma'lumotlarni yuklashda xatolik", "error");
  }
}

async function renderComments(bookId) {
  const list = document.getElementById('comments-list');
  if (!list) return;

  const currentUser = getCurrentUser();

  try {
    const comments = await getCommentsByBook(bookId);
    if (comments.length === 0) {
      list.innerHTML = `
        <div class="text-center" style="padding: 20px 0; color: var(--text-muted); font-size: 0.9rem;">
          Birinchi bo'lib fikr bildiring!
        </div>
      `;
      return;
    }

    list.innerHTML = comments.map(c => {
      const isLiked = c.likedBy && c.likedBy.includes(currentUser.id);
      const safeUserName = escapeHtml(c.userName || '');
      const safeText = escapeHtml(c.text || '');
      const safeAvatar = escapeHtml(c.userAvatar || '😊');
      return `
        <div class="comment-card card" style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md); margin-bottom: 0;">
          <div class="comment-header">
            <div class="comment-avatar">${safeAvatar}</div>
            <div style="flex: 1;">
              <div class="comment-user">${safeUserName}</div>
              <div class="comment-date">${formatDateTime(c.createdAt)}</div>
            </div>
          </div>
          <div class="comment-text" style="white-space: pre-wrap; margin-top: 8px;">${safeText}</div>
          <div class="comment-actions" style="margin-top: 12px; display: flex; justify-content: flex-end;">
            <button class="comment-like-btn ${isLiked ? 'liked' : ''}" data-comment-id="${c.id}" style="display: flex; align-items: center; gap: 4px; background: none; border: none; color: ${isLiked ? 'var(--color-error)' : 'var(--text-muted)'}; cursor: pointer; font-size: 0.85rem; font-weight: 500;">
              ❤️ <span>${c.likesCount || 0}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach like listener
    list.querySelectorAll('.comment-like-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const commentId = btn.dataset.commentId;
        const comment = comments.find(c => c.id === commentId);
        if (!comment) return;

        let likedBy = comment.likedBy || [];
        let likesCount = comment.likesCount || 0;

        if (likedBy.includes(currentUser.id)) {
          // Unlike
          likedBy = likedBy.filter(uid => uid !== currentUser.id);
          likesCount = Math.max(0, likesCount - 1);
        } else {
          // Like
          likedBy.push(currentUser.id);
          likesCount += 1;
        }

        try {
          await updateComment(commentId, { likedBy, likesCount });
          renderComments(bookId);
        } catch (err) {
          showNotification("Amal bajarilmadi", "error");
        }
      });
    });

  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="text-center text-error">Comments list loading error.</div>`;
  }
}
