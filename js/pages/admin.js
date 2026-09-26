// ============================================================
// pages/admin.js — Admin boshqaruv paneli
// ============================================================
// Faqat role === 'admin' bo'lgan foydalanuvchilar kiradi.
// Import: db.js (CRUD) · auth.js · utils.js
// ============================================================
import { supabase, isSupabaseOnline } from '../supabase-client.js';
import { getCurrentUser }        from '../auth.js';
import { getBooks, saveBook,
         deleteBook, getQuestions,
         saveQuestion,
         deleteQuestion,
         getCharacters, saveCharacter,
         deleteCharacter }        from '../db.js';
import { escapeHtml,
         showNotification,
         setButtonLoading,
         truncate }              from '../utils.js';
import * as localData            from '../data.js';

let _cleanup     = [];
let _activeTab   = 'books';

// ============================================================
// RENDER
// ============================================================
export async function render(container, { params, user }) {

  // Adminlik tekshiruvi: faqat tasdiqlangan role === 'admin' va isAdmin
  const isAdmin = user && (user.role === 'admin' && user.isAdmin === true);

  if (!isAdmin) {
    container.innerHTML = `
      <div class="page">
        <div class="container">
          <div class="empty-state" style="min-height:60vh">
            <div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>
            <p class="empty-state__title">Ruxsat yo'q</p>
            <p class="empty-state__desc">Bu sahifa faqat administratorlar uchun mo'ljallangan.</p>
            <div style="display:flex; gap:12px; justify-content:center; margin-top:20px;">
              <a href="#login" class="btn btn-outline">Admin sifatida kirish</a>
              <a href="#home" class="btn btn-primary">Bosh sahifaga</a>
            </div>
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
            <h1 class="admin-header__title">Admin panel</h1>
            <p class="admin-header__sub">Kitobchi boshqaruv tizimi</p>
          </div>
          <div class="admin-header__stats" id="admin-quick-stats">
            <div class="spinner spinner--sm"></div>
          </div>
        </div>

        <!-- Tab navigatsiya -->
        <div class="tabs admin-tabs animate-slide-up" id="admin-tabs" role="tablist">
          <button class="tab tab--active" data-tab="books"      role="tab" aria-selected="true">Kitoblar</button>
          <button class="tab"             data-tab="questions"  role="tab" aria-selected="false">Savollar</button>
          <button class="tab"             data-tab="users"      role="tab" aria-selected="false">Foydalanuvchilar</button>
          <button class="tab"             data-tab="comments"   role="tab" aria-selected="false">Izohlar</button>
          <button class="tab"             data-tab="characters" role="tab" aria-selected="false">Personajlar</button>
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
// FOYDALANUVCHILARNI YUKLASH VA UNIFIKATSIYA QILISH
// ============================================================
/**
 * Supabase va mahalliy xotiradagi barcha foydalanuvchilarni to'playdi,
 * deduplikatsiya qiladi, haqiqiy foydalanuvchilarni to'g'ri
 * statistika (score: 2500, streak: 15) bilan kafolatlaydi va tartiblab qaytaradi.
 */
async function _fetchAdminUsers() {
  let users = [];

  // 1. Supabase profiles dan olish
  if (isSupabaseOnline()) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 2500);

    try {
      let query = supabase.from('profiles').select('*');
      if (typeof query.abortSignal === 'function') {
        query = query.abortSignal(controller.signal);
      }
      const { data, error } = await query;
      clearTimeout(timer);

      if (!error && Array.isArray(data) && data.length > 0) {
        users = data.map(p => {
          const stats = p.stats || {};
          const rawUname = String(p.username || '').replace(/^@+/, '').trim().toLowerCase();
          const rawEmail = String(p.email || '').trim().toLowerCase();
          const isMaster = p.is_admin === true || p.role === 'admin' || 
                           rawUname === 'admin_kitobchi' || 
                           rawUname === 'admin' ||
                           rawEmail.startsWith('admin@') ||
                           rawUname.startsWith('admin@');
          return {
            id: p.id,
            full_name: p.full_name || p.username || 'Foydalanuvchi',
            username: rawUname || (p.id ? String(p.id).slice(0, 8) : 'foydalanuvchi'),
            score: Number(stats.totalScore || stats.bestScore || stats.avgScore || p.score || 0),
            streak: stats.currentStreak !== undefined && stats.currentStreak !== null ? Number(stats.currentStreak) : Number(p.streak || 0),
            role: (p.is_admin || isMaster) ? 'admin' : (p.role || 'user'),
            is_admin: Boolean(p.is_admin || isMaster),
            avatar: isMaster ? (p.avatar || '👑') : (p.avatar || '👤'),
            avatar_image: p.avatar_image || null,
            is_master: isMaster,
          };
        });
      }
    } catch {
      clearTimeout(timer);
    }
  }

  // 2. Mahalliy xotiradagi kitobchi_all_users va kitobchi_registered_users ni birlashtirish (sun'iy demo foydalanuvchilarsiz)
  let localUsers = {};
  try {
    const raw = localStorage.getItem('kitobchi_all_users');
    if (raw) localUsers = JSON.parse(raw);
  } catch {}

  let regUsers = {};
  try {
    const rawReg = localStorage.getItem('kitobchi_registered_users');
    if (rawReg) regUsers = JSON.parse(rawReg);
  } catch {}

  const candidateList = [
    ...Object.values(localUsers),
    ...Object.values(regUsers)
  ].filter(u => u && u.id && !String(u.id).startsWith('demo_') && !String(u.id).startsWith('sample-'));

  candidateList.forEach(u => {
    if (!u) return;
    const cleanUname = String(u.username || '').replace(/^@+/, '').trim().toLowerCase();
    const cleanEmail = String(u.email || '').trim().toLowerCase();
    const isMaster = u.is_admin === true || u.role === 'admin' ||
                     cleanUname === 'admin_kitobchi' || 
                     cleanUname === 'admin' || 
                     cleanEmail.startsWith('admin@') ||
                     cleanUname.startsWith('admin@');
    const finalUname = cleanUname || (u.id ? String(u.id).slice(0, 8) : 'foydalanuvchi');

    // Deduplikatsiya
    const idx = users.findIndex(item => 
      (item.id && u.id && item.id === u.id) ||
      (item.username && finalUname && item.username.toLowerCase() === finalUname)
    );

    if (idx >= 0) {
      users[idx] = {
        ...users[idx],
        score: Math.max(users[idx].score || 0, u.score || 0),
        streak: Math.max(users[idx].streak || 0, u.streak || 0),
        role: u.role || users[idx].role || (u.is_admin ? 'admin' : 'user'),
        is_admin: u.role === 'admin' || u.is_admin === true || users[idx].is_admin === true,
        full_name: u.fullName || u.full_name || users[idx].full_name,
      };
    } else {
      users.push({
        id: u.id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        full_name: u.fullName || u.full_name || finalUname,
        username: finalUname,
        score: u.score || 0,
        streak: u.streak || 0,
        role: (u.role === 'admin' || u.is_admin || isMaster) ? 'admin' : 'user',
        is_admin: Boolean(u.role === 'admin' || u.is_admin || isMaster),
        avatar: isMaster ? (u.avatar || '👑') : (u.avatar || '👤'),
        is_master: isMaster,
      });
    }
  });

  // Joriy sessiyadagi foydalanuvchini tekshirish
  const cur = getCurrentUser();
  if (cur && cur.username) {
    const curUname = String(cur.username || '').replace(/^@+/, '').trim().toLowerCase();
    const isCurAdmin = cur.role === 'admin' || cur.is_admin === true || cur.isAdmin === true || curUname === 'admin' || curUname.includes('admin@');
    const cIdx = users.findIndex(item => item.id === cur.id || item.username?.toLowerCase() === curUname);
    if (cIdx >= 0) {
      if (isCurAdmin) {
        users[cIdx].is_master = true;
        users[cIdx].role = 'admin';
        users[cIdx].is_admin = true;
      }
    }
  }

  // Master admin doim 1-o'rinda, qolganlar ball bo'yicha kamayish tartibida
  users.sort((a, b) => {
    if (a.is_master && !b.is_master) return -1;
    if (!a.is_master && b.is_master) return 1;
    return (b.score || 0) - (a.score || 0);
  });

  return users;
}

// ============================================================
// TEZKOR STATISTIKA
// ============================================================
async function _loadQuickStats() {
  try {
    const books = await getBooks();
    const bCnt  = books.length;

    let qCnt = 0;
    const qResults = await Promise.all(books.map(b => getQuestions(b.id).catch(() => [])));
    qResults.forEach(qs => { qCnt += (qs?.length || 0); });

    const users = await _fetchAdminUsers();
    const uCnt  = users.length;

    const el = document.getElementById('admin-quick-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="admin-stat-pill">${bCnt} kitob</div>
      <div class="admin-stat-pill">${qCnt} savol</div>
      <div class="admin-stat-pill" id="quick-stat-users">${uCnt} foydalanuvchi</div>
    `;
  } catch (err) {
    console.warn('[admin] _loadQuickStats xatosi:', err);
  }
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
        <div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>
        <p class="empty-state__title">Yuklashda xato</p>
        <p class="empty-state__desc">${escapeHtml(err.message || 'Noma\'lum xato')}</p>
      </div>`;
  }
}

// ============================================================
// 1. KITOBLAR
// ============================================================
async function _renderBooks(panel) {
  let books = [];
  try {
    books = await getBooks(true);
  } catch {
    books = localData.books || [];
  }

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">Kitoblar (${books.length})</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input id="admin-book-search" type="search" class="input" style="max-width:180px"
                 placeholder="Kitob yoki muallif..." aria-label="Kitob qidirish">
          <label class="btn btn-primary btn-sm" style="margin:0;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px" title="Kompyuteringizdan 52ta rasmni tanlang — fayl nomiga ko'ra kitoblarga avtomatik joylanadi">
            Ommaviy 52ta rasm yuklash
            <input id="batch-covers-file" type="file" accept="image/*" multiple style="display:none">
          </label>
          <button id="add-book-btn" class="btn btn-ghost btn-sm">+ Kitob qo'shish</button>
        </div>
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
              <th>Muqova</th><th>ID</th><th>Sarlavha</th><th>Muallif</th>
              <th>Kategoriya</th><th>Yil</th><th>Amallar</th>
            </tr>
          </thead>
          <tbody id="books-tbody">
            ${_renderBookRows(books)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  _bindBookEvents(books);
}

function _renderBookRows(books) {
  if (books.length === 0) {
    return `<tr><td colspan="7" class="text-center text-muted" style="padding:24px;text-align:center">Birorta ham kitob topilmadi.</td></tr>`;
  }
  return books.map(b => {
    const coverSrc = b.cover_url || b.coverImage || (typeof b.cover === 'string' && b.cover.startsWith('http') ? b.cover : '');
    return `
      <tr id="book-row-${b.id}">
        <td style="width:50px;text-align:center">
          <div style="width:36px;height:48px;border-radius:4px;overflow:hidden;position:relative;display:inline-flex;align-items:center;justify-content:center;background:var(--paper-alt);border:1px solid var(--divider);">
            <span style="display:inline-flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:var(--ochre);z-index:1;">📖</span>
            ${coverSrc ? `
              <img src="${escapeHtml(coverSrc)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;">
            ` : ''}
          </div>
        </td>
        <td>${b.id}</td>
        <td><strong>${escapeHtml(b.title)}</strong></td>
        <td>${escapeHtml(b.author || '')}</td>
        <td><span class="badge">${escapeHtml(b.category || '')}</span></td>
        <td>${b.year || '—'}</td>
        <td class="admin-actions">
          <button class="btn btn-ghost btn-sm edit-book-btn" data-id="${b.id}">Tahrirlash</button>
          <button class="btn btn-danger btn-sm del-book-btn"  data-id="${b.id}">O'chirish</button>
        </td>
      </tr>
    `;
  }).join('');
}

function _bookFormHTML(book = {}) {
  const cover = book.cover_url || book.cover || '';
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
        <div class="input-group" style="grid-column:1/-1">
          <label for="bf-cover">Muqova rasmi (URL yoki qurilmadan rasm)</label>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <input id="bf-cover" class="input" type="text" placeholder="https://... yoki fayl tanlang" value="${escapeHtml(cover)}" style="flex:1;min-width:200px">
            <label class="btn btn-outline btn-sm" style="margin:0;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">
              Rasm yuklash
              <input id="bf-cover-file" type="file" accept="image/*" style="display:none">
            </label>
          </div>
          <div id="bf-cover-preview-wrap" style="margin-top:10px;display:${cover ? 'block' : 'none'}">
            <img id="bf-cover-preview" src="${escapeHtml(cover)}" alt="Muqova oldindan ko'rish" style="max-height:140px;border-radius:var(--radius-md);border:1px solid var(--border-color);object-fit:cover">
          </div>
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
    if (!formWrap) return;
    formWrap.innerHTML = _bookFormHTML(book);
    formWrap.hidden = false;
    if (document.body.contains(formWrap)) {
      try { formWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* ignore */ }
    }
    _bindBookForm();
  };

  document.getElementById('add-book-btn')?.addEventListener('click', () => showForm());

  document.getElementById('batch-covers-file')?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length) {
      _handleBatchCoverUpload(files, books);
    }
  });

  // Qidiruv
  const searchEl = document.getElementById('admin-book-search');
  let timer;
  searchEl?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = searchEl.value.toLowerCase().trim();
      const tbody = document.getElementById('books-tbody');
      if (!tbody) return;
      const filtered = books.filter(b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.author || '').toLowerCase().includes(q) ||
        (b.category || '').toLowerCase().includes(q)
      );
      tbody.innerHTML = _renderBookRows(filtered);
      _bindBookRowEvents(filtered, books, showForm);
    }, 200);
  });

  _bindBookRowEvents(books, books, showForm);
}

function _bindBookRowEvents(currentBooks, allBooks, showForm) {
  // Tahrirlash tugmalari
  document.querySelectorAll('.edit-book-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const book = allBooks.find(b => String(b.id) === btn.dataset.id);
      if (book) showForm(book);
    });
  });

  // O'chirish tugmalari
  document.querySelectorAll('.del-book-btn').forEach(btn => {
    btn.addEventListener('click', () => _deleteBook(btn.dataset.id));
  });
}

async function _handleBatchCoverUpload(files, books) {
  if (!files || !files.length || !books || !books.length) return;

  const fileArray = Array.from(files);
  showNotification(`${fileArray.length} ta rasm fayli o'qilmoqda va kitoblarga biriktirilmoqda...`, 'info', 4000);

  let matchedCount = 0;

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const originalName = file.name || '';
    const baseName = originalName.replace(/\.[^/.]+$/, '').trim();
    const cleanSlug = _slugify(baseName);

    // Mos kitobni qidirish
    const matchedBook = books.find(b => {
      if (!b) return false;
      const bId = String(b.id || '');
      const bTitleSlug = _slugify(b.title || '');
      const bSlug = _slugify(b.slug || '');

      return bId === baseName ||
             bId === cleanSlug ||
             bTitleSlug === cleanSlug ||
             (bSlug && bSlug === cleanSlug) ||
             (cleanSlug.length > 2 && bTitleSlug.includes(cleanSlug)) ||
             (cleanSlug.length > 2 && cleanSlug.includes(bTitleSlug));
    });

    if (matchedBook) {
      try {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });

        if (dataUrl) {
          matchedBook.cover_url  = dataUrl;
          matchedBook.coverImage = dataUrl;
          matchedBook.cover      = dataUrl;
          matchedCount++;

          // Supabase va local saqlash
          saveBook(matchedBook, matchedBook.id).catch(() => {});
        }
      } catch { /* ignore */ }
    }
  }

  showNotification(`${matchedCount} ta rasm kitoblarga muvaffaqiyatli biriktirildi va saqlandi!`, 'success', 6000);

  const tbody = document.getElementById('books-tbody');
  if (tbody) tbody.innerHTML = _renderBookRows(books);
}

async function _fetchBookCoverImage(title, author) {
  const cleanTitle = (title || '').trim();
  const cleanAuthor = (author || '').trim();

  try {
    // 1. Google Books API
    const query = `${cleanTitle} ${cleanAuthor}`.trim();
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`);
    if (res.ok) {
      const data = await res.json();
      const links = data.items?.[0]?.volumeInfo?.imageLinks;
      let img = links?.thumbnail || links?.smallThumbnail || links?.medium || links?.large;
      if (img) {
        return img.replace(/^http:/i, 'https:').replace(/&edge=curl/gi, '');
      }
    }
  } catch { /* ignore */ }

  try {
    // 2. Open Library API
    const res = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      const coverId = data.docs?.[0]?.cover_i;
      if (coverId) {
        return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
      }
    }
  } catch { /* ignore */ }

  // 3. Fallback placeholder
  const seed = encodeURIComponent(cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return `https://picsum.photos/seed/${seed}/300/400`;
}

async function _autoFetchAllCovers(books) {
  const btn = document.getElementById('auto-fetch-covers-btn');
  if (!btn || !books || !books.length) return;

  if (!confirm(`${books.length} ta kitobning muqovasi Google Books & OpenLibrary API orqali avtomatik topilib yangilanadi. Boshlaymizmi?`)) {
    return;
  }

  setButtonLoading(btn, true, 'Boshlanmoqda...');
  let count = 0;

  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    btn.textContent = `${i + 1}/${books.length}...`;

    const img = await _fetchBookCoverImage(b.title, b.author);
    if (img) {
      b.cover_url  = img;
      b.coverImage = img;
      b.cover      = img;
      count++;

      // Supabase va local xatosiz yangilash
      saveBook(b, b.id).catch(() => {});
    }
  }

  setButtonLoading(btn, false, 'Avtomatik muqovalarni topish');
  showNotification(`${count} ta kitob muqovasi muvaffaqiyatli yangilandi!`, 'success', 5000);

  const tbody = document.getElementById('books-tbody');
  if (tbody) tbody.innerHTML = _renderBookRows(books);
}

function _bindBookForm() {
  const coverInput     = document.getElementById('bf-cover');
  const coverFileInput = document.getElementById('bf-cover-file');
  const previewWrap    = document.getElementById('bf-cover-preview-wrap');
  const previewImg     = document.getElementById('bf-cover-preview');

  const updatePreview = (src) => {
    if (src && previewWrap && previewImg) {
      previewImg.src = src;
      previewWrap.style.display = 'block';
    } else if (previewWrap) {
      previewWrap.style.display = 'none';
    }
  };

  coverInput?.addEventListener('input', () => {
    updatePreview(coverInput.value.trim());
  });

  coverFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showNotification('Rasm hajmi 3MB dan kichik bo\'lishi kerak', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result;
      if (dataUrl && coverInput) {
        coverInput.value = dataUrl;
        updatePreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  });

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
      const res = await saveBook(data, id || null);
      if (!res.success) throw new Error(res.error || "Kitob saqlanmadi");

      showNotification(id ? 'Kitob yangilandi.' : "Kitob qo'shildi.", 'success');
      await _loadTab('books');
      _loadQuickStats().catch(() => {});
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
    const res = await deleteBook(id);
    if (!res.success) throw new Error(res.error || "O'chirishda xatolik");
    showNotification("Kitob o'chirildi", 'success');
    document.getElementById(`book-row-${id}`)?.remove();
    _loadQuickStats().catch(() => {});
  } catch (err) {
    showNotification(`Xato: ${err.message}`, 'error');
  }
}

// ============================================================
// 2. SAVOLLAR
// ============================================================
async function _renderQuestions(panel) {
  let books = [];
  try {
    books = await getBooks();
  } catch {
    books = localData.books || [];
  }

  let qs = [];
  try {
    const allResults = await Promise.all(
      books.map(async b => {
        try {
          const bQs = await getQuestions(b.id);
          return bQs.map(q => ({
            ...q,
            book_id: b.id,
            books: { title: b.title }
          }));
        } catch {
          return [];
        }
      })
    );
    qs = allResults.flat();
  } catch { /* ignore */ }

  const bookOptions = books.map(b =>
    `<option value="${b.id}">${escapeHtml(b.title)}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">Savollar (${qs.length})</h2>
        <button id="add-q-btn" class="btn btn-primary btn-sm">+ Savol qo'shish</button>
      </div>

      <div id="q-form-wrap" hidden>
        ${_questionFormHTML({}, bookOptions)}
      </div>

      <!-- Filter va Qidiruv -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end">
        <div class="input-group" style="max-width:260px;margin-bottom:0;flex:1">
          <label for="q-filter-book">Kitob bo'yicha</label>
          <select id="q-filter-book" class="input">
            <option value="">— Barcha kitoblar —</option>
            ${bookOptions}
          </select>
        </div>
        <div class="input-group" style="max-width:280px;margin-bottom:0;flex:1">
          <label for="admin-q-search">Savol qidirish</label>
          <input id="admin-q-search" type="search" class="input"
                 placeholder="Savol matnidan qidirish..." aria-label="Savol qidirish">
        </div>
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
            ${qs.length === 0
              ? `<tr><td colspan="5" style="padding:24px;text-align:center" class="text-muted">Hali savollar yo'q. "+ Savol qo'shish" tugmasini bosing.</td></tr>`
              : _renderQRows(qs)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Filter & Search
  const filterEl  = document.getElementById('q-filter-book');
  const searchQEl = document.getElementById('admin-q-search');

  const applyQFilter = () => {
    const bid   = filterEl?.value || '';
    const query = searchQEl?.value?.toLowerCase().trim() || '';
    const tbody = document.getElementById('questions-tbody');
    if (!tbody) return;
    const filtered = qs.filter(q => {
      const matchBook = !bid || String(q.book_id) === bid;
      const matchText = !query ||
        (q.question || q.text || '').toLowerCase().includes(query) ||
        (q.books?.title || '').toLowerCase().includes(query);
      return matchBook && matchText;
    });
    tbody.innerHTML = filtered.length ? _renderQRows(filtered) : `<tr><td colspan="5" style="padding:24px;text-align:center" class="text-muted">Savol topilmadi.</td></tr>`;
    _bindQRowEvents(filtered, bookOptions, qs);
  };

  filterEl?.addEventListener('change', applyQFilter);
  searchQEl?.addEventListener('input', applyQFilter);

  _bindQRowEvents(qs, bookOptions, qs);

  // Qo'shish
  document.getElementById('add-q-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('q-form-wrap');
    if (!wrap) return;
    wrap.innerHTML = _questionFormHTML({}, bookOptions);
    wrap.hidden = false;
    if (document.body.contains(wrap)) {
      try { wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* ignore */ }
    }
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
        <button class="btn btn-ghost btn-sm edit-q-btn" data-id="${q.id}">Tahrir</button>
        <button class="btn btn-danger btn-sm del-q-btn"  data-id="${q.id}">O'chir</button>
      </td>
    </tr>
  `).join('');
}

function _questionFormHTML(q = {}, bookOptions = '') {
  const opts = (q.options || ['','','','']).concat(['','','','']).slice(0,4);
  return `
    <form id="q-form" class="admin-form card">
      <h3 class="admin-form__title">${q.id ? 'Savolni tahrirlash' : "Yangi savol qo'shish"}</h3>
      <div class="admin-form__grid">
        <div class="input-group" style="grid-column:1/-1">
          <label for="qf-book">Kitob *</label>
          <select id="qf-book" class="input" required>
            <option value="">— Kitobni tanlang —</option>
            ${bookOptions}
          </select>
        </div>
        <div class="input-group" style="grid-column:1/-1">
          <label for="qf-text">Savol matni *</label>
          <textarea id="qf-text" class="input" rows="2" maxlength="500" required>${escapeHtml(q.question||q.text||'')}</textarea>
        </div>
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
      if (!wrap) return;
      wrap.innerHTML = _questionFormHTML(q, bookOptions);
      wrap.hidden = false;
      const bookSel = document.getElementById('qf-book');
      if (bookSel) bookSel.value = String(q.book_id || '');
      if (document.body.contains(wrap)) {
        try { wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* ignore */ }
      }
      _bindQuestionForm(q.id);
    });
  });

  document.querySelectorAll('.del-q-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Savol ID: ${btn.dataset.id} ni o'chirasizmi?`)) return;
      const res = await deleteQuestion(btn.dataset.id);
      if (!res.success) { showNotification(`Xato: ${res.error}`, 'error'); return; }
      showNotification("Savol o'chirildi", 'success');
      const row = document.getElementById(`q-row-${btn.dataset.id}`);
      if (row && row.parentNode) row.parentNode.removeChild(row);
      _loadQuickStats().catch(() => {});
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
      book_id:        parseInt(document.getElementById('qf-book')?.value, 10) || document.getElementById('qf-book')?.value,
      question:       document.getElementById('qf-text')?.value.trim(),
      options:        opts,
      correct_answer: document.getElementById('qf-answer')?.value.trim(),
    };

    try {
      const res = await saveQuestion(data, existingId || null);
      if (!res.success) throw new Error(res.error || "Savol saqlanmadi");

      showNotification(existingId ? 'Savol yangilandi.' : "Savol qo'shildi.", 'success');
      await _loadTab('questions');
      _loadQuickStats().catch(() => {});
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
  panel.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Foydalanuvchilar yuklanmoqda...</span></div>`;
  const users = await _fetchAdminUsers();

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title" id="users-count-title">Foydalanuvchilar (${users.length})</h2>
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
            ${_renderUserRows(users)}
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
      const q = searchEl.value.toLowerCase().trim();
      const filtered = users.filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.username  || '').toLowerCase().includes(q) ||
        (u.email     || '').toLowerCase().includes(q) ||
        (u.role      || '').toLowerCase().includes(q)
      );
      const tbody = document.getElementById('users-tbody');
      if (tbody) {
        tbody.innerHTML = filtered.length
          ? _renderUserRows(filtered)
          : `<tr><td colspan="7" style="padding:24px;text-align:center" class="text-muted">Birorta ham foydalanuvchi topilmadi.</td></tr>`;
      }
      _bindUserEvents(filtered);
    }, 200);
  });

  _bindUserEvents(users);
}

function _renderUserRows(users) {
  if (!users || users.length === 0) {
    return `<tr><td colspan="7" style="padding:24px;text-align:center" class="text-muted">Birorta ham foydalanuvchi topilmadi.</td></tr>`;
  }
  return users.map(u => {
    const isMaster = u.is_master || u.role === 'admin' || u.is_admin || String(u.username || '').includes('admin');
    const isAdmin = u.role === 'admin' || u.is_admin || isMaster;
    const roleBadge = isAdmin
      ? `<span class="badge-admin-role">👑 Administrator</span>`
      : `<span class="badge-user-role">👤 O'quvchi</span>`;

    let actionBtn = '';
    if (isMaster) {
      actionBtn = `<span class="badge-master-locked" title="Bosh administrator huquqi o'zgartirilmaydi">🔒 Asosiy ma'mur</span>`;
    } else if (isAdmin) {
      actionBtn = `<button class="btn btn-sm btn-role-demote toggle-role-btn"
                     data-id="${u.id}"
                     data-username="${escapeHtml(u.username || '')}"
                     data-name="${escapeHtml(u.full_name || u.username || '')}"
                     data-role="admin">
                     ⬇️ O'quvchi qilish
                   </button>`;
    } else {
      actionBtn = `<button class="btn btn-sm btn-role-promote toggle-role-btn"
                     data-id="${u.id}"
                     data-username="${escapeHtml(u.username || '')}"
                     data-name="${escapeHtml(u.full_name || u.username || '')}"
                     data-role="user">
                     ⬆️ Admin qilish
                   </button>`;
    }

    const shortId = u.id ? (String(u.id).length > 8 ? String(u.id).slice(0, 8) + '…' : String(u.id)) : '—';
    const streakDisplay = (u.streak !== undefined && u.streak !== null) ? `🔥 ${u.streak}` : '0';

    return `
      <tr id="user-row-${u.id}">
        <td class="text-muted" style="font-size:.8rem;font-family:monospace">${escapeHtml(shortId)}</td>
        <td><strong>${escapeHtml(u.full_name || '—')}</strong></td>
        <td>@${escapeHtml(u.username || '')}</td>
        <td style="color:var(--color-primary);font-weight:700">${Number(u.score || 0).toLocaleString()}</td>
        <td>${streakDisplay}</td>
        <td class="role-cell">
          ${roleBadge}
        </td>
        <td class="admin-actions">
          ${actionBtn}
        </td>
      </tr>
    `;
  }).join('');
}

function _bindUserEvents(users) {
  document.querySelectorAll('.toggle-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const currentRole = btn.dataset.role;
      const targetRole = currentRole === 'admin' ? 'user' : 'admin';
      const userName = btn.dataset.name || 'Foydalanuvchi';
      const actionText = targetRole === 'admin' 
        ? `"${userName}"ga Administrator maqomini bermoqchimisiz?` 
        : `"${userName}"ni O'quvchi maqomiga tushirmoqchimisiz?`;

      if (!confirm(actionText)) return;

      const userId = btn.dataset.id;
      setButtonLoading(btn, true);

      try {
        // Supabase da yangilash
        if (isSupabaseOnline()) {
          try {
            await supabase.from('profiles').update({
              is_admin: targetRole === 'admin',
              role: targetRole
            }).eq('id', userId);
          } catch (e) {
            console.warn('[admin] Supabase profile role update fallback:', e);
          }
        }

        // LocalStorage dagi barcha joylarda yangilash
        try {
          const rawAll = localStorage.getItem('kitobchi_all_users');
          if (rawAll) {
            const all = JSON.parse(rawAll);
            if (all[userId]) {
              all[userId].role = targetRole;
              all[userId].is_admin = (targetRole === 'admin');
              localStorage.setItem('kitobchi_all_users', JSON.stringify(all));
            }
          }
        } catch {}

        try {
          const rawReg = localStorage.getItem('kitobchi_registered_users');
          if (rawReg) {
            const reg = JSON.parse(rawReg);
            Object.values(reg).forEach(r => {
              if (r.id === userId || (btn.dataset.username && r.username === btn.dataset.username)) {
                r.role = targetRole;
                r.is_admin = (targetRole === 'admin');
              }
            });
            localStorage.setItem('kitobchi_registered_users', JSON.stringify(reg));
          }
        } catch {}

        // Foydalanuvchilar ro'yxatidagi obyektni yangilash
        const userObj = users.find(u => u.id === userId);
        if (userObj) {
          userObj.role = targetRole;
          userObj.is_admin = (targetRole === 'admin');
        }

        showNotification(`Muvaffaqiyatli: ${userName} ${targetRole === 'admin' ? 'Administrator' : "O'quvchi"} qilindi!`, 'success');

        // DOM ni chiroyli yangilash
        const row = btn.closest('tr');
        if (row) {
          const roleCell = row.querySelector('.role-cell');
          if (roleCell) {
            roleCell.innerHTML = targetRole === 'admin'
              ? `<span class="badge-admin-role">👑 Administrator</span>`
              : `<span class="badge-user-role">👤 O'quvchi</span>`;
          }

          btn.dataset.role = targetRole;
          if (targetRole === 'admin') {
            btn.className = 'btn btn-sm btn-role-demote toggle-role-btn';
            btn.innerHTML = '⬇️ O\'quvchi qilish';
          } else {
            btn.className = 'btn btn-sm btn-role-promote toggle-role-btn';
            btn.innerHTML = '⬆️ Admin qilish';
          }
        }

        // Quick stats yangilash
        _loadQuickStats().catch(() => {});
      } catch (err) {
        showNotification(`Xatolik: ${err.message}`, 'error');
      } finally {
        const finalLabel = btn.dataset.role === 'admin' ? '⬇️ O\'quvchi qilish' : '⬆️ Admin qilish';
        setButtonLoading(btn, false, finalLabel);
      }
    });
  });
}

// ============================================================
// 4. IZOHLAR MODERATSIYASI
// ============================================================
async function _renderComments(panel) {
  let comments = [];
  if (isSupabaseOnline()) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(100);
      if (!error && Array.isArray(data)) {
        comments = data;
      }
    } catch { /* ignore */ }
  }

  if (comments.length === 0) {
    try {
      const raw = localStorage.getItem('kitobchi_comments');
      if (raw) comments = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">Izohlar (${comments.length})</h2>
      </div>

      ${!comments.length
        ? `<div class="empty-state">
             <div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div>
             <p class="empty-state__title">Hozircha izohlar yo'q</p>
             <p class="empty-state__desc">Foydalanuvchilar qoldirgan barcha fikr-mulohazalar shu yerda ko'rinadi.</p>
           </div>`
        : `<div class="admin-table-wrap">
             <table class="admin-table" aria-label="Izohlar">
               <thead>
                 <tr><th>ID</th><th>Foydalanuvchi</th><th>Kitob</th><th>Izoh</th><th>Sana</th><th>Amal</th></tr>
               </thead>
               <tbody>
                 ${comments.map(c => {
                   const dateStr = c.createdAt ? new Date(typeof c.createdAt === 'number' ? c.createdAt : c.createdAt).toLocaleDateString() : (c.created_at?.slice(0,10) ?? new Date().toISOString().slice(0,10));
                   return `
                   <tr id="comment-row-${c.id}">
                     <td>${c.id}</td>
                     <td>@${escapeHtml(c.profiles?.username || c.userName || 'foydalanuvchi')}</td>
                     <td><span class="badge">${escapeHtml(c.books?.title || c.bookTitle || `#${c.bookId || c.book_id || ''}`)}</span></td>
                     <td class="admin-q-text">${escapeHtml(truncate(c.text || c.body || '', 80))}</td>
                     <td class="text-muted" style="font-size:.8rem;white-space:nowrap">
                       ${dateStr}
                     </td>
                     <td>
                        <button class="btn btn-danger btn-sm del-comment-btn" data-id="${c.id}">O'chirish</button>
                     </td>
                   </tr>
                 `;}).join('')}
               </tbody>
             </table>
           </div>`
      }
    </div>
  `;

  document.querySelectorAll('.del-comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Izohni o\'chirasizmi?')) return;
      try {
        await supabase.from('comments').delete().eq('id', btn.dataset.id);
      } catch { /* ignore */ }
      showNotification("Izoh o'chirildi", 'success');
      document.getElementById(`comment-row-${btn.dataset.id}`)?.remove();
    });
  });
}

// ============================================================
// 5. PERSONAJLAR
// ============================================================
async function _renderCharacters(panel) {
  let chars = [];
  try {
    chars = await getCharacters();
  } catch {
    chars = localData.characters || [];
  }

  let books = [];
  try {
    books = await getBooks();
  } catch {
    books = localData.books || [];
  }

  const bookOptions = books.map(b =>
    `<option value="${b.id}">${escapeHtml(b.title)}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="admin-section">
      <div class="admin-section__header">
        <h2 class="admin-section__title">Personajlar (${chars.length})</h2>
        <button id="add-char-btn" class="btn btn-primary btn-sm">+ Personaj qo'shish</button>
      </div>

      <div id="char-form-wrap" hidden>
        ${_charFormHTML({}, bookOptions)}
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table" aria-label="Personajlar">
          <thead>
            <tr><th>ID</th><th>Avatar / Rasm</th><th>Ism</th><th>Kitob</th><th>Ta'rif</th><th>Amallar</th></tr>
          </thead>
          <tbody id="chars-tbody">
            ${chars.map(c => `
              <tr id="char-row-${c.id}">
                <td>${c.id}</td>
                <td>
                  ${c.avatarImage
                    ? `<img src="${escapeHtml(c.avatarImage)}" alt="${escapeHtml(c.name || '')}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1.5px solid var(--border-color);">`
                    : `<span style="font-size:1.6rem; display:inline-block;">${escapeHtml(c.avatar || '🎭')}</span>`
                  }
                </td>
                <td><strong>${escapeHtml(c.name || '')}</strong></td>
                <td><span class="badge">${escapeHtml(c.bookTitle || c.books?.title || c.book_id || '')}</span></td>
                <td class="admin-q-text">${escapeHtml(truncate(c.description || '', 60))}</td>
                <td class="admin-actions">
                  <button class="btn btn-ghost btn-sm edit-char-btn" data-id="${c.id}">Tahrir</button>
                  <button class="btn btn-danger btn-sm del-char-btn"  data-id="${c.id}">O'chir</button>
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
    _bindCharForm(null, chars);
  });

  // Tahrirlash
  document.querySelectorAll('.edit-char-btn').forEach(btn => {
    const c = (chars || []).find(x => String(x.id) === btn.dataset.id);
    if (!c) return;
    btn.addEventListener('click', () => {
      const wrap = document.getElementById('char-form-wrap');
      wrap.innerHTML = _charFormHTML(c, bookOptions);
      const sel = document.getElementById('chf-book');
      if (sel) sel.value = String(c.book_id || c.bookId || '');
      wrap.hidden = false;
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _bindCharForm(c.id, chars);
    });
  });

  // O'chirish
  document.querySelectorAll('.del-char-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Personajni o\'chirasizmi?')) return;
      try {
        await deleteCharacter(btn.dataset.id);
        showNotification("Personaj o'chirildi", 'success');
        document.getElementById(`char-row-${btn.dataset.id}`)?.remove();
      } catch (e) {
        showNotification(`Xato: ${e.message}`, 'error');
      }
    });
  });
}

function _charFormHTML(c = {}, bookOptions = '') {
  return `
    <form id="char-form" class="admin-form card">
      <h3 class="admin-form__title">${c.id ? 'Personajni tahrirlash' : "Yangi personaj qo'shish"}</h3>
      <input type="hidden" id="chf-id" value="${c.id || ''}">
      
      <div class="admin-form__grid">
        <div class="input-group">
          <label for="chf-name">Ism *</label>
          <input id="chf-name" class="input" type="text" maxlength="100"
                 value="${escapeHtml(c.name||'')}" placeholder="Masalan: Otabek" required>
        </div>
        <div class="input-group">
          <label for="chf-book">Tegishli Kitob *</label>
          <select id="chf-book" class="input" required>
            <option value="">— Kitobni tanlang —</option>
            ${bookOptions}
          </select>
        </div>
        <div class="input-group">
          <label for="chf-avatar">Emoji Avatar (ixtiyoriy)</label>
          <input id="chf-avatar" class="input" type="text" maxlength="10"
                 value="${escapeHtml(c.avatar || '🎭')}" placeholder="🎭">
        </div>
      </div>

      <!-- Rasm yuklash (File input & preview) -->
      <div class="input-group" style="margin-top:12px;">
        <label>Personaj rasmi (ixtiyoriy)</label>
        
        <!-- Preview -->
        <div id="char-img-preview" style="${c.avatarImage ? 'display:block;' : 'display:none;'} margin-bottom: 8px;">
          <img id="char-img-preview-img" src="${escapeHtml(c.avatarImage || '')}"
               style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--border-color);">
        </div>
        
        <!-- File input -->
        <input type="file" 
               id="char-avatar-file" 
               class="input" 
               accept="image/jpeg,image/png,image/webp,image/gif">
        
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
          JPEG, PNG, WEBP, GIF — max 2MB
        </p>
      </div>

      <div class="input-group" style="margin-top:12px;">
        <label for="chf-desc">Ta'rif va xarakter</label>
        <textarea id="chf-desc" class="input" rows="3" maxlength="500" placeholder="Personaj haqida qisqacha ta'rif...">${escapeHtml(c.description||'')}</textarea>
      </div>

      <div class="admin-form__actions">
        <button type="submit" id="chf-save" class="btn btn-primary">${c.id ? 'Saqlash' : "Qo'shish"}</button>
        <button type="button" id="chf-cancel" class="btn btn-ghost">Bekor qilish</button>
      </div>
    </form>
  `;
}

function _bindCharForm(existingId, chars = []) {
  document.getElementById('chf-cancel')?.addEventListener('click', () => {
    document.getElementById('char-form-wrap').hidden = true;
  });

  const fileInput = document.getElementById('char-avatar-file');
  fileInput?.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      showNotification('Faqat JPEG, PNG, WEBP yoki GIF ruxsat etiladi', 'error');
      this.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showNotification('Rasm hajmi 2MB dan oshmasligi kerak', 'error');
      this.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('char-img-preview');
      const img = document.getElementById('char-img-preview-img');
      if (preview && img) {
        img.src = e.target.result;
        preview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('char-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('chf-save');
    setButtonLoading(saveBtn, true);

    const bookVal = document.getElementById('chf-book')?.value;
    const existingObj = existingId ? chars.find(x => String(x.id) === String(existingId)) : null;
    let avatarImage = existingObj?.avatarImage || null;

    if (fileInput && fileInput.files && fileInput.files[0]) {
      try {
        avatarImage = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(fileInput.files[0]);
        });
      } catch (err) {
        console.warn('Base64 convert error:', err);
      }
    }

    const payload = {
      name:        document.getElementById('chf-name')?.value.trim(),
      book_id:     /^\d+$/.test(bookVal) ? parseInt(bookVal, 10) : bookVal,
      avatar:      document.getElementById('chf-avatar')?.value.trim() || '🎭',
      avatarImage: avatarImage,
      description: document.getElementById('chf-desc')?.value.trim(),
    };

    try {
      await saveCharacter(payload, existingId);
      showNotification(existingId ? 'Personaj yangilandi.' : "Personaj qo'shildi.", 'success');
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
    .admin-actions { display: flex; gap: 6px; align-items: center; }
    .admin-q-text { max-width: 280px; color: var(--text-secondary); }

    /* User Role Badges & Actions */
    .badge-admin-role {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: var(--radius-full);
      background: rgba(234, 179, 8, 0.15); color: #d97706;
      border: 1px solid rgba(234, 179, 8, 0.35);
      font-size: 0.8rem; font-weight: 700; white-space: nowrap;
    }
    [data-theme="dark"] .badge-admin-role {
      background: rgba(245, 158, 11, 0.2); color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.4);
    }
    .badge-user-role {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: var(--radius-full);
      background: var(--bg-tertiary); color: var(--text-secondary);
      border: 1px solid var(--border-color);
      font-size: 0.8rem; font-weight: 600; white-space: nowrap;
    }
    .badge-master-locked {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: var(--radius-full);
      background: rgba(99, 102, 241, 0.12); color: #4f46e5;
      border: 1px solid rgba(99, 102, 241, 0.28);
      font-size: 0.78rem; font-weight: 700; white-space: nowrap;
    }
    [data-theme="dark"] .badge-master-locked {
      background: rgba(99, 102, 241, 0.22); color: #a5b4fc;
      border-color: rgba(99, 102, 241, 0.4);
    }
    .btn-role-promote {
      background: rgba(34, 197, 94, 0.1); color: #16a34a;
      border: 1px solid rgba(34, 197, 94, 0.35); font-weight: 600;
      transition: all 0.2s ease;
    }
    .btn-role-promote:hover {
      background: #16a34a; color: #fff; border-color: #16a34a;
    }
    .btn-role-demote {
      background: rgba(239, 68, 68, 0.1); color: #dc2626;
      border: 1px solid rgba(239, 68, 68, 0.35); font-weight: 600;
      transition: all 0.2s ease;
    }
    .btn-role-demote:hover {
      background: #dc2626; color: #fff; border-color: #dc2626;
    }

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
