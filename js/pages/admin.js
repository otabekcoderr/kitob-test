// ============================================================
// pages/admin.js — Admin boshqaruv paneli
// ============================================================
// Faqat role === 'admin' bo'lgan foydalanuvchilar kiradi.
// Import: db.js (CRUD) · auth.js · utils.js
// ============================================================
import { supabase }              from '../supabase-client.js';
import { getCurrentUser }        from '../auth.js';
import { escapeHtml,
         showNotification,
         setButtonLoading,
         truncate }              from '../utils.js';
import { navigate }              from '../app.js';

let _cleanup     = [];
let _activeTab   = 'books';

// ============================================================
// RENDER
// ============================================================
export async function render(container, { params, user }) {

  // Rol tekshiruvi
  if (!user || user.role !== 'admin') {
    container.innerHTML = `
      <div class="page">
        <div class="container">
          <div class="empty-state" style="min-height:60vh">
            <div class="empty-state__icon">🔒</div>
            <p class="empty-state__title">Ruxsat yo'q</p>
            <p class="empty-state__desc">Bu sahifa faqat administratorlar uchun.</p>
            <a href="#home" class="btn btn-primary mt-4">Bosh sahifaga</a>
          </div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="page admin-page" id="admin-page">
      <div class="container container--xl">

        <!-- Sarlavha -->
        <div class="admin-header animate-slide-up">
          <div>
            <h1 class="admin-header__title">⚙️ Admin panel</h1>
            <p class="admin-header__sub">Kitobchi boshqaruv tizimi</p>
          </div>
          <div class="admin-header__stats" id="admin-quick-stats">
            <div class="spinner spinner--sm"></div>
          </div>
        </div>

        <!-- Tab navigatsiya -->
        <div class="tabs admin-tabs animate-slide-up" id="admin-tabs" role="tablist">
          <button class="tab tab--active" data-tab="books"      role="tab" aria-selected="true">📚 Kitoblar</button>
          <button class="tab"             data-tab="questions"  role="tab" aria-selected="false">❓ Savollar</button>
          <button class="tab"             data-tab="users"      role="tab" aria-selected="false">👥 Foydalanuvchilar</button>
          <button class="tab"             data-tab="comments"   role="tab" aria-selected="false">💬 Izohlar</button>
          <button class="tab"             data-tab="characters" role="tab" aria-selected="false">🎭 Personajlar</button>
        </div>

        <!-- Panellar -->
        <div id="admin-panel" class="animate-slide-up">
          <div class="loading-state">
            <div class="spinner"></div>
            <span>Yuklanmoqda...</span>
          </div>
        </div>

      </div>
    </div>
  `;

  _addStyles();

  // Tezkor statistika
  _loadQuickStats();

  // Tab hodisalari
  const tabsEl = document.getElementById('admin-tabs');
  const onTab  = (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    _activeTab = btn.dataset.tab;
    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('tab--active', t === btn);
      t.setAttribute('aria-selected', String(t === btn));
    });
    _loadTab(_activeTab);
  };
  tabsEl.addEventListener('click', onTab);
  _cleanup.push(() => tabsEl.removeEventListener('click', onTab));

  // Birinchi tabni yuklash
  _loadTab('books');
}

// ============================================================
// TEZKOR STATISTIKA
// ============================================================
async function _loadQuickStats() {
  try {
    const [books, questions, users] = await Promise.all([
      supabase.from('books').select('id', { count: 'exact', head: true }),
      supabase.from('questions').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);

    const el = document.getElementById('admin-quick-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="admin-stat-pill">📚 ${books.count ?? 0} kitob</div>
      <div class="admin-stat-pill">❓ ${questions.count ?? 0} savol</div>
      <div class="admin-stat-pill">👥 ${users.count ?? 0} foydalanuvchi</div>
    `;
  } catch { /* ignore */ }
}

// ============================================================
// TAB YUKLASH
// ============================================================
async function _loadTab(tab) {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  panel.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Yuklanmoqda...</span></div>`;

  try {
    switch (tab) {
      case 'books':      await _renderBooks(panel);      break;
      case 'questions':  await _renderQuestions(panel);  break;
      case 'users':      await _renderUsers(panel);      break;
      case 'comments':   await _renderComments(panel);   break;
      case 'characters': await _renderCharacters(panel); break;
    }
  } catch (err) {
    console.error(`[admin] ${tab} xatosi:`, err);
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <p class="empty-state__title">Yuklashda xato</p>
        <p class="empty-state__desc">${escapeHtml(err.message || 'Noma\'lum xato')}</p>
      </div>`;
  }
}

// ============================================================
// 1. KITOBLAR
// ============================================================
async function _renderBooks(panel) {
  const { data: books, error } = await supabase
    .from('books').select('*').order('id');

  if (error) throw error;

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">📚 Kitoblar (${books?.length ?? 0})</h2>
        <button id="add-book-btn" class="btn btn-primary btn-sm">+ Kitob qo'shish</button>
      </div>

      <!-- Qo'shish / tahrirlash formasi (yashirin) -->
      <div id="book-form-wrap" hidden>
        ${_bookFormHTML()}
      </div>

      <!-- Jadval -->
      <div class="admin-table-wrap">
        <table class="admin-table" aria-label="Kitoblar jadvali">
          <thead>
            <tr>
              <th>ID</th><th>Sarlavha</th><th>Muallif</th>
              <th>Kategoriya</th><th>Yil</th><th>Amallar</th>
            </tr>
          </thead>
          <tbody id="books-tbody">
            ${(books || []).map(b => `
              <tr id="book-row-${b.id}">
                <td>${b.id}</td>
                <td><strong>${escapeHtml(b.title)}</strong></td>
                <td>${escapeHtml(b.author || '')}</td>
                <td><span class="badge">${escapeHtml(b.category || '')}</span></td>
                <td>${b.year || '—'}</td>
                <td class="admin-actions">
                  <button class="btn btn-ghost btn-sm edit-book-btn" data-id="${b.id}">✏️ Tahrirlash</button>
                  <button class="btn btn-danger btn-sm del-book-btn"  data-id="${b.id}">🗑️ O'chirish</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  _bindBookEvents(books || []);
}

function _bookFormHTML(book = {}) {
  return `
    <form id="book-form" class="admin-form card">
      <h3 class="admin-form__title">${book.id ? 'Kitobni tahrirlash' : "Yangi kitob qo'shish"}</h3>
      <input type="hidden" id="bf-id" value="${book.id || ''}">
      <div class="admin-form__grid">
        <div class="input-group">
          <label for="bf-title">Sarlavha *</label>
          <input id="bf-title" class="input" type="text" maxlength="200" value="${escapeHtml(book.title||'')}" required>
        </div>
        <div class="input-group">
          <label for="bf-author">Muallif *</label>
          <input id="bf-author" class="input" type="text" maxlength="100" value="${escapeHtml(book.author||'')}" required>
        </div>
        <div class="input-group">
          <label for="bf-category">Kategoriya</label>
          <input id="bf-category" class="input" type="text" maxlength="50" value="${escapeHtml(book.category||'')}">
        </div>
        <div class="input-group">
          <label for="bf-year">Yil</label>
          <input id="bf-year" class="input" type="number" min="1000" max="2100" value="${book.year||''}">
        </div>
        <div class="input-group">
          <label for="bf-pages">Betlar soni</label>
          <input id="bf-pages" class="input" type="number" min="1" value="${book.pages||''}">
        </div>
        <div class="input-group">
          <label for="bf-cover">Muqova URL</label>
          <input id="bf-cover" class="input" type="url" value="${escapeHtml(book.cover_url||'')}">
        </div>
      </div>
      <div class="input-group">
        <label for="bf-desc">Tavsif</label>
        <textarea id="bf-desc" class="input" rows="3" maxlength="1000">${escapeHtml(book.description||'')}</textarea>
      </div>
      <div class="admin-form__actions">
        <button type="submit" id="bf-save" class="btn btn-primary">${book.id ? 'Saqlash' : "Qo'shish"}</button>
        <button type="button" id="bf-cancel" class="btn btn-ghost">Bekor qilish</button>
      </div>
    </form>
  `;
}

function _bindBookEvents(books) {
  const formWrap = document.getElementById('book-form-wrap');

  // Forma ko'rsatish
  const showForm = (book = {}) => {
    formWrap.innerHTML = _bookFormHTML(book);
    formWrap.hidden = false;
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    _bindBookForm();
  };

  document.getElementById('add-book-btn')?.addEventListener('click', () => showForm());

  // Tahrirlash tugmalari
  document.querySelectorAll('.edit-book-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const book = books.find(b => String(b.id) === btn.dataset.id);
      if (book) showForm(book);
    });
  });

  // O'chirish tugmalari
  document.querySelectorAll('.del-book-btn').forEach(btn => {
    btn.addEventListener('click', () => _deleteBook(btn.dataset.id));
  });
}

function _bindBookForm() {
  document.getElementById('bf-cancel')?.addEventListener('click', () => {
    document.getElementById('book-form-wrap').hidden = true;
  });

  document.getElementById('book-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('bf-save');
    setButtonLoading(saveBtn, true);

    const id    = document.getElementById('bf-id')?.value;
    const data  = {
      title:       document.getElementById('bf-title')?.value.trim(),
      author:      document.getElementById('bf-author')?.value.trim(),
      category:    document.getElementById('bf-category')?.value.trim(),
      year:        parseInt(document.getElementById('bf-year')?.value) || null,
      pages:       parseInt(document.getElementById('bf-pages')?.value) || null,
      cover_url:   document.getElementById('bf-cover')?.value.trim(),
      description: document.getElementById('bf-desc')?.value.trim(),
    };

    try {
      const { error } = id
        ? await supabase.from('books').update(data).eq('id', id)
        : await supabase.from('books').insert(data);

      if (error) throw error;
      showNotification(id ? 'Kitob yangilandi ✅' : "Kitob qo'shildi ✅", 'success');
      await _loadTab('books');
    } catch (err) {
      showNotification(`Xato: ${err.message}`, 'error');
    } finally {
      setButtonLoading(saveBtn, false, id ? 'Saqlash' : "Qo'shish");
    }
  });
}

async function _deleteBook(id) {
  if (!confirm(`ID: ${id} kitobni o'chirishni tasdiqlaysizmi?`)) return;
  try {
    const { error } = await supabase.from('books').delete().eq('id', id);
    if (error) throw error;
    showNotification("Kitob o'chirildi", 'success');
    document.getElementById(`book-row-${id}`)?.remove();
  } catch (err) {
    showNotification(`Xato: ${err.message}`, 'error');
  }
}

// ============================================================
// 2. SAVOLLAR
// ============================================================
async function _renderQuestions(panel) {
  // Avval kitoblar ro'yxatini olish (select uchun)
  const { data: books } = await supabase.from('books').select('id, title').order('title');
  const { data: qs,  error } = await supabase
    .from('questions').select('*, books(title)').order('book_id').order('id');

  if (error) throw error;

  const bookOptions = (books || []).map(b =>
    `<option value="${b.id}">${escapeHtml(b.title)}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">❓ Savollar (${qs?.length ?? 0})</h2>
        <button id="add-q-btn" class="btn btn-primary btn-sm">+ Savol qo'shish</button>
      </div>

      <div id="q-form-wrap" hidden>
        ${_questionFormHTML({}, bookOptions)}
      </div>

      <!-- Filter kitob bo'yicha -->
      <div class="input-group" style="max-width:280px;margin-bottom:16px">
        <label for="q-filter-book">Kitob bo'yicha filtrlash</label>
        <select id="q-filter-book" class="input">
          <option value="">— Barcha kitoblar —</option>
          ${bookOptions}
        </select>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table" aria-label="Savollar jadvali">
          <thead>
            <tr>
              <th>ID</th><th>Kitob</th><th>Savol</th>
              <th>Variantlar</th><th>Amallar</th>
            </tr>
          </thead>
          <tbody id="questions-tbody">
            ${_renderQRows(qs || [])}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Filter
  const filterEl = document.getElementById('q-filter-book');
  filterEl?.addEventListener('change', () => {
    const bid = filterEl.value;
    const tbody = document.getElementById('questions-tbody');
    if (!tbody) return;
    const filtered = bid ? (qs || []).filter(q => String(q.book_id) === bid) : (qs || []);
    tbody.innerHTML = _renderQRows(filtered);
    _bindQRowEvents(filtered, bookOptions, qs || []);
  });

  _bindQRowEvents(qs || [], bookOptions, qs || []);

  // Qo'shish
  document.getElementById('add-q-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('q-form-wrap');
    wrap.innerHTML = _questionFormHTML({}, bookOptions);
    wrap.hidden = false;
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    _bindQuestionForm(null);
  });
}

function _renderQRows(qs) {
  return qs.map(q => `
    <tr id="q-row-${q.id}">
      <td>${q.id}</td>
      <td><span class="badge">${escapeHtml(q.books?.title || `#${q.book_id}`)}</span></td>
      <td class="admin-q-text">${escapeHtml(truncate(q.question || q.text || '', 70))}</td>
      <td>${(q.options || []).length} variant</td>
      <td class="admin-actions">
        <button class="btn btn-ghost btn-sm edit-q-btn" data-id="${q.id}">✏️</button>
        <button class="btn btn-danger btn-sm del-q-btn"  data-id="${q.id}">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function _questionFormHTML(q = {}, bookOptions = '') {
  const opts = (q.options || ['','','','']).concat(['','','','']).slice(0,4);
  return `
    <form id="q-form" class="admin-form card">
      <h3 class="admin-form__title">${q.id ? 'Savolni tahrirlash' : "Yangi savol"}</h3>
      <input type="hidden" id="qf-id" value="${q.id || ''}">
      <div class="input-group">
        <label for="qf-book">Kitob *</label>
        <select id="qf-book" class="input" required>
          <option value="">— Kitobni tanlang —</option>
          ${bookOptions}
        </select>
      </div>
      <div class="input-group">
        <label for="qf-text">Savol matni *</label>
        <textarea id="qf-text" class="input" rows="2" required maxlength="500">${escapeHtml(q.question||q.text||'')}</textarea>
      </div>
      ${opts.map((o, i) => `
        <div class="input-group">
          <label for="qf-opt-${i}">Variant ${String.fromCharCode(65+i)} ${i===0?'*':''}</label>
          <input id="qf-opt-${i}" class="input" type="text" maxlength="200"
                 value="${escapeHtml(o)}" ${i===0?'required':''}>
        </div>
      `).join('')}
      <div class="input-group">
        <label for="qf-answer">To'g'ri javob (variant matni) *</label>
        <input id="qf-answer" class="input" type="text" maxlength="200"
               value="${escapeHtml(q.correct_answer||q.answer||'')}" required>
        <span class="input-hint">Yuqoridagi variantlardan birining aniq matni</span>
      </div>
      <div class="admin-form__actions">
        <button type="submit" id="qf-save" class="btn btn-primary">${q.id ? 'Saqlash' : "Qo'shish"}</button>
        <button type="button" id="qf-cancel" class="btn btn-ghost">Bekor qilish</button>
      </div>
    </form>
  `;
}

function _bindQRowEvents(qs, bookOptions, allQs) {
  document.querySelectorAll('.edit-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = qs.find(x => String(x.id) === btn.dataset.id)
               || allQs.find(x => String(x.id) === btn.dataset.id);
      if (!q) return;
      const wrap = document.getElementById('q-form-wrap');
      wrap.innerHTML = _questionFormHTML(q, bookOptions);
      wrap.hidden = false;
      // Kitob selectini tanlash
      const bookSel = document.getElementById('qf-book');
      if (bookSel) bookSel.value = String(q.book_id || '');
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _bindQuestionForm(q.id);
    });
  });

  document.querySelectorAll('.del-q-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Savol ID: ${btn.dataset.id} ni o'chirasizmi?`)) return;
      const { error } = await supabase.from('questions').delete().eq('id', btn.dataset.id);
      if (error) { showNotification(`Xato: ${error.message}`, 'error'); return; }
      showNotification("Savol o'chirildi", 'success');
      document.getElementById(`q-row-${btn.dataset.id}`)?.remove();
    });
  });
}

function _bindQuestionForm(existingId) {
  document.getElementById('qf-cancel')?.addEventListener('click', () => {
    document.getElementById('q-form-wrap').hidden = true;
  });

  document.getElementById('q-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('qf-save');
    setButtonLoading(saveBtn, true);

    const opts = [0,1,2,3]
      .map(i => document.getElementById(`qf-opt-${i}`)?.value.trim())
      .filter(Boolean);

    const data = {
      book_id:        parseInt(document.getElementById('qf-book')?.value),
      question:       document.getElementById('qf-text')?.value.trim(),
      options:        opts,
      correct_answer: document.getElementById('qf-answer')?.value.trim(),
    };

    try {
      const { error } = existingId
        ? await supabase.from('questions').update(data).eq('id', existingId)
        : await supabase.from('questions').insert(data);
      if (error) throw error;
      showNotification(existingId ? 'Savol yangilandi ✅' : "Savol qo'shildi ✅", 'success');
      await _loadTab('questions');
    } catch (err) {
      showNotification(`Xato: ${err.message}`, 'error');
    } finally {
      setButtonLoading(saveBtn, false, existingId ? 'Saqlash' : "Qo'shish");
    }
  });
}

// ============================================================
// 3. FOYDALANUVCHILAR
// ============================================================
async function _renderUsers(panel) {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('*')
    .order('score', { ascending: false });

  if (error) throw error;

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">👥 Foydalanuvchilar (${users?.length ?? 0})</h2>
        <input id="user-search" type="search" class="input" style="max-width:220px"
               placeholder="Qidirish..." aria-label="Foydalanuvchi qidirish">
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table" aria-label="Foydalanuvchilar jadvali">
          <thead>
            <tr>
              <th>ID</th><th>Ism</th><th>Username</th>
              <th>Ball</th><th>Streak</th><th>Rol</th><th>Amallar</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
            ${_renderUserRows(users || [])}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Qidiruv
  const searchEl = document.getElementById('user-search');
  let timer;
  searchEl?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = searchEl.value.toLowerCase();
      const filtered = (users || []).filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.username  || '').toLowerCase().includes(q)
      );
      const tbody = document.getElementById('users-tbody');
      if (tbody) tbody.innerHTML = _renderUserRows(filtered);
      _bindUserEvents(filtered);
    }, 250);
  });

  _bindUserEvents(users || []);
}

function _renderUserRows(users) {
  return users.map(u => `
    <tr id="user-row-${u.id}">
      <td class="text-muted" style="font-size:.8rem">${u.id.slice(0,8)}…</td>
      <td><strong>${escapeHtml(u.full_name || '—')}</strong></td>
      <td>@${escapeHtml(u.username || '')}</td>
      <td style="color:var(--color-primary);font-weight:700">${u.score ?? 0}</td>
      <td>🔥 ${u.streak ?? 0}</td>
      <td>
        <span class="badge ${u.role === 'admin' ? 'badge-error' : ''}">
          ${escapeHtml(u.role || 'user')}
        </span>
      </td>
      <td class="admin-actions">
        <button class="btn btn-ghost btn-sm toggle-role-btn"
                data-id="${u.id}"
                data-role="${u.role || 'user'}">
          ${u.role === 'admin' ? '👤 Foydalanuvchi' : '🔑 Admin'}
        </button>
      </td>
    </tr>
  `).join('');
}

function _bindUserEvents(users) {
  document.querySelectorAll('.toggle-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newRole = btn.dataset.role === 'admin' ? 'user' : 'admin';
      if (!confirm(`Rolni "${newRole}" ga o'girmoqchimisiz?`)) return;

      const { error } = await supabase
        .from('profiles').update({ role: newRole }).eq('id', btn.dataset.id);

      if (error) { showNotification(`Xato: ${error.message}`, 'error'); return; }
      showNotification('Rol yangilandi ✅', 'success');

      // Lokalda yangilash
      btn.dataset.role = newRole;
      btn.textContent  = newRole === 'admin' ? '👤 Foydalanuvchi' : '🔑 Admin';
      const badge = btn.closest('tr')?.querySelector('.badge');
      if (badge) {
        badge.textContent = newRole;
        badge.className = `badge ${newRole === 'admin' ? 'badge-error' : ''}`;
      }
    });
  });
}

// ============================================================
// 4. IZOHLAR MODERATSIYASI
// ============================================================
async function _renderComments(panel) {
  // comments jadvali bo'lmasa ham xato bermaydi
  const { data: comments, error } = await supabase
    .from('comments')
    .select('*, profiles(username, full_name), books(title)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error && error.code === '42P01') {
    // Jadval mavjud emas
    panel.innerHTML = `
      <div class="admin-section">
        <div class="empty-state">
          <div class="empty-state__icon">💬</div>
          <p class="empty-state__title">Izohlar jadvali yo'q</p>
          <p class="empty-state__desc">Supabase da <code>comments</code> jadvali yarating.</p>
        </div>
      </div>`;
    return;
  }
  if (error) throw error;

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">💬 Izohlar (${comments?.length ?? 0})</h2>
      </div>

      ${!comments?.length
        ? `<div class="empty-state">
             <div class="empty-state__icon">💬</div>
             <p class="empty-state__title">Izohlar yo'q</p>
           </div>`
        : `<div class="admin-table-wrap">
             <table class="admin-table" aria-label="Izohlar">
               <thead>
                 <tr><th>ID</th><th>Foydalanuvchi</th><th>Kitob</th><th>Izoh</th><th>Sana</th><th>Amal</th></tr>
               </thead>
               <tbody>
                 ${(comments || []).map(c => `
                   <tr id="comment-row-${c.id}">
                     <td>${c.id}</td>
                     <td>@${escapeHtml(c.profiles?.username || '—')}</td>
                     <td><span class="badge">${escapeHtml(c.books?.title || `#${c.book_id}`)}</span></td>
                     <td class="admin-q-text">${escapeHtml(truncate(c.text || c.body || '', 80))}</td>
                     <td class="text-muted" style="font-size:.8rem;white-space:nowrap">
                       ${c.created_at?.slice(0,10) ?? ''}
                     </td>
                     <td>
                       <button class="btn btn-danger btn-sm del-comment-btn" data-id="${c.id}">
                         🗑️ O'chirish
                       </button>
                     </td>
                   </tr>
                 `).join('')}
               </tbody>
             </table>
           </div>`
      }
    </div>
  `;

  document.querySelectorAll('.del-comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Izohni o\'chirasizmi?')) return;
      const { error: e } = await supabase.from('comments').delete().eq('id', btn.dataset.id);
      if (e) { showNotification(`Xato: ${e.message}`, 'error'); return; }
      showNotification("Izoh o'chirildi", 'success');
      document.getElementById(`comment-row-${btn.dataset.id}`)?.remove();
    });
  });
}

// ============================================================
// 5. PERSONAJLAR
// ============================================================
async function _renderCharacters(panel) {
  const { data: chars, error } = await supabase
    .from('characters')
    .select('*, books(title)')
    .order('book_id');

  if (error && error.code === '42P01') {
    panel.innerHTML = `
      <div class="admin-section">
        <div class="empty-state">
          <div class="empty-state__icon">🎭</div>
          <p class="empty-state__title">Personajlar jadvali yo'q</p>
          <p class="empty-state__desc">Supabase da <code>characters</code> jadvali yarating.</p>
        </div>
      </div>`;
    return;
  }
  if (error) throw error;

  const { data: books } = await supabase.from('books').select('id, title').order('title');
  const bookOptions = (books || []).map(b =>
    `<option value="${b.id}">${escapeHtml(b.title)}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">🎭 Personajlar (${chars?.length ?? 0})</h2>
        <button id="add-char-btn" class="btn btn-primary btn-sm">+ Personaj qo'shish</button>
      </div>

      <div id="char-form-wrap" hidden>
        ${_charFormHTML({}, bookOptions)}
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table" aria-label="Personajlar">
          <thead>
            <tr><th>ID</th><th>Ism</th><th>Kitob</th><th>Ta'rif</th><th>Amallar</th></tr>
          </thead>
          <tbody id="chars-tbody">
            ${(chars || []).map(c => `
              <tr id="char-row-${c.id}">
                <td>${c.id}</td>
                <td><strong>${escapeHtml(c.name || '')}</strong></td>
                <td><span class="badge">${escapeHtml(c.books?.title || `#${c.book_id}`)}</span></td>
                <td class="admin-q-text">${escapeHtml(truncate(c.description || '', 60))}</td>
                <td class="admin-actions">
                  <button class="btn btn-ghost btn-sm edit-char-btn" data-id="${c.id}">✏️</button>
                  <button class="btn btn-danger btn-sm del-char-btn"  data-id="${c.id}">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Qo'shish
  document.getElementById('add-char-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('char-form-wrap');
    wrap.innerHTML = _charFormHTML({}, bookOptions);
    wrap.hidden = false;
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    _bindCharForm(null);
  });

  // Tahrirlash / o'chirish
  document.querySelectorAll('.edit-char-btn').forEach(btn => {
    const c = (chars || []).find(x => String(x.id) === btn.dataset.id);
    if (!c) return;
    btn.addEventListener('click', () => {
      const wrap = document.getElementById('char-form-wrap');
      wrap.innerHTML = _charFormHTML(c, bookOptions);
      const sel = document.getElementById('chf-book');
      if (sel) sel.value = String(c.book_id || '');
      wrap.hidden = false;
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _bindCharForm(c.id);
    });
  });

  document.querySelectorAll('.del-char-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Personajni o\'chirasizmi?')) return;
      const { error: e } = await supabase.from('characters').delete().eq('id', btn.dataset.id);
      if (e) { showNotification(`Xato: ${e.message}`, 'error'); return; }
      showNotification("Personaj o'chirildi", 'success');
      document.getElementById(`char-row-${btn.dataset.id}`)?.remove();
    });
  });
}

function _charFormHTML(c = {}, bookOptions = '') {
  return `
    <form id="char-form" class="admin-form card">
      <h3 class="admin-form__title">${c.id ? 'Personajni tahrirlash' : "Yangi personaj"}</h3>
      <input type="hidden" id="chf-id" value="${c.id || ''}">
      <div class="admin-form__grid">
        <div class="input-group">
          <label for="chf-name">Ism *</label>
          <input id="chf-name" class="input" type="text" maxlength="100"
                 value="${escapeHtml(c.name||'')}" required>
        </div>
        <div class="input-group">
          <label for="chf-book">Kitob *</label>
          <select id="chf-book" class="input" required>
            <option value="">— Kitobni tanlang —</option>
            ${bookOptions}
          </select>
        </div>
      </div>
      <div class="input-group">
        <label for="chf-desc">Ta'rif</label>
        <textarea id="chf-desc" class="input" rows="3" maxlength="500">${escapeHtml(c.description||'')}</textarea>
      </div>
      <div class="admin-form__actions">
        <button type="submit" id="chf-save" class="btn btn-primary">${c.id ? 'Saqlash' : "Qo'shish"}</button>
        <button type="button" id="chf-cancel" class="btn btn-ghost">Bekor qilish</button>
      </div>
    </form>
  `;
}

function _bindCharForm(existingId) {
  document.getElementById('chf-cancel')?.addEventListener('click', () => {
    document.getElementById('char-form-wrap').hidden = true;
  });

  document.getElementById('char-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('chf-save');
    setButtonLoading(saveBtn, true);

    const data = {
      name:        document.getElementById('chf-name')?.value.trim(),
      book_id:     parseInt(document.getElementById('chf-book')?.value),
      description: document.getElementById('chf-desc')?.value.trim(),
    };

    try {
      const { error } = existingId
        ? await supabase.from('characters').update(data).eq('id', existingId)
        : await supabase.from('characters').insert(data);
      if (error) throw error;
      showNotification(existingId ? 'Personaj yangilandi ✅' : "Personaj qo'shildi ✅", 'success');
      await _loadTab('characters');
    } catch (err) {
      showNotification(`Xato: ${err.message}`, 'error');
    } finally {
      setButtonLoading(saveBtn, false, existingId ? 'Saqlash' : "Qo'shish");
    }
  });
}

// ============================================================
// STYLES
// ============================================================
function _addStyles() {
  if (document.getElementById('admin-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-page-styles';
  style.textContent = `
    .admin-page { background: var(--bg-secondary); }

    /* Header */
    .admin-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; margin-bottom: 24px;
    }
    .admin-header__title { font-size: 1.75rem; margin-bottom: 4px; }
    .admin-header__sub   { color: var(--text-muted); }
    .admin-header__stats { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .admin-stat-pill {
      background: var(--bg-primary); border: 1px solid var(--border-color);
      border-radius: var(--radius-full); padding: 6px 14px;
      font-size: .875rem; font-weight: 600; white-space: nowrap;
    }

    /* Tabs */
    .admin-tabs { margin-bottom: 20px; overflow-x: auto; flex-wrap: nowrap; }

    /* Section */
    .admin-section { }
    .admin-section__header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
    }
    .admin-section__title { font-size: 1.125rem; }

    /* Table */
    .admin-table-wrap { overflow-x: auto; }
    .admin-table {
      width: 100%; border-collapse: collapse; font-size: .9rem; background: var(--bg-primary);
      border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden;
    }
    .admin-table thead th {
      background: var(--bg-tertiary);
      text-align: left; padding: 11px 14px;
      font-size: .8rem; font-weight: 700;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em;
      border-bottom: 2px solid var(--border-color);
      white-space: nowrap;
    }
    .admin-table tbody td { padding: 11px 14px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
    .admin-table tbody tr:last-child td { border-bottom: none; }
    .admin-table tbody tr:hover { background: var(--bg-hover); }
    .admin-actions { display: flex; gap: 6px; }
    .admin-q-text { max-width: 280px; color: var(--text-secondary); }

    /* Form */
    .admin-form {
      margin-bottom: 20px;
      border: 2px solid var(--color-primary-light);
    }
    .admin-form__title  { font-size: 1rem; margin-bottom: 20px; }
    .admin-form__grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-bottom: 14px; }
    .admin-form__actions{ display: flex; gap: 10px; margin-top: 16px; }

    @media (max-width: 600px) {
      .admin-form__grid { grid-template-columns: 1fr; }
      .admin-actions { flex-wrap: wrap; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup   = [];
  _activeTab = 'books';
}
