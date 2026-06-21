import { getCurrentUser } from './auth.js';
import { getResultById, getResultsByUser, getAllResults, getAllUsers, getQuestionsByBook } from './db.js';
import { navigate, showNotification } from './app.js';

export async function renderResultDetail(container, resultId) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Natija ma'lumotlari yuklanmoqda...</p>
    </div>
  `;

  try {
    const result = await getResultById(resultId);
    if (!result) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">❌</div>
          <div class="empty-state-title">Natija topilmadi</div>
          <a href="#/dashboard" class="btn btn-primary mt-md">Bosh sahifaga qaytish</a>
        </div>
      `;
      return;
    }

    const questions = await getQuestionsByBook(result.bookId);
    const mm = String(Math.floor(result.timeSpent / 60)).padStart(2, '0');
    const ss = String(result.timeSpent % 60).padStart(2, '0');

    // Score evaluation
    let resultClass = 'poor';
    let resultMsg = 'Ko\'proq o\'qishingiz kerak 📚';
    if (result.score >= 80) {
      resultClass = 'excellent';
      resultMsg = 'A\'lo natija! Mukammal bilim! 🌟';
    } else if (result.score >= 60) {
      resultClass = 'good';
      resultMsg = 'Yaxshi natija! Yana biroz harakat qiling 👍';
    } else if (result.score >= 40) {
      resultClass = 'average';
      resultMsg = 'O\'rtacha natija. Kitobni qayta o\'qib chiqing 📖';
    }

    container.innerHTML = `
      <div class="fade-in">
        <div class="card glass-card text-center mb-lg result-hero">
          <div class="result-circle ${resultClass}">
            <div class="result-score">${result.score}%</div>
            <div class="result-label">BALL</div>
          </div>
          <h1 class="result-message" style="font-family: var(--font-heading); font-size: 1.6rem; margin-top: 16px;">${resultMsg}</h1>
          <p style="color: var(--text-secondary); margin-bottom: 8px;">Kitob: <strong>${result.bookTitle}</strong></p>

          ${result.penaltiesCount > 0 ? `
            <div style="margin: 16px auto; max-width: 440px; padding: 14px; border-radius: var(--radius-md); background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: var(--color-error); text-align: center; font-size: 0.9rem;">
              🚨 <strong>Xavfsizlik tizimi:</strong> Qoidabuzarlik aniqlanganligi sababli yakuniy balldan <strong>-${result.penaltiesCount * 10}%</strong> chegirildi!
              <br><span style="font-size: 0.8rem; opacity: 0.85; display: inline-block; margin-top: 4px;">Boshlang'ich bilim ko'rsatkichi: ${result.originalScore}% | Jarimalar: ${result.penaltiesCount} ta tab almashtirish</span>
            </div>
          ` : ''}

          <div class="result-details" style="display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; margin-top: 24px;">
            <div class="result-detail-item">
              <div style="font-size: 1.5rem;">🎯</div>
              <div style="font-weight: 700; margin-top: 4px;">${result.correctAnswers} / ${result.totalQuestions}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">To'g'ri javoblar</div>
            </div>
            <div class="result-detail-item">
              <div style="font-size: 1.5rem;">⏱️</div>
              <div style="font-weight: 700; margin-top: 4px;">${mm}:${ss}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">Sarf etilgan vaqt</div>
            </div>
            <div class="result-detail-item">
              <div style="font-size: 1.5rem;">📅</div>
              <div style="font-weight: 700; margin-top: 4px;">${new Date(result.completedAt).toLocaleDateString('uz')}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">Sana</div>
            </div>
          </div>

          <div style="display: flex; gap: 12px; justify-content: center; margin-top: 28px; flex-wrap: wrap;">
            <a href="#/quiz/${result.bookId}" class="btn btn-primary">🔁 Qayta topshirish</a>
            <a href="#/book/${result.bookId}" class="btn btn-secondary">💬 Muhokama va Fikrlar</a>
            <a href="#/dashboard" class="btn btn-outline">🏠 Bosh sahifa</a>
          </div>
        </div>

        <div class="section-title">📝 Xatolar ustida ishlash</div>
        <div style="display: flex; flex-direction: column; gap: 20px;">
          ${questions.map((q, idx) => {
            const userAns = result.answers.find(a => a.questionId === q.id);
            const selectedIdx = userAns ? userAns.selectedAnswerIndex : null;
            const isCorrect = userAns ? userAns.isCorrect : false;

            return `
              <div class="card" style="border-left: 5px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-error)'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                  <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">SAVOL ${idx + 1}</span>
                  <span class="badge ${isCorrect ? 'badge-success' : 'badge-error'}">
                    ${isCorrect ? '✓ To\'g\'ri' : '✗ Noto\'g\'ri'}
                  </span>
                </div>
                
                <h3 style="font-size: 1.05rem; font-weight: 600; line-height: 1.5; margin-bottom: 16px;">${q.question}</h3>

                <div class="quiz-options" style="pointer-events: none;">
                  ${q.options.map((opt, oIdx) => {
                    let optionClass = '';
                    if (oIdx === q.correctAnswer) {
                      optionClass = 'correct';
                    } else if (oIdx === selectedIdx && !isCorrect) {
                      optionClass = 'wrong';
                    }
                    return `
                      <div class="quiz-option ${optionClass}" style="margin-bottom: 0;">
                        <span class="quiz-option-letter">${String.fromCharCode(65 + oIdx)}</span>
                        <span>${opt}</span>
                      </div>
                    `;
                  }).join('')}
                </div>

                <div style="margin-top: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); font-size: 0.9rem; border-left: 3px solid var(--color-primary);">
                  <strong>Tushuntirish:</strong> ${q.explanation}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    showNotification("Ma'lumotlarni yuklashda xatolik yuz berdi", "error");
  }
}

export async function renderResultsHistory(container) {
  const currentUser = getCurrentUser();
  
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Natijalar tarixi yuklanmoqda...</p>
    </div>
  `;

  try {
    const results = await getResultsByUser(currentUser.id);

    if (results.length === 0) {
      container.innerHTML = `
        <div class="fade-in">
          <div class="page-header">
            <h1 class="page-title">📊 Natijalar Tarixi</h1>
            <p class="page-subtitle">Siz topshirgan testlar ro'yxati va statistikalari</p>
          </div>
          <div class="card text-center" style="padding: 60px 20px;">
            <div style="font-size: 3rem; margin-bottom: 16px;">📈</div>
            <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 8px;">Natijalar mavjud emas</h2>
            <p style="color: var(--text-secondary); margin-bottom: 24px;">Hali hech qanday test topshirmagansiz.</p>
            <a href="#/books" class="btn btn-primary">Test topshirish</a>
          </div>
        </div>
      `;
      return;
    }

    const totalTests = results.length;
    const avgScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests);
    const bestScore = Math.max(...results.map(r => r.score));
    const totalTimeSec = results.reduce((acc, r) => acc + r.timeSpent, 0);
    const totalTimeMin = Math.round(totalTimeSec / 60);

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header">
          <h1 class="page-title">📊 Natijalar Tarixi</h1>
          <p class="page-subtitle">Siz topshirgan testlar ro'yxati va statistikalari</p>
        </div>

        <div class="grid grid-4 mb-lg">
          <div class="card stat-card slide-up stagger-1">
            <div class="stat-value">${totalTests}</div>
            <div class="stat-label">Umumiy urinishlar</div>
          </div>
          <div class="card stat-card slide-up stagger-2">
            <div class="stat-value">${avgScore}%</div>
            <div class="stat-label">O'rtacha ball</div>
          </div>
          <div class="card stat-card slide-up stagger-3">
            <div class="stat-value">${bestScore}%</div>
            <div class="stat-label">Eng yaxshi ball</div>
          </div>
          <div class="card stat-card slide-up stagger-4">
            <div class="stat-value">${totalTimeMin}m</div>
            <div class="stat-label">Sarf etilgan vaqt</div>
          </div>
        </div>

        <div class="section-title">📋 Barcha natijalar</div>
        <div class="card" style="padding: 0;">
          <div style="display: flex; flex-direction: column;">
            ${results.map((r, idx) => {
              const mm = String(Math.floor(r.timeSpent / 60)).padStart(2, '0');
              const ss = String(r.timeSpent % 60).padStart(2, '0');
              return `
                <div class="results-history-item" onclick="window.location.hash='#/result/${r.id}'" style="border-bottom: 1px solid var(--border-color); padding: 20px; transition: var(--transition); display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                  <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
                    <div style="width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; background: ${r.score >= 80 ? 'rgba(34,197,94,0.15)' : r.score >= 60 ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${r.score >= 80 ? 'var(--color-success)' : r.score >= 60 ? 'var(--color-primary)' : 'var(--color-error)'}; font-size: 1rem;">
                      ${r.score}%
                    </div>
                    <div>
                      <h3 style="font-size: 1.05rem; font-weight: 600; margin-bottom: 4px;">${r.bookTitle}</h3>
                      <p style="font-size: 0.8rem; color: var(--text-muted);">${r.correctAnswers}/${r.totalQuestions} to'g'ri • Vaqt: ${mm}:${ss}</p>
                    </div>
                  </div>
                  <div style="text-align: right; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 0.8rem; color: var(--text-muted);">${new Date(r.completedAt).toLocaleDateString('uz')}</span>
                    <span style="color: var(--text-muted); font-size: 1.2rem;">→</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    showNotification("Xatolik yuz berdi", "error");
  }
}

export async function renderLeaderboard(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Reyting jadvali yuklanmoqda...</p>
    </div>
  `;

  try {
    const allUsers = await getAllUsers();
    const allResults = await getAllResults();
    const currentUser = getCurrentUser();

    // Calculate ranking statistics for all users
    const usersStats = allUsers.map(user => {
      const userResults = allResults.filter(r => r.userId === user.id);
      const testsCompleted = userResults.length;
      
      let avgScore = 0;
      let totalCorrect = 0;
      let totalQuestions = 0;
      let bestScore = 0;

      if (testsCompleted > 0) {
        userResults.forEach(r => {
          totalCorrect += r.correctAnswers;
          totalQuestions += r.totalQuestions;
          if (r.score > bestScore) bestScore = r.score;
        });
        avgScore = Math.round((totalCorrect / totalQuestions) * 100) || 0;
      }

      return {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        avatar: user.avatar,
        testsCompleted,
        avgScore,
        bestScore
      };
    });

    // Filter users who completed at least 1 test, sort by avgScore descending, then by testsCompleted descending
    const rankedUsers = usersStats
      .filter(u => u.testsCompleted > 0)
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) {
          return b.avgScore - a.avgScore;
        }
        return b.testsCompleted - a.testsCompleted;
      });

    container.innerHTML = `
      <div class="fade-in">
        <div class="page-header">
          <h1 class="page-title">🏆 Foydalanuvchilar Reytingi</h1>
          <p class="page-subtitle">Platformadagi barcha kitobxonlarning o'rtacha ko'rsatkichi bo'yicha saralanishi</p>
        </div>

        <div class="card" style="padding: 0;">
          ${rankedUsers.length > 0 ? `
            <div style="display: flex; flex-direction: column;">
              ${rankedUsers.map((u, idx) => {
                const isSelf = u.id === currentUser.id;
                let rankEmoji = '';
                if (idx === 0) rankEmoji = '🥇';
                else if (idx === 1) rankEmoji = '🥈';
                else if (idx === 2) rankEmoji = '🥉';

                return `
                  <div class="leaderboard-item ${isSelf ? 'active-self' : ''}" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); background: ${isSelf ? 'var(--color-primary-light)' : 'transparent'};">
                    <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
                      <div class="leaderboard-rank" style="width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.95rem; background: ${idx < 3 ? 'transparent' : 'var(--bg-tertiary)'};">
                        ${rankEmoji || (idx + 1)}
                      </div>
                      <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                        ${u.avatar || '😊'}
                      </div>
                      <div>
                        <h3 style="font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                          ${u.fullName}
                          ${isSelf ? '<span class="badge badge-primary" style="font-size: 0.65rem; padding: 2px 6px;">Siz</span>' : ''}
                        </h3>
                        <p style="font-size: 0.75rem; color: var(--text-muted);">@${u.username} • ${u.testsCompleted} marta yechilgan</p>
                      </div>
                    </div>
                    <div style="text-align: right;">
                      <div class="leaderboard-score" style="font-weight: 700; font-size: 1.25rem; color: var(--color-secondary);">${u.avgScore}%</div>
                      <div style="font-size: 0.7rem; color: var(--text-muted);">o'rtacha ball</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="text-center" style="padding: 60px 20px;">
              <div style="font-size: 3rem; margin-bottom: 16px;">🏆</div>
              <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 8px;">Reyting jadvali bo'sh</h2>
              <p style="color: var(--text-secondary);">Hali hech kim test topshirmagan. Birinchi bo'ling!</p>
            </div>
          `}
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    showNotification("Reytingni yuklashda xatolik", "error");
  }
}
