import { getCurrentUser, updateProfile, logout as authLogout } from './auth.js';
import { getResultsByUser, getAllBooks, getAllCharacters } from './db.js';
import { navigate, showNotification } from './app.js';
import { cssUrl, safeCssUrl } from './utils.js';

export async function renderProfile(container) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    navigate('/login');
    return;
  }

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Profil ma'lumotlari yuklanmoqda...</p>
    </div>
  `;

  try {
    const results = await getResultsByUser(currentUser.id);
    const booksList = await getAllBooks();
    
    const totalTests = results.length;
    const avgScore = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests) : 0;
    
    // Group results by bookId to see unique completed books
    const bookScoresMap = {};
    results.forEach(r => {
      if (!bookScoresMap[r.bookId] || r.score > bookScoresMap[r.bookId]) {
        bookScoresMap[r.bookId] = r.score;
      }
    });
    const booksCompletedCount = Object.keys(bookScoresMap).length;

    container.innerHTML = `
      <div class="fade-in">
        <div class="card glass-card mb-lg profile-header" style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
          <div class="profile-avatar-large" style="width: 80px; height: 80px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; border: 3px solid var(--color-primary); box-shadow: var(--shadow-glow);${safeCssUrl(currentUser.avatarImage)}">
            ${currentUser.avatarImage ? '' : (currentUser.avatar || '😊')}
          </div>
          <div>
            <h1 class="profile-name" style="font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; margin-bottom: 4px;">${currentUser.fullName}</h1>
            <p class="profile-username" style="color: var(--text-muted); font-size: 0.9rem;">@${currentUser.username}</p>
          </div>
        </div>

        <div class="grid grid-4 mb-lg">
          <div class="card stat-card glass-card">
            <div class="stat-value" style="color: var(--color-primary);">${totalTests}</div>
            <div class="stat-label">Jami urinishlar</div>
          </div>
          <div class="card stat-card glass-card">
            <div class="stat-value" style="color: var(--color-secondary);">${avgScore}%</div>
            <div class="stat-label">O'rtacha ko'rsatkich</div>
          </div>
          <div class="card stat-card glass-card">
            <div class="stat-value" style="color: var(--color-success);">${booksCompletedCount} / ${booksList.length}</div>
            <div class="stat-label">Yechilgan kitoblar</div>
          </div>
          <div class="card stat-card glass-card" title="Maksimal streak: ${currentUser.stats?.maxStreak || 0} kun">
            <div class="stat-value" style="color: var(--color-accent);">🔥 ${currentUser.stats?.currentStreak || 0}</div>
            <div class="stat-label">Joriy Streak (Maks: ${currentUser.stats?.maxStreak || 0} kun)</div>
          </div>
        </div>

        <div class="tabs" style="margin-bottom: 24px;">
          <button class="tab active" id="tab-stats">Statistika</button>
          <button class="tab" id="tab-settings">Sozlamalar</button>
        </div>

        <div id="tab-content">
          <!-- Dynamically switched content -->
        </div>
      </div>
    `;

    const statsTab = document.getElementById('tab-stats');
    const settingsTab = document.getElementById('tab-settings');
    const tabContent = document.getElementById('tab-content');

    statsTab.addEventListener('click', () => {
      statsTab.classList.add('active');
      settingsTab.classList.remove('active');
      try {
        renderStatsView(tabContent, booksList, bookScoresMap);
      } catch (err) {
        console.error('Stats render error:', err);
        tabContent.innerHTML = `<div class="text-error text-center">Statistikani yuklashda xatolik.</div>`;
      }
    });

    settingsTab.addEventListener('click', async () => {
      settingsTab.classList.add('active');
      statsTab.classList.remove('active');
      try {
        await renderSettingsView(tabContent, currentUser);
      } catch (err) {
        console.error('Settings render error:', err);
        tabContent.innerHTML = `<div class="text-error text-center">Sozlamalarni yuklashda xatolik. Iltimos, sahifani qayta yuklang.</div>`;
      }
    });

    // Render stats view by default
    renderStatsView(tabContent, booksList, bookScoresMap);

  } catch (err) {
    console.error(err);
    showNotification("Profil ma'lumotlarini yuklashda xatolik", "error");
  }
}

function renderStatsView(container, booksList, bookScoresMap) {
  const completedBooks = booksList.map(book => {
    const score = bookScoresMap[book.id];
    return {
      ...book,
      score: score !== undefined ? score : null
    };
  });

  container.innerHTML = `
    <div class="fade-in">
      <div class="section-title">📊 Kitoblar bo'yicha ko'rsatkichlar</div>
      <div class="profile-books-list">
        ${completedBooks.map(b => {
          const hasAttempt = b.score !== null;
          const percentage = hasAttempt ? b.score : 0;
          let color = 'var(--color-primary)';
          if (percentage >= 80) color = 'var(--color-success)';
          else if (percentage >= 40) color = 'var(--color-warning)';
          else if (hasAttempt) color = 'var(--color-error)';

          return `
            <div class="card glass-card profile-book-card">
              <div class="profile-book-row">
                <div class="profile-book-info">
                  <span class="profile-book-cover"${b.coverImage ? ` style="background: ${cssUrl(b.coverImage)} center/cover no-repeat; font-size: 0;"` : ''}>${b.coverImage ? '' : escapeHtml(b.cover)}</span>
                  <div class="profile-book-text">
                    <h3 class="profile-book-title">${b.title}</h3>
                    <p class="profile-book-author">${b.author}</p>
                  </div>
                </div>
                <div class="profile-book-badge">
                  ${hasAttempt ? `
                    <span class="badge" style="background: ${color}20; color: ${color};">Eng yaxshi ball: ${b.score}%</span>
                  ` : `
                    <span class="badge badge-unattempted">Hali yechilmagan</span>
                  `}
                </div>
              </div>

              ${hasAttempt ? `
                <div class="profile-book-progress">
                  <div class="profile-book-progress-bar" style="width: ${percentage}%; background: ${color};"></div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

async function renderSettingsView(container, currentUser) {
  let defaultChars = [];
  try {
    const mod = await import('./data.js');
    defaultChars = mod.characters || [];
  } catch (e) {
    console.warn('Could not load characters from data.js:', e);
  }
  let dbChars = [];
  try {
    dbChars = await getAllCharacters();
  } catch (e) {
    console.warn('Could not load DB characters, using defaults:', e);
  }
  // Merge: DB characters override defaults
  const charMap = {};
  for (const c of defaultChars) charMap[c.id] = c;
  for (const c of dbChars) charMap[c.id] = c;
  const characters = Object.values(charMap);
  let selectedCharId = currentUser.avatarCharId || '';

  container.innerHTML = `
    <div class="fade-in card">
      <h2 class="section-title" style="margin-top: 0;">⚙️ Profil sozlamalari</h2>
      
      <form id="settings-form" style="display: flex; flex-direction: column; gap: 20px;">
        <div class="input-group">
          <label>Profil Personaji (Avatar)</label>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Quyidagi mashhur asarlar qahramonlaridan birini o'z personajingiz sifatida tanlang:</p>
          <div class="character-grid">
            ${characters.map(char => {
              const isSelected = (char.id === selectedCharId) || (!selectedCharId && char.avatar === (currentUser.avatar || ''));
              const avatarStyle = safeCssUrl(char.avatarImage)
                ? safeCssUrl(char.avatarImage)
                : `background: ${escapeHtml(char.color)}20; color: ${escapeHtml(char.color)};`;
              return `
                <div class="character-card ${isSelected ? 'selected' : ''}" data-char-id="${escapeHtml(char.id)}" data-avatar="${escapeHtml(char.avatar)}">
                  <div class="character-avatar-circle" style="${avatarStyle}">
                    ${safeCssUrl(char.avatarImage) ? '' : escapeHtml(char.avatar)}
                  </div>
                  <div style="flex: 1;">
                    <h4 style="font-weight: 700; font-size: 0.95rem;">${char.name}</h4>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">Asar: "${char.bookTitle}"</p>
                    <p style="font-size: 0.75rem; color: var(--text-secondary); font-style: italic; line-height: 1.3;">${char.description}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="input-group">
          <label for="profile-fullName-input">Ism va Familiya</label>
          <input type="text" id="profile-fullName-input" class="input" value="${currentUser.fullName}" required minlength="2">
        </div>

        <div class="input-group">
          <label for="profile-username-input">Foydalanuvchi nomi (Login)</label>
          <input type="text" id="profile-username-input" class="input" value="${currentUser.username}" required minlength="3">
        </div>

        <div class="input-group">
          <label for="profile-password-input">Yangi parol (O'zgartirish uchun yozing, aks holda bo'sh qoldiring)</label>
          <input type="password" id="profile-password-input" class="input" placeholder="Kamida 4 ta belgi" minlength="4">
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 10px;">
          <button type="submit" class="btn btn-primary">💾 Saqlash</button>
          <button type="button" class="btn btn-ghost" id="profile-logout-btn" style="color: var(--color-error);">Chiqish</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('profile-logout-btn')?.addEventListener('click', () => {
    authLogout();
    navigate('/login');
    showNotification('Tizimdan chiqdingiz', 'info');
  });

  // Character card selection handling
  const cards = container.querySelectorAll('.character-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedCharId = card.dataset.charId;
    });
  });

  // Form submission
  const form = document.getElementById('settings-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';

    const fullNameInput = document.getElementById('profile-fullName-input');
    const usernameInput = document.getElementById('profile-username-input');
    const passwordInput = document.getElementById('profile-password-input');

    const newFullName = fullNameInput.value.trim();
    const newUsername = usernameInput.value.trim();
    const newPassword = passwordInput.value;

    if (!newFullName || !newUsername) {
      showNotification("Ism yoki login bo'sh bo'lishi mumkin emas!", "error");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saqlanmoqda...";
    }

    // Find selected character
    const selectedChar = characters.find(c => c.id === selectedCharId);
    const updates = {
      fullName: newFullName,
      username: newUsername,
      avatar: selectedChar ? selectedChar.avatar : (currentUser.avatar || '😊'),
      avatarImage: selectedChar && selectedChar.avatarImage ? selectedChar.avatarImage : undefined,
      avatarCharId: selectedChar ? selectedChar.id : undefined
    };

    if (newPassword) {
      updates.password = newPassword;
    }

    try {
      await updateProfile(updates);
      showNotification("Profil sozlamalari muvaffaqiyatli saqlandi! 🎉", "success");
      // Navigate to profile to refresh the page
      navigate('/profile');
    } catch (err) {
      console.error(err);
      showNotification(err.message || "Saqlashda xatolik yuz berdi", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });
}
