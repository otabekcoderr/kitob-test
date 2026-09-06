// ============================================================
// pages/profile.js — Profil, Sozlamalar, Yutuqlar & Mastery (Editorial uslub)
// ============================================================
import { getCurrentUser, updateProfile, logout } from '../auth.js';
import { getUserResults, getCharacters, getStreakStatus, getBooks } from '../db.js';
import {
  escapeHtml,
  showNotification,
  setButtonLoading,
  getUserLevel,
  checkUserAchievements,
  calculateAllBooksMastery,
} from '../utils.js';

let _cleanup = [];
let _allCharacters = [];
let _userResults = [];
let _allBooks = [];
let _currentAvatarData = null;
let _avatarRemoved = false;

export async function render(container, { params, user }) {
  if (!user) { window.navigate('login'); return; }

  _currentAvatarData = user.avatarImage || ((user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:image/'))) ? user.avatar : null);
  _avatarRemoved = false;

  // Agar foydalanuvchining personaji mustaqil xotirada saqlangan bo'lsa, birlashtiramiz
  if (user && user.id) {
    try {
      const savedChar = localStorage.getItem(`kitobchi_user_character_${user.id}`);
      if (savedChar) {
        const parsed = JSON.parse(savedChar);
        if (parsed.avatarCharId && !user.avatarCharId) user.avatarCharId = parsed.avatarCharId;
        if (parsed.avatarImage && !user.avatarImage)   user.avatarImage   = parsed.avatarImage;
        if (parsed.avatar && (!user.avatar || user.avatar === '🎭')) user.avatar = parsed.avatar;
      }
    } catch {}
  }

  const isAdmin = user?.role === 'admin' ||
                  user?.isAdmin === true ||
                  user?.is_admin === true ||
                  String(user?.username || '').toLowerCase() === 'admin' ||
                  String(user?.email || '').toLowerCase().startsWith('admin@');

  const userLevel = getUserLevel(user.score || 0);

  container.innerHTML = `
    <div class="page" id="profile-page">
      <div class="container container--md">

        <!-- Profil sarlavhasi (Avatar, Ism, Daraja va Statistika) -->
        <div class="profile-hero animate-slide-up">
          <div class="profile-hero__avatar" id="avatar-display">
            ${_avatarHTML(user)}
          </div>
          <div class="profile-hero__info">
            <div class="profile-hero__header-row">
              <h1 class="profile-hero__name">${escapeHtml(user.fullName || user.username)}</h1>
              <span class="badge ${isAdmin ? 'badge-primary' : ''}">
                ${isAdmin ? 'Administrator' : `@${escapeHtml(user.username)}`}
              </span>
            </div>

            <!-- Daraja va XP Progress bari -->
            <div class="profile-hero__level-wrap" style="margin:10px 0 14px;max-width:420px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                <span class="badge ${userLevel.badgeClass || 'badge-primary'}" style="font-size:0.8125rem;padding:3px 10px;font-weight:700;">
                  ${userLevel.emoji} ${escapeHtml(userLevel.title)} · Daraja ${userLevel.level}
                </span>
                <span style="font-size:0.75rem;color:var(--ink-muted);font-weight:600;">
                  ${userLevel.isMaxLevel ? 'Oliy daraja 👑' : `${userLevel.currentLevelXP} / ${userLevel.nextLevelXP} XP (${userLevel.progressPct}%)`}
                </span>
              </div>
              <div style="height:7px;background:var(--divider);border-radius:4px;overflow:hidden;">
                <div style="width:${userLevel.progressPct}%;height:100%;background:linear-gradient(90deg, var(--ochre), #e08e28);border-radius:4px;"></div>
              </div>
            </div>

            <div class="profile-hero__stats">
              <div class="profile-hero__stat">
                <span class="profile-hero__stat-val">${user.score ?? 0}</span>
                <span class="profile-hero__stat-label">XP Ball</span>
              </div>
              <div class="profile-hero__stat" id="streak-stat">
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

        ${isAdmin ? `
        <!-- Admin boshqaruv paneli havolasi -->
        <div class="card animate-slide-up" style="margin-bottom:24px; border:1px solid var(--ochre); background:var(--paper-alt);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <h3 style="font-family:var(--font-display); font-size:1.15rem; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Admin boshqaruv paneli
              </h3>
              <p class="text-sm text-muted" style="margin:0;">Kitoblar, test savollari, foydalanuvchilar va izohlarni to'liq boshqarish.</p>
            </div>
            <a href="#admin" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
              Admin panelni ochish →
            </a>
          </div>
        </div>
        ` : ''}

        <!-- Tablar -->
        <div class="tabs profile-tabs animate-slide-up" id="profile-tabs" role="tablist">
          <button class="tab tab--active" data-tab="edit" role="tab" aria-selected="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Tahrirlash
          </button>
          <button class="tab" data-tab="characters" role="tab" aria-selected="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 1 0-16 0"></path></svg>
            Personaj tanlash 🎭
          </button>
          <button class="tab" data-tab="achievements" role="tab" aria-selected="false">
            <span style="font-size:1rem;margin-right:2px;">🏆</span>
            Yutuqlar
          </button>
          <button class="tab" data-tab="mastery" role="tab" aria-selected="false">
            <span style="font-size:1rem;margin-right:2px;">⭐</span>
            Mastery
          </button>
          <button class="tab" data-tab="history" role="tab" aria-selected="false">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Test tarixi
          </button>
        </div>

        <!-- 1. Tahrirlash paneli -->
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

              <!-- Avatar boshqarish (qurilmadan tanlash, jonli ko'rish va URL) -->
              <div class="avatar-management-block" style="margin-bottom: 24px;">
                <label class="form-label" style="font-weight:600;font-size:0.9375rem;margin-bottom:10px;display:block;color:var(--ink);">
                  Profil rasmi (Avatar)
                </label>
                
                <div class="avatar-upload-zone" id="avatar-drop-zone">
                  <div class="avatar-current-preview-wrap" style="position:relative;width:88px;height:88px;flex-shrink:0;">
                    <div id="pf-avatar-circle" class="avatar-circle-large" style="width:100%;height:100%;border-radius:50%;overflow:hidden;border:2.5px solid var(--ochre);background:var(--paper-alt);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);transition:all 0.2s ease;">
                      <img id="pf-avatar-preview-img" 
                           src="${escapeHtml(_currentAvatarData || '')}" 
                           alt="Avatar" 
                           style="width:100%;height:100%;object-fit:cover;${!_currentAvatarData ? 'display:none;' : ''}" />
                      <span id="pf-avatar-initial" class="avatar-initial-large" style="font-family:var(--font-display);font-size:2.2rem;font-weight:700;color:var(--ochre);${_currentAvatarData ? 'display:none;' : ''}">
                        ${user.avatar && !user.avatar.startsWith('http') && !user.avatar.startsWith('data:') ? escapeHtml(user.avatar) : escapeHtml((user.fullName || user.username || 'U')[0].toUpperCase())}
                      </span>
                    </div>
                    <label for="pf-avatar-file" class="avatar-upload-badge" title="Qurilmadan rasm tanlash" style="position:absolute;bottom:0;right:0;width:30px;height:30px;background:var(--ochre);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid var(--surface);transition:all 0.2s ease;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                    </label>
                  </div>

                  <div class="avatar-upload-actions" style="flex:1;min-width:200px;">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
                      <label for="pf-avatar-file" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        Qurilmadan tanlash 📷
                      </label>
                      <input id="pf-avatar-file" type="file" accept="image/png, image/jpeg, image/webp, image/gif" style="display:none;" />
                      
                      <button type="button" id="pf-remove-avatar-btn" class="btn btn-ghost btn-sm" style="font-size:0.8125rem;color:var(--error);display:${_currentAvatarData ? 'inline-flex' : 'none'};align-items:center;gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Rasmni o'chirish
                      </button>
                    </div>

                    <div style="font-size:0.75rem;color:var(--ink-muted);line-height:1.45;">
                      JPG, PNG, WebP yoki GIF (telefon yoki kompyuteringizdan to'g'ridan-to'g'ri tanlang yoki sudrab tashlang).
                    </div>
                  </div>
                </div>

                <!-- URL orqali kiritish varianti (accordion/toggle) -->
                <div style="margin-top:12px;">
                  <button type="button" id="toggle-url-avatar-btn" class="btn btn-ghost btn-xs" style="font-size:0.75rem;padding:4px 8px;color:var(--ochre);display:inline-flex;align-items:center;gap:4px;">
                    <span>🔗 Internet havolasi (URL) orqali kiritish</span>
                    <svg id="url-toggle-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </button>

                  <div id="url-avatar-container" style="display:${(user.avatar && user.avatar.startsWith('http') && !user.avatar.startsWith('data:')) ? 'block' : 'none'};margin-top:8px;">
                    <div style="position: relative; display: flex; align-items: center;">
                      <span style="position: absolute; left: 12px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-muted);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      </span>
                      <input
                        id="pf-avatar" name="avatar" type="url"
                        class="input" maxlength="500" style="padding-left: 38px;font-size:0.875rem;"
                        placeholder="https://example.com/rasm.jpg"
                        value="${escapeHtml((user.avatar && user.avatar.startsWith('http') && !user.avatar.startsWith('data:')) ? user.avatar : '')}"
                      />
                    </div>
                  </div>
                </div>

                <div class="character-tab-hint" style="margin-top:12px;padding:10px 14px;background:var(--paper-alt);border-radius:var(--radius-sm);border:1px dashed var(--divider);display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.8125rem;">
                  <span style="color:var(--ink);">🎭 Milliy adabiy qahramonlar timsolini xohlaysizmi?</span>
                  <button type="button" class="btn btn-ghost btn-xs" id="go-to-chars-tab-btn" style="color:var(--ochre);font-weight:700;white-space:nowrap;">
                    Personaj tanlash →
                  </button>
                </div>
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

        <!-- 2. Personaj tanlash paneli -->
        <div id="tab-characters" class="profile-panel animate-slide-up" hidden>
          <div class="card">
            <div style="margin-bottom: 20px;">
              <h2 class="card__title" style="margin-bottom: 4px;">Adabiy personajingizni tanlang</h2>
              <p class="text-sm text-muted" style="margin:0;">O'zingizga yoqqan qahramonni tanlang — u sizning profilingizdagi bosh avatar timsoliga aylanadi.</p>
            </div>

            <div id="character-grid-container">
              <div class="loading-state">
                <div class="spinner spinner--sm"></div>
                <span>Personajlar yuklanmoqda...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Yutuqlar paneli -->
        <div id="tab-achievements" class="profile-panel animate-slide-up" hidden>
          <div class="card">
            <div style="margin-bottom: 20px;">
              <h2 class="card__title" style="margin-bottom: 4px;">Adabiy yutuqlar 🏆</h2>
              <p class="text-sm text-muted" style="margin:0;">Muntazam mutolaa qilib, yangi marralar va faxriy nishonlarni qo'lga kiriting.</p>
            </div>
            <div id="achievements-container">
              <div class="loading-state">
                <div class="spinner spinner--sm"></div>
                <span>Yutuqlar tekshirilmoqda...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Mastery paneli -->
        <div id="tab-mastery" class="profile-panel animate-slide-up" hidden>
          <div class="card">
            <div style="margin-bottom: 20px;">
              <h2 class="card__title" style="margin-bottom: 4px;">Asarlarni o'zlashtirish (Mastery ⭐)</h2>
              <p class="text-sm text-muted" style="margin:0;">Har bir asar bo'yicha eng yuqori natijangiz va bilim darajangiz.</p>
            </div>
            <div id="mastery-container">
              <div class="loading-state">
                <div class="spinner spinner--sm"></div>
                <span>Mastery darajalari hisoblanmoqda...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. Test tarixi paneli -->
        <div id="tab-history" class="profile-panel animate-slide-up" hidden>
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
  _bindEvents(user, params);
  _loadAllData(user);
}

// ---- BIND EVENTS ----
function _bindEvents(user, params = {}) {
  const tabsEl = document.getElementById('profile-tabs');
  const panels = {
    edit: document.getElementById('tab-edit'),
    characters: document.getElementById('tab-characters'),
    achievements: document.getElementById('tab-achievements'),
    mastery: document.getElementById('tab-mastery'),
    history: document.getElementById('tab-history'),
  };

  const switchTab = (targetTab) => {
    tabsEl?.querySelectorAll('.tab').forEach(t => {
      const isMatch = t.dataset.tab === targetTab;
      t.classList.toggle('tab--active', isMatch);
      t.setAttribute('aria-selected', String(isMatch));
    });

    Object.keys(panels).forEach(key => {
      if (panels[key]) panels[key].hidden = (key !== targetTab);
    });
  };

  const onTabClick = (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  };
  tabsEl?.addEventListener('click', onTabClick);
  _cleanup.push(() => tabsEl?.removeEventListener('click', onTabClick));

  // Agar query param orqali tab berilgan bo'lsa
  const initialTab = params?.tab;
  if (initialTab && panels[initialTab]) {
    switchTab(initialTab);
  }

  // 1. Helper: Rasm oldindan ko'rishni yangilash
  const updateAvatarUI = (src) => {
    const previewImg = document.getElementById('pf-avatar-preview-img');
    const initialSpan = document.getElementById('pf-avatar-initial');
    const removeBtn = document.getElementById('pf-remove-avatar-btn');
    const heroAvatarDisp = document.getElementById('avatar-display');

    if (src) {
      if (previewImg) {
        previewImg.src = src;
        previewImg.style.display = 'block';
      }
      if (initialSpan) initialSpan.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'inline-flex';
      if (heroAvatarDisp) {
        heroAvatarDisp.innerHTML = `<img src="${escapeHtml(src)}" alt="" class="profile-hero__avatar-img">`;
      }
    } else {
      if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
      }
      if (initialSpan) initialSpan.style.display = 'block';
      if (removeBtn) removeBtn.style.display = 'none';
      if (heroAvatarDisp) {
        const cur = getCurrentUser() || user;
        const initial = (cur?.fullName || cur?.username || 'U')[0].toUpperCase();
        heroAvatarDisp.innerHTML = `<span class="profile-hero__avatar-letter">${escapeHtml(initial)}</span>`;
      }
    }
  };

  // 2. Helper: Rasmni Canvas yordamida kvadrat qirqish va siqish (max 400x400, JPEG 0.85)
  const compressAndCropImage = (dataUrl, callback) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const TARGET_SIZE = 400;
      canvas.width = TARGET_SIZE;
      canvas.height = TARGET_SIZE;
      const ctx = canvas.getContext('2d');

      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);

      const optimized = canvas.toDataURL('image/jpeg', 0.85);
      callback(optimized);
    };
    img.onerror = () => {
      showNotification('Rasmni yuklashda xatolik yuz berdi.', 'error');
    };
    img.src = dataUrl;
  };

  // 3. Helper: Tanlangan faylni qayta ishlash
  const processSelectedFile = (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showNotification('Faqat rasm formatidagi fayllarni yuklashingiz mumkin (PNG, JPG, WebP, GIF).', 'warning');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showNotification('Fayl hajmi 15MB dan oshmasligi kerak.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target.result;
      compressAndCropImage(rawDataUrl, (optimizedDataUrl) => {
        _currentAvatarData = optimizedDataUrl;
        _avatarRemoved = false;
        updateAvatarUI(optimizedDataUrl);
        showNotification('Rasm tanlandi! Saqlash uchun "Saqlash" tugmasini bosing.', 'info');
      });
    };
    reader.readAsDataURL(file);
  };

  // 4. File input hodisasi
  const fileInput = document.getElementById('pf-avatar-file');
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
  };
  fileInput?.addEventListener('change', onFileChange);
  _cleanup.push(() => fileInput?.removeEventListener('change', onFileChange));

  // 5. Drag and Drop zonasi
  const dropZone = document.getElementById('avatar-drop-zone');
  if (dropZone) {
    const onDragOver = (e) => {
      e.preventDefault();
      dropZone.classList.add('avatar-drop-zone--active');
    };
    const onDragLeave = () => {
      dropZone.classList.remove('avatar-drop-zone--active');
    };
    const onDrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('avatar-drop-zone--active');
      const file = e.dataTransfer?.files?.[0];
      if (file) processSelectedFile(file);
    };
    dropZone.addEventListener('dragover', onDragOver);
    dropZone.addEventListener('dragleave', onDragLeave);
    dropZone.addEventListener('drop', onDrop);
    _cleanup.push(() => {
      dropZone.removeEventListener('dragover', onDragOver);
      dropZone.removeEventListener('dragleave', onDragLeave);
      dropZone.removeEventListener('drop', onDrop);
    });
  }

  // 6. Rasmni o'chirish tugmasi
  const removeBtn = document.getElementById('pf-remove-avatar-btn');
  const onRemoveClick = () => {
    _currentAvatarData = null;
    _avatarRemoved = true;
    const urlInput = document.getElementById('pf-avatar');
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
    updateAvatarUI(null);
    showNotification('Rasm o\'chirildi. Standart avatar o\'rnatildi.', 'info');
  };
  removeBtn?.addEventListener('click', onRemoveClick);
  _cleanup.push(() => removeBtn?.removeEventListener('click', onRemoveClick));

  // 7. URL toggle tugmasi
  const toggleUrlBtn = document.getElementById('toggle-url-avatar-btn');
  const urlContainer = document.getElementById('url-avatar-container');
  const chevron = document.getElementById('url-toggle-chevron');
  const onToggleUrl = () => {
    if (!urlContainer) return;
    const isHidden = urlContainer.style.display === 'none';
    urlContainer.style.display = isHidden ? 'block' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'none';
  };
  toggleUrlBtn?.addEventListener('click', onToggleUrl);
  _cleanup.push(() => toggleUrlBtn?.removeEventListener('click', onToggleUrl));

  // 8. URL input hodisasi
  const avatarUrlInput = document.getElementById('pf-avatar');
  let urlTimer;
  const onUrlInput = () => {
    clearTimeout(urlTimer);
    const url = avatarUrlInput.value.trim();
    if (!url) return;
    urlTimer = setTimeout(() => {
      _currentAvatarData = url;
      _avatarRemoved = false;
      updateAvatarUI(url);
    }, 500);
  };
  avatarUrlInput?.addEventListener('input', onUrlInput);
  _cleanup.push(() => {
    avatarUrlInput?.removeEventListener('input', onUrlInput);
    clearTimeout(urlTimer);
  });

  // 9. Personaj tabiga o'tish tugmasi
  const goToCharsBtn = document.getElementById('go-to-chars-tab-btn');
  const onGoToChars = () => switchTab('characters');
  goToCharsBtn?.addEventListener('click', onGoToChars);
  _cleanup.push(() => goToCharsBtn?.removeEventListener('click', onGoToChars));

  // Profil saqlash
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
      const avatarInputVal = document.getElementById('pf-avatar')?.value.trim() || '';
      const updateData = { fullName };

      if (_avatarRemoved) {
        updateData.avatar = '';
        updateData.avatarImage = null;
        updateData.avatarCharId = null;
      } else if (_currentAvatarData) {
        updateData.avatar = _currentAvatarData;
        updateData.avatarImage = _currentAvatarData;
        updateData.avatarCharId = null;
      } else if (avatarInputVal) {
        updateData.avatar = avatarInputVal;
        updateData.avatarImage = avatarInputVal;
        updateData.avatarCharId = null;
      }

      const result = await updateProfile(updateData);

      if (result.success) {
        showNotification('Profil muvaffaqiyatli saqlandi.', 'success');
        const avatarDisp = document.getElementById('avatar-display');
        if (avatarDisp) avatarDisp.innerHTML = _avatarHTML(result.user);
        const nameEl = document.querySelector('.profile-hero__name');
        if (nameEl) nameEl.textContent = result.user.fullName || result.user.username;
        _currentAvatarData = result.user.avatarImage || ((result.user.avatar && (result.user.avatar.startsWith('http') || result.user.avatar.startsWith('data:image/'))) ? result.user.avatar : null);
        _avatarRemoved = false;
        updateAvatarUI(_currentAvatarData);
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
    _currentAvatarData = cur.avatarImage || ((cur.avatar && (cur.avatar.startsWith('http') || cur.avatar.startsWith('data:image/'))) ? cur.avatar : null);
    _avatarRemoved = false;
    document.getElementById('pf-fullname').value = cur.fullName || '';
    if (document.getElementById('pf-avatar')) document.getElementById('pf-avatar').value = (cur.avatar && cur.avatar.startsWith('http') && !cur.avatar.startsWith('data:')) ? cur.avatar : '';
    if (document.getElementById('pf-avatar-file')) document.getElementById('pf-avatar-file').value = '';
    document.getElementById('pf-name-error').textContent = '';
    document.getElementById('pf-fullname').classList.remove('input--error');
    updateAvatarUI(_currentAvatarData);
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

// ---- DATA LOADING ----
async function _loadAllData(user) {
  try {
    const [chars, results, books] = await Promise.all([
      getCharacters().catch(() => []),
      getUserResults(user.id).catch(() => []),
      getBooks().catch(() => []),
    ]);

    _allCharacters = chars;
    _userResults = results;
    _allBooks = books;

    // Stat elementlarini yangilash
    const statEl = document.getElementById('test-count-stat');
    if (statEl) {
      statEl.querySelector('.profile-hero__stat-val').textContent = results.length;
    }

    try {
      const streakStatus = await getStreakStatus(user, results);
      const streakEl = document.getElementById('streak-stat');
      if (streakEl) {
        streakEl.querySelector('.profile-hero__stat-val').innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ochre);"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
          ${streakStatus.currentStreak}
        `;
      }
    } catch {}

    _renderCharacterGrid(user);
    _renderAchievements(user, results);
    _renderMastery(user, results, books);
    _renderHistory(results);
  } catch (err) {
    console.error('[profile] _loadAllData xatosi:', err);
  }
}

// ---- 1. CHARACTERS ----
function _renderCharacterGrid(user) {
  const container = document.getElementById('character-grid-container');
  if (!container) return;

  let curCharId = user.avatarCharId || null;
  if (!curCharId && user?.id) {
    try {
      const saved = localStorage.getItem(`kitobchi_user_character_${user.id}`);
      if (saved) curCharId = JSON.parse(saved).avatarCharId || null;
    } catch {}
  }

  if (!_allCharacters || _allCharacters.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Hozircha personajlar mavjud emas</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="character-grid">
      ${_allCharacters.map(char => {
        const isSelected = String(char.id) === String(curCharId) ||
          (user.avatar && user.avatar === char.avatar && !curCharId && !user.avatarImage);
        return `
          <div class="character-card ${isSelected ? 'selected' : ''}"
               data-char-id="${escapeHtml(char.id)}"
               tabindex="0"
               role="button"
               aria-pressed="${isSelected ? 'true' : 'false'}"
               aria-label="${escapeHtml(char.name)}: ${escapeHtml(char.bookTitle || '')}${isSelected ? ' (Tanlangan)' : ''}">
            <div class="character-avatar">
              ${char.avatarImage
                ? `<img src="${escapeHtml(char.avatarImage)}" alt="${escapeHtml(char.name)}" class="character-avatar-img">`
                : `<span class="character-avatar-emoji">${escapeHtml(char.avatar || '🎭')}</span>`
              }
            </div>
            <div class="character-name">${escapeHtml(char.name)}</div>
            <div class="character-book">${escapeHtml(char.bookTitle || '')}</div>
            ${isSelected ? `<div class="character-selected-badge">✨ Tanlangan</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Click & hover
  container.querySelectorAll('.character-card').forEach(card => {
    const selectCard = async () => {
      const charId = card.dataset.charId;
      await _selectCharacter(charId);
    };

    card.addEventListener('click', selectCard);
    card.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await selectCard();
      }
    });
  });
}

async function _selectCharacter(charId) {
  const char = _allCharacters.find(c => String(c.id) === String(charId));
  if (!char) return;

  try {
    const res = await updateProfile({
      avatar: char.avatar || '🎭',
      avatarImage: char.avatarImage || null,
      avatarCharId: char.id,
    });

    if (res.success) {
      showNotification(`${char.name} personaji tanlandi! 🎭`, 'success');
      const avatarDisp = document.getElementById('avatar-display');
      if (avatarDisp) {
        avatarDisp.innerHTML = _avatarHTML(res.user);
        avatarDisp.classList.remove('avatar-swapping');
        void avatarDisp.offsetWidth;
        avatarDisp.classList.add('avatar-swapping');
        setTimeout(() => avatarDisp.classList.remove('avatar-swapping'), 600);
      }
      _renderCharacterGrid(res.user);
      window.dispatchEvent(new CustomEvent('kitobchi_profile_updated', { detail: res.user }));
    } else {
      showNotification(res.error || 'Xatolik yuz berdi', 'error');
    }
  } catch (err) {
    showNotification(`Xato: ${err.message}`, 'error');
  }
}

// ---- 2. ACHIEVEMENTS ----
function _renderAchievements(user, results) {
  const container = document.getElementById('achievements-container');
  if (!container) return;

  const achievements = checkUserAchievements(user, results);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:8px;">
      <span style="font-size:0.875rem;color:var(--ink-muted);">
        Ochilgan yutuqlar: <strong style="color:var(--ochre);">${unlockedCount} / ${achievements.length}</strong>
      </span>
      <div style="height:6px;width:120px;background:var(--divider);border-radius:3px;overflow:hidden;">
        <div style="width:${Math.round((unlockedCount / achievements.length) * 100)}%;height:100%;background:var(--ochre);border-radius:3px;"></div>
      </div>
    </div>

    <div class="achievements-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
      ${achievements.map(a => `
        <div class="achievement-card ${a.unlocked ? 'achievement-card--unlocked' : 'achievement-card--locked'}"
             style="padding:16px;border-radius:var(--radius-md);border:1.5px solid ${a.unlocked ? 'var(--ochre)' : 'var(--divider)'};background:${a.unlocked ? 'var(--paper-alt)' : 'var(--surface)'};display:flex;gap:12px;align-items:flex-start;position:relative;opacity:${a.unlocked ? '1' : '0.65'};">
          <div style="font-size:2rem;line-height:1;filter:${a.unlocked ? 'none' : 'grayscale(1)'};">
            ${a.emoji}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <h4 style="font-family:var(--font-display);font-size:0.95rem;font-weight:700;margin:0;color:var(--ink);">
                ${escapeHtml(a.title)}
              </h4>
              ${a.unlocked
                ? `<span style="font-size:0.7rem;font-weight:700;color:var(--success);">✓</span>`
                : `<span style="font-size:0.7rem;color:var(--ink-muted);">🔒</span>`
              }
            </div>
            <p style="font-size:0.8125rem;color:var(--ink-muted);line-height:1.45;margin:0;">
              ${escapeHtml(a.desc)}
            </p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---- 3. MASTERY ----
function _renderMastery(user, results, books) {
  const container = document.getElementById('mastery-container');
  if (!container) return;

  const masteryMap = calculateAllBooksMastery(user.id, results);
  const masteredBookIds = Object.keys(masteryMap);

  if (masteredBookIds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Hali test yechilmagan</p>
        <p class="empty-state__desc">Kitoblar bo'yicha test topshiring va asarlarni mukammal o'zlashtirish (Mastery) darajasiga erishing!</p>
        <a href="#books" class="btn btn-primary" style="margin-top:12px;">Kitoblar</a>
      </div>
    `;
    return;
  }

  // Kitoblar ma'lumotlarini birlashtiramiz
  const bookById = {};
  books.forEach(b => {
    bookById[String(b.id)] = b;
  });

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;">
      ${masteredBookIds.map(bId => {
        const item = masteryMap[bId];
        const book = bookById[bId] || { title: `Kitob #${bId}`, author: '' };
        const tier = item.tier;

        return `
          <div class="mastery-card" style="padding:16px;border-radius:var(--radius-md);background:var(--paper-alt);border:1.5px solid var(--divider);display:flex;gap:14px;align-items:center;">
            <div style="width:48px;height:68px;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface);border:1px solid var(--divider);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${book.coverImage
                ? `<img src="${escapeHtml(book.coverImage)}" alt="${escapeHtml(book.title)}" style="width:100%;height:100%;object-fit:cover;">`
                : `<span style="font-size:1.5rem;">📖</span>`
              }
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span class="badge ${tier.colorClass}" style="font-size:0.75rem;padding:2px 8px;font-weight:700;">
                  ${tier.emoji} ${escapeHtml(tier.tier)}
                </span>
                <span style="font-size:0.75rem;font-weight:700;color:var(--ochre);margin-left:auto;">${item.bestPercentage}%</span>
              </div>
              <h4 style="font-family:var(--font-display);font-size:0.95rem;font-weight:700;color:var(--ink);margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(book.title)}
              </h4>
              <div style="font-size:0.75rem;color:var(--ink-muted);">
                ${item.attempts} marta urinish
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---- 4. HISTORY ----
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
  if (user.avatarImage) {
    return `<img src="${escapeHtml(user.avatarImage)}" alt="${escapeHtml(user.fullName || '')}" class="profile-hero__avatar-img">`;
  }
  if (user.avatar) {
    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://') || user.avatar.startsWith('data:image/')) {
      return `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.fullName || '')}" class="profile-hero__avatar-img">`;
    }
    return `<span class="profile-hero__avatar-letter" style="font-size: 2.2rem; display:flex; align-items:center; justify-content:center;">${escapeHtml(user.avatar)}</span>`;
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
    .profile-tabs { margin-bottom: 24px; overflow-x: auto; flex-wrap: nowrap; }
    .profile-tabs .tab { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }

    /* Avatar upload zone & dropzone */
    .avatar-upload-zone {
      display: flex; align-items: center; gap: 18px;
      padding: 16px; background: var(--surface);
      border: 1.5px dashed var(--divider);
      border-radius: var(--radius-md);
      transition: border-color 0.2s ease, background 0.2s ease;
    }
    .avatar-upload-zone.avatar-drop-zone--active {
      border-color: var(--ochre);
      background: var(--ochre-light, rgba(183, 110, 22, 0.08));
    }
    .avatar-upload-badge:hover {
      transform: scale(1.12);
    }
    @media (max-width: 520px) {
      .avatar-upload-zone {
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 14px;
      }
      .avatar-upload-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .avatar-upload-actions div {
        justify-content: center;
      }
    }

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
      .profile-hero__level-wrap { margin-left: auto; margin-right: auto; }
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
