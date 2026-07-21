// ============================================================
// pages/not-found.js — 404 sahifa
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
            <span class="nf-icon">📚</span>
            <span class="nf-num">4</span>
          </div>

          <h1 class="nf-title">Sahifa topilmadi</h1>
          <p  class="nf-desc">
            Siz izlayotgan sahifa mavjud emas yoki ko'chirilgan.<br>
            Bosh sahifaga qayting va qayta urinib ko'ring.
          </p>

          <div class="nf-actions">
            <button id="nf-back-btn" class="btn btn-primary btn-lg">
              🏠 Bosh sahifaga
            </button>
            <a href="#books" class="btn btn-outline btn-lg">
              📚 Kitoblar
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
      font-family: var(--font-heading);
      font-size: clamp(5rem, 15vw, 8rem);
      font-weight: 800; line-height: 1;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .nf-icon {
      font-size: clamp(4rem, 12vw, 6.5rem);
      animation: bounce-in 0.7s cubic-bezier(0.34,1.56,0.64,1);
      display: block;
    }
    .nf-title {
      font-size: clamp(1.375rem, 4vw, 1.875rem);
    }
    .nf-desc {
      color: var(--text-muted); line-height: 1.7;
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
      font-size: .875rem; color: var(--text-muted);
      text-decoration: underline; text-underline-offset: 3px;
      transition: var(--transition-fast);
    }
    .nf-link:hover { color: var(--color-primary); }

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
