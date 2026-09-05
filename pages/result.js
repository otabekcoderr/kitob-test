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
          <div class="result-stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:1px;border:1px solid var(--divider);border-radius:var(--radius-md);overflow:hidden;margin-bottom:24px;">
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
          <div class="result-actions" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
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

  // Adabiy zarhal zarrachalar (literary golden confetti) animatsiyasini ishga tushirish
  _launchLiteraryConfetti();
}

/**
 * Adabiy uslubdagi zarhal zarrachalar (literary golden confetti)
 * Qog'oz (#F8F4EA), zumrad (#17362D) va zarhal oxra (#B76E16) tuslarida.
 * Sof canvas va requestAnimationFrame orqali 60 FPS silliq ishlaydi.
 */
function _launchLiteraryConfetti() {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.id = 'literary-confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999;opacity:1;transition:opacity 0.6s ease;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = window.innerWidth;
  let height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(dpr, dpr);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const colors = isDark ? [
    '#E1A64D', // Ochre gold (dark theme)
    '#F3C98B', // Bright antique gold
    '#F5E6C8', // Warm parchment
    '#52B788', // Emerald green (dark theme)
    '#74C69D', // Light emerald
    '#D4A373', // Warm gold
    '#FFEAA7', // Shimmering gold
  ] : [
    '#B76E16', // Ochre gold
    '#D4A373', // Light antique gold
    '#E5A93C', // Warm amber gold
    '#17362D', // Emerald ink
    '#2D6A4F', // Emerald green
    '#F8F4EA', // Parchment paper
    '#EFE8D9', // Antique paper
  ];

  const particleCount = 65;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * -height * 0.4 - 10,
      w: Math.random() * 8 + 6,
      h: Math.random() * 12 + 6,
      vx: (Math.random() - 0.5) * 2.2,
      vy: Math.random() * 2.2 + 1.8,
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 4,
      tilt: Math.random() * 10,
      vTilt: Math.random() * 0.08 + 0.03,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() > 0.35 ? 'rect' : (Math.random() > 0.5 ? 'diamond' : 'star'),
      opacity: Math.random() * 0.3 + 0.7,
    });
  }

  let animId = null;
  let fadeoutTimer = null;
  const startTime = performance.now();
  const DURATION_MS = 3800;

  function _drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  function _renderFrame(now) {
    const elapsed = now - startTime;
    if (elapsed > DURATION_MS) {
      canvas.style.opacity = '0';
      fadeoutTimer = setTimeout(() => {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }, 600);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.y += p.vy;
      p.x += Math.sin(p.tilt) * 1.5 + p.vx;
      p.rotation += p.vRotation;
      p.tilt += p.vTilt;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.scale(Math.cos(p.tilt), 1);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -p.h / 2);
        ctx.lineTo(p.w / 2, 0);
        ctx.lineTo(0, p.h / 2);
        ctx.lineTo(-p.w / 2, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        _drawStar(ctx, 0, 0, 4, p.w * 0.7, p.w * 0.3);
      }

      ctx.restore();
    }

    animId = requestAnimationFrame(_renderFrame);
  }

  animId = requestAnimationFrame(_renderFrame);

  const onResize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
  };
  window.addEventListener('resize', onResize);

  _cleanup.push(() => {
    if (animId) cancelAnimationFrame(animId);
    if (fadeoutTimer) clearTimeout(fadeoutTimer);
    window.removeEventListener('resize', onResize);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  });
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
