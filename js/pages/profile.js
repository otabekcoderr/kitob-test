// ============================================================
// pages/profile.js — Profil va sozlamalar sahifasi (Editorial uslub)
// ============================================================
import { getCurrentUser, updateProfile, logout } from '../auth.js';
import { getUserResults }                         from '../db.js';
import { escapeHtml, showNotification,
         setButtonLoading }                       from '../utils.js';
let _cleanup = [];

export async function render(container, { params, user }) {
  if (!user) { window.navigate('login'); return; }

  container.innerHTML = `
    <div class="page" id="profile-page">
      <div class="container container--md">

        <!-- Profil sarlavhasi (Logo, Nom 1 qatorda, 1ta border bilan) -->
        <div class="profile-hero animate-slide-up">
          <div class="profile-hero__avatar" id="avatar-display">
            ${_avatarHTML(user)}
          </div>
          <div class="profile-hero__info">
            <div class="profile-hero__header-row">
              <h1 class="profile-hero__name">${escapeHtml(user.fullName || user.username)}</h1>
              <span class="badge">@${escapeHtml(user.username)}</span>
            </div>
            <div class="profile-hero__stats">
              <div class="profile-hero__stat">
                <span class="profile-hero__stat-val">${user.score ?? 0}</span>
                <span class="profile-hero__stat-label">Ball</span>
              </div>
              <div class="profile-hero__stat">
                <span class="profile-hero__stat-val" style="display:inline-flex; align-items:center; gap:4px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
                  ${user.streak ?? 0}
                </span>
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

        <!-- Tablar (Ekran elementlaridagi ikonkalari SVG) -->
        <div class="tabs profile-tabs animate-slide-up" id="profile-tabs" role="tablist">
          <button class="tab tab--active" data-tab="edit" role="tab" aria-selected="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Tahrirlash
          </button>
          <button class="tab" data-tab="history" role="tab" aria-selected="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Tarix
          </button>
        </div>

        <!-- Tahrirlash paneli -->
        <div id="tab-edit" class="profile-panel animate-slide-up">
          <div class="card">
            <h2 class="card__title" style="margin-bottom:24px">Profil ma'lumotlari</h2>

            <form id="profile-form" class="auth-form" novalidate>

              <div class="input-group">
                <label for="pf-fullname">To'liq ism</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <span style="position: absolute; left: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-muted);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </span>
                  <input
                    id="pf-fullname" name="fullName" type="text"
                    class="input" maxlength="100" style="padding-left: 38px;"
                    value="${escapeHtml(user.fullName || '')}"
                  />
                </div>
                <span class="input-error" id="pf-name-error" role="alert" aria-live="polite"></span>
              </div>

              <div class="input-group">
                <label for="pf-avatar">Avatar URL <span class="text-muted text-sm">(ixtiyoriy)</span></label>
                <div style="position: relative; display: flex; align-items: center;">
                  <span style="position: absolute; left: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-muted);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  </span>
                  <input
                    id="pf-avatar" name="avatar" type="url"
                    class="input" maxlength="500" style="padding-left: 38px;"
                    placeholder="https://..."
                    value="${escapeHtml(user.avatar || '')}"
                  />
                </div>
                <span class="input-hint">To'g'ri URL kiritilsa, avatar ko'rsatiladi</span>
              </div>

              <!-- Avatar oldindan ko'rish -->
              <div class="pf-avatar-preview" id="avatar-preview" hidden style="margin-top:12px;">
                <img id="avatar-preview-img" src="" alt="Avatar oldindan ko'rish" />
              </div>

              <div id="pf-global-error" class="auth-error" role="alert" aria-live="polite" hidden></div>

              <div class="profile-form-actions" style="margin-top:24px;">
                <button id="pf-save-btn" type="submit" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:6px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                  Saqlash
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
        showNotification('Profil yangilandi.', 'success');
        const avatarDisp = document.getElementById('avatar-display');
        if (avatarDisp) avatarDisp.innerHTML = _avatarHTML(result.user);
        const nameEl = document.querySelector('.profile-hero__name');
        if (nameEl) nameEl.textContent = result.user.fullName || result.user.username;
        window.dispatchEvent(new CustomEvent('kitobchi_profile_updated', { detail: result.user }));
      } else {
        errEl.textContent = result.error;
        errEl.hidden = false;
      }
    } finally {
      setButtonLoading(saveBtn, false, 'Saqlash');
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
    window.navigate('home');
  };
  logoutBtn?.addEventListener('click', onLogout);
  _cleanup.push(() => logoutBtn?.removeEventListener('click', onLogout));
}

// ---- HISTORY ----
async function _loadHistory(user) {
  try {
    const results = await getUserResults(user.id);
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
        <div class="empty-state__icon" style="color:var(--ink-faint); margin-bottom:12px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <p class="empty-state__title">Test tarixi yo'q</p>
        <p class="empty-state__desc">Birinchi testni yeching!</p>
        <a href="#books" class="btn btn-primary" style="margin-top: 12px;">Kitoblar</a>
      </div>
    `;
    return;
  }

  const getEmoji = (pct) => {
    if (pct >= 90) return 'A\'lo';
    if (pct >= 75) return 'Yaxshi';
    if (pct >= 60) return 'Qoniqarli';
    if (pct >= 40) return 'Past';
    return 'Zaif';
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
                  <span class="badge ${pct >= 60 ? 'badge-success' : 'badge-error'}">
                    ${getEmoji(pct)} · ${pct}%
                  </span>
                </td>
                <td class="history-table__score" style="font-weight:700; color:var(--ochre);">
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
    .profile-hero {
      display: flex; align-items: center; gap: 24px;
      padding: 24px; margin-bottom: 24px;
      border: 1.5px solid var(--divider);
      border-radius: var(--radius-md);
      background: var(--surface);
      flex-wrap: wrap;
    }
    .profile-hero__avatar {
      width: 72px; height: 72px; border-radius: 50%;
      overflow: hidden; flex-shrink: 0;
      background: var(--paper-alt);
      border: 1.5px solid var(--divider);
      display: flex; align-items: center; justify-content: center;
    }
    .profile-hero__avatar-img    { width: 100%; height: 100%; object-fit: cover; }
    .profile-hero__avatar-letter { font-family: var(--font-display); font-size: 1.75rem; font-weight: 700; color: var(--ochre); }
    .profile-hero__info { flex: 1; min-width: 200px; }
    .profile-hero__header-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
    .profile-hero__name     { font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; color: var(--ink); margin: 0; }
    .profile-hero__stats    { display: flex; gap: 20px; flex-wrap: wrap; }
    .profile-hero__stat     { display: flex; align-items: center; gap: 6px; font-size: .875rem; color: var(--ink-muted); }
    .profile-hero__stat-val { font-weight: 700; color: var(--ink); }
    .profile-hero__stat-label { color: var(--ink-muted); }
    .profile-logout { margin-left: auto; }

    /* Tabs */
    .profile-tabs { margin-bottom: 24px; }
    .profile-tabs .tab { display: inline-flex; align-items: center; gap: 6px; }

    /* Avatar preview */
    .pf-avatar-preview {
      width: 64px; height: 64px; border-radius: 50%; overflow: hidden;
      border: 1.5px solid var(--divider);
    }
    .pf-avatar-preview img { width: 100%; height: 100%; object-fit: cover; }

    /* Form actions */
    .profile-form-actions { display: flex; gap: 12px; flex-wrap: wrap; }

    /* Auth form */
    .auth-form { display: flex; flex-direction: column; gap: 16px; }
    .auth-error {
      background: var(--error-light); color: var(--error);
      border: 1px solid var(--error);
      border-radius: var(--radius-md); padding: 12px 16px;
      font-size: .9rem; font-weight: 500;
    }

    /* History table */
    .history-table-wrap { overflow-x: auto; }
    .history-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    .history-table thead th {
      text-align: left; padding: 10px 12px;
      font-size: .75rem; font-weight: 600; color: var(--ink-muted);
      text-transform: uppercase; letter-spacing: .06em;
      border-bottom: 1.5px solid var(--divider);
    }
    .history-table tbody td { padding: 12px; border-bottom: 1px solid var(--divider); vertical-align: middle; }
    .history-table tbody tr:last-child td { border-bottom: none; }
    .history-table tbody tr:hover { background: var(--paper-alt); }
    .history-table__book  { color: var(--ink); max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
    .history-table__date  { color: var(--ink-muted); white-space: nowrap; font-size: .8125rem; }

    @media (max-width: 600px) {
      .profile-hero { flex-direction: column; text-align: center; gap: 16px; }
      .profile-hero__header-row { justify-content: center; }
      .profile-hero__stats { justify-content: center; }
      .profile-logout { margin: 8px auto 0; width: 100%; }
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
