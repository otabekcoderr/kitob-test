// ============================================================
// pages/leaderboard.js — Reyting jadvali (Editorial uslub)
// ============================================================
import { getLeaderboard } from '../db.js';
import { escapeHtml }     from '../utils.js';
let _cleanup = [];

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page" id="leaderboard-page">
      <div class="container container--md">

        <!-- Sarlavha -->
        <div style="margin-bottom:32px;" class="animate-fade-in">
          <h1 style="font-family:var(--font-display);font-size:clamp(1.7rem,3vw,2.7rem);font-weight:700;color:var(--ink);margin-bottom:8px;">Reyting</h1>
          <p style="color:var(--ink-muted);font-size:0.9375rem;">Eng ko'p ball to'plagan o'quvchilar</p>
        </div>

        <!-- Podium (top-3) -->
        <div id="lb-podium" class="animate-slide-up" style="margin-bottom:40px;">
          <!-- Yuklanmoqda -->
          <div class="podium" aria-label="Top 3 o'yinchilar">
            <div class="podium__item podium__item--2">
              <div class="podium__rank">2</div>
              <div class="podium__avatar" style="background:var(--paper-alt);"></div>
              <div class="podium__name" style="background:var(--divider);height:14px;width:60px;border-radius:4px;"></div>
            </div>
            <div class="podium__item podium__item--1">
              <div class="podium__rank">1</div>
              <div class="podium__avatar" style="background:var(--paper-alt);"></div>
              <div class="podium__name" style="background:var(--divider);height:14px;width:60px;border-radius:4px;"></div>
            </div>
            <div class="podium__item podium__item--3">
              <div class="podium__rank">3</div>
              <div class="podium__avatar" style="background:var(--paper-alt);"></div>
              <div class="podium__name" style="background:var(--divider);height:14px;width:60px;border-radius:4px;"></div>
            </div>
          </div>
        </div>

        <!-- To'liq jadval -->
        <div class="card animate-slide-up">
          <div class="card__header">
            <h2 class="card__title">Barcha ishtirokchilar</h2>
            <span class="badge" id="total-badge">Yuklanmoqda...</span>
          </div>
          <div id="lb-table-wrap">
            <div class="loading-state"><div class="spinner spinner--sm"></div><span>Yuklanmoqda...</span></div>
          </div>
        </div>

      </div>
    </div>
  `;

  try {
    const leaders = await getLeaderboard(50);
    _renderPodium(leaders.slice(0, 3), user);
    _renderTable(leaders, user);

    const badge = document.getElementById('total-badge');
    if (badge) badge.textContent = `${leaders.length} ta ishtirokchi`;

  } catch (err) {
    console.error('[leaderboard] Xato:', err);
    const wrap = document.getElementById('lb-table-wrap');
    if (wrap) wrap.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Reyting yuklanmadi</p>
        <p class="empty-state__desc">Internet ulanishini tekshiring.</p>
      </div>
    `;
  }
}

// ---- PODIUM (TOP-3) ----
function _renderPodium(top3, currentUser) {
  const el = document.getElementById('lb-podium');
  if (!el) return;

  if (!top3 || top3.length === 0) {
    el.hidden = true;
    el.style.display = 'none';
    return;
  }
  el.hidden = false;
  el.style.display = 'block';

  // Har bir o'yinchiga o'zining haqiqiy 1-o'rin, 2-o'rin, 3-o'rin raqamini beramiz
  const ranked = top3.map((u, i) => ({ ...u, rank: i + 1 }));

  // Vizual tartib: 3ta bo'lsa (2-1-3), 2ta bo'lsa (2-1), 1ta bo'lsa (1)
  let order = [];
  if (ranked.length === 3) {
    order = [ranked[1], ranked[0], ranked[2]];
  } else if (ranked.length === 2) {
    order = [ranked[1], ranked[0]];
  } else if (ranked.length === 1) {
    order = [ranked[0]];
  }

  el.innerHTML = `
    <div class="podium" aria-label="Top 3 o'yinchilar" role="list">
      ${order.map((u) => {
        const rank    = u.rank;
        const isMe    = currentUser && u.id === currentUser.id;
        const initial = (u.full_name || u.username || '?')[0].toUpperCase();
        return `
          <div class="podium__item podium__item--${rank}" role="listitem"
               aria-label="${rank}. o'rin: ${escapeHtml(u.full_name || u.username)}">
            <div class="podium__rank">${rank}</div>
            <div class="podium__avatar"${isMe ? ' style="border-color:var(--ochre);"' : ''}>
              ${u.avatar_url
                ? `<img src="${escapeHtml(u.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
                : escapeHtml(initial)
              }
            </div>
            <div class="podium__name">
              ${escapeHtml(u.full_name || u.username)}
              ${isMe ? ' <span class="badge badge-primary" style="font-size:.65rem;">Siz</span>' : ''}
            </div>
            <div class="podium__score">${u.score ?? 0} ball</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---- TO'LIQ JADVAL (4-o'rindan boshlab) ----
function _renderTable(leaders, currentUser) {
  const wrap = document.getElementById('lb-table-wrap');
  if (!wrap) return;

  if (!leaders.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Hali hech kim test yechmagan</p>
        <p class="empty-state__desc">Birinchi bo'ling!</p>
      </div>
    `;
    return;
  }

  // Top-3 podiumda ko'rsatiladi, jadvalda 4+ o'rinlar
  const tableData = leaders.slice(3);

  if (!tableData.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Top 3 o'rin yuqoridagi podiumda ko'rsatilgan</p>
        <p class="empty-state__desc">4-o'rin va undan keyingi ishtirokchilar bu yerda paydo bo'ladi.</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="admin-table-wrap" style="border:none;border-radius:0;">
      <table class="leaderboard-table" style="padding:0 2px;">
        <tbody>
          ${tableData.map((u, i) => {
            const rank    = i + 4; // 4-o'rindan boshlaymiz
            const isMe    = currentUser && u.id === currentUser.id;
            const initial = (u.full_name || u.username || '?')[0].toUpperCase();
            return `
              <tr${isMe ? ' style="background:var(--ochre-light);"' : ''}>
                <td class="leaderboard__rank" style="width:40px;padding:12px 0 12px 4px;">${rank}</td>
                <td style="padding:12px 8px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:var(--paper-alt);border:1px solid var(--divider);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8125rem;color:var(--ochre);flex-shrink:0;overflow:hidden;">
                      ${u.avatar_url
                        ? `<img src="${escapeHtml(u.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
                        : escapeHtml(initial)
                      }
                    </div>
                    <span style="font-weight:${isMe ? 600 : 400};">
                      ${escapeHtml(u.full_name || u.username)}
                      ${isMe ? ' <span class="badge badge-primary" style="font-size:.65rem;">Siz</span>' : ''}
                    </span>
                  </div>
                </td>
                <td style="text-align:right;padding:12px 4px 12px 0;">
                  <span class="leaderboard__score">${u.score ?? 0}</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
