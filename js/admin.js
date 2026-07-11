import { 
  getAllBooks, getBookById, addBook, deleteBook, updateBook,
  getQuestionsByBook, addQuestion, deleteQuestion, 
  getAllUsers, deleteUser, 
  getAllComments, deleteComment, 
  getAllResults,
  getAllCharacters, addCharacter, deleteCharacter, updateCharacter
} from './db.js';
import { navigate, showNotification } from './app.js';
import { safeCssUrl } from './utils.js';

export async function renderAdminPanel(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Admin paneli yuklanmoqda...</p>
    </div>
  `;

  try {
    const books = await getAllBooks();
    const users = (await getAllUsers()) || [];
    const results = (await getAllResults()) || [];
    const comments = (await getAllComments()) || [];

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header" style="margin-bottom: 24px;">
          <h1 class="page-title">👑 Tizim Boshqaruv Paneli (Admin)</h1>
          <p class="page-subtitle">Kitoblar, test savollari, izohlar va foydalanuvchilarni to'liq nazorat qilish</p>
        </div>

        <div class="tabs" style="margin-bottom: 24px;">
          <button class="tab active" id="admin-tab-stats">📈 Statistika</button>
          <button class="tab" id="admin-tab-books">📚 Kitoblar</button>
          <button class="tab" id="admin-tab-questions">❓ Savollar</button>
          <button class="tab" id="admin-tab-comments">💬 Izohlar</button>
          <button class="tab" id="admin-tab-users">👥 Foydalanuvchilar</button>
          <button class="tab" id="admin-tab-characters">🦸 Qahramonlar</button>
          <button class="tab" id="admin-tab-bulk">📋 Copy-Paste</button>
        </div>

        <div id="admin-tab-content">
          <!-- Dynamic tab content -->
        </div>
      </div>
    `;

    const tabStats = document.getElementById('admin-tab-stats');
    const tabBooks = document.getElementById('admin-tab-books');
    const tabQuestions = document.getElementById('admin-tab-questions');
    const tabComments = document.getElementById('admin-tab-comments');
    const tabUsers = document.getElementById('admin-tab-users');
    const tabBulk = document.getElementById('admin-tab-bulk');
    const tabCharacters = document.getElementById('admin-tab-characters');
    const tabContent = document.getElementById('admin-tab-content');

    tabStats.addEventListener('click', () => {
      setActiveTab(tabStats);
      renderStatsTab(tabContent, books, users, results, comments);
    });

    tabBooks.addEventListener('click', () => {
      setActiveTab(tabBooks);
      renderBooksTab(tabContent);
    });

    tabQuestions.addEventListener('click', () => {
      setActiveTab(tabQuestions);
      renderQuestionsTab(tabContent);
    });

    tabComments.addEventListener('click', () => {
      setActiveTab(tabComments);
      renderCommentsTab(tabContent);
    });

    tabUsers.addEventListener('click', () => {
      setActiveTab(tabUsers);
      renderUsersTab(tabContent);
    });

    tabCharacters.addEventListener('click', () => {
      setActiveTab(tabCharacters);
      renderCharactersTab(tabContent);
    });

    tabBulk.addEventListener('click', () => {
      setActiveTab(tabBulk);
      renderBulkImportTab(tabContent);
    });

    function setActiveTab(activeBtn) {
      [tabStats, tabBooks, tabQuestions, tabComments, tabUsers, tabCharacters, tabBulk].forEach(btn => btn.classList.remove('active'));
      activeBtn.classList.add('active');
    }

    // Default tab
    renderStatsTab(tabContent, books, users, results, comments);

  } catch (err) {
    console.error(err);
    showNotification("Admin panelni yuklashda xatolik yuz berdi", "error");
  }
}

// 1. STATS TAB
function renderStatsTab(container, books, users, results, comments) {
  const totalUsers = users.length;
  const totalResults = results.length;
  const avgScore = totalResults > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / totalResults) : 0;
  const totalComments = comments.length;

  container.innerHTML = `
    <div class="fade-in">
      <div class="grid grid-4 mb-lg">
        <div class="card stat-card">
          <div class="stat-value" style="color: var(--color-primary);">${books.length}</div>
          <div class="stat-label">Jami Kitoblar</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value" style="color: var(--color-secondary);">${totalUsers}</div>
          <div class="stat-label">Jami Foydalanuvchilar</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value" style="color: var(--color-accent);">${totalResults}</div>
          <div class="stat-label">Topshirilgan Testlar</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value" style="color: var(--color-success);">${avgScore}%</div>
          <div class="stat-label">O'rtacha Ball</div>
        </div>
      </div>

      <div class="grid grid-2" style="align-items: start; gap: 24px;">
        <div class="card">
          <h3 class="section-title" style="margin-top: 0;">📊 So'nggi test topshirishlar</h3>
          ${results.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${results.slice(0, 5).map(r => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <div>
                    <span style="font-weight: 600;">${escapeHtml(r.userName)}</span>
                    <span style="color: var(--text-muted); font-size: 0.8rem;"> - ${escapeHtml(r.bookTitle)}</span>
                  </div>
                  <span class="badge ${r.score >= 80 ? 'badge-success' : r.score >= 60 ? 'badge-primary' : 'badge-error'}">${r.score}%</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--text-secondary);">Hozircha natijalar yo\'q.</p>'}
        </div>

        <div class="card">
          <h3 class="section-title" style="margin-top: 0;">💬 So'nggi fikrlar</h3>
          ${comments.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${comments.slice(0, 5).map(c => `
                <div style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(c.userName)}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(c.createdAt).toLocaleDateString('uz')}</span>
                  </div>
                  <p style="font-size: 0.85rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.text)}</p>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--text-secondary);">Hozircha izohlar yo\'q.</p>'}
        </div>
      </div>
    </div>
  `;
}

// 2. BOOKS MANAGEMENT TAB
async function renderBooksTab(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const books = await getAllBooks();

    container.innerHTML = `
      <div class="fade-in grid grid-2" style="align-items: start; gap: 24px;">
        <!-- Left: Add New Book Form -->
        <div class="card">
          <h3 class="section-title" style="margin-top: 0; margin-bottom: 16px;">➕ Yangi kitob qo'shish</h3>
          <form id="add-book-form" style="display: flex; flex-direction: column; gap: 14px;">
            <div class="input-group" style="margin-bottom: 0;">
              <label for="book-title">Kitob nomi</label>
              <input type="text" id="book-title" class="input" placeholder="Masalan: Mehrobdan chayon" required>
            </div>
            
            <div class="input-group" style="margin-bottom: 0;">
              <label for="book-author">Muallif</label>
              <input type="text" id="book-author" class="input" placeholder="Masalan: Abdulla Qodiriy" required>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="input-group" style="margin-bottom: 0;">
                <label for="book-year">Yozilgan yili</label>
                <input type="number" id="book-year" class="input" placeholder="Masalan: 1929" required>
              </div>
              <div class="input-group" style="margin-bottom: 0;">
                <label for="book-genre">Janri</label>
                <input type="text" id="book-genre" class="input" placeholder="Masalan: Roman" required>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="input-group" style="margin-bottom: 0;">
                <label for="book-difficulty">Qiyinchilik darajasi</label>
                <select id="book-difficulty" class="input">
                  <option value="Oson">Oson</option>
                  <option value="O'rta" selected>O'rta</option>
                  <option value="Qiyin">Qiyin</option>
                </select>
              </div>
              <div class="input-group" style="margin-bottom: 0;">
                <label for="book-cover">Muqova Emoji</label>
                <input type="text" id="book-cover" class="input" placeholder="Masalan: 🦂">
              </div>
              <div class="input-group" style="margin-bottom: 0;">
                <label for="book-cover-image">Muqova rasmi (ixtiyoriy)</label>
                <input type="file" id="book-cover-image" class="input" accept="image/*">
                <div id="book-cover-preview" style="margin-top: 8px; display: none;"></div>
              </div>
            </div>

            <div class="input-group" style="margin-bottom: 0;">
              <label for="book-description">Qisqacha tavsif (2-3 jumla)</label>
              <textarea id="book-description" class="input" placeholder="Kitob syujeti va mazmuni haqida..." required></textarea>
            </div>

            <button type="submit" class="btn btn-primary" style="margin-top: 8px;">💾 Kitobni saqlash</button>
          </form>
        </div>

        <!-- Right: Current Books List -->
        <div>
          <h3 class="section-title">📚 Mavjud kitoblar (${books.length} ta)</h3>
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 520px; overflow-y: auto; padding-right: 4px;">
            ${books.map(b => `
              <div class="card" style="padding: 16px; background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 2rem;">${escapeHtml(b.cover)}</span>
                  <div>
                    <h4 style="font-weight: 600; font-size: 1rem; margin-bottom: 2px;">${escapeHtml(b.title)}</h4>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(b.author)} • ${escapeHtml(b.genre)}</p>
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-outline btn-sm edit-book-btn" data-id="${b.id}" style="color: var(--color-primary); border-color: rgba(99, 102, 241, 0.2); background: rgba(99, 102, 241, 0.05);">
                    ✏️ Tahrirlash
                  </button>
                  <button class="btn btn-outline btn-sm delete-book-btn" data-id="${b.id}" style="color: var(--color-error); border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05);">
                    🗑️ O'chirish
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Handle book addition
    const form = document.getElementById('add-book-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');

      const title = document.getElementById('book-title').value.trim();
      const author = document.getElementById('book-author').value.trim();
      const year = parseInt(document.getElementById('book-year').value);
      const genre = document.getElementById('book-genre').value.trim();
      const difficulty = document.getElementById('book-difficulty').value;
      const cover = document.getElementById('book-cover').value.trim();
      const description = document.getElementById('book-description').value.trim();
      const coverImageInput = document.getElementById('book-cover-image');

      let coverImage = '';
      if (coverImageInput && coverImageInput.files && coverImageInput.files[0]) {
        coverImage = await fileToBase64(coverImageInput.files[0]);
      }

      const gradients = [
        ['#4F46E5', '#7C3AED'],
        ['#0EA5E9', '#2563EB'],
        ['#DC2626', '#9333EA'],
        ['#16A34A', '#059669'],
        ['#D97706', '#DC2626'],
        ['#CA8A04', '#EA580C'],
        ['#0D9488', '#0284C7']
      ];
      const randomGradient = gradients[Math.floor(Math.random() * gradients.length)];

      const newBook = {
        id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID(),
        title,
        author,
        year,
        genre,
        difficulty,
        cover,
        coverBg: `linear-gradient(135deg, ${randomGradient[0]}, ${randomGradient[1]})`,
        coverImage: coverImage || undefined,
        description,
        questionCount: 0
      };

      try {
        // Loading state
        submitBtn.disabled = true;
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '⏳ Saqlanmoqda...';

        await addBook(newBook);
        showNotification("Yangi kitob qo'shildi! 🥳", "success");
        renderBooksTab(container); // reload
      } catch (err) {
        console.error(err);
        showNotification(err.message || "Kitob qo'shishda xatolik yuz berdi", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Kitobni saqlash';
      }
    });

    // Image preview for add form
    const addImageInput = document.getElementById('book-cover-image');
    const addPreviewDiv = document.getElementById('book-cover-preview');
    addImageInput.addEventListener('change', function() {
      const file = this.files && this.files[0];
      if (!file) return;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showNotification('Faqat JPEG, PNG, GIF yoki WEBP formatlari qabul qilinadi', 'error');
        this.value = '';
        addPreviewDiv.style.display = 'none';
        return;
      }
      const maxSize = 2 * 1024 * 1024;
      if (file.size > maxSize) {
        showNotification('Rasm hajmi 2 MB dan oshmasligi kerak', 'error');
        this.value = '';
        addPreviewDiv.style.display = 'none';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        addPreviewDiv.style.display = 'block';
        addPreviewDiv.innerHTML = `<img src="${e.target.result}" style="max-width: 120px; max-height: 160px; border-radius: var(--radius-sm);" alt="Muqova preview">`;
      };
      reader.readAsDataURL(file);
    });

    // Handle book deletion
    container.querySelectorAll('.delete-book-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm("Haqiqatan ham bu kitobni va uning barcha savollarini o'chirmoqchisiz?")) return;
        const bookId = btn.dataset.id;
        try {
          // Delete book
          await deleteBook(bookId);
          // Delete questions of this book
          const qs = await getQuestionsByBook(bookId);
          for (const q of qs) {
            await deleteQuestion(q.id);
          }
          showNotification("Kitob muvaffaqiyatli o'chirildi", "success");
          renderBooksTab(container); // reload
        } catch (err) {
          showNotification("Kitobni o'chirishda xatolik", "error");
        }
      });
    });

    // Handle edit book
    container.querySelectorAll('.edit-book-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bookId = btn.dataset.id;
        const book = await getBookById(bookId);
        if (!book) {
          showNotification("Kitob topilmadi", "error");
          return;
        }
        showEditBookModal(book, container);
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="text-error text-center">Xatolik yuz berdi</div>`;
  }
}

function showEditBookModal(book, container) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.innerHTML = `
    <div class="modal-content fade-in">
      <div class="modal-header">
        <h3 class="modal-title">✏️ Kitobni tahrirlash</h3>
        <button class="modal-close-btn" id="modal-close-btn">&times;</button>
      </div>
      <form id="edit-book-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-book-title">Kitob nomi</label>
          <input type="text" id="edit-book-title" class="input" value="${escapeHtml(book.title)}" required>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-book-author">Muallif</label>
          <input type="text" id="edit-book-author" class="input" value="${escapeHtml(book.author)}" required>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="edit-book-year">Yozilgan yili</label>
            <input type="number" id="edit-book-year" class="input" value="${book.year}" required>
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="edit-book-genre">Janri</label>
            <input type="text" id="edit-book-genre" class="input" value="${escapeHtml(book.genre)}" required>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="edit-book-difficulty">Qiyinchilik darajasi</label>
            <select id="edit-book-difficulty" class="input">
              <option value="Oson" ${book.difficulty === 'Oson' ? 'selected' : ''}>Oson</option>
              <option value="O'rta" ${book.difficulty === "O'rta" ? 'selected' : ''}>O'rta</option>
              <option value="Qiyin" ${book.difficulty === 'Qiyin' ? 'selected' : ''}>Qiyin</option>
            </select>
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="edit-book-cover">Muqova Emoji</label>
            <input type="text" id="edit-book-cover" class="input" value="${escapeHtml(book.cover || '')}">
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-book-cover-image">Muqova rasmi (ixtiyoriy)</label>
          <input type="file" id="edit-book-cover-image" class="input" accept="image/*">
          <div id="edit-book-cover-preview" style="margin-top: 8px;${book.coverImage && book.coverImage.startsWith('data:') ? '' : ' display: none;'}">
            ${book.coverImage && book.coverImage.startsWith('data:') ? `<img src="${escapeHtml(book.coverImage)}" style="max-width: 120px; max-height: 160px; border-radius: var(--radius-sm);">` : ''}
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-book-description">Qisqacha tavsif</label>
          <textarea id="edit-book-description" class="input" required>${escapeHtml(book.description)}</textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="modal-cancel-btn">Bekor qilish</button>
          <button type="submit" class="btn btn-primary">💾 Saqlash</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();

  modalOverlay.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Image preview for edit form
  const editImageInput = modalOverlay.querySelector('#edit-book-cover-image');
  const editPreviewDiv = modalOverlay.querySelector('#edit-book-cover-preview');
  editImageInput.addEventListener('change', function() {
    const file = this.files && this.files[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showNotification('Faqat JPEG, PNG, GIF yoki WEBP formatlari qabul qilinadi', 'error');
      this.value = '';
      return;
    }
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      showNotification('Rasm hajmi 2 MB dan oshmasligi kerak', 'error');
      this.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      editPreviewDiv.style.display = 'block';
      editPreviewDiv.innerHTML = `<img src="${e.target.result}" style="max-width: 120px; max-height: 160px; border-radius: var(--radius-sm);" alt="Muqova preview">`;
    };
    reader.readAsDataURL(file);
  });

  const editForm = modalOverlay.querySelector('#edit-book-form');
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = editForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ Saqlanmoqda...';
    const updates = {
      title: modalOverlay.querySelector('#edit-book-title').value.trim(),
      author: modalOverlay.querySelector('#edit-book-author').value.trim(),
      year: parseInt(modalOverlay.querySelector('#edit-book-year').value),
      genre: modalOverlay.querySelector('#edit-book-genre').value.trim(),
      difficulty: modalOverlay.querySelector('#edit-book-difficulty').value,
      cover: modalOverlay.querySelector('#edit-book-cover').value.trim(),
      description: modalOverlay.querySelector('#edit-book-description').value.trim()
    };

    if (!updates.cover) {
      updates.cover = book.cover || '📖';
    }

    const fileInput = modalOverlay.querySelector('#edit-book-cover-image');
    if (fileInput.files && fileInput.files[0]) {
      updates.coverImage = await fileToBase64(fileInput.files[0]);
    }

    try {
      await updateBook(book.id, updates);
      showNotification("Kitob muvaffaqiyatli yangilandi! 🥳", "success");
      closeModal();
      renderBooksTab(container);
    } catch (err) {
      console.error(err);
      showNotification(err.message || "Kitobni yangilashda xatolik yuz berdi", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

// 3. QUESTIONS MANAGEMENT TAB
async function renderQuestionsTab(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const books = await getAllBooks();
    if (books.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <div class="empty-state-title">Avval kitob qo'shing</div>
          <p style="color: var(--text-secondary);">Savollar qo'shishdan oldin kamida bitta kitob yarating.</p>
        </div>
      `;
      return;
    }

    let selectedBookId = books[0].id;

    function renderQuestionsLayout() {
      container.innerHTML = `
        <div class="fade-in grid grid-2" style="align-items: start; gap: 24px;">
          <!-- Left: Add Question Form -->
          <div class="card">
            <h3 class="section-title" style="margin-top: 0; margin-bottom: 16px;">➕ Yangi savol qo'shish</h3>
            
            <div class="input-group" style="margin-bottom: 16px;">
              <label for="select-book-choice">Kitobni tanlang</label>
              <select id="select-book-choice" class="input">
                ${books.map(b => `<option value="${b.id}" ${b.id === selectedBookId ? 'selected' : ''}>${b.title}</option>`).join('')}
              </select>
            </div>

            <form id="add-question-form" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="input-group" style="margin-bottom: 0;">
                <label for="q-text">Savol matni</label>
                <input type="text" id="q-text" class="input" placeholder="Savolni yozing..." required>
              </div>

              <div class="input-group" style="margin-bottom: 0;">
                <label>Javob variantlari</label>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-weight: 700; color: var(--text-muted);">A</span>
                    <input type="text" id="opt-0" class="input" placeholder="Variant A" required>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-weight: 700; color: var(--text-muted);">B</span>
                    <input type="text" id="opt-1" class="input" placeholder="Variant B" required>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-weight: 700; color: var(--text-muted);">C</span>
                    <input type="text" id="opt-2" class="input" placeholder="Variant C" required>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-weight: 700; color: var(--text-muted);">D</span>
                    <input type="text" id="opt-3" class="input" placeholder="Variant D" required>
                  </div>
                </div>
              </div>

              <div class="input-group" style="margin-bottom: 0;">
                <label for="q-correct">To'g'ri javob</label>
                <select id="q-correct" class="input">
                  <option value="0">Variant A</option>
                  <option value="1">Variant B</option>
                  <option value="2">Variant C</option>
                  <option value="3">Variant D</option>
                </select>
              </div>

              <div class="input-group" style="margin-bottom: 0;">
                <label for="q-explanation">Tushuntirish (Izoh)</label>
                <textarea id="q-explanation" class="input" placeholder="Bu javob nima uchun to'g'ri ekanligi haqida tushuntirish..." required></textarea>
              </div>

              <button type="submit" class="btn btn-primary" style="margin-top: 8px;">💾 Savolni saqlash</button>
            </form>
          </div>

          <!-- Right: Questions List of Selected Book -->
          <div>
            <h3 class="section-title">❓ Savollar ro'yxati</h3>
            <div id="questions-list-container" style="display: flex; flex-direction: column; gap: 14px; max-height: 520px; overflow-y: auto; padding-right: 4px;">
              <!-- Loaded dynamically -->
            </div>
          </div>
        </div>
      `;

      // Select book handler
      const selectChoice = document.getElementById('select-book-choice');
      selectChoice.addEventListener('change', (e) => {
        selectedBookId = e.target.value;
        loadQuestionsForSelectedBook();
      });

      // Submit new question
      const qForm = document.getElementById('add-question-form');
      const qSubmitBtn = qForm.querySelector('button[type="submit"]');
      qForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const questionText = document.getElementById('q-text').value.trim();
        const optA = document.getElementById('opt-0').value.trim();
        const optB = document.getElementById('opt-1').value.trim();
        const optC = document.getElementById('opt-2').value.trim();
        const optD = document.getElementById('opt-3').value.trim();
        const correctAnswer = parseInt(document.getElementById('q-correct').value);
        const explanation = document.getElementById('q-explanation').value.trim();

        const newQ = {
          id: `q-${selectedBookId}-${Date.now()}`,
          bookId: selectedBookId,
          question: questionText,
          options: [optA, optB, optC, optD],
          correctAnswer,
          explanation
        };

        qSubmitBtn.disabled = true;
        qSubmitBtn.innerHTML = '⏳ Saqlanmoqda...';
        console.log("=== SAVOL SAQLASH ===");
console.log("selectedBookId:", selectedBookId);
console.log("newQ:", newQ);

await addQuestion(newQ);

console.log("Savol muvaffaqiyatli saqlandi");
        try {
          await addQuestion(newQ);
          // Increment book's questionCount
          const book = books.find(b => b.id === selectedBookId);
          if (book) {
            const currentCount = book.questionCount || 0;
            const { updateBook } = await import('./db.js');
            await updateBook(selectedBookId, { questionCount: currentCount + 1 });
            book.questionCount = currentCount + 1; // local update
          }

          showNotification("Yangi savol muvaffaqiyatli qo'shildi!", "success");
          qForm.reset();
          qSubmitBtn.disabled = false;
          qSubmitBtn.innerHTML = '💾 Savolni saqlash';
          loadQuestionsForSelectedBook();
        } catch (err) {
          showNotification("Savol qo'shishda xatolik yuz berdi", "error");
          qSubmitBtn.disabled = false;
          qSubmitBtn.innerHTML = '💾 Savolni saqlash';
        }
      });

      // Initial load
      loadQuestionsForSelectedBook();
    }

    async function loadQuestionsForSelectedBook() {
      const listContainer = document.getElementById('questions-list-container');
      if (!listContainer) return;

      listContainer.innerHTML = `
        <div class="loading-state" style="padding: 20px 0;">
          <div class="spinner"></div>
        </div>
      `;

      try {
        const qs = await getQuestionsByBook(selectedBookId);
        if (qs.length === 0) {
          listContainer.innerHTML = `
            <div class="text-center" style="padding: 40px 0; color: var(--text-secondary);">
              Bu kitobga hali savol qo'shilmagan.
            </div>
          `;
          return;
        }

        listContainer.innerHTML = qs.map((q, i) => `
          <div class="card" style="padding: 16px; background: var(--bg-secondary);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
              <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">SAVOL ${i + 1}</span>
              <button class="btn btn-ghost btn-sm delete-q-btn" data-id="${q.id}" style="color: var(--color-error); padding: 2px 8px;">
                O'chirish
              </button>
            </div>
            <p style="font-weight: 600; font-size: 0.95rem; margin-bottom: 12px; line-height: 1.5;">${q.question}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem; color: var(--text-secondary);">
              ${q.options.map((opt, oIdx) => `
                <div style="padding: 6px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid ${oIdx === q.correctAnswer ? 'var(--color-success)40' : 'transparent'}; color: ${oIdx === q.correctAnswer ? 'var(--color-success)' : 'inherit'};">
                  ${String.fromCharCode(65 + oIdx)}) ${opt}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');

        // Handle delete question
        listContainer.querySelectorAll('.delete-q-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm("Ushbu test savolini o'chirmoqchisiz?")) return;
            const qId = btn.dataset.id;
            try {
              await deleteQuestion(qId);
              // Decrement book's questionCount
              const book = books.find(b => b.id === selectedBookId);
              if (book) {
                const currentCount = Math.max(0, (book.questionCount || 0) - 1);
                const { updateBook } = await import('./db.js');
                await updateBook(selectedBookId, { questionCount: currentCount });
                book.questionCount = currentCount; // local update
              }
              showNotification("Savol o'chirildi", "success");
              loadQuestionsForSelectedBook();
            } catch (err) {
              showNotification("Savolni o'chirishda xatolik", "error");
            }
          });
        });

      } catch (err) {
        listContainer.innerHTML = `<div class="text-error">Savollarni yuklashda xatolik.</div>`;
      }
    }

    renderQuestionsLayout();

  } catch (err) {
    container.innerHTML = `<div class="text-error text-center">Xatolik yuz berdi</div>`;
  }
}

// 4. COMMENTS MODERATION TAB
async function renderCommentsTab(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const comments = await getAllComments();

    if (comments.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-title">Izohlar mavjud emas</div>
          <p style="color: var(--text-secondary);">Foydalanuvchilar tomonidan hali fikr qoldirilmagan.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="fade-in card">
        <h3 class="section-title" style="margin-top: 0;">💬 Izohlarni moderatsiya qilish</h3>
        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${comments.map(c => `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); gap: 16px;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 1.25rem;">${escapeHtml(c.userAvatar || '😊')}</span>
                  <span style="font-weight: 700;">${escapeHtml(c.userName)}</span>
                  <span style="font-size: 0.8rem; color: var(--text-muted);">${new Date(c.createdAt).toLocaleString('uz')}</span>
                </div>
                <p style="margin-top: 8px; color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem;">${escapeHtml(c.text)}</p>
                <p style="margin-top: 4px; font-size: 0.75rem; color: var(--color-primary-hover); font-weight: 600;">Kitob ID: ${escapeHtml(c.bookId)}</p>
              </div>
              <button class="btn btn-outline btn-sm delete-comment-moderation-btn" data-id="${escapeHtml(c.id)}" style="color: var(--color-error); border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.03);">
                🗑️ O'chirish
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Handle delete comment
    container.querySelectorAll('.delete-comment-moderation-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm("Ushbu fikrni o'chirib tashlamoqchisiz?")) return;
        const commentId = btn.dataset.id;
        try {
          await deleteComment(commentId);
          showNotification("Izoh muvaffaqiyatli o'chirildi", "success");
          renderCommentsTab(container); // reload
        } catch (err) {
          showNotification("Izohni o'chirishda xatolik", "error");
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="text-error text-center">Xatolik yuz berdi</div>`;
  }
}

// 5. USERS MANAGEMENT TAB
async function renderUsersTab(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const users = await getAllUsers();

    container.innerHTML = `
      <div class="fade-in card">
        <h3 class="section-title" style="margin-top: 0;">👥 Ro'yxatdan o'tgan foydalanuvchilar</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-secondary);">
                <th style="padding: 12px 8px;">Foydalanuvchi</th>
                <th style="padding: 12px 8px;">Username</th>
                <th style="padding: 12px 8px;">Rol</th>
                <th style="padding: 12px 8px;">Ro'yxatdan o'tgan</th>
                <th style="padding: 12px 8px; text-align: right;">Amallar</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 14px 8px; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.5rem;">${escapeHtml(u.avatar || '😊')}</span>
                    <span style="font-weight: 600;">${escapeHtml(u.fullName)}</span>
                  </td>
                  <td style="padding: 14px 8px; color: var(--text-secondary);">@${escapeHtml(u.username)}</td>
                  <td style="padding: 14px 8px;">
                    <span class="badge ${u.isAdmin ? 'badge-primary' : 'badge-success'}">${u.isAdmin ? 'Admin' : 'Foydalanuvchi'}</span>
                  </td>
                  <td style="padding: 14px 8px; color: var(--text-muted); font-size: 0.85rem;">${new Date(u.createdAt).toLocaleDateString('uz')}</td>
                  <td style="padding: 14px 8px; text-align: right;">
                    ${u.username === 'admin' ? `
                      <span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">O'chirib bo'lmaydi</span>
                    ` : `
                      <button class="btn btn-ghost btn-sm delete-user-btn" data-id="${escapeHtml(u.id)}" style="color: var(--color-error);">
                        O'chirish
                      </button>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Handle delete user via Edge Function
    container.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm("Ushbu foydalanuvchini va uning barcha natijalarini o'chirmoqchisiz?")) return;
        const userId = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
          const { data: { session } } = await (await import('./supabase-client.js')).supabase.auth.getSession();
          const accessToken = session?.access_token;
          if (!accessToken) {
            showNotification('Tizimga kirmagansiz', 'error');
            btn.disabled = false;
            btn.innerHTML = 'O\'chirish';
            return;
          }
          const res = await fetch('https://gvgyaxlbpkvpvwpqxjwc.supabase.co/functions/v1/delete-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ userId })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Server xatoligi');
          }
          showNotification("Foydalanuvchi tizimdan o'chirildi", "success");
          renderUsersTab(container);
        } catch (err) {
          showNotification(err.message || 'Foydalanuvchini o\'chirishda xatolik', "error");
          btn.disabled = false;
          btn.innerHTML = 'O\'chirish';
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="text-error text-center">Xatolik yuz berdi</div>`;
  }
}

// 6. CHARACTERS MANAGEMENT TAB
async function renderCharactersTab(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const { characters: defaultChars } = await import('./data.js');

    // Check if Supabase has characters; if not, seed defaults
    let remoteChars = [];
    try {
      remoteChars = await getAllCharacters();
    } catch (e) {
      console.warn('Characters store not available yet:', e);
    }

    if (remoteChars.length === 0 && defaultChars.length > 0) {
      for (const c of defaultChars) {
        try { await addCharacter(c); } catch (e) {}
      }
      remoteChars = await getAllCharacters();
    }

    const allChars = remoteChars;

    container.innerHTML = `
      <div class="fade-in grid grid-2" style="align-items: start; gap: 24px;">
        <div class="card">
          <h3 class="section-title" style="margin-top: 0; margin-bottom: 16px;">🦸 Yangi qahramon qo'shish</h3>
          <form id="add-character-form" style="display: flex; flex-direction: column; gap: 14px;">
            <div class="input-group" style="margin-bottom: 0;">
              <label for="char-name">Qahramon nomi</label>
              <input type="text" id="char-name" class="input" placeholder="Masalan: Alpomish" required>
            </div>
            <div class="input-group" style="margin-bottom: 0;">
              <label for="char-book">Asar nomi</label>
              <input type="text" id="char-book" class="input" placeholder="Masalan: Alpomish" required>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="input-group" style="margin-bottom: 0;">
                <label for="char-avatar">Avatar Emoji</label>
                <input type="text" id="char-avatar" class="input" placeholder="Masalan: 👨" value="😊">
              </div>
              <div class="input-group" style="margin-bottom: 0;">
                <label for="char-color">Rang kodi</label>
                <input type="text" id="char-color" class="input" placeholder="Masalan: #3B82F6" value="#6366F1">
              </div>
            </div>
            <div class="input-group" style="margin-bottom: 0;">
              <label for="char-avatar-image">Avatar rasm (ixtiyoriy)</label>
              <input type="file" id="char-avatar-image" class="input" accept="image/*">
              <div id="char-avatar-preview" style="margin-top: 8px; display: none;"></div>
            </div>
            <div class="input-group" style="margin-bottom: 0;">
              <label for="char-desc">Tavsif</label>
              <textarea id="char-desc" class="input" placeholder="Qahramon haqida qisqacha..." required></textarea>
            </div>
            <button type="submit" class="btn btn-primary">💾 Qahramonni saqlash</button>
          </form>
        </div>

        <div>
          <h3 class="section-title">🦸 Mavjud qahramonlar (${allChars.length} ta)</h3>
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 560px; overflow-y: auto; padding-right: 4px;">
            ${allChars.map(c => `
              <div class="card" style="padding: 16px; background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; background: ${escapeHtml(c.color)}20; color: ${escapeHtml(c.color)}; flex-shrink: 0;${safeCssUrl(c.avatarImage)}">
                    ${escapeHtml(c.avatar || '😊')}
                  </div>
                  <div>
                    <h4 style="font-weight: 600; font-size: 0.95rem; margin-bottom: 2px;">${escapeHtml(c.name)}</h4>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(c.bookTitle)}</p>
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-outline btn-sm edit-char-btn" data-id="${escapeHtml(c.id)}" style="color: var(--color-primary); border-color: rgba(99, 102, 241, 0.2); background: rgba(99, 102, 241, 0.05);">
                    ✏️ Tahrirlash
                  </button>
                  <button class="btn btn-outline btn-sm delete-char-btn" data-id="${escapeHtml(c.id)}" style="color: var(--color-error); border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05);">
                    🗑️ O'chirish
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Image preview for add form with validation
    const addImageInput = document.getElementById('char-avatar-image');
    const addPreviewDiv = document.getElementById('char-avatar-preview');
    addImageInput.addEventListener('change', function() {
      const file = this.files && this.files[0];
      if (!file) return;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showNotification('Faqat JPEG, PNG, GIF yoki WEBP formatlari qabul qilinadi', 'error');
        this.value = '';
        return;
      }
      const maxSize = 2 * 1024 * 1024;
      if (file.size > maxSize) {
        showNotification('Rasm hajmi 2 MB dan oshmasligi kerak', 'error');
        this.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        addPreviewDiv.style.display = 'block';
        addPreviewDiv.innerHTML = `<img src="${e.target.result}" style="max-width: 80px; max-height: 80px; border-radius: 50%;">`;
      };
      reader.readAsDataURL(file);
    });

    // Handle add character
    const charForm = document.getElementById('add-character-form');
    charForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = charForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Saqlanmoqda...';

      const name = document.getElementById('char-name').value.trim();
      const bookTitle = document.getElementById('char-book').value.trim();
      const avatar = document.getElementById('char-avatar').value.trim() || '😊';
      const color = document.getElementById('char-color').value.trim() || '#6366F1';
      const description = document.getElementById('char-desc').value.trim();
      const fileInput = document.getElementById('char-avatar-image');

      let avatarImage = '';
      if (fileInput.files && fileInput.files[0]) {
        avatarImage = await fileToBase64(fileInput.files[0]);
      }

      const newChar = {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID(),
        name,
        bookTitle,
        avatar,
        color,
        avatarImage: avatarImage || undefined,
        description
      };

      try {
        await addCharacter(newChar);
        showNotification("Yangi qahramon qo'shildi! 🦸", "success");
        renderCharactersTab(container);
      } catch (err) {
        showNotification(err.message || "Qahramon qo'shishda xatolik", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Qahramonni saqlash';
      }
    });

    // Handle delete character
    container.querySelectorAll('.delete-char-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Haqiqatan ham "${allChars.find(c => c.id === btn.dataset.id)?.name}" qahramonini o'chirmoqchisiz?`)) return;
        btn.disabled = true;
        btn.innerHTML = '⏳';
        try {
          await deleteCharacter(btn.dataset.id);
          showNotification("Qahramon o'chirildi", "success");
          renderCharactersTab(container);
        } catch (err) {
          showNotification(err.message || "Qahramonni o'chirishda xatolik", "error");
          btn.disabled = false;
          btn.innerHTML = '🗑️ O\'chirish';
        }
      });
    });

    // Handle edit character
    container.querySelectorAll('.edit-char-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const char = allChars.find(c => c.id === btn.dataset.id);
        if (!char) { showNotification("Qahramon topilmadi", "error"); return; }
        showEditCharModal(char, container);
      });
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="text-error text-center">Xatolik yuz berdi</div>`;
  }
}

function showEditCharModal(char, container) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.innerHTML = `
    <div class="modal-content fade-in">
      <div class="modal-header">
        <h3 class="modal-title">✏️ Qahramonni tahrirlash</h3>
        <button class="modal-close-btn" id="char-modal-close">&times;</button>
      </div>
      <form id="edit-char-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-char-name">Qahramon nomi</label>
          <input type="text" id="edit-char-name" class="input" value="${escapeHtml(char.name)}" required>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-char-book">Asar nomi</label>
          <input type="text" id="edit-char-book" class="input" value="${escapeHtml(char.bookTitle)}" required>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="edit-char-avatar">Avatar Emoji</label>
            <input type="text" id="edit-char-avatar" class="input" value="${escapeHtml(char.avatar || '😊')}">
          </div>
          <div class="input-group" style="margin-bottom: 0;">
            <label for="edit-char-color">Rang kodi</label>
            <input type="text" id="edit-char-color" class="input" value="${char.color || '#6366F1'}">
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-char-avatar-image">Avatar rasm (ixtiyoriy)</label>
          <input type="file" id="edit-char-avatar-image" class="input" accept="image/*">
          <div id="edit-char-avatar-preview" style="margin-top: 8px;${safeCssUrl(char.avatarImage) ? '' : ' display: none;'}">
            ${safeCssUrl(char.avatarImage) ? `<img src="${escapeHtml(char.avatarImage)}" style="max-width: 80px; max-height: 80px; border-radius: 50%;">` : ''}
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label for="edit-char-desc">Tavsif</label>
          <textarea id="edit-char-desc" class="input" required>${escapeHtml(char.description)}</textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="char-modal-cancel">Bekor qilish</button>
          <button type="submit" class="btn btn-primary">💾 Saqlash</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);
  const close = () => modalOverlay.remove();
  modalOverlay.querySelector('#char-modal-close').addEventListener('click', close);
  modalOverlay.querySelector('#char-modal-cancel').addEventListener('click', close);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) close(); });

  // Image preview with validation
  const editImageInput = modalOverlay.querySelector('#edit-char-avatar-image');
  const editPreviewDiv = modalOverlay.querySelector('#edit-char-avatar-preview');
  editImageInput.addEventListener('change', function() {
    const file = this.files && this.files[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showNotification('Faqat JPEG, PNG, GIF yoki WEBP formatlari qabul qilinadi', 'error');
      this.value = '';
      return;
    }
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      showNotification('Rasm hajmi 2 MB dan oshmasligi kerak', 'error');
      this.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      editPreviewDiv.style.display = 'block';
      editPreviewDiv.innerHTML = `<img src="${e.target.result}" style="max-width: 80px; max-height: 80px; border-radius: 50%;">`;
    };
    reader.readAsDataURL(file);
  });

  modalOverlay.querySelector('#edit-char-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = modalOverlay.querySelector('#edit-char-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Saqlanmoqda...';

    const updates = {
      name: modalOverlay.querySelector('#edit-char-name').value.trim(),
      bookTitle: modalOverlay.querySelector('#edit-char-book').value.trim(),
      avatar: modalOverlay.querySelector('#edit-char-avatar').value.trim() || '😊',
      color: modalOverlay.querySelector('#edit-char-color').value.trim() || '#6366F1',
      description: modalOverlay.querySelector('#edit-char-desc').value.trim()
    };
    const fileInput = modalOverlay.querySelector('#edit-char-avatar-image');
    if (fileInput.files && fileInput.files[0]) {
      updates.avatarImage = await fileToBase64(fileInput.files[0]);
    } else if (char.avatarImage) {
      updates.avatarImage = char.avatarImage;
    }
    try {
      await updateCharacter(char.id, updates);
      showNotification("Qahramon yangilandi! 🦸", "success");
      close();
      renderCharactersTab(container);
    } catch (err) {
      showNotification(err.message || "Qahramonni yangilashda xatolik", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = '💾 Saqlash';
    }
  });
}

// 7. BULK IMPORT (COPY-PASTE) TAB
async function renderBulkImportTab(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const books = await getAllBooks();

    container.innerHTML = `
      <div class="fade-in">
        <div class="card mb-lg">
          <h3 class="section-title" style="margin-top: 0;">📋 Copy-Paste orqali test tuzish</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 0.9rem;">
            Quyidagi formatda savollarni tayyorlab, pastdagi maydonga joylashtiring va "Parse qilish" tugmasini bosing.
          </p>

          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md); margin-bottom: 16px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; overflow-x: auto;">
            <strong style="color: var(--text-primary);">Format:</strong><br>
            <code style="white-space: pre-wrap;">
Savol: Savol matni?
A) Variant A
B) Variant B
C) Variant C
D) Variant D
Javob: A
Izoh: Tushuntirish matni

Savol: 2-savol matni?
A) ...
B) ...
C) ...
D) ...
Javob: B
Izoh: ...
            </code>
          </div>

          <div class="input-group" style="margin-bottom: 16px;">
            <label for="bulk-book-select">Kitobni tanlang</label>
            <select id="bulk-book-select" class="input">
              ${books.map(b => `<option value="${b.id}">${b.title} (${b.author})</option>`).join('')}
            </select>
          </div>

          <div class="input-group" style="margin-bottom: 16px;">
            <label for="bulk-textarea">Savollarni joylashtiring</label>
            <textarea id="bulk-textarea" class="input" style="min-height: 300px; font-family: monospace; font-size: 0.9rem;" placeholder="Savollarni yuqoridagi formatda shu yerga joylashtiring..."></textarea>
          </div>

          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <button class="btn btn-primary" id="bulk-parse-btn">🔍 Parse qilish</button>
            <button class="btn btn-secondary" id="bulk-save-all-btn" style="display: none;" disabled>💾 Hammasini saqlash</button>
            <button class="btn btn-outline" id="bulk-clear-btn">🗑️ Tozalash</button>
          </div>
        </div>

        <div id="bulk-preview" class="card" style="display: none;">
          <h3 class="section-title" style="margin-top: 0;">Ko'rib chiqish</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 0.9rem;">
            <span id="bulk-parse-count">0</span> ta savol topildi. Quyida parse qilingan savollarni ko'rishingiz mumkin.
          </p>
          <div id="bulk-preview-list" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>
      </div>
    `;

    const textarea = document.getElementById('bulk-textarea');
    const parseBtn = document.getElementById('bulk-parse-btn');
    const saveAllBtn = document.getElementById('bulk-save-all-btn');
    const clearBtn = document.getElementById('bulk-clear-btn');
    const previewDiv = document.getElementById('bulk-preview');
    const previewList = document.getElementById('bulk-preview-list');
    const parseCount = document.getElementById('bulk-parse-count');
    const bookSelect = document.getElementById('bulk-book-select');

    let parsedQuestions = [];

    clearBtn.addEventListener('click', () => {
      textarea.value = '';
      previewDiv.style.display = 'none';
      saveAllBtn.style.display = 'none';
      saveAllBtn.disabled = true;
      parsedQuestions = [];
    });

    parseBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) {
        showNotification('Iltimos, savollarni joylashtiring!', 'warning');
        return;
      }

      parsedQuestions = parseQuestionsFromText(text);

      if (parsedQuestions.length === 0) {
        showNotification('Hech qanday savol topilmadi. Formatni tekshiring!', 'error');
        previewDiv.style.display = 'none';
        saveAllBtn.style.display = 'none';
        return;
      }

      parseCount.textContent = parsedQuestions.length;
      previewList.innerHTML = parsedQuestions.map((q, i) => {
        const letters = ['A', 'B', 'C', 'D'];
        return `
          <div class="card" style="padding: 16px; background: var(--bg-secondary); border-left: 4px solid var(--color-primary);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">SAVOL ${i + 1}</span>
            </div>
            <p style="font-weight: 600; margin-bottom: 12px;">${escapeHtml(q.question)}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem; margin-bottom: 8px;">
              ${q.options.map((opt, oi) => `
                <div style="padding: 8px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid ${oi === q.correctAnswer ? 'var(--color-success)40' : 'transparent'}; color: ${oi === q.correctAnswer ? 'var(--color-success)' : 'var(--text-secondary)'};">
                  ${letters[oi]}) ${escapeHtml(opt)}
                </div>
              `).join('')}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); padding: 8px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
              <strong>Izoh:</strong> ${escapeHtml(q.explanation || 'Yo\'q')}
            </div>
          </div>
        `;
      }).join('');

      previewDiv.style.display = 'block';
      saveAllBtn.style.display = 'inline-flex';
      saveAllBtn.disabled = false;
      showNotification(`${parsedQuestions.length} ta savol topildi!`, 'success');
    });

    saveAllBtn.addEventListener('click', async () => {
      const selectedBookId = bookSelect.value;
      const book = books.find(b => b.id === selectedBookId);
      if (!book) {
        showNotification('Kitob topilmadi!', 'error');
        return;
      }

      if (parsedQuestions.length === 0) {
        showNotification('Avval savollarni parse qiling!', 'warning');
        return;
      }

      saveAllBtn.disabled = true;
      saveAllBtn.textContent = '⏳ Saqlanmoqda...';

      try {
        let savedCount = 0;
        for (const q of parsedQuestions) {
          const newQ = {
            id: `q-${selectedBookId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            bookId: selectedBookId,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || ''
          };
          await addQuestion(newQ);
          savedCount++;
        }

        const existingQs = await getQuestionsByBook(selectedBookId);
        await updateBook(selectedBookId, { questionCount: existingQs.length });

        showNotification(`${savedCount} ta savol muvaffaqiyatli qo'shildi! 🎉`, 'success');
        parsedQuestions = [];
        previewDiv.style.display = 'none';
        saveAllBtn.style.display = 'none';
        textarea.value = '';
      } catch (err) {
        console.error(err);
        showNotification('Saqlashda xatolik yuz berdi', 'error');
        saveAllBtn.disabled = false;
        saveAllBtn.textContent = '💾 Hammasini saqlash';
      }
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="text-error text-center">Xatolik yuz berdi</div>`;
  }
}

function parseQuestionsFromText(text) {
  const results = [];
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);

    let question = '';
    const options = [];
    let correctAnswer = -1;
    let explanation = '';
    let questionFound = false;

    for (const line of lines) {
      const optionMatch = line.match(/^([A-Da-d])[\.\)]\s*(.+)/);
      const javobMatch = line.match(/^(?:Javob|javob|J|j|Togri|togri|To'g'ri|to'g'ri)\s*[:.]?\s*([A-Da-d])/i);
      const izohMatch = line.match(/^(?:Izoh|izoh|I|i)\s*[:.]?\s*(.+)/i);
      const savolPrefix = line.match(/^(?:Savol|savol|S|s)\s*\d*\s*[:.]\s*(.+)/i);

      if (savolPrefix) {
        question = savolPrefix[1];
        questionFound = true;
      } else if (optionMatch) {
        const letter = optionMatch[1].toUpperCase();
        const textVal = optionMatch[2];
        const idx = letter.charCodeAt(0) - 65;
        if (idx >= 0 && idx <= 5) {
          options[idx] = textVal;
        }
      } else if (javobMatch) {
        const letter = javobMatch[1].toUpperCase();
        correctAnswer = letter.charCodeAt(0) - 65;
      } else if (izohMatch) {
        explanation = izohMatch[1];
      } else if (!questionFound && line.length > 5) {
        question = line;
        questionFound = true;
      }
    }

    if (question && options.length >= 2 && correctAnswer >= 0 && correctAnswer < options.length) {
      while (options.length < 4) {
        const letter = String.fromCharCode(65 + options.length);
        options.push(`(${letter}) ...`);
      }
      if (correctAnswer > 3) correctAnswer = 0;
      results.push({ question, options: options.slice(0, 4), correctAnswer, explanation });
    }
  }

  return results;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
