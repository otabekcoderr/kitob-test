// ============================================================
// pages/profile.js — Profil va sozlamalar sahifasi
// ============================================================
import { getCurrentUser, updateProfile, logout } from '../auth.js';
import { getUserResults }                         from '../db.js';
import { escapeHtml, showNotification,
         setButtonLoading, today }                from '../utils.js';
import { navigate }                               from '../app.js';

let _cleanup = [];

export async function render(container, { params, user }) {
  if (!user) { navigate('login'); return; }

  container.innerHTML = `
    <div class="page" id="profile-page">
      <div class="container container--md">

        <!-- Profil sarlavhasi -->
        <div class="profile-hero card animate-slide-up">
          <div class="profile-hero__avatar" id="avatar-display">
            ${_avatarHTML(user)}
          </div>
          <div class="profile-hero__info">
            <h1 class="profile-hero__name">${escapeHtml(user.fullName || user.username)}</h1>
            <p class="profile-hero__username">@${escapeHtml(user.username)}</p>
            <div class="profile-hero__stats">
              <div class="profile-hero__stat">
                <span class="profile-hero__stat-val">${user.score ?? 0}</span>
                <span class="profile-hero__stat-label">Ball</span>
              </div>
              <div class="profile-hero__stat">
                <span class="profile-hero__stat-val">🔥 ${user.streak ?? 0}</span>
                <span class="profile-hero__stat-label">Streak</span>
              </div>
              <div class="profile-hero__stat" id="test-count-stat">
                <span class="profile-hero__stat-val">—</span>
                <span class="profile-hero__stat-label">Test</span>
              </div>
            </div>
          </div>
          <button id="logout-profile-btn" class="btn btn-outline btn-sm profile-logout">
            Chiqish
          </button>
        </div>

        <!-- Tablar -->
        <div class="tabs profile-tabs animate-slide-up" id="profile-tabs" role="tablist">
          <button class="tab tab--active" data-tab="edit"    role="tab" aria-selected="true">✏️ Tahrirlash</button>
          <button class="tab"             data-tab="history" role="tab" aria-selected="false">📋 Tarix</button>
        </div>

        <!-- Tahrirlash paneli -->
        <div id="tab-edit" class="profile-panel animate-slide-up">
          <div class="card">
            <h2 class="card__title" style="margin-bottom:24px">Profil ma'lumotlari</h2>

            <form id="profile-form" class="auth-form" novalidate>

              <div class="input-group">
                <label for="pf-fullname">To'liq ism</label>
                <div class="input-wrapper">
                  <span class="input-icon" aria-hidden="true">📝</span>
                  <input
                    id="pf-fullname" name="fullName" type="text"
                    class="input" maxlength="100"
                    value="${escapeHtml(user.fullName || '')}"
                  />
                </div>
                <span class="input-error" id="pf-name-error" role="alert" aria-live="polite"></span>
              </div>

              <div class="input-group">
                <label for="pf-avatar">Avatar URL <span class="text-muted text-sm">(ixtiyoriy)</span></label>
                <div class="input-wrapper">
                  <span class="input-icon" aria-hidden="true">🖼️</span>
                  <input
                    id="pf-avatar" name="avatar" type="url"
                    class="input" maxlength="500"
                    placeholder="https://..."
                    value="${escapeHtml(user.avatar || '')}"
                  />
                </div>
                <span class="input-hint">To'g'ri URL kiritilsa, avatar ko'rsatiladi</span>
              </div>

              <!-- Avatar oldindan ko'rish -->
              <div class="pf-avatar-preview" id="avatar-preview" hidden>
                <img id="avatar-preview-img" src="" alt="Avatar oldindan ko'rish" />
              </div>

              <div id="pf-global-error" class="auth-error" role="alert" aria-live="polite" hidden></div>

              <div class="profile-form-actions">
                <button id="pf-save-btn" type="submit" class="btn btn-primary">
                  💾 Saqlash
                </button>
                <button type="button" id="pf-reset-btn" class="btn btn-ghost">
                  Bekor qilish
                </button>
              </div>

            </form>
          </div>
        </div>

        <!-- Tarix paneli -->
        <div id="tab-history" class="profile-panel" hidden>
          <div class="card">
            <h2 class="card__title" style="margin-bottom:20px">Test tarixi</h2>
            <div id="history-content">
              <div class="loading-state">
                <div class="spinner spinner--sm"></div>
                <span>Yuklanmoqda...</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  _addStyles();
  _bindEvents(user);

  // Tarix va test sonini yuklash
  _loadHistory(user);
}

// ---- EVENTS ----
function _bindEvents(user) {

  // Tablar
  const tabsEl = document.getElementById('profile-tabs');
  const onTabClick = (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const tab = btn.dataset.tab;

    tabsEl.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('tab--active', t === btn);
      t.setAttribute('aria-selected', String(t === btn));
    });

    document.getElementById('tab-edit').hidden    = (tab !== 'edit');
    document.getElementById('tab-history').hidden = (tab !== 'history');
  };
  tabsEl?.addEventListener('click', onTabClick);
  _cleanup.push(() => tabsEl?.removeEventListener('click', onTabClick));

  // Avatar oldindan ko'rish
  const avatarInput  = document.getElementById('pf-avatar');
  const previewWrap  = document.getElementById('avatar-preview');
  const previewImg   = document.getElementById('avatar-preview-img');
  let previewTimer;

  const onAvatarInput = () => {
    clearTimeout(previewTimer);
    const url = avatarInput.value.trim();
    if (!url) { previewWrap.hidden = true; return; }

    previewTimer = setTimeout(() => {
      previewImg.src = url;
      previewWrap.hidden = false;
      previewImg.onerror = () => { previewWrap.hidden = true; };
    }, 600);
  };
  avatarInput?.addEventListener('input', onAvatarInput);
  _cleanup.push(() => {
    avatarInput?.removeEventListener('input', onAvatarInput);
    clearTimeout(previewTimer);
  });

  // Profil formasi
  const form      = document.getElementById('profile-form');
  const saveBtn   = document.getElementById('pf-save-btn');
  const resetBtn  = document.getElementById('pf-reset-btn');
  const errEl     = document.getElementById('pf-global-error');

  const onSubmit = async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('pf-fullname')?.value.trim();

    if (!fullName) {
      const errField = document.getElementById('pf-name-error');
      if (errField) errField.textContent = 'Ism kiritilishi shart.';
      document.getElementById('pf-fullname')?.classList.add('input--error');
      return;
    }

    errEl.hidden = true;
    setButtonLoading(saveBtn, true);

    try {
      const result = await updateProfile({
        fullName,
        avatar: document.getElementById('pf-avatar')?.value.trim() || '',
      });

      if (result.success) {
        showNotification('Profil yangilandi! ✅', 'success');
        // Avatar display ni yangilash
        const avatarDisp = document.getElementById('avatar-display');
        if (avatarDisp) avatarDisp.innerHTML = _avatarHTML(result.user);
        const nameEl = document.querySelector('.profile-hero__name');
        if (nameEl) nameEl.textContent = result.user.fullName || result.user.username;
      } else {
        errEl.textContent = result.error;
        errEl.hidden = false;
      }
    } finally {
      setButtonLoading(saveBtn, false, '💾 Saqlash');
    }
  };

  const onReset = () => {
    const cur = getCurrentUser();
    if (!cur) return;
    document.getElementById('pf-fullname').value = cur.fullName || '';
    document.getElementById('pf-avatar').value   = cur.avatar || '';
    document.getElementById('pf-name-error').textContent = '';
    document.getElementById('pf-fullname').classList.remove('input--error');
    document.getElementById('avatar-preview').hidden = true;
    errEl.hidden = true;
  };

  form?.addEventListener('submit',  onSubmit);
  resetBtn?.addEventListener('click', onReset);
  _cleanup.push(
    () => form?.removeEventListener('submit',  onSubmit),
    () => resetBtn?.removeEventListener('click', onReset),
  );

  // Logout
  const logoutBtn = document.getElementById('logout-profile-btn');
  const onLogout  = async () => {
    if (!confirm('Tizimdan chiqmoqchimisiz?')) return;
    await logout();
    showNotification('Tizimdan chiqdingiz.', 'info');
    navigate('home');
  };
  logoutBtn?.addEventListener('click', onLogout);
  _cleanup.push(() => logoutBtn?.removeEventListener('click', onLogout));
}

// ---- HISTORY ----
async function _loadHistory(user) {
  try {
    const results = await getUserResults(user.id);

    // Test soni
    const statEl = document.getElementById('test-count-stat');
    if (statEl) {
      statEl.querySelector('.profile-hero__stat-val').textContent = results.length;
    }

    _renderHistory(results);
  } catch {
    _renderHistory([]);
  }
}

function _renderHistory(results) {
  const el = document.getElementById('history-content');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <p class="empty-state__title">Test tarixi yo'q</p>
        <p class="empty-state__desc">Birinchi testni yeching!</p>
        <a href="#books" class="btn btn-primary mt-4">Kitoblar</a>
      </div>
    `;
    return;
  }

  const grades = { 90: '🏆', 75: '🌟', 60: '👍', 40: '🙂', 20: '😕', 0: '😔' };
  const getEmoji = (pct) => {
    const key = [90,75,60,40,20,0].find(k => pct >= k);
    return grades[key] ?? '😔';
  };

  el.innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table" aria-label="Test tarixi">
        <thead>
          <tr>
            <th scope="col">Kitob</th>
            <th scope="col">Natija</th>
            <th scope="col">Ball</th>
            <th scope="col">Sana</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => {
            const pct  = r.percentage ?? 0;
            return `
              <tr>
                <td class="history-table__book">
                  ${escapeHtml(r.books?.title ?? `Kitob #${r.book_id}`)}
                </td>
                <td>
                  <span class="history-table__pct">
                    ${getEmoji(pct)} ${pct}%
                  </span>
                </td>
                <td class="history-table__score">
                  ${r.score ?? 0} / ${r.total ?? 0}
                </td>
                <td class="history-table__date">
                  ${escapeHtml(r.date ?? r.created_at?.slice(0,10) ?? '')}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---- AVATAR HTML ----
function _avatarHTML(user) {
  if (user.avatar) {
    return `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.fullName || '')}" class="profile-hero__avatar-img">`;
  }
  const initial = (user.fullName || user.username || 'U')[0].toUpperCase();
  return `<span class="profile-hero__avatar-letter">${escapeHtml(initial)}</span>`;
}

function _addStyles() {
  if (document.getElementById('profile-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'profile-page-styles';
  style.textContent = `
    /* Hero */
    .profile-hero {
      display: flex; align-items: center; gap: 24px;
      padding: 28px 32px; margin-bottom: 24px;
      position: relative;
    }
    .profile-hero__avatar {
      width: 88px; height: 88px; border-radius: 50%;
      overflow: hidden; flex-shrink: 0;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 4px var(--color-primary-light);
    }
    .profile-hero__avatar-img    { width: 100%; height: 100%; object-fit: cover; }
    .profile-hero__avatar-letter { font-size: 2.25rem; font-weight: 800; color: white; }
    .profile-hero__info { flex: 1; min-width: 0; }
    .profile-hero__name     { font-size: 1.375rem; margin-bottom: 2px; }
    .profile-hero__username { color: var(--text-muted); font-size: .9rem; margin-bottom: 16px; }
    .profile-hero__stats    { display: flex; gap: 24px; flex-wrap: wrap; }
    .profile-hero__stat     { display: flex; flex-direction: column; gap: 2px; }
    .profile-hero__stat-val { font-family: var(--font-heading); font-size: 1.375rem; font-weight: 800; }
    .profile-hero__stat-label { font-size: .75rem; color: var(--text-muted); }
    .profile-logout { position: absolute; top: 20px; right: 20px; }

    /* Tabs */
    .profile-tabs { margin-bottom: 20px; }

    /* Avatar preview */
    .pf-avatar-preview {
      width: 72px; height: 72px; border-radius: 50%; overflow: hidden;
      border: 3px solid var(--color-primary);
    }
    .pf-avatar-preview img { width: 100%; height: 100%; object-fit: cover; }

    /* Form actions */
    .profile-form-actions { display: flex; gap: 12px; flex-wrap: wrap; }

    /* Auth form (reused from login) */
    .auth-form { display: flex; flex-direction: column; gap: 16px; }
    .auth-error {
      background: var(--color-error-light); color: var(--color-error);
      border: 1px solid var(--color-error);
      border-radius: var(--radius-md); padding: 12px 16px;
      font-size: .9rem; font-weight: 500;
    }

    /* History table */
    .history-table-wrap { overflow-x: auto; }
    .history-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    .history-table thead th {
      text-align: left; padding: 10px 12px;
      font-size: .8125rem; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .05em;
      border-bottom: 2px solid var(--border-color);
    }
    .history-table tbody td   { padding: 12px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
    .history-table tbody tr:last-child td { border-bottom: none; }
    .history-table tbody tr:hover { background: var(--bg-hover); }
    .history-table__book  { color: var(--text-secondary); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .history-table__pct   { font-weight: 600; }
    .history-table__score { color: var(--color-primary); font-weight: 700; }
    .history-table__date  { color: var(--text-muted); white-space: nowrap; font-size: .8125rem; }

    @media (max-width: 600px) {
      .profile-hero { flex-direction: column; text-align: center; padding: 24px 20px; }
      .profile-hero__stats { justify-content: center; }
      .profile-logout { position: static; margin-top: 8px; }
      .profile-form-actions { flex-direction: column; }
      .profile-form-actions .btn { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
