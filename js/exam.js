// ============================================
// NTC Exam Prep - Exam Logic
// Handles CBT interface, timer, questions
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const examSetup = document.querySelector('.exam-setup');
  const examInterface = document.querySelector('.exam-interface');
  
  // ── Exam Setup Logic ──────────────────────────────────────────────
  if (examSetup) {
    const startBtn = document.getElementById('startExamBtn');
    const scheduledExamGrid = document.getElementById('scheduledExamGrid');
    let selectedScheduledExam = null;
    
    const attachCardListeners = () => {
      const subjectCards = document.querySelectorAll('.exam-subject-card');
      subjectCards.forEach(card => {
        card.addEventListener('click', () => {
          subjectCards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          
          if (card.hasAttribute('data-scheduled-id')) {
            selectedScheduledExam = JSON.parse(decodeURIComponent(card.getAttribute('data-scheduled-data')));
          }
          
          if (startBtn) {
            startBtn.disabled = false;
            startBtn.classList.remove('disabled');
          }
        });
      });
    };

    const loadExamSubjects = async () => {
      if (scheduledExamGrid && window.supaDB && window.supaDB.getScheduledExams) {
        try {
          const exams = await window.supaDB.getScheduledExams();
          if (exams && exams.length > 0) {
            let html = '';
            const now = new Date();
            let hasActiveOrUpcoming = false;

            // Check if user has already submitted any of these
            let submittedIds = new Set();
            if (window.supaAuth && window.supaDB.checkDuplicateSubmission) {
              try {
                const user = await window.supaAuth.getCurrentUser();
                if (user) {
                  for (const exam of exams) {
                    const isDuplicate = await window.supaDB.checkDuplicateSubmission(user.id, exam.id);
                    if (isDuplicate) submittedIds.add(exam.id);
                  }
                }
              } catch(e) {
                console.warn('Could not check submissions:', e);
              }
            }

            exams.forEach(exam => {
              const startTime = new Date(exam.start_time);
              const endTime = new Date(exam.end_time);
              
              if (now > endTime) return; // Don't show past exams
              hasActiveOrUpcoming = true;

              const isActive = now >= startTime && now <= endTime;
              const alreadySubmitted = submittedIds.has(exam.id);
              const canStart = isActive && !alreadySubmitted;

              // Strip answer key from data passed to the card (security)
              const safeExamData = {
                id: exam.id,
                title: exam.title,
                subject: exam.subject,
                start_time: exam.start_time,
                end_time: exam.end_time,
                duration_minutes: exam.duration_minutes
                // questions_data intentionally omitted here
              };
              const encodedData = encodeURIComponent(JSON.stringify(safeExamData));
              
              let statusLabel;
              if (alreadySubmitted) {
                statusLabel = `<p style="font-size: var(--text-xs); margin-top: 8px; color: var(--success); font-weight: 600;">✓ Already Submitted</p>`;
              } else if (isActive) {
                statusLabel = `<p style="font-size: var(--text-xs); margin-top: 8px; color: var(--success); font-weight: 500;">Active Now. Ends ${endTime.toLocaleTimeString()}</p>`;
              } else {
                statusLabel = `<p style="font-size: var(--text-xs); margin-top: 8px; color: var(--warning); font-weight: 500;">Starts ${startTime.toLocaleString()}</p>`;
              }
              
              html += `
                <div class="exam-subject-card ${canStart ? '' : 'disabled'}" 
                     ${canStart ? `data-scheduled-id="${exam.id}" data-scheduled-data="${encodedData}"` : ''}
                     style="${!canStart ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                  <div class="subject-icon" style="width: 64px; height: 64px; font-size: 32px; background: var(--danger); color: white;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <h4>${exam.title}</h4>
                  <p>${exam.subject}</p>
                  ${statusLabel}
                  <p style="font-size: var(--text-xs); color: var(--text-light); margin-top: 4px;">Duration: ${exam.duration_minutes || 60} mins</p>
                </div>
              `;
            });
            
            const emptyStateHtml = `
              <div style="grid-column: 1/-1; text-align: center; padding: var(--space-xl); background: var(--surface-2); border-radius: var(--radius-lg);">
                <div style="font-size: 3rem; margin-bottom: var(--space-sm);">📚</div>
                <h3 style="margin-bottom: var(--space-xs); color: var(--text);">No exams available right now</h3>
                <p style="color: var(--text-light); margin-bottom: var(--space-lg);">There are no live exams scheduled for you to take at this time.</p>
                <a href="resources.html" class="btn btn-primary">Continue Studying</a>
              </div>
            `;
            scheduledExamGrid.innerHTML = hasActiveOrUpcoming ? html : emptyStateHtml;
            if (!hasActiveOrUpcoming && startBtn) startBtn.style.display = 'none';
          } else {
            const emptyStateHtml = `
              <div style="grid-column: 1/-1; text-align: center; padding: var(--space-xl); background: var(--surface-2); border-radius: var(--radius-lg);">
                <div style="font-size: 3rem; margin-bottom: var(--space-sm);">📚</div>
                <h3 style="margin-bottom: var(--space-xs); color: var(--text);">No exams available right now</h3>
                <p style="color: var(--text-light); margin-bottom: var(--space-lg);">There are no live exams scheduled for you to take at this time.</p>
                <a href="resources.html" class="btn btn-primary">Continue Studying</a>
              </div>
            `;
            scheduledExamGrid.innerHTML = emptyStateHtml;
            if (startBtn) startBtn.style.display = 'none';
          }
        } catch(e) {
          console.error(e);
          scheduledExamGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: var(--space-md);">Failed to load scheduled exams.</div>';
          if (startBtn) startBtn.style.display = 'none';
        }
      }
      attachCardListeners();
    };
    
    setTimeout(loadExamSubjects, 500);
    
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        if (!selectedScheduledExam) return;
        
        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="spinner spinner-sm"></span> Loading...';
        
        try {
          // Now fetch the full exam data including questions (only at start time, not before)
          const exams = await window.supaDB.getScheduledExams();
          const fullExam = exams.find(e => e.id === selectedScheduledExam.id);
          if (!fullExam || !fullExam.questions_data || fullExam.questions_data.length === 0) {
            window.showToast('This exam has no questions. Contact your admin.', 'error');
            startBtn.disabled = false;
            startBtn.innerHTML = 'Start Examination';
            return;
          }

          // Strip answer keys for in-memory storage — they'll only be used at submission
          // We keep the full questions_data in sessionStorage (required for grading client-side)
          const config = {
            isScheduled: true,
            id: fullExam.id,
            title: fullExam.title,
            subject: fullExam.subject,
            startTime: fullExam.start_time,
            endTime: fullExam.end_time,
            durationMins: fullExam.duration_minutes || 60,
            questions: fullExam.questions_data
          };
          
          // Clear any previous progress for this exam
          sessionStorage.removeItem('ntc_exam_progress');
          sessionStorage.setItem('ntc_exam_config', JSON.stringify(config));
          window.location.href = 'exam.html';
        } catch (e) {
          console.error(e);
          window.showToast('Failed to load exam. Please try again.', 'error');
          startBtn.disabled = false;
          startBtn.innerHTML = 'Start Examination';
        }
      });
    }
  }
  
  // ── Exam Interface Logic ──────────────────────────────────────────
  const configStr = sessionStorage.getItem('ntc_exam_config');
  const isSetupMode = window.location.search.includes('setup=1');
  
  if (examInterface && configStr && !isSetupMode) {
    let examQuestions = [];
    let currentQuestionIndex = 0;
    let answers = {};
    let flagged = {};
    let timeRemaining = 0;
    let timerInterval = null;
    let examConfig = null;
    
    initExam();
    
    async function initExam() {
      examConfig = JSON.parse(configStr);
      
      // Restore any saved progress
      const savedProgress = sessionStorage.getItem('ntc_exam_progress');
      if (savedProgress) {
        try {
          const progress = JSON.parse(savedProgress);
          // Only restore if it belongs to the same exam
          if (progress.examId === examConfig.id) {
            answers = progress.answers || {};
            flagged = progress.flagged || {};
          }
        } catch(e) {
          console.warn('Could not restore progress:', e);
        }
      }
      
      if (examConfig.isScheduled) {
        document.getElementById('examSubjectTitle').textContent = examConfig.title;
        
        const now = new Date();
        const startTime = new Date(examConfig.startTime);
        const endTime = new Date(examConfig.endTime);
        const durationSecs = (examConfig.durationMins || 60) * 60;
        
        if (now < startTime) {
          window.showToast('This exam has not started yet.', 'error');
          setTimeout(() => { window.location.href = 'exam.html?setup=1'; }, 2000);
          return;
        }
        
        if (now > endTime) {
          window.showToast('This exam has already ended.', 'error');
          setTimeout(() => { window.location.href = 'exam.html?setup=1'; }, 2000);
          return;
        }
        
        const maxSecsRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
        
        // Restore timer position from saved progress if available
        let savedTimer = null;
        if (savedProgress) {
          try {
            const progress = JSON.parse(savedProgress);
            if (progress.examId === examConfig.id && progress.timeRemaining > 0) {
              savedTimer = progress.timeRemaining;
            }
          } catch(e) {}
        }
        
        const activeTimer = savedTimer || Math.min(durationSecs, maxSecsRemaining);
        
        await loadQuestions();
        buildNavigator();
        showQuestion(0);
        startTimer(activeTimer);
      } else {
        document.getElementById('examSubjectTitle').textContent = examConfig.subject;
        await loadQuestions();
        buildNavigator();
        showQuestion(0);
        startTimer((examConfig.timeMinutes || 60) * 60);
      }
      
      setupEventListeners();
      window.addEventListener('beforeunload', beforeUnloadHandler);
      
      // Auto-save progress every 30 seconds
      setInterval(saveProgress, 30000);
    }
    
    function saveProgress() {
      if (!examConfig) return;
      const progress = {
        examId: examConfig.id || 'custom',
        answers,
        flagged,
        timeRemaining
      };
      sessionStorage.setItem('ntc_exam_progress', JSON.stringify(progress));
    }
    
    async function loadQuestions() {
      try {
        const qContainer = document.getElementById('questionContainer');
        qContainer.innerHTML = `
          <div class="empty-state">
            <div class="spinner spinner-lg" style="margin: 0 auto 20px;"></div>
            <p>Loading exam questions...</p>
          </div>
        `;
        
        if (examConfig.isScheduled) {
          examQuestions = examConfig.questions || [];
          if (examQuestions.length === 0) {
            throw new Error('This scheduled exam has no questions.');
          }
          return;
        }

        const response = await fetch('../data/questions.json');
        const allQuestions = await response.json();
        
        let subjectQuestions = allQuestions;
        if (examConfig.subject !== 'All Subjects') {
          subjectQuestions = allQuestions.filter(q => q.subject === examConfig.subject);
        }
        
        subjectQuestions = shuffleArray(subjectQuestions);
        examQuestions = subjectQuestions.slice(0, Math.min(examConfig.count || 20, subjectQuestions.length));
        
        if (examQuestions.length === 0) {
          throw new Error('No questions found for this subject.');
        }
      } catch (error) {
        console.error('Error loading questions:', error);
        window.showToast(error.message || 'Failed to load questions.', 'error');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 2500);
      }
    }
    
    function showQuestion(index) {
      if (index < 0 || index >= examQuestions.length) return;
      
      currentQuestionIndex = index;
      const question = examQuestions[index];
      
      const qContainer = document.getElementById('questionContainer');
      const isFlagged = flagged[index] ? 'flagged' : '';
      
      let optionsHtml = '';
      const letters = ['A', 'B', 'C', 'D'];
      
      (question.options || []).forEach((opt, i) => {
        const isSelected = answers[index] === i ? 'selected' : '';
        optionsHtml += `
          <div class="option-item ${isSelected}" data-index="${i}">
            <div class="option-letter">${letters[i]}</div>
            <div class="option-text">${opt}</div>
          </div>
        `;
      });
      
      qContainer.innerHTML = `
        <div class="question-card">
          <div class="question-header">
            <div class="question-number">Question ${index + 1} of ${examQuestions.length}</div>
            <button class="question-flag ${isFlagged}" id="flagBtn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${isFlagged ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
              Flag for Review
            </button>
          </div>
          <div class="question-text">${question.question}</div>
          <div class="options-list" id="optionsList">
            ${optionsHtml}
          </div>
        </div>
      `;
      
      document.getElementById('prevBtn').disabled = index === 0;
      
      if (index === examQuestions.length - 1) {
        document.getElementById('nextBtn').style.display = 'none';
        document.getElementById('submitBtn').style.display = 'flex';
      } else {
        document.getElementById('nextBtn').style.display = 'flex';
        document.getElementById('submitBtn').style.display = 'none';
      }
      
      const progressPercent = ((index + 1) / examQuestions.length) * 100;
      document.getElementById('progressBar').style.width = `${progressPercent}%`;
      document.getElementById('progressText').textContent = `Answered ${Object.keys(answers).length} of ${examQuestions.length}`;
      
      const options = document.querySelectorAll('.option-item');
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          const selectedIndex = parseInt(opt.getAttribute('data-index'));
          answers[currentQuestionIndex] = selectedIndex;
          updateNavigatorBtn(currentQuestionIndex);
          updateProgressStats();
          saveProgress(); // auto-save on every answer
        });
      });
      
      const flagBtn = document.getElementById('flagBtn');
      flagBtn.addEventListener('click', () => {
        if (flagged[currentQuestionIndex]) {
          delete flagged[currentQuestionIndex];
          flagBtn.classList.remove('flagged');
          flagBtn.querySelector('svg').setAttribute('fill', 'none');
        } else {
          flagged[currentQuestionIndex] = true;
          flagBtn.classList.add('flagged');
          flagBtn.querySelector('svg').setAttribute('fill', 'currentColor');
        }
        updateNavigatorBtn(currentQuestionIndex);
        saveProgress();
      });
      
      document.querySelectorAll('.navigator-btn').forEach(btn => btn.classList.remove('current'));
      const navBtn = document.getElementById(`nav-btn-${index}`);
      if (navBtn) navBtn.classList.add('current');
    }
    
    function buildNavigator() {
      const navGrid = document.getElementById('navigatorGrid');
      let html = '';
      for (let i = 0; i < examQuestions.length; i++) {
        html += `<button class="navigator-btn" id="nav-btn-${i}" data-index="${i}">${i + 1}</button>`;
      }
      navGrid.innerHTML = html;
      
      document.querySelectorAll('.navigator-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          showQuestion(parseInt(btn.getAttribute('data-index')));
        });
      });
      
      // Mark already-answered buttons (restored from progress)
      Object.keys(answers).forEach(idx => updateNavigatorBtn(parseInt(idx)));
      Object.keys(flagged).forEach(idx => updateNavigatorBtn(parseInt(idx)));
      updateProgressStats();
    }
    
    function updateNavigatorBtn(index) {
      const btn = document.getElementById(`nav-btn-${index}`);
      if (!btn) return;
      btn.className = 'navigator-btn';
      if (index === currentQuestionIndex) btn.classList.add('current');
      if (answers[index] !== undefined) btn.classList.add('answered');
      if (flagged[index]) btn.classList.add('flagged');
    }
    
    function updateProgressStats() {
      const answeredCount = Object.keys(answers).length;
      document.getElementById('navStatAnswered').textContent = answeredCount;
      document.getElementById('navStatUnanswered').textContent = examQuestions.length - answeredCount;
      document.getElementById('progressText').textContent = `Answered ${answeredCount} of ${examQuestions.length}`;
    }
    
    function setupEventListeners() {
      document.getElementById('prevBtn').addEventListener('click', () => showQuestion(currentQuestionIndex - 1));
      document.getElementById('nextBtn').addEventListener('click', () => showQuestion(currentQuestionIndex + 1));
      
      const showModal = () => {
        const answeredCount = Object.keys(answers).length;
        const unansweredCount = examQuestions.length - answeredCount;
        const flaggedCount = Object.keys(flagged).length;
        
        document.getElementById('modalStatAnswered').textContent = answeredCount;
        document.getElementById('modalStatUnanswered').textContent = unansweredCount;
        
        const warningEl = document.getElementById('submitWarning');
        if (unansweredCount > 0) {
          warningEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                               <p>Warning: You have <strong>${unansweredCount} unanswered</strong> questions.</p>`;
          warningEl.style.display = 'flex';
        } else if (flaggedCount > 0) {
          warningEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                               <p>Note: You have <strong>${flaggedCount} flagged</strong> questions for review.</p>`;
          warningEl.style.display = 'flex';
        } else {
          warningEl.style.display = 'none';
        }
        
        window.openModal('submitModal');
      };
      
      document.getElementById('submitBtn').addEventListener('click', showModal);
      const headerSubmitBtn = document.getElementById('headerSubmitBtn');
      if (headerSubmitBtn) headerSubmitBtn.addEventListener('click', showModal);
      
      document.getElementById('confirmSubmitBtn').addEventListener('click', submitExam);
      
      const sidebarToggle = document.getElementById('examSidebarToggle');
      if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
          document.querySelector('.exam-sidebar').classList.toggle('open');
          let overlay = document.getElementById('examOverlay');
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'examOverlay';
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => {
              document.querySelector('.exam-sidebar').classList.remove('open');
              overlay.classList.remove('active');
            });
          }
          overlay.classList.toggle('active', document.querySelector('.exam-sidebar').classList.contains('open'));
        });
      }
    }
    
    function startTimer(seconds) {
      timeRemaining = seconds;
      updateTimerDisplay();
      timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
          clearInterval(timerInterval);
          autoSubmit();
        }
      }, 1000);
    }
    
    function updateTimerDisplay() {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const timerEl = document.getElementById('examTimer');
      timerEl.innerHTML = `<span class="timer-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> ${display}`;
      if (timeRemaining <= 300 && timeRemaining > 60) {
        timerEl.className = 'exam-timer warning';
      } else if (timeRemaining <= 60) {
        timerEl.className = 'exam-timer danger';
      }
    }
    
    function autoSubmit() {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      window.closeModal('submitModal');
      window.showToast('Time is up! Auto-submitting your exam...', 'warning');
      setTimeout(() => submitExam(), 2000);
    }
    
    // ── FIXED: submitExam is now properly async ──────────────────────
    async function submitExam() {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      clearInterval(timerInterval);
      
      const confirmBtn = document.getElementById('confirmSubmitBtn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner spinner-sm" style="border-color: white; border-top-color: transparent;"></span> Grading...';
      }
      
      // ── Grade the exam ──────────────────────────────────────────
      let score = 0;
      const reviewData = [];
      
      examQuestions.forEach((q, index) => {
        const userAnswer = answers[index];
        // answer is the index (0-3) stored in questions_data by admin
        const isCorrect = userAnswer !== undefined && userAnswer === q.answer;
        if (isCorrect) score++;
        reviewData.push({
          question: q.question,
          options: q.options,
          correctAnswer: q.answer,
          userAnswer: userAnswer,
          isCorrect: isCorrect
        });
      });
      
      const percentage = Math.round((score / examQuestions.length) * 100);
      
      // Calculate time used
      let timeUsedSecs = 0;
      if (examConfig.isScheduled) {
        const startTime = new Date(examConfig.startTime);
        const durationSecs = (examConfig.durationMins || 60) * 60;
        timeUsedSecs = durationSecs - timeRemaining;
      } else {
        timeUsedSecs = ((examConfig.timeMinutes || 60) * 60) - timeRemaining;
      }
      const timeUsedMins = Math.floor(timeUsedSecs / 60);
      const timeUsedSec  = timeUsedSecs % 60;
      const timeUsedStr  = `${timeUsedMins}m ${timeUsedSec}s`;
      
      const resultData = {
        isScheduled: examConfig.isScheduled || false,
        scheduledExamId: examConfig.isScheduled ? examConfig.id : null,
        id: examConfig.isScheduled ? examConfig.id : null,
        title: examConfig.isScheduled ? examConfig.title : examConfig.subject,
        subject: examConfig.subject,
        score: score,
        total: examQuestions.length,
        percentage: percentage,
        timeUsed: timeUsedStr,
        reviewData: reviewData,
        date: new Date().toISOString()
      };
      
      // ── Save result to sessionStorage for results.html ──────────
      sessionStorage.setItem('ntc_current_result', JSON.stringify(resultData));
      
      // ── Save to Supabase ─────────────────────────────────────────
      if (window.supaDB && window.supaAuth) {
        try {
          const user = await window.supaAuth.getCurrentUser();
          if (user) {
            // Save result record
            await window.supaDB.saveExamResult(user.id, resultData);
            
            // Record submission to prevent duplicates
            if (examConfig.isScheduled && window.supaDB.recordSubmission) {
              await window.supaDB.recordSubmission(user.id, examConfig.id);
            }
          }
        } catch(e) {
          console.warn('Could not save result to Supabase:', e);
        }
      }
      
      // ── Also save to localStorage as fallback ────────────────────
      try {
        const history = JSON.parse(localStorage.getItem('ntc_exam_results') || '[]');
        history.push(resultData);
        localStorage.setItem('ntc_exam_results', JSON.stringify(history));
      } catch(e) {}
      
      // ── Clear progress (exam done) ───────────────────────────────
      sessionStorage.removeItem('ntc_exam_progress');
      
      // ── Redirect to results ──────────────────────────────────────
      setTimeout(() => {
        window.location.href = 'results.html';
      }, 1500);
    }
    
    function beforeUnloadHandler(e) {
      saveProgress(); // Save progress before leaving
      e.preventDefault();
      e.returnValue = '';
    }
    
    function shuffleArray(array) {
      const newArray = [...array];
      for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
      }
      return newArray;
    }
  }
});
