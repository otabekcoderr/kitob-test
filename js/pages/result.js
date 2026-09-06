// ============================================================
// pages/result.js — Test natijasi & Rivojlanish sahifasi (Editorial uslub)
// ============================================================
import { escapeHtml, getUserLevel, getNextUnlockTarget, getBookUnlockReq } from '../utils.js';
import { getBooks } from '../db.js';
import { getCurrentUser } from '../auth.js';

let _cleanup = [];

export async function render(container, { params, user: initialUser }) {
  let result = null;
  try {
    const raw = sessionStorage.getItem('quiz_result') || localStorage.getItem('last_quiz_result');
    if (raw) result = JSON.parse(raw);
  } catch { /* ignore */ }

  if (!result || typeof result.percentage === 'undefined') {
    window.navigate('books');
    return;
  }

  const user = getCurrentUser() || initialUser;
  const { score, total, percentage, penalty, bookId, bookTitle } = result;
  const correctCount = result.correctCount ?? result.rawScore ?? score ?? 0;
  const wrongCount   = Math.max(0, (total ?? 0) - correctCount);
  const isPassed     = percentage >= 60;
  const isOnline     = navigator.onLine;

  const xpEarned          = result.xpEarned ?? 0;
  const xpBreakdown       = result.xpBreakdown ?? { base: 15, accuracyBonus: 0, speedBonus: 0, dailyBonus: 0, streakBonus: 0 };
  const userLevel         = result.newLevel || getUserLevel(user?.score || 0);
  const isLevelUp         = Boolean(result.isLevelUp);
  const missionsCompleted = Array.isArray(result.missionsCompleted) ? result.missionsCompleted : [];

  // Kitoblar ro'yxatini yuklash (keyingi qulfdan chiqadigan asarni aniqlash uchun)
  let allBooks = [];
  try {
    allBooks = await getBooks();
  } catch {
    allBooks = [];
  }

  const nextUnlock = getNextUnlockTarget(allBooks, user);
  const newlyUnlockedBooks = isLevelUp
    ? allBooks.filter(b => {
        const req = getBookUnlockReq(b);
        return req.level === userLevel.level;
      })
    : [];

  // Fikr-mulohaza matni
  const feedback = _getFeedback(percentage);

  container.innerHTML = `
    <div class="page" id="result-page">
      <div class="container container--sm">

        <!-- Asosiy natija kartochkasi -->
        <div class="card animate-slide-up" style="text-align:center;padding:36px 28px;position:relative;overflow:hidden;">

          <!-- Ball halqasi -->
          <div class="result-score-ring ${isPassed ? 'result-score-ring--pass' : 'result-score-ring--fail'}"
               style="margin:0 auto 20px;">
            <div class="result-score-pct">${percentage}%</div>
            <div class="result-score-label">${isPassed ? "O'tdingiz" : "Davom eting"}</div>
          </div>

          <!-- Sarlavha -->
          <h1 style="font-family:var(--font-display);font-size:1.6rem;font-weight:700;color:var(--ink);margin-bottom:8px;">
            ${feedback.title}
          </h1>
          <p style="font-size:0.9375rem;color:var(--ink-muted);max-width:42ch;margin:0 auto 20px;line-height:1.65;">
            ${escapeHtml(feedback.desc)}
          </p>

          ${bookTitle ? `
            <div style="margin-bottom:20px;">
              <span class="badge" style="font-size:0.875rem;padding:6px 14px;background:var(--paper-alt);border:1px solid var(--divider);color:var(--ink);">
                📖 ${escapeHtml(bookTitle)}
              </span>
            </div>
          ` : ''}

          <!-- Statistika jadval -->
          <div class="result-stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:1px;border:1px solid var(--divider);border-radius:var(--radius-md);overflow:hidden;margin-bottom:24px;">
            <div style="padding:14px 8px;background:var(--surface);">
              <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--success);line-height:1;">${correctCount}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">To'g'ri</div>
            </div>
            <div style="padding:14px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--error);line-height:1;">${wrongCount}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Noto'g'ri</div>
            </div>
            <div style="padding:14px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--ochre);line-height:1;">${score}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Ball</div>
            </div>
            <div style="padding:14px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--ink);line-height:1;">${total}</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Savol</div>
            </div>
            ${penalty > 0 ? `
            <div style="padding:14px 8px;background:var(--surface);border-left:1px solid var(--divider);">
              <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--error);line-height:1;">-${penalty}%</div>
              <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:4px;">Jarima</div>
            </div>` : ''}
          </div>

          <!-- XP VA DARAJA RIVOJLANISHI BLOKI -->
          <div class="result-progression-panel" style="margin-bottom:24px;padding:20px;border-radius:var(--radius-md);background:var(--paper-alt);border:1.5px solid var(--divider);text-align:left;">
            
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="badge ${userLevel.badgeClass || 'badge-primary'}" style="font-size:0.875rem;padding:6px 12px;font-weight:700;">
                  ${userLevel.emoji} ${escapeHtml(userLevel.title)} · Daraja ${userLevel.level}
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-muted);font-weight:600;">Olingan XP:</span>
                <span style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--ochre);">+${xpEarned} XP</span>
              </div>
            </div>

            <!-- XP Breakdown Teglari -->
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
              <span class="result-chip">Asosiy: +${xpBreakdown.base || 15} XP</span>
              ${xpBreakdown.accuracyBonus > 0 ? `<span class="result-chip result-chip--accent">Aniqlik: +${xpBreakdown.accuracyBonus} XP</span>` : ''}
              ${xpBreakdown.speedBonus > 0 ? `<span class="result-chip result-chip--accent">Tezkorlik: +${xpBreakdown.speedBonus} XP</span>` : ''}
              ${xpBreakdown.dailyBonus > 0 ? `<span class="result-chip result-chip--gold">Kunlik topshiriq: +${xpBreakdown.dailyBonus} XP</span>` : ''}
              ${xpBreakdown.streakBonus > 0 ? `<span class="result-chip result-chip--gold">Streak: +${xpBreakdown.streakBonus} XP</span>` : ''}
            </div>

            <!-- Daraja progress indikatori -->
            <div class="result-level-bar-wrap">
              <div style="display:flex;justify-content:space-between;font-size:0.8125rem;color:var(--ink-muted);margin-bottom:6px;">
                <span>${userLevel.isMaxLevel ? "Oliy daraja zabt etildi! 👑" : `Keyingi darajagacha progress`}</span>
                <span><strong>${userLevel.progressPct}%</strong></span>
              </div>
              <div style="height:9px;background:var(--divider);border-radius:6px;overflow:hidden;position:relative;">
                <div style="width:${userLevel.progressPct}%;height:100%;background:linear-gradient(90deg, var(--ochre), #e08e28);border-radius:6px;transition:width 1s ease-out;"></div>
              </div>
              ${!userLevel.isMaxLevel && userLevel.remainingXP > 0 ? `
                <div style="font-size:0.75rem;color:var(--ink-muted);margin-top:6px;display:flex;justify-content:space-between;">
                  <span>Hozirgi XP: <strong>${user?.score ?? (userLevel.currentLevelXP || 0)} XP</strong></span>
                  <span>Yana <strong>${userLevel.remainingXP} XP</strong> kerak</span>
                </div>
              ` : ''}
            </div>

          </div>

          <!-- KUNLIK MISSIYA NATIJASI (Agar bajarilgan bo'lsa) -->
          ${missionsCompleted.length > 0 ? `
            <div style="margin-bottom:20px;padding:12px 16px;border-radius:var(--radius-md);background:rgba(183,110,22,0.08);border:1px solid var(--ochre);text-align:left;display:flex;align-items:center;gap:12px;">
              <span style="font-size:1.5rem;">🎯</span>
              <div>
                <div style="font-size:0.8125rem;font-weight:700;color:var(--ochre);">Kunlik missiya muvaffaqiyatli yakunlandi!</div>
                <div style="font-size:0.875rem;color:var(--ink);">
                  ${missionsCompleted.map(m => escapeHtml(m.title)).join(', ')}
                </div>
              </div>
            </div>
          ` : ''}

          <!-- KEYINGI OCHILADIGAN KITOB ANNOTATSIYASI (Next Unlock Teaser) -->
          ${nextUnlock && nextUnlock.book ? `
            <div class="next-unlock-card" style="margin-bottom:24px;padding:16px;border-radius:var(--radius-md);background:var(--surface);border:1.5px dashed var(--ochre);text-align:left;display:flex;align-items:center;gap:16px;">
              <div style="width:48px;height:68px;border-radius:var(--radius-sm);overflow:hidden;background:var(--paper-alt);border:1px solid var(--divider);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;">
                ${nextUnlock.book.coverImage
                  ? `<img src="${escapeHtml(nextUnlock.book.coverImage)}" alt="${escapeHtml(nextUnlock.book.title)}" style="width:100%;height:100%;object-fit:cover;">`
                  : `<span style="font-size:1.5rem;">📚</span>`
                }
                <div style="position:absolute;inset:0;background:rgba(23,54,45,0.45);display:flex;align-items:center;justify-content:center;color:#FFF;font-size:1.1rem;">🔒</div>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--ochre);">
                  Keyingi marrada ochiladigan durdona
                </div>
                <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${escapeHtml(nextUnlock.book.title)}
                </div>
                <div style="font-size:0.8125rem;color:var(--ink-muted);margin-top:2px;">
                  Daraja ${nextUnlock.unlockReq.level} · Qulfdan chiqarish uchun yana <strong>${nextUnlock.xpNeeded} XP</strong>
                </div>
                <div style="height:5px;background:var(--divider);border-radius:3px;margin-top:6px;overflow:hidden;">
                  <div style="width:${nextUnlock.progressPct}%;height:100%;background:var(--ochre);border-radius:3px;"></div>
                </div>
              </div>
              <a href="#books" class="btn btn-sm btn-outline" style="flex-shrink:0;">Kutubxona</a>
            </div>
          ` : ''}

          <!-- Online/Offline holati -->
          <div style="display:flex;justify-content:center;margin-bottom:24px;">
            <span class="offline-badge">
              <span class="offline-badge__dot" style="background:${isOnline ? 'var(--success)' : 'var(--ink-faint)'};"></span>
              ${isOnline ? 'Natija profilga saqlandi' : 'Lokal xotirada saqlandi'}
            </span>
          </div>

          <!-- Boshqaruv tugmalari -->
          <div class="result-actions" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            ${bookId
              ? `<a href="#book?id=${escapeHtml(String(bookId))}" class="btn btn-outline">Qaytadan urinish</a>
                 <a href="#books" class="btn btn-primary">Barcha kitoblar</a>`
              : `<a href="#books" class="btn btn-primary">Kitoblar kutubxonasi</a>`
            }
            <a href="#profile" class="btn btn-ghost">Profilim</a>
            <a href="#leaderboard" class="btn btn-ghost">Reyting</a>
          </div>

        </div>

        <!-- Maslahat bloki -->
        ${percentage < 60 ? `
        <div style="margin-top:20px;padding:18px 20px;border:1px solid var(--divider);border-left:3px solid var(--ochre);border-radius:var(--radius-md);background:var(--surface);">
          <p style="font-size:0.875rem;color:var(--ink-muted);line-height:1.65;margin:0;">
            Bilimingizni mustahkamlash uchun kitob mazmunini takroran ko'zdan kechirib, yana bir bor urinib ko'ring.
            Har bir topshirilgan test sizga yangi XP olib keladi va yangi kitoblar sari yaqinlashtiradi!
          </p>
        </div>` : ''}

      </div>
    </div>

    <!-- DARAJA OSHISHI TANTANASI MODALI (LEVEL UP MODAL) -->
    ${isLevelUp ? `
      <div id="level-up-modal" class="level-up-modal animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="level-up-title" style="position:fixed;inset:0;background:rgba(23,54,45,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);">
        <div class="level-up-dialog animate-scale-up" style="max-width:460px;width:100%;background:var(--surface);border:2px solid var(--ochre);border-radius:var(--radius-lg);padding:32px 24px;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.3);position:relative;">
          
          <div style="font-size:3.5rem;line-height:1;margin-bottom:12px;">
            ${userLevel.emoji}
          </div>

          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.12em;color:var(--ochre);font-weight:700;margin-bottom:6px;">
            ✨ TABRIKLAYMIZ! DARAJA OSHDI! ✨
          </div>

          <h2 id="level-up-title" style="font-family:var(--font-display);font-size:1.65rem;color:var(--ink);font-weight:700;margin-bottom:8px;">
            ${escapeHtml(userLevel.title)}
          </h2>

          <p style="font-size:0.9rem;color:var(--ink-muted);line-height:1.6;margin-bottom:20px;">
            ${escapeHtml(userLevel.desc)}
          </p>

          ${newlyUnlockedBooks.length > 0 ? `
            <div style="text-align:left;background:var(--paper-alt);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:24px;border:1px solid var(--divider);">
              <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--ochre);font-weight:700;margin-bottom:8px;">
                🔓 Yangi ochilgan asarlar:
              </div>
              <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
                ${newlyUnlockedBooks.map(b => `
                  <li style="font-size:0.875rem;color:var(--ink);display:flex;align-items:center;gap:8px;">
                    <span>📖</span>
                    <strong style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(b.title)}</strong>
                    <span style="font-size:0.75rem;color:var(--ink-muted);">${escapeHtml(b.author || '')}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          <button id="level-up-continue-btn" class="btn btn-primary" style="width:100%;padding:12px;font-size:1rem;font-weight:600;">
            Mutolaani davom ettirish ➔
          </button>
        </div>
      </div>
    ` : ''}
  `;

  // Modal yopish hodisasi
  if (isLevelUp) {
    const modalEl = document.getElementById('level-up-modal');
    const closeBtn = document.getElementById('level-up-continue-btn');
    if (closeBtn && modalEl) {
      const closeModal = () => {
        modalEl.style.opacity = '0';
        modalEl.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          if (modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
        }, 300);
      };
      closeBtn.addEventListener('click', closeModal);
      _cleanup.push(() => closeBtn.removeEventListener('click', closeModal));
    }
  }

  // Adabiy zarhal zarrachalar (literary golden confetti) animatsiyasini ishga tushirish
  _launchLiteraryConfetti();
}

/**
 * Adabiy uslubdagi zarhal zarrachalar (literary golden confetti)
 * Qog'oz (#F8F4EA), zumrad (#17362D) va zarhal oxra (#B76E16) tuslarida.
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
    '#E1A64D', '#F3C98B', '#F5E6C8', '#52B788', '#74C69D', '#D4A373', '#FFEAA7',
  ] : [
    '#B76E16', '#D4A373', '#E5A93C', '#17362D', '#2D6A4F', '#F8F4EA', '#EFE8D9',
  ];

  const particleCount = 70;
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
  const DURATION_MS = 4000;

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
