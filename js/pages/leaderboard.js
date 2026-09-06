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

    // Jonli yangilanishni tinglash
    const onLeaderboardUpdated = (e) => {
      const fresh = Array.isArray(e.detail) ? e.detail : [];
      if (fresh.length > 0) {
        _renderPodium(fresh.slice(0, 3), user);
        _renderTable(fresh, user);
        const b = document.getElementById('total-badge');
        if (b) b.textContent = `${fresh.length} ta ishtirokchi`;
      }
    };
    window.addEventListener('kitobchi_leaderboard_updated', onLeaderboardUpdated);
    _cleanup.push(() => window.removeEventListener('kitobchi_leaderboard_updated', onLeaderboardUpdated));

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
        const rank      = u.rank;
        const isMe      = currentUser && (u.id === currentUser.id || (u.username && u.username === currentUser.username));
        const initial   = (u.full_name || u.username || '?')[0].toUpperCase();
        const avatarImg = u.avatarImage || (u.avatar_url && (u.avatar_url.startsWith('http') || u.avatar_url.startsWith('data:image/')) ? u.avatar_url : null);
        return `
          <div class="podium__item podium__item--${rank}" role="listitem"
               aria-label="${rank}. o'rin: ${escapeHtml(u.full_name || u.username)}">
            <div class="podium__rank">${rank === 1 ? '🥇' : (rank === 2 ? '🥈' : '🥉')}</div>
            <div class="podium__avatar"${isMe ? ' style="border-color:var(--ochre);box-shadow:0 0 10px rgba(183,110,22,0.3);"' : ''}>
              ${avatarImg
                ? `<img src="${escapeHtml(avatarImg)}" alt="${escapeHtml(u.full_name || '')}" style="width:100%;height:100%;object-fit:cover;">`
                : (u.avatar || u.avatar_url || escapeHtml(initial))
              }
            </div>
            <div class="podium__name">
              ${escapeHtml(u.full_name || u.username)}
              ${isMe ? ' <span class="badge badge-primary" style="font-size:.65rem;">Siz</span>' : ''}
            </div>
            <div class="podium__score">
              <span>${u.score ?? 0} ball</span>
              ${u.streak > 0 ? `<div style="font-size:0.75rem;color:var(--ochre);font-weight:600;margin-top:2px;" title="${u.streak} kunlik streak">🔥 ${u.streak} kun</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---- TO'LIQ JADVAL (Barcha o'rinlar 1..N) ----
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

  wrap.innerHTML = `
    <div class="admin-table-wrap" style="border:none;border-radius:0;">
      <table class="leaderboard-table" style="padding:0 2px;">
        <thead>
          <tr style="border-bottom:1px solid var(--divider);font-size:0.75rem;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.04em;">
            <th style="padding:10px 4px;text-align:left;width:48px;">O'rin</th>
            <th style="padding:10px 8px;text-align:left;">Ishtirokchi</th>
            <th style="padding:10px 8px;text-align:right;">Natija</th>
          </tr>
        </thead>
        <tbody>
          ${leaders.map((u, i) => {
            const rank      = i + 1;
            const isMe      = currentUser && (u.id === currentUser.id || (u.username && u.username === currentUser.username));
            const initial   = (u.full_name || u.username || '?')[0].toUpperCase();
            const avatarImg = u.avatarImage || (u.avatar_url && (u.avatar_url.startsWith('http') || u.avatar_url.startsWith('data:image/')) ? u.avatar_url : null);
            
            let rankBadge = `<span style="font-weight:600;color:var(--ink-muted);">${rank}</span>`;
            if (rank === 1) rankBadge = `<span style="font-size:1.1rem;" title="1-o'rin">🥇</span>`;
            else if (rank === 2) rankBadge = `<span style="font-size:1.1rem;" title="2-o'rin">🥈</span>`;
            else if (rank === 3) rankBadge = `<span style="font-size:1.1rem;" title="3-o'rin">🥉</span>`;

            return `
              <tr${isMe ? ' style="background:var(--ochre-light);font-weight:600;"' : ''}>
                <td class="leaderboard__rank" style="width:48px;padding:12px 4px;text-align:center;">${rankBadge}</td>
                <td style="padding:12px 8px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:var(--paper-alt);border:1.5px solid ${isMe ? 'var(--ochre)' : 'var(--divider)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8125rem;color:var(--ochre);flex-shrink:0;overflow:hidden;">
                      ${avatarImg
                        ? `<img src="${escapeHtml(avatarImg)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
                        : (u.avatar || u.avatar_url || escapeHtml(initial))
                      }
                    </div>
                    <span style="font-weight:${isMe ? 600 : 400};">
                      ${escapeHtml(u.full_name || u.username)}
                      ${isMe ? ' <span class="badge badge-primary" style="font-size:.65rem;margin-left:4px;">Siz</span>' : ''}
                    </span>
                  </div>
                </td>
                <td style="text-align:right;padding:12px 8px 12px 0;">
                  <span class="leaderboard__score" style="font-weight:700;color:var(--ochre);">${u.score ?? 0} ball</span>
                  ${u.streak > 0 ? `<div style="font-size:0.75rem;color:var(--ochre);font-weight:600;margin-top:2px;" title="${u.streak} kunlik streak">🔥 ${u.streak} kun</div>` : ''}
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
