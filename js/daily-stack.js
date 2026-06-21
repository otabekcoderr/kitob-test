import { getAllQuestions, addResult } from './db.js';
import { getCurrentUser } from './auth.js';
import { navigate, showNotification } from './app.js';

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export async function renderDailyStack(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Kunlik savol yuklanmoqda...</p>
    </div>
  `;

  try {
    const allQuestions = await getAllQuestions();
    if (allQuestions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <div class="empty-state-title">Hozircha savollar mavjud emas</div>
          <p style="color: var(--text-secondary);">Admin savol qo'shgandan keyin qayta urinib ko'ring.</p>
        </div>
      `;
      return;
    }

    const dayOfYear = getDayOfYear();
    const seed = dayOfYear * 42;
    const questionIndex = Math.floor(seededRandom(seed) * allQuestions.length);
    const question = allQuestions[questionIndex];

    const currentUser = getCurrentUser();

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header" style="margin-bottom: 24px;">
          <h1 class="page-title" style="display: flex; align-items: center; gap: 12px;">
            <span>📅</span> Kunlik Stack
          </h1>
          <p class="page-subtitle">Har kuni yangi savol. Bilimingizni sinab ko'ring va streak yuritib boring!</p>
        </div>

        <div class="card" style="max-width: 700px; margin: 0 auto;">
          <div id="daily-stack-content">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <span style="font-size: 1rem; padding: 4px 12px; border-radius: 20px; background: var(--color-primary-light); color: var(--color-primary); font-weight: 600;">
                Savol №${dayOfYear}
              </span>
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${new Date().toLocaleDateString('uz', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>

            <div id="daily-question-text" style="font-size: 1.15rem; font-weight: 600; line-height: 1.6; margin-bottom: 24px; padding: 20px; background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary);">
              ${question.question}
            </div>

            <div id="daily-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
              ${question.options.map((opt, idx) => `
                <button class="btn btn-outline daily-option-btn" data-index="${idx}" style="padding: 14px 16px; text-align: left; font-size: 0.95rem; height: auto; justify-content: flex-start; gap: 12px;">
                  <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; font-size: 0.85rem; flex-shrink: 0;">
                    ${String.fromCharCode(65 + idx)}
                  </span>
                  <span>${opt}</span>
                </button>
              `).join('')}
            </div>

            <div id="daily-result" style="display: none;"></div>

            <div id="daily-footer" style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--border-color);">
              <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${currentUser ? 'Javobingizni tanlang!' : '⚠️ Javob berish uchun '}
                ${!currentUser ? '<a href="#/login" style="color: var(--color-primary);">kiring</a>' : ''}
              </span>
              <button class="btn btn-ghost" id="daily-skip-btn" ${!currentUser ? 'disabled' : ''}>
                Bugun keyin ⏭️
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (!currentUser) return;

    const optionButtons = container.querySelectorAll('.daily-option-btn');
    let answered = false;

    optionButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        if (answered) return;
        answered = true;
        const selectedIdx = parseInt(btn.dataset.index);
        const isCorrect = selectedIdx === question.correctAnswer;

        optionButtons.forEach(b => {
          const idx = parseInt(b.dataset.index);
          b.disabled = true;
          if (idx === question.correctAnswer) {
            b.style.borderColor = 'var(--color-success)';
            b.style.background = 'rgba(16, 185, 129, 0.1)';
          } else if (idx === selectedIdx && !isCorrect) {
            b.style.borderColor = 'var(--color-error)';
            b.style.background = 'rgba(239, 68, 68, 0.1)';
          }
        });

        const resultDiv = document.getElementById('daily-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <div style="padding: 16px; border-radius: var(--radius-md); ${isCorrect ? 'background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);' : 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2);'}">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
              <span style="font-size: 1.5rem;">${isCorrect ? '✅' : '❌'}</span>
              <div>
                <div style="font-weight: 700; font-size: 1.05rem;">${isCorrect ? "To'g'ri javob! 🎉" : "Noto'g'ri javob"}</div>
                ${!isCorrect ? `<div style="font-size: 0.9rem; color: var(--color-success); margin-top: 2px;">To'g'ri javob: ${String.fromCharCode(65 + question.correctAnswer)}) ${question.options[question.correctAnswer]}</div>` : ''}
              </div>
            </div>
            ${question.explanation ? `<div style="margin-top: 8px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">💡 ${question.explanation}</div>` : ''}
          </div>
        `;

        document.getElementById('daily-footer').querySelector('span').textContent = isCorrect ? "Bugungi stack bajarildi! 🔥" : "Ertaga yana urinib ko'ring! 💪";

        try {
          await addResult({
            id: `daily-${crypto.randomUUID()}`,
            userId: currentUser.id,
            userName: currentUser.fullName,
            bookId: question.bookId,
            bookTitle: 'Kunlik Stack',
            score: isCorrect ? 100 : 0,
            correctAnswers: isCorrect ? 1 : 0,
            totalQuestions: 1,
            timeSpent: 0,
            completedAt: Date.now()
          });
        } catch (err) {
          console.error(err);
        }
      });
    });

    document.getElementById('daily-skip-btn')?.addEventListener('click', () => {
      navigate('/dashboard');
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="text-error text-center">Kunlik savolni yuklashda xatolik yuz berdi.</div>`;
  }
}
