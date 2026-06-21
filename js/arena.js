import { getAllQuestions, addArenaMatch, getAllArenaMatches, getArenaMatchesByUser } from './db.js';
import { getCurrentUser } from './auth.js';
import { navigate, showNotification } from './app.js';

const ARENA_QUESTION_COUNT = 5;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function renderArena(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Arena yuklanmoqda...</p>
    </div>
  `;

  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const allQuestions = await getAllQuestions();
    if (allQuestions.length < ARENA_QUESTION_COUNT) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚔️</div>
          <div class="empty-state-title">Arena uchun yetarli savol yo'q</div>
          <p style="color: var(--text-secondary);">Kamida ${ARENA_QUESTION_COUNT} ta savol kerak.</p>
        </div>
      `;
      return;
    }

    const selectedQuestions = shuffle(allQuestions).slice(0, ARENA_QUESTION_COUNT);

    renderArenaBattle(container, selectedQuestions, currentUser);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="text-error text-center">Arenani yuklashda xatolik.</div>`;
  }
}

function renderArenaBattle(container, questions, user) {
  let currentIndex = 0;
  let correctCount = 0;
  const totalQuestions = questions.length;
  const startTime = Date.now();
  let answered = false;

  function renderQuestion() {
    const q = questions[currentIndex];
    const progress = ((currentIndex) / totalQuestions) * 100;

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header" style="margin-bottom: 24px;">
          <h1 class="page-title" style="display: flex; align-items: center; gap: 12px;">
            <span>⚔️</span> Arena Jangi
          </h1>
          <p class="page-subtitle">${totalQuestions} ta savolga javob bering va reytingda yuqoriga ko'tariling!</p>
        </div>

        <div class="card" style="max-width: 700px; margin: 0 auto;">
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
            <div style="flex: 1; height: 8px; background: var(--bg-tertiary); border-radius: 99px; overflow: hidden;">
              <div style="height: 100%; width: ${progress}%; background: linear-gradient(90deg, var(--color-primary), var(--color-secondary)); border-radius: 99px; transition: width 0.4s ease;"></div>
            </div>
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; white-space: nowrap;">${currentIndex + 1}/${totalQuestions}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <span style="font-size: 0.85rem; padding: 4px 12px; border-radius: 20px; background: rgba(99, 102, 241, 0.12); color: var(--color-primary); font-weight: 600;">
              🎯 Savol ${currentIndex + 1}
            </span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">To'g'ri: ${correctCount}</span>
          </div>

          <div id="arena-question-text" style="font-size: 1.15rem; font-weight: 600; line-height: 1.6; margin-bottom: 24px; padding: 20px; background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary);">
            ${q.question}
          </div>

          <div id="arena-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            ${q.options.map((opt, idx) => `
              <button class="btn btn-outline arena-option-btn" data-index="${idx}" style="padding: 14px 16px; text-align: left; font-size: 0.95rem; height: auto; justify-content: flex-start; gap: 12px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--color-primary-light); color: var(--color-primary); font-weight: 700; font-size: 0.85rem; flex-shrink: 0;">
                  ${String.fromCharCode(65 + idx)}
                </span>
                <span>${opt}</span>
              </button>
            `).join('')}
          </div>

          <div id="arena-feedback" style="display: none;"></div>
        </div>
      </div>
    `;

    answered = false;
    attachOptionListeners(q);
  }

  function attachOptionListeners(q) {
    const buttons = container.querySelectorAll('.arena-option-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const selectedIdx = parseInt(btn.dataset.index);
        const isCorrect = selectedIdx === q.correctAnswer;
        if (isCorrect) correctCount++;

        buttons.forEach(b => {
          const idx = parseInt(b.dataset.index);
          b.disabled = true;
          if (idx === q.correctAnswer) {
            b.style.borderColor = 'var(--color-success)';
            b.style.background = 'rgba(16, 185, 129, 0.1)';
          } else if (idx === selectedIdx && !isCorrect) {
            b.style.borderColor = 'var(--color-error)';
            b.style.background = 'rgba(239, 68, 68, 0.1)';
          }
        });

        const feedback = document.getElementById('arena-feedback');
        feedback.style.display = 'block';
        feedback.innerHTML = `
          <div style="padding: 12px; border-radius: var(--radius-md); ${isCorrect ? 'background: rgba(16, 185, 129, 0.1);' : 'background: rgba(239, 68, 68, 0.1);'} display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600;">${isCorrect ? "✅ To'g'ri!" : `❌ Noto'g'ri. To'g'ri: ${String.fromCharCode(65 + q.correctAnswer)}`}</span>
            <button class="btn btn-primary btn-sm" id="arena-next-btn">
              ${currentIndex < totalQuestions - 1 ? 'Keyingi →' : 'Natijani ko\'rish 📊'}
            </button>
          </div>
        `;

        document.getElementById('arena-next-btn').addEventListener('click', () => {
          if (currentIndex < totalQuestions - 1) {
            currentIndex++;
            renderQuestion();
          } else {
            finishBattle();
          }
        });
      });
    });
  }

  async function finishBattle() {
    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    const score = Math.round((correctCount / totalQuestions) * 100);

    const matchData = {
      id: `arena-${crypto.randomUUID()}`,
      userId: user.id,
      userName: user.fullName,
      userAvatar: user.avatar,
      score,
      correctCount,
      totalQuestions,
      timeSpent,
      completedAt: Date.now()
    };

    try {
      await addArenaMatch(matchData);
    } catch (err) {
      console.error(err);
    }

    const rankEmoji = score === 100 ? '🏆' : score >= 80 ? '🥇' : score >= 60 ? '🥈' : score >= 40 ? '🥉' : '💪';

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header" style="margin-bottom: 24px; text-align: center;">
          <h1 class="page-title" style="display: flex; align-items: center; justify-content: center; gap: 12px;">
            <span>⚔️</span> Jang yakunlandi!
          </h1>
        </div>

        <div class="card" style="max-width: 500px; margin: 0 auto; text-align: center;">
          <div style="font-size: 4rem; margin-bottom: 16px;">${rankEmoji}</div>
          <h2 style="font-size: 1.5rem; margin-bottom: 8px;">${score === 100 ? "Mukammal! 🎉" : score >= 80 ? "Ajoyib natija! 🌟" : score >= 60 ? "Yaxshi! 👍" : score >= 40 ? "Yaxshilashga harakat qiling! 💪" : "Ko'proq mashq qiling! 📚"}</h2>
          <div style="font-size: 3rem; font-weight: 800; color: var(--color-primary); margin-bottom: 8px;">${score}%</div>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">${correctCount} / ${totalQuestions} ta to'g'ri javob</p>

          <div style="display: flex; gap: 12px; justify-content: center;">
            <button class="btn btn-primary btn-lg" id="arena-replay-btn">⚔️ Qayta urinish</button>
            <button class="btn btn-outline btn-lg" id="arena-leaderboard-btn">🏆 Reyting</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('arena-replay-btn').addEventListener('click', () => {
      renderArena(container);
    });

    document.getElementById('arena-leaderboard-btn').addEventListener('click', () => {
      navigate('/arena-leaderboard');
    });
  }

  renderQuestion();
}

export async function renderArenaLeaderboard(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Reyting yuklanmoqda...</p>
    </div>
  `;

  try {
    const matches = await getAllArenaMatches();

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header" style="margin-bottom: 24px;">
          <h1 class="page-title" style="display: flex; align-items: center; gap: 12px;">
            <span>🏆</span> Arena Reytingi
          </h1>
          <p class="page-subtitle">Eng kuchli jangchilar reytingi</p>
        </div>

        <div class="card" style="max-width: 600px; margin: 0 auto;">
          ${matches.length === 0 ? `
            <div class="text-center" style="padding: 40px 0; color: var(--text-secondary);">
              Hozircha hech kim Arena jangida qatnashmagan. Birinchi bo'ling!
            </div>
          ` : `
            <div style="display: flex; flex-direction: column;">
              ${buildArenaRanking(matches).map((entry, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const rankDisplay = i < 3 ? medals[i] : `#${i + 1}`;
                const isCurrentUser = entry.userId === (getCurrentUser()?.id);
                return `
                  <div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--border-color); ${isCurrentUser ? 'background: var(--color-primary-light);' : ''}">
                    <span style="font-size: 1.25rem; width: 36px; text-align: center; flex-shrink: 0;">${rankDisplay}</span>
                    <span style="font-size: 1.25rem;">${entry.avatar || '😊'}</span>
                    <div style="flex: 1;">
                      <div style="font-weight: 600; font-size: 0.95rem;">${entry.userName} ${isCurrentUser ? '(Siz)' : ''}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${entry.matches} ta jang</div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-weight: 700; color: var(--color-primary); font-size: 1.05rem;">${entry.bestScore}%</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">Eng yaxshi</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <button class="btn btn-primary" id="arena-start-btn">⚔️ Yangi jangni boshlash</button>
        </div>
      </div>
    `;

    document.getElementById('arena-start-btn')?.addEventListener('click', () => {
      navigate('/arena');
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="text-error text-center">Reytingni yuklashda xatolik.</div>`;
  }
}

function buildArenaRanking(matches) {
  const userMap = {};
  for (const m of matches) {
    if (!userMap[m.userId]) {
      userMap[m.userId] = { userId: m.userId, userName: m.userName, avatar: m.userAvatar, bestScore: 0, matches: 0 };
    }
    userMap[m.userId].bestScore = Math.max(userMap[m.userId].bestScore, m.score);
    userMap[m.userId].matches++;
  }
  return Object.values(userMap).sort((a, b) => b.bestScore - a.bestScore || b.matches - a.matches);
}
