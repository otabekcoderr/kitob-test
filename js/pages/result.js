// ============================================================
// pages/result.js — Test natijasi sahifasi (Editorial uslub)
// ============================================================
import { escapeHtml } from '../utils.js';
let _cleanup = [];

export async function render(container, { params, user }) {
  let result = null;
  try {
    const raw = sessionStorage.getItem('quiz_result') || localStorage.getItem('last_quiz_result');
    if (raw) result = JSON.parse(raw);
  } catch { /* ignore */ }

  if (!result || typeof result.percentage === 'undefined') {
    window.navigate('books');
    return;
  }

  const { score, total, percentage, penalty, bookId, bookTitle } = result;
  const correctCount = result.correctCount ?? result.rawScore ?? score ?? 0;
  const wrongCount   = Math.max(0, (total ?? 0) - correctCount);
  const isPassed     = percentage >= 60;
  const isOnline     = navigator.onLine;

  // Fikr-mulohaza matni
  const feedback = _getFeedback(percentage);

  container.innerHTML = `
    <div class="page" id="result-page">
      <div class="container container--sm">

        <!-- Natija bloki -->
        <div class="card animate-slide-up" style="text-align:center;padding:40px 32px;">

          <!-- Ball halqasi -->
          <div class="result-score-ring ${isPassed ? 'result-score-ring--pass' : 'result-score-ring--fail'}"
               style="margin-bottom:20px;">
            <div class="result-score-pct">${percentage}%</div>
            <div class="result-score-label">${isPassed ? "O'tdingiz" : "Davom eting"}</div>
          </div>

          <!-- Sarlavha -->
          <h1 style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--ink);margin-bottom:8px;">
            ${feedback.title}
          </h1>
          <p style="font-size:0.9375rem;color:var(--ink-muted);max-width:40ch;margin:0 auto 24px;line-height:1.65;">
            ${escapeHtml(feedback.desc)}
          </p>

          ${bookTitle ? `<p class="label" style="margin-bottom:24px;">${escapeHtml(bookTitle)}</p>` : ''}

          <!-- Statistika jadval -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:1px;border:1px solid var(--divider);border-radius:var(--radius-md);overflow:hidden;margin-bottom:24px;">
            <div style="padding:16px 8px;background:var(--surface);">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--success);line-height:1;">${correctCount}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">To'g'ri</div>
            </div>
            <div style="padding:16px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--error);line-height:1;">${wrongCount}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Noto'g'ri</div>
            </div>
            <div style="padding:16px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--ochre);line-height:1;">${score}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Ball</div>
            </div>
            <div style="padding:16px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--ink);line-height:1;">${total}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Savol</div>
            </div>
            ${penalty > 0 ? `
            <div style="padding:16px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;color:var(--error);line-height:1;">-${penalty}%</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Jarima</div>
            </div>` : ''}
          </div>

          <!-- Online/Offline belgisi -->
          <div style="display:flex;justify-content:center;margin-bottom:24px;">
            <span class="offline-badge">
              <span class="offline-badge__dot" style="background:${isOnline ? 'var(--success)' : 'var(--ink-faint)'};"></span>
              ${isOnline ? 'Natija saqlandi' : 'Lokal saqlanadi'}
            </span>
          </div>

          <!-- Tugmalar -->
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            ${bookId
              ? `<a href="#book?id=${escapeHtml(String(bookId))}" class="btn btn-outline">Qaytadan urinish</a>
                 <a href="#books" class="btn btn-primary">Keyingi kitob</a>`
              : `<a href="#books" class="btn btn-primary">Kitoblar</a>`
            }
            <a href="#leaderboard" class="btn btn-ghost">Reyting</a>
          </div>

        </div>

        <!-- Tavsiya (zarur emas, qo'shimcha) -->
        ${percentage < 60 ? `
        <div style="margin-top:24px;padding:20px;border:1px solid var(--divider);border-left:3px solid var(--ochre);border-radius:var(--radius-md);background:var(--surface);">
          <p style="font-size:0.875rem;color:var(--ink-muted);line-height:1.65;">
            Bilimingizni mustahkamlash uchun kitobni qayta o'qib, yana bir bor urinib ko'ring.
            Har bir urinish — o'sish.
          </p>
        </div>` : ''}

      </div>
    </div>
  `;
}

function _getFeedback(pct) {
  if (pct >= 90) return { title: 'Ajoyib natija!',        desc: "Siz bu kitobni juda yaxshi o'rgangansiz." };
  if (pct >= 75) return { title: 'Yaxshi natija!',         desc: "Bilimingiz mustahkam. Davom eting!" };
  if (pct >= 60) return { title: "O'tdingiz",              desc: "Yaxshi ish. Kamchiliklar bor, lekin o'tib ketdi." };
  if (pct >= 40) return { title: "Deyarli yetdi",          desc: "Ozroq more o'qish kerak. Qayta urinib ko'ring." };
  return          { title: "Bu safar o'tmadi",              desc: "Xafa bo'lmang. Yana bir bor urinib ko'ring!" };
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
