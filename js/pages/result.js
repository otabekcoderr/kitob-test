// ============================================================
// pages/result.js — Test natijasi sahifasi
// ============================================================
import { getUserResults }       from '../db.js';
import { escapeHtml, today }    from '../utils.js';
import { navigate }             from '../app.js';

let _cleanup = [];

export async function render(container, { params, user }) {
  // Natijani sessionStorage dan olish
  let result = null;
  try {
    const raw = sessionStorage.getItem('quiz_result');
    if (raw) { result = JSON.parse(raw); sessionStorage.removeItem('quiz_result'); }
  } catch { /* ignore */ }

  if (!result) {
    navigate('books');
    return;
  }

  const { score, total, percentage, penalty, bookId } = result;
  const grade = _getGrade(percentage);

  container.innerHTML = `
    <div class="page result-page" id="result-page">
      <div class="container container--sm">

        <!-- Natija kartasi -->
        <div class="result-card card animate-slide-up">

          <!-- Emoji & Ball -->
          <div class="result-card__hero">
            <div class="result-card__emoji" aria-hidden="true">${grade.emoji}</div>
            <div class="result-card__score-circle" style="--pct:${percentage}%">
              <svg class="result-circle-svg" viewBox="0 0 120 120" aria-hidden="true">
                <circle class="result-circle-bg"   cx="60" cy="60" r="52"/>
                <circle class="result-circle-fill" cx="60" cy="60" r="52"
                  style="stroke:${grade.color}"
                  stroke-dasharray="${Math.round(2 * Math.PI * 52)}"
                  stroke-dashoffset="${Math.round(2 * Math.PI * 52 * (1 - percentage / 100))}"
                />
              </svg>
              <div class="result-circle-inner">
                <span class="result-circle-pct">${percentage}%</span>
              </div>
            </div>
            <div class="result-card__grade" style="color:${grade.color}">${grade.label}</div>
          </div>

          <!-- Statistika qatori -->
          <div class="result-stats">
            <div class="result-stat">
              <div class="result-stat__val">${score}</div>
              <div class="result-stat__label">To'g'ri javob</div>
            </div>
            <div class="result-stat">
              <div class="result-stat__val">${total - score}</div>
              <div class="result-stat__label">Noto'g'ri</div>
            </div>
            <div class="result-stat">
              <div class="result-stat__val">${total}</div>
              <div class="result-stat__label">Jami savol</div>
            </div>
            ${penalty > 0
              ? `<div class="result-stat result-stat--penalty">
                   <div class="result-stat__val">-${penalty}%</div>
                   <div class="result-stat__label">Jarima</div>
                 </div>`
              : ''}
          </div>

          <!-- Streak ma'lumoti -->
          ${user
            ? `<div class="result-streak" id="result-streak">
                 <div class="spinner spinner--sm"></div>
                 <span>Natija saqlanmoqda...</span>
               </div>`
            : ''}

          <!-- Harakatlar -->
          <div class="result-actions">
            ${bookId
              ? `<button id="retry-btn" class="btn btn-outline">🔄 Qayta urinish</button>`
              : ''}
            <a href="#books"       class="btn btn-primary">📚 Boshqa kitob</a>
            <a href="#leaderboard" class="btn btn-ghost">🏆 Reyting</a>
          </div>

        </div>

        <!-- So'nggi natijalar (faqat kirganda) -->
        ${user
          ? `<div class="card mt-6" id="history-card">
               <h2 style="font-size:1rem;margin-bottom:16px">📋 So'nggi natijalarim</h2>
               <div id="history-list">
                 <div class="loading-state"><div class="spinner spinner--sm"></div></div>
               </div>
             </div>`
          : ''}

      </div>
    </div>
  `;

  _addStyles();

  // Tugmalar
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    const onClick = () => navigate('quiz', { bookId: String(bookId) });
    retryBtn.addEventListener('click', onClick);
    _cleanup.push(() => retryBtn.removeEventListener('click', onClick));
  }

  // Streak va tarixni yuklash
  if (user) {
    _loadUserData(user, result);
  }
}

async function _loadUserData(user, result) {
  try {
    const results = await getUserResults(user.id);
    _renderStreak(result);
    _renderHistory(results.slice(0, 5));
  } catch {
    _renderStreak(result);
    document.getElementById('history-list').innerHTML =
      `<p class="text-muted text-sm">Tarix yuklanmadi.</p>`;
  }
}

function _renderStreak(result) {
  const el = document.getElementById('result-streak');
  if (!el) return;

  const isGood = (result.percentage ?? 0) >= 50;
  el.innerHTML = `
    <span aria-hidden="true">${isGood ? '🔥' : '💪'}</span>
    <span>
      ${isGood
        ? 'Ajoyib! Streak saqlanib qolindi.'
        : 'Keling, keyingi safar yaxshiroq natija ko\'rsating!'}
    </span>
  `;
}

function _renderHistory(results) {
  const el = document.getElementById('history-list');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = `<p class="text-muted text-sm">Hali test yechilmagan.</p>`;
    return;
  }

  el.innerHTML = `
    <ul class="history-list" role="list">
      ${results.map(r => {
        const pct   = r.percentage ?? 0;
        const grade = _getGrade(pct);
        return `
          <li class="history-item">
            <span class="history-item__emoji" aria-hidden="true">${grade.emoji}</span>
            <span class="history-item__book">
              ${escapeHtml(r.books?.title ?? `Kitob #${r.book_id}`)}
            </span>
            <span class="history-item__score" style="color:${grade.color}">${pct}%</span>
            <span class="history-item__date">${escapeHtml(r.date ?? '')}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function _getGrade(pct) {
  if (pct >= 90) return { emoji: '🏆', label: 'Ustoz!',         color: '#10b981' };
  if (pct >= 75) return { emoji: '🌟', label: 'Zo\'r!',         color: '#06b6d4' };
  if (pct >= 60) return { emoji: '👍', label: 'Yaxshi',         color: '#6c63ff' };
  if (pct >= 40) return { emoji: '🙂', label: "O'rtacha",       color: '#f59e0b' };
  if (pct >= 20) return { emoji: '😕', label: "Qo'shimcha o'rganing", color: '#f97316' };
  return           { emoji: '😔', label: 'Qayta urining',       color: '#ef4444' };
}

function _addStyles() {
  if (document.getElementById('result-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'result-page-styles';
  style.textContent = `
    .result-page { padding-top: calc(var(--navbar-h) + 24px); }

    .result-card { padding: 40px; }
    .result-card__hero {
      display: flex; flex-direction: column;
      align-items: center; gap: 16px;
      margin-bottom: 32px;
    }
    .result-card__emoji { font-size: 4rem; animation: bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1); }
    .result-card__grade { font-size: 1.375rem; font-weight: 800; font-family: var(--font-heading); }

    /* SVG doira */
    .result-card__score-circle { position: relative; width: 140px; height: 140px; }
    .result-circle-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .result-circle-bg   { fill: none; stroke: var(--bg-tertiary); stroke-width: 10; }
    .result-circle-fill {
      fill: none; stroke-width: 10;
      stroke-linecap: round;
      transition: stroke-dashoffset 1s ease;
    }
    .result-circle-inner {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .result-circle-pct {
      font-family: var(--font-heading);
      font-size: 2rem; font-weight: 800;
      color: var(--text-primary);
    }

    .result-stats {
      display: flex; justify-content: center; gap: 0;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden; margin-bottom: 24px;
    }
    .result-stat {
      flex: 1; text-align: center; padding: 16px 8px;
      border-right: 1px solid var(--border-color);
    }
    .result-stat:last-child { border-right: none; }
    .result-stat--penalty .result-stat__val { color: var(--color-error); }
    .result-stat__val  { font-size: 1.5rem; font-weight: 800; font-family: var(--font-heading); }
    .result-stat__label{ font-size: .75rem; color: var(--text-muted); margin-top: 4px; }

    .result-streak {
      display: flex; align-items: center; gap: 10px;
      background: var(--color-warning-light);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      font-size: .9375rem; font-weight: 500;
      margin-bottom: 24px;
      color: var(--text-primary);
    }

    .result-actions {
      display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
    }

    /* Tarix */
    .history-list { display: flex; flex-direction: column; gap: 0; }
    .history-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid var(--border-color);
      font-size: .9rem;
    }
    .history-item:last-child { border-bottom: none; }
    .history-item__emoji { font-size: 1.125rem; }
    .history-item__book  { flex: 1; color: var(--text-secondary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .history-item__score { font-weight: 700; }
    .history-item__date  { color: var(--text-muted); font-size: .8125rem; white-space: nowrap; }

    @media (max-width: 480px) {
      .result-card { padding: 24px 20px; }
      .result-stat__val { font-size: 1.25rem; }
      .result-actions { flex-direction: column; }
      .result-actions .btn { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
