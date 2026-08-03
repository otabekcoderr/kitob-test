// ============================================================
// pages/not-found.js — 404 sahifa (Editorial uslub)
// ============================================================
let _cleanup = [];

export async function render(container, { params, user }) {
  container.innerHTML = `
    <div class="page nf-page">
      <div class="container">
        <div class="nf-content animate-slide-up">

          <!-- Animatsiya -->
          <div class="nf-illustration" aria-hidden="true">
            <span class="nf-num">4</span>
            <div style="width:72px;height:72px;background:var(--ochre);border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 12px;transform:rotate(-8deg);flex-shrink:0;">
              <span style="font-family:Georgia,serif;font-size:2.5rem;font-weight:700;color:#fff;">K</span>
            </div>
            <span class="nf-num">4</span>
          </div>

          <h1 class="nf-title">Sahifa topilmadi</h1>
          <p class="nf-desc">
            Siz izlayotgan sahifa mavjud emas yoki ko'chirilgan.<br>
            Bosh sahifaga qayting va qayta urinib ko'ring.
          </p>

          <div class="nf-actions">
            <button id="nf-back-btn" class="btn btn-primary btn-lg" style="display:inline-flex; align-items:center; gap:8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              Bosh sahifa
            </button>
            <a href="#books" class="btn btn-outline btn-lg" style="display:inline-flex; align-items:center; gap:8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              Kitoblar
            </a>
          </div>

          <!-- Qisqa havolalar -->
          <nav class="nf-links" aria-label="Tezkor havolalar">
            <a href="#home"        class="nf-link">Bosh sahifa</a>
            <a href="#books"       class="nf-link">Kitoblar</a>
            <a href="#leaderboard" class="nf-link">Reyting</a>
            ${user
              ? `<a href="#profile" class="nf-link">Profil</a>`
              : `<a href="#login"   class="nf-link">Kirish</a>`
            }
          </nav>

        </div>
      </div>
    </div>
  `;

  _addStyles();

  const backBtn = document.getElementById('nf-back-btn');
  const onClick = () => window.navigate('home');
  backBtn?.addEventListener('click', onClick);
  _cleanup.push(() => backBtn?.removeEventListener('click', onClick));
}

function _addStyles() {
  if (document.getElementById('nf-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'nf-page-styles';
  style.textContent = `
    .nf-page { display: flex; align-items: center; justify-content: center; }
    .nf-content {
      text-align: center; padding: 48px 24px;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      max-width: 480px;
    }
    .nf-illustration {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 8px;
    }
    .nf-num {
      font-family: var(--font-display);
      font-size: clamp(5rem, 15vw, 8rem);
      font-weight: 700; line-height: 1;
      color: var(--ink);
    }
    .nf-title {
      font-family: var(--font-display);
      font-size: clamp(1.375rem, 4vw, 1.875rem);
      font-weight: 700;
    }
    .nf-desc {
      color: var(--ink-muted); line-height: 1.7;
      font-size: .9375rem;
    }
    .nf-actions {
      display: flex; gap: 12px; flex-wrap: wrap;
      justify-content: center; margin-top: 8px;
    }
    .nf-links {
      display: flex; gap: 20px; flex-wrap: wrap;
      justify-content: center; margin-top: 8px;
    }
    .nf-link {
      font-size: .875rem; color: var(--ink-muted);
      text-decoration: underline; text-underline-offset: 3px;
      transition: var(--transition-fast);
    }
    .nf-link:hover { color: var(--ochre); }

    @media (max-width: 480px) {
      .nf-actions { flex-direction: column; width: 100%; }
      .nf-actions .btn { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

export function cleanup() {
  _cleanup.forEach(fn => fn());
  _cleanup = [];
}
