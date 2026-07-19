// ============================================================
// pages/leaderboard.js — Reyting jadvali
// ============================================================
import { getLeaderboard }  from '../db.js';
import { escapeHtml }      from '../utils.js';
import { navigate }        from '../app.js';

let _cleanup = [];

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page" id="leaderboard-page">
      <div class="container container--md">

        <!-- Sarlavha -->
        <div class="lb-header animate-slide-up">
          <h1 class="lb-header__title">🏆 Reyting jadvali</h1>
          <p class="lb-header__sub">Eng ko'p ball to'plagan o'quvchilar</p>
        </div>

        <!-- Top-3 podium -->
        <div class="lb-podium animate-slide-up" id="lb-podium">
          ${_skeletonPodium()}
        </div>

        <!-- To'liq jadval -->
        <div class="card animate-slide-up">
          <div class="card__header">
            <h2 class="card__title">Barcha ishtirokchilar</h2>
            <span class="badge" id="total-badge">Yuklanmoqda...</span>
          </div>
          <div id="lb-table-wrap">
            ${_skeletonTable(7)}
          </div>
        </div>

      </div>
    </div>
  `;

  _addStyles();

  try {
    const leaders = await getLeaderboard(50);
    _renderPodium(leaders.slice(0, 3), user);
    _renderTable(leaders, user);

    const badge = document.getElementById('total-badge');
    if (badge) badge.textContent = `${leaders.length} ta ishtirokchi`;

  } catch (err) {
    console.error('[leaderboard] Xato:', err);
    document.getElementById('lb-table-wrap').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <p class="empty-state__title">Reyting yuklanmadi</p>
        <p class="empty-state__desc">Internet ulanishini tekshiring.</p>
      </div>
    `;
  }
}

// ---- PODIUM (TOP-3) ----
function _renderPodium(top3, currentUser) {
  const el = document.getElementById('lb-podium');
  if (!el || top3.length === 0) { el && (el.hidden = true); return; }

  // 2-1-3 tartibida ko'rsatamiz (vizual)
  const order  = [top3[1], top3[0], top3[2]].filter(Boolean);
  const ranks  = top3[1] ? [2, 1, 3] : [1, 3];
  const heights = { 1: 120, 2: 90, 3: 72 };
  const medals  = { 1: '🥇', 2: '🥈', 3: '🥉' };

  el.innerHTML = order.map((u, i) => {
    const rank   = ranks[i];
    const isMe   = currentUser && u.id === currentUser.id;
    const initial = (u.full_name || u.username || '?')[0].toUpperCase();
    const h      = heights[rank] ?? 72;

    return `
      <div class="podium-item podium-item--rank-${rank} ${isMe ? 'podium-item--me' : ''}">
        <div class="podium-item__avatar">
          ${u.avatar_url
            ? `<img src="${escapeHtml(u.avatar_url)}" alt="" class="podium-item__avatar-img">`
            : `<span class="podium-item__avatar-letter">${escapeHtml(initial)}</span>`
          }
          ${isMe ? `<span class="podium-item__you-badge">Siz</span>` : ''}
        </div>
        <div class="podium-item__name">${escapeHtml(u.full_name || u.username)}</div>
        <div class="podium-item__score">${(u.score ?? 0).toLocaleString()} ball</div>
        <div class="podium-item__base" style="height:${h}px">
          <span class="podium-item__medal" aria-hidden="true">${medals[rank]}</span>
          <span class="podium-item__rank">${rank}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ---- JADVAL ----
function _renderTable(leaders, currentUser) {
  const el = document.getElementById('lb-table-wrap');
  if (!el) return;

  if (!leaders.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🏆</div>
        <p class="empty-state__title">Hali hech kim test yechmagan</p>
        <p class="empty-state__desc">Birinchi bo'ling!</p>
        <a href="#books" class="btn btn-primary mt-4">Test boshlash</a>
      </div>
    `;
    return;
  }

  const medals = ['🥇','🥈','🥉'];

  el.innerHTML = `
    <table class="lb-table" aria-label="Reyting jadvali">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Foydalanuvchi</th>
          <th scope="col">Ball</th>
          <th scope="col">Streak</th>
        </tr>
      </thead>
      <tbody>
        ${leaders.map((u, i) => {
          const isMe   = currentUser && u.id === currentUser.id;
          const rank   = i + 1;
          const medal  = medals[i] ?? '';
          const initial = (u.full_name || u.username || '?')[0].toUpperCase();
          return `
            <tr class="lb-table__row ${isMe ? 'lb-table__row--me' : ''}"
                tabindex="${isMe ? 0 : -1}"
                aria-label="${isMe ? 'Sizning natijangiz' : ''}">
              <td class="lb-table__rank">
                ${medal
                  ? `<span aria-hidden="true">${medal}</span>`
                  : `<span class="lb-table__rank-num">${rank}</span>`
                }
              </td>
              <td class="lb-table__user">
                <div class="lb-table__avatar">
                  ${u.avatar_url
                    ? `<img src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy">`
                    : `<span>${escapeHtml(initial)}</span>`
                  }
                </div>
                <div class="lb-table__user-info">
                  <span class="lb-table__fullname">
                    ${escapeHtml(u.full_name || u.username)}
                    ${isMe ? `<span class="badge badge-primary" style="font-size:.7rem;vertical-align:middle">Siz</span>` : ''}
                  </span>
                  <span class="lb-table__username">@${escapeHtml(u.username || '')}</span>
                </div>
              </td>
              <td class="lb-table__score">${(u.score ?? 0).toLocaleString()}</td>
              <td class="lb-table__streak">
                <span class="lb-streak">
                  <span aria-hidden="true">🔥</span>
                  ${u.streak ?? 0}
                </span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ---- SKELETON ----
function _skeletonPodium() {
  return `
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:16px;height:220px">
      ${[90,120,72].map(h => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          <div class="skeleton" style="width:64px;height:64px;border-radius:50%"></div>
          <div class="skeleton" style="width:80px;height:14px;border-radius:4px"></div>
          <div class="skeleton" style="width:80px;height:${h}px;border-radius:8px 8px 0 0"></div>
        </div>
      `).join('')}
    </div>
  `;
}

function _skeletonTable(n) {
  return `<div style="display:flex;flex-direction:column;gap:0">` +
    Array.from({ length: n }, (_, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border-color)">
        <div class="skeleton" style="width:28px;height:20px;border-radius:4px"></div>
        <div class="skeleton" style="width:40px;height:40px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skeleton" style="width:${60 + i * 3}%;height:14px;border-radius:4px;margin-bottom:6px"></div>
          <div class="skeleton" style="width:40%;height:12px;border-radius:4px"></div>
        </div>
        <div class="skeleton" style="width:60px;height:20px;border-radius:4px"></div>
      </div>
    `).join('') + `</div>`;
}

function _addStyles() {
  if (document.getElementById('lb-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'lb-page-styles';
  style.textContent = `
    .lb-header { text-align: center; margin-bottom: 36px; }
    .lb-header__title { font-size: clamp(1.75rem, 4vw, 2.25rem); margin-bottom: 8px; }
    .lb-header__sub   { color: var(--text-muted); }

    /* Podium */
    .lb-podium {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 12px;
      margin-bottom: 36px;
      min-height: 220px;
    }
    .podium-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .podium-item__avatar {
      position: relative;
      width: 64px; height: 64px;
    }
    .podium-item--rank-1 .podium-item__avatar { width: 80px; height: 80px; }
    .podium-item__avatar-img,
    .podium-item__avatar-letter {
      width: 100%; height: 100%; border-radius: 50%;
      object-fit: cover;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      color: white; font-weight: 800; font-size: 1.25rem;
    }
    .podium-item--rank-1 .podium-item__avatar-letter { font-size: 1.5rem; }
    .podium-item__you-badge {
      position: absolute; bottom: -4px; left: 50%;
      transform: translateX(-50%);
      background: var(--color-primary); color: white;
      font-size: .65rem; font-weight: 700; padding: 1px 6px;
      border-radius: var(--radius-full); white-space: nowrap;
    }
    .podium-item__name  { font-size: .875rem; font-weight: 600; text-align: center; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .podium-item__score { font-size: .8rem; color: var(--text-muted); }
    .podium-item__base {
      width: 100px;
      border-radius: 10px 10px 0 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 4px;
      background: linear-gradient(180deg, var(--color-primary-light), var(--bg-tertiary));
      border: 1px solid var(--border-color);
    }
    .podium-item--rank-1 .podium-item__base {
      background: linear-gradient(180deg, rgba(245,158,11,.2), var(--bg-tertiary));
      border-color: var(--color-secondary);
    }
    .podium-item--rank-3 .podium-item__base {
      background: linear-gradient(180deg, rgba(180,180,180,.15), var(--bg-tertiary));
    }
    .podium-item--me .podium-item__base {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px var(--color-primary-light);
    }
    .podium-item__medal { font-size: 1.5rem; }
    .podium-item__rank  { font-size: .75rem; color: var(--text-muted); font-weight: 700; }

    /* Jadval */
    .lb-table {
      width: 100%; border-collapse: collapse;
      font-size: .9375rem;
    }
    .lb-table thead th {
      text-align: left; padding: 10px 12px;
      font-size: .8125rem; font-weight: 600;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em;
      border-bottom: 2px solid var(--border-color);
    }
    .lb-table__row td { padding: 12px; border-bottom: 1px solid var(--border-color); }
    .lb-table__row:last-child td { border-bottom: none; }
    .lb-table__row:hover { background: var(--bg-hover); }
    .lb-table__row--me  { background: var(--color-primary-light) !important; }

    .lb-table__rank     { width: 48px; font-size: 1.25rem; text-align: center; }
    .lb-table__rank-num { font-weight: 700; color: var(--text-muted); }
    .lb-table__user     { display: flex; align-items: center; gap: 12px; }
    .lb-table__avatar   {
      width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: .875rem;
    }
    .lb-table__avatar img { width: 100%; height: 100%; object-fit: cover; }
    .lb-table__user-info { display: flex; flex-direction: column; gap: 2px; }
    .lb-table__fullname  { font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .lb-table__username  { font-size: .8rem; color: var(--text-muted); }
    .lb-table__score     { font-weight: 700; color: var(--color-primary); white-space: nowrap; }
    .lb-streak           { display: flex; align-items: center; gap: 4px; font-weight: 600; color: var(--color-warning); }

    @media (max-width: 480px) {
      .lb-podium { gap: 6px; }
      .podium-item__base { width: 80px; }
      .lb-table__username { display: none; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
