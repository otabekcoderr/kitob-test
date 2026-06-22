import { getBookById, getQuestionsByBook, addResult, updateUserStreak } from './db.js';
import { getCurrentUser } from './auth.js';
import { navigate, showNotification } from './app.js';
import { escapeHtml } from './utils.js';

export async function renderQuiz(container, bookId) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Test yuklanmoqda...</p>
    </div>
  `;

  let book = null;
  let questions = [];
  const currentUser = getCurrentUser();

  try {
    book = await getBookById(bookId);
    questions = await getQuestionsByBook(bookId);
  } catch (err) {
    console.error(err);
    showNotification("Testni yuklashda xatolik", "error");
    navigate('/books');
    return;
  }

  if (!book || questions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Test topilmadi</div>
        <p class="empty-state-text">Ushbu kitob bo'yicha hozircha testlar mavjud emas.</p>
        <a href="#/books" class="btn btn-primary mt-md">Kutubxonaga qaytish</a>
      </div>
    `;
    return;
  }

  // Show anti-cheat warning modal before starting
  container.innerHTML = `
    <div class="modal-backdrop show" id="quiz-consent-modal">
      <div class="modal">
        <h2 class="modal-title">🔒 Xavfsizlik va Anti-Cheat Tizimi</h2>
        <div class="modal-text">
          <p style="margin-bottom: 12px; font-weight: 600; color: var(--color-error);">DIQQAT! Ushbu testda xavfsizlik rejimi yoqilgan:</p>
          <ul style="list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 8px;">
            <li>⚠️ <strong>Tab / Oyna almashtirish taqiqlanadi</strong> (har bir urinish uchun yakuniy balldan <strong>10% jarima</strong> chegiriladi).</li>
            <li>🚫 Sichqoncha o'ng tugmasini bosish yoki F12 (kodlarni ochish) tugmasi taqiqlangan.</li>
            <li>🚨 Qoidalarni buzish jarimaga yoki testni 0 ball bilan avtomatik topshirilishiga olib keladi.</li>
          </ul>
          <p style="margin-top: 16px; font-weight: 500;">Testni boshlashga tayyormisiz?</p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <a href="#/book/${book.id}" class="btn btn-outline">Yo'q, qaytish</a>
          <button class="btn btn-primary" id="confirm-start-quiz-btn">Ha, tayyorman! 🚀</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('confirm-start-quiz-btn').addEventListener('click', () => {
    document.getElementById('quiz-consent-modal').classList.remove('show');
    setTimeout(() => {
      startQuiz();
    }, 200);
  });

  function startQuiz() {
    // Quiz state
    let currentQuestionIndex = 0;
    let answers = []; // Stores: { questionId: string, selectedAnswerIndex: number, isCorrect: boolean }
    const startTime = Date.now();
    let timerInterval = null;
    let penaltiesCount = 0;

    // Anti-cheat handlers
    function handleWindowBlur() {
      penaltiesCount++;
      showNotification(`Ogohlantirish! Oynadan chiqib ketdingiz. Jarima balli yozildi! (Jarima jami: ${penaltiesCount}) ⚠️`, "error");
    }

    function handleKeyDown(e) {
      // Prevent F12 (123)
      if (e.keyCode === 123) {
        e.preventDefault();
        penaltiesCount++;
        showNotification("DevTools (F12) ochish taqiqlanadi! (Jarima: 10% ball)", "error");
      }
      // Prevent Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
      if (e.ctrlKey && (e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67) || e.keyCode === 85)) {
        e.preventDefault();
        penaltiesCount++;
        showNotification("Kodni ko'rish taqiqlanadi! (Jarima: 10% ball)", "error");
      }
    }

    function handleContextMenu(e) {
      e.preventDefault();
      showNotification("Sichqonchaning o'ng tugmasi taqiqlangan!", "warning");
    }

    // Attach listeners
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    function renderCurrentQuestion() {
      const q = questions[currentQuestionIndex];
      const progressPercent = (currentQuestionIndex / questions.length) * 100;
      const currentAnswer = answers.find(a => a.questionId === q.id);
      const safeBookTitle = escapeHtml(book.title);
      const safeBookAuthor = escapeHtml(book.author);
      const safeQuestion = escapeHtml(q.question);
      const safeOptions = q.options.map(opt => escapeHtml(opt));

      container.innerHTML = `
        <div class="quiz-container fade-in">
          <div class="card glass-card mb-md">
            <div class="quiz-header">
              <div>
                <h2 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; margin-bottom: 2px;">${safeBookTitle}</h2>
                <p style="font-size: 0.8rem; color: var(--text-muted);">${safeBookAuthor}</p>
              </div>
              <div style="text-align: right; display: flex; align-items: center; gap: 16px;">
                ${penaltiesCount > 0 ? `
                  <span class="badge badge-error" style="animation: pulse 1s infinite;">Jarima: -${penaltiesCount * 10}%</span>
                ` : ''}
                <div class="quiz-timer" id="quiz-timer" style="font-weight: 700; color: var(--color-accent); font-size: 1.3rem;">00:00</div>
              </div>
            </div>

            <div class="quiz-progress" style="margin-top: 16px;">
              <div class="quiz-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          </div>

          <div class="card mb-md">
            <div class="quiz-question-number" style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-bottom: 8px;">
              SAVOL ${currentQuestionIndex + 1} / ${questions.length}
            </div>
            <div class="quiz-question-text" style="font-size: 1.15rem; font-weight: 600; line-height: 1.6; margin-bottom: 24px;">
              ${safeQuestion}
            </div>

            <div class="quiz-options">
              ${safeOptions.map((option, idx) => {
                const isSelected = currentAnswer && currentAnswer.selectedAnswerIndex === idx;
                return `
                  <div class="quiz-option ${isSelected ? 'selected' : ''}" data-index="${idx}">
                    <span class="quiz-option-letter">${String.fromCharCode(65 + idx)}</span>
                    <span>${option}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="card" style="padding: 16px;">
            <div class="quiz-nav">
              <button class="btn btn-outline" id="prev-question-btn" ${currentQuestionIndex === 0 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
                ← Oldingi
              </button>

              <!-- Navigation Dots -->
              <div class="flex items-center gap-sm" style="overflow-x: auto; padding: 4px; max-width: 50%;">
                ${questions.map((_, idx) => {
                  const ans = answers.find(a => a.questionId === questions[idx].id);
                  let dotStyle = 'background: var(--bg-tertiary); color: var(--text-muted);';
                  if (idx === currentQuestionIndex) {
                    dotStyle = 'background: var(--color-primary); color: white; box-shadow: var(--shadow-glow);';
                  } else if (ans) {
                    dotStyle = 'background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary);';
                  }
                  return `
                    <button class="quiz-dot-nav" data-index="${idx}" style="width: 32px; height: 32px; border-radius: 50%; border: none; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: var(--transition); ${dotStyle}">
                      ${idx + 1}
                    </button>
                  `;
                }).join('')}
              </div>

              ${currentQuestionIndex === questions.length - 1 ? `
                <button class="btn btn-primary" id="finish-quiz-btn">
                  🎉 Tugatish
                </button>
              ` : `
                <button class="btn btn-primary" id="next-question-btn">
                  Keyingi →
                </button>
              `}
            </div>
          </div>
        </div>
      `;

      // Update Timer display immediately
      updateTimerDisplay();

      // Event listeners
      const options = container.querySelectorAll('.quiz-option');
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          const selectedIdx = parseInt(opt.dataset.index);
          selectOption(selectedIdx);
        });
      });

      const prevBtn = document.getElementById('prev-question-btn');
      if (prevBtn && currentQuestionIndex > 0) {
        prevBtn.addEventListener('click', () => {
          currentQuestionIndex--;
          renderCurrentQuestion();
        });
      }

      const nextBtn = document.getElementById('next-question-btn');
      if (nextBtn && currentQuestionIndex < questions.length - 1) {
        nextBtn.addEventListener('click', () => {
          currentQuestionIndex++;
          renderCurrentQuestion();
        });
      }

      const finishBtn = document.getElementById('finish-quiz-btn');
      if (finishBtn) {
        finishBtn.addEventListener('click', finishQuiz);
      }

      const dotButtons = container.querySelectorAll('.quiz-dot-nav');
      dotButtons.forEach(dot => {
        dot.addEventListener('click', () => {
          currentQuestionIndex = parseInt(dot.dataset.index);
          renderCurrentQuestion();
        });
      });
    }

    function selectOption(idx) {
      const q = questions[currentQuestionIndex];
      const isCorrect = idx === q.correctAnswer;
      const answerData = {
        questionId: q.id,
        selectedAnswerIndex: idx,
        isCorrect
      };

      const existingIdx = answers.findIndex(a => a.questionId === q.id);
      if (existingIdx !== -1) {
        answers[existingIdx] = answerData;
      } else {
        answers.push(answerData);
      }

      renderCurrentQuestion();
    }

    function updateTimerDisplay() {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
      const ss = String(elapsedSeconds % 60).padStart(2, '0');
      const timerEl = document.getElementById('quiz-timer');
      if (timerEl) {
        timerEl.textContent = `${mm}:${ss}`;
      }
    }

    function cleanupListeners() {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      clearInterval(timerInterval);
    }

    function finishQuiz() {
      if (answers.length < questions.length) {
        const remaining = questions.length - answers.length;
        showNotification(`Iltimos, qolgan ${remaining} ta savolga ham javob bering!`, 'warning');
        return;
      }

      cleanupListeners();

      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      const correctCount = answers.filter(a => a.isCorrect).length;
      const scorePercent = Math.round((correctCount / questions.length) * 100);

      // Score adjustment with anti-cheat penalties
      const penaltyPercent = penaltiesCount * 10;
      const finalScore = Math.max(0, scorePercent - penaltyPercent);

      const result = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        userName: currentUser.fullName,
        userAvatar: currentUser.avatar,
        bookId: book.id,
        bookTitle: book.title,
        score: finalScore, // saved as final score (post penalty)
        originalScore: scorePercent, // normal score
        penaltiesCount,
        totalQuestions: questions.length,
        correctAnswers: correctCount,
        timeSpent,
        answers,
        completedAt: Date.now()
      };

      addResult(result)
        .then(async () => {
          try {
            const updatedUser = await updateUserStreak(currentUser.id);
            const sessionUser = JSON.parse(localStorage.getItem('kitobtest_session') || '{}');
            sessionUser.stats = updatedUser.stats;
            localStorage.setItem('kitobtest_session', JSON.stringify(sessionUser));
          } catch (err) {
            console.error("Streak update error:", err);
          }
          showNotification("Test muvaffaqiyatli topshirildi! 🎉", "success");
          navigate(`/result/${result.id}`);
        })
        .catch(err => {
          console.error("Result save error:", err);
          showNotification("Natijani saqlashda xatolik yuz berdi", "error");
        });
    }

    // Set up timer interval
    timerInterval = setInterval(updateTimerDisplay, 1000);

    // Initial render
    renderCurrentQuestion();

    // Clean up if user navigates away using browser controls
    window.addEventListener('hashchange', function cleanup() {
      cleanupListeners();
      window.removeEventListener('hashchange', cleanup);
    });
  }
}
