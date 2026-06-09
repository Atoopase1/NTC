// ============================================
// NTC Exam Prep - Exam Logic
// Handles CBT interface, timer, questions
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Check if we are on the exam setup page or exam interface
  const examSetup = document.querySelector('.exam-setup');
  const examInterface = document.querySelector('.exam-interface');
  
  // --- Exam Setup Logic ---
  if (examSetup) {
    const startBtn = document.getElementById('startExamBtn');
    const examSubjectGrid = document.getElementById('examSubjectGrid');
    const scheduledExamGrid = document.getElementById('scheduledExamGrid');
    let selectedSubject = null;
    let selectedScheduledExam = null;
    
    // Function to attach listeners to dynamic cards
    const attachCardListeners = () => {
      const subjectCards = document.querySelectorAll('.exam-subject-card');
      subjectCards.forEach(card => {
        card.addEventListener('click', () => {
          // Remove selection from all
          subjectCards.forEach(c => c.classList.remove('selected'));
          if (scheduledExamGrid) {
            scheduledExamGrid.querySelectorAll('.exam-subject-card').forEach(c => c.classList.remove('selected'));
          }
          // Add to clicked
          card.classList.add('selected');
          
          if (card.hasAttribute('data-scheduled-id')) {
            selectedScheduledExam = JSON.parse(decodeURIComponent(card.getAttribute('data-scheduled-data')));
            selectedSubject = null; // Unset practice subject
          } else {
            selectedSubject = card.getAttribute('data-subject');
            selectedScheduledExam = null;
          }
          
          // Enable start button
          if (startBtn) {
            startBtn.disabled = false;
            startBtn.classList.remove('disabled');
          }
        });
      });
    };

    // Load subjects dynamically
    const loadExamSubjects = async () => {
      if (examSubjectGrid && window.supaDB && window.supaDB.getSubjects) {
        try {
          const subjects = await window.supaDB.getSubjects();
          if (subjects && subjects.length > 0) {
            // Keep the "All Subjects" card, append others
            let html = `
              <div class="exam-subject-card" data-subject="All Subjects">
                <div class="subject-icon pedagogy" style="width: 64px; height: 64px; font-size: 32px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </div>
                <h4>All Subjects (Mock)</h4>
                <p>Mixed questions from all core modules</p>
              </div>
            `;
            
            subjects.forEach((sub, idx) => {
              const iconClasses = ['pedagogy', 'general', 'curriculum', 'assessment', 'psychology'];
              const iconClass = iconClasses[idx % iconClasses.length];
              
              html += `
                <div class="exam-subject-card" data-subject="${sub.name}">
                  <div class="subject-icon ${iconClass}" style="width: 64px; height: 64px; font-size: 32px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                  </div>
                  <h4>${sub.name}</h4>
                  <p>Practice test on ${sub.name}</p>
                </div>
              `;
            });
            
            examSubjectGrid.innerHTML = html;
          }
        } catch (e) {
          console.error('Error loading subjects:', e);
        }
      }

      // Load Scheduled Exams
      if (scheduledExamGrid && window.supaDB && window.supaDB.getScheduledExams) {
        try {
          const exams = await window.supaDB.getScheduledExams();
          if (exams && exams.length > 0) {
            let html = '';
            const now = new Date();
            let hasActiveOrUpcoming = false;

            exams.forEach(exam => {
              const startTime = new Date(exam.start_time);
              const endTime = new Date(exam.end_time);
              
              if (now > endTime) return; // Don't show past exams
              hasActiveOrUpcoming = true;

              const isActive = now >= startTime && now <= endTime;
              const encodedData = encodeURIComponent(JSON.stringify(exam));
              
              html += `
                <div class="exam-subject-card ${isActive ? '' : 'disabled'}" ${isActive ? `data-scheduled-id="${exam.id}" data-scheduled-data="${encodedData}"` : ''} style="${!isActive ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                  <div class="subject-icon" style="width: 64px; height: 64px; font-size: 32px; background: var(--danger); color: white;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <h4>${exam.title}</h4>
                  <p>${exam.subject}</p>
                  <p style="font-size: var(--text-xs); margin-top: 8px; color: ${isActive ? 'var(--success)' : 'var(--warning)'}; font-weight: 500;">
                    ${isActive ? 'Active Now. Ends ' + endTime.toLocaleTimeString() : 'Starts ' + startTime.toLocaleString()}
                  </p>
                  <p style="font-size: var(--text-xs); color: var(--text-light); margin-top: 4px;">Duration: ${exam.duration_minutes || 60} mins</p>
                </div>
              `;
            });
            
            scheduledExamGrid.innerHTML = hasActiveOrUpcoming ? html : '<div style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: var(--space-md);">No live exams available.</div>';
          } else {
            scheduledExamGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: var(--space-md);">No scheduled exams at this time.</div>';
          }
        } catch(e) {
          console.error(e);
          scheduledExamGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: var(--space-md);">Failed to load scheduled exams.</div>';
        }
      }
      
      // Always attach listeners at the end
      attachCardListeners();
    };
    
    // Slight delay to ensure supaDB is loaded
    setTimeout(loadExamSubjects, 500);
    
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (!selectedSubject && !selectedScheduledExam) return;
        
        let config = {};

        if (selectedScheduledExam) {
          config = {
            isScheduled: true,
            id: selectedScheduledExam.id,
            title: selectedScheduledExam.title,
            subject: selectedScheduledExam.subject,
            startTime: selectedScheduledExam.start_time,
            endTime: selectedScheduledExam.end_time,
            durationMins: selectedScheduledExam.duration_minutes || 60,
            questions: selectedScheduledExam.questions_data
          };
        } else {
          const questionCount = document.getElementById('questionCount').value;
          const examTime = document.getElementById('examTime').value;
          config = {
            isScheduled: false,
            subject: selectedSubject,
            count: parseInt(questionCount),
            timeMinutes: parseInt(examTime)
          };
        }
        
        // Save config to session storage to use in exam interface
        sessionStorage.setItem('ntc_exam_config', JSON.stringify(config));
        
        // Redirect to exam interface
        window.location.href = 'exam.html';
      });
    }
  }
  
  // --- Exam Interface Logic ---
  if (examInterface) {
    let allQuestions = [];
    let examQuestions = [];
    let currentQuestionIndex = 0;
    let answers = {};
    let flagged = {};
    let timeRemaining = 0;
    let timerInterval = null;
    let examConfig = null;
    
    initExam();
    
    async function initExam() {
      // Get config from setup page
      const configStr = sessionStorage.getItem('ntc_exam_config');
      if (configStr) {
        examConfig = JSON.parse(configStr);
      } else {
        // Fallback for direct navigation
        examConfig = {
          subject: 'Pedagogy',
          count: 20,
          timeMinutes: 30
        };
      }
      
      // Update UI with config
      if (examConfig.isScheduled) {
        document.getElementById('examSubjectTitle').textContent = examConfig.title;
        
        const now = new Date();
        const startTime = new Date(examConfig.startTime);
        const endTime = new Date(examConfig.endTime);
        const durationSecs = (examConfig.durationMins || 60) * 60;
        
        if (now < startTime) {
          alert('This exam has not started yet.');
          window.location.href = 'exam.html';
          return;
        }
        
        // Timer is the minimum between explicit duration and remaining window time
        const maxSecsRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
        const activeTimer = Math.min(durationSecs, maxSecsRemaining);
        
        await loadQuestions();
        buildNavigator();
        showQuestion(0);
        startTimer(activeTimer);
      } else {
        document.getElementById('examSubjectTitle').textContent = examConfig.subject;
        await loadQuestions();
        buildNavigator();
        showQuestion(0);
        startTimer(examConfig.timeMinutes * 60);
      }
      
      // Event Listeners
      setupEventListeners();
      
      // Prevent accidental exit
      window.addEventListener('beforeunload', beforeUnloadHandler);
    }
    
    async function loadQuestions() {
      try {
        // Show loading state
        const qContainer = document.getElementById('questionContainer');
        qContainer.innerHTML = `
          <div class="empty-state">
            <div class="spinner spinner-lg" style="margin: 0 auto 20px;"></div>
            <p>Loading exam questions...</p>
          </div>
        `;
        
        // Check if scheduled
        if (examConfig.isScheduled) {
          allQuestions = examConfig.questions;
          examQuestions = [...allQuestions];
          if (examQuestions.length === 0) {
            throw new Error("This scheduled exam has no questions.");
          }
          return; // Skip normal fetching
        }

        // Fetch questions from JSON
        const response = await fetch('../data/questions.json');
        allQuestions = await response.json();
        
        // Filter by subject
        let subjectQuestions = allQuestions;
        if (examConfig.subject !== 'All Subjects') {
          subjectQuestions = allQuestions.filter(q => q.subject === examConfig.subject);
        }
        
        // Shuffle and limit
        subjectQuestions = shuffleArray(subjectQuestions);
        examQuestions = subjectQuestions.slice(0, Math.min(examConfig.count, subjectQuestions.length));
        
        // If not enough questions, handle it
        if (examQuestions.length === 0) {
          throw new Error("No questions found for this subject.");
        }
        
      } catch (error) {
        console.error('Error loading questions:', error);
        window.showToast('Failed to load questions. Returning to setup.', 'error');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 2000);
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
      
      question.options.forEach((opt, i) => {
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
      
      // Update Navigation Buttons
      document.getElementById('prevBtn').disabled = index === 0;
      
      if (index === examQuestions.length - 1) {
        document.getElementById('nextBtn').style.display = 'none';
        document.getElementById('submitBtn').style.display = 'flex';
      } else {
        document.getElementById('nextBtn').style.display = 'flex';
        document.getElementById('submitBtn').style.display = 'none';
      }
      
      // Update Progress Bar
      const progressPercent = ((index + 1) / examQuestions.length) * 100;
      document.getElementById('progressBar').style.width = `${progressPercent}%`;
      document.getElementById('progressText').textContent = `Answered ${Object.keys(answers).length} of ${examQuestions.length}`;
      
      // Re-attach Option Listeners
      const options = document.querySelectorAll('.option-item');
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          // Deselect others
          options.forEach(o => o.classList.remove('selected'));
          // Select this
          opt.classList.add('selected');
          // Save answer
          const selectedIndex = parseInt(opt.getAttribute('data-index'));
          answers[currentQuestionIndex] = selectedIndex;
          
          // Update Navigator
          updateNavigatorBtn(currentQuestionIndex);
          updateProgressStats();
        });
      });
      
      // Attach Flag Listener
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
      });
      
      // Update Navigator active state
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
      
      // Add listeners
      document.querySelectorAll('.navigator-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = parseInt(btn.getAttribute('data-index'));
          showQuestion(index);
        });
      });
      
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
      document.getElementById('prevBtn').addEventListener('click', () => {
        showQuestion(currentQuestionIndex - 1);
      });
      
      document.getElementById('nextBtn').addEventListener('click', () => {
        showQuestion(currentQuestionIndex + 1);
      });
      
      // Show Submit Modal
      const showSubmitBtn = document.getElementById('submitBtn');
      const headerSubmitBtn = document.getElementById('headerSubmitBtn');
      
      const showModal = () => {
        const answeredCount = Object.keys(answers).length;
        const unansweredCount = examQuestions.length - answeredCount;
        const flaggedCount = Object.keys(flagged).length;
        
        document.getElementById('modalStatAnswered').textContent = answeredCount;
        document.getElementById('modalStatUnanswered').textContent = unansweredCount;
        
        const warningEl = document.getElementById('submitWarning');
        if (unansweredCount > 0) {
          warningEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                 <p>Warning: You have <strong>${unansweredCount} unanswered</strong> questions. Are you sure you want to submit?</p>`;
          warningEl.style.display = 'flex';
        } else if (flaggedCount > 0) {
          warningEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                 <p>Note: You have <strong>${flaggedCount} flagged</strong> questions for review. Once submitted, you cannot change your answers.</p>`;
          warningEl.style.display = 'flex';
        } else {
          warningEl.style.display = 'none';
        }
        
        window.openModal('submitModal');
      };
      
      showSubmitBtn.addEventListener('click', showModal);
      if (headerSubmitBtn) headerSubmitBtn.addEventListener('click', showModal);
      
      // Final Submit
      document.getElementById('confirmSubmitBtn').addEventListener('click', submitExam);
      
      // Sidebar Toggle for Mobile
      const sidebarToggle = document.getElementById('examSidebarToggle');
      if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
          document.querySelector('.exam-sidebar').classList.toggle('open');
          
          // Add/remove overlay
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
          
          if (document.querySelector('.exam-sidebar').classList.contains('open')) {
            overlay.classList.add('active');
          } else {
            overlay.classList.remove('active');
          }
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
      
      const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      const timerEl = document.getElementById('examTimer');
      timerEl.innerHTML = `<span class="timer-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> ${display}`;
      
      // Warnings
      if (timeRemaining <= 300 && timeRemaining > 60) { // 5 mins
        timerEl.className = 'exam-timer warning';
      } else if (timeRemaining <= 60) { // 1 min
        timerEl.className = 'exam-timer danger';
      }
    }
    
    function autoSubmit() {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      window.closeModal('submitModal');
      
      window.showToast('Time is up! Auto-submitting your exam...', 'warning');
      
      setTimeout(() => {
        submitExam();
      }, 2000);
    }
    
    function submitExam() {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      clearInterval(timerInterval);
      
      // Calculate Score
      let score = 0;
      const reviewData = [];
      
      examQuestions.forEach((q, index) => {
        const userAnswer = answers[index];
        const isCorrect = userAnswer === q.answer;
        
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
      
      let timeUsed = 0;
      if (examConfig.isScheduled) {
        const startTime = new Date(examConfig.startTime);
        const now = new Date();
        timeUsed = Math.floor((now - startTime) / 1000);
      } else {
        timeUsed = (examConfig.timeMinutes * 60) - timeRemaining;
      }
      
      // Create Result Object
      const resultData = {
        isScheduled: examConfig.isScheduled || false,
        scheduledExamId: examConfig.isScheduled ? examConfig.id : null,
        title: examConfig.isScheduled ? examConfig.title : examConfig.subject,
        subject: examConfig.subject,
        score: score,
        total: examQuestions.length,
        percentage: percentage,
        timeUsed: timeUsed,
        reviewData: reviewData,
        date: new Date().toISOString()
      };
      
      // Save Result
      sessionStorage.setItem('ntc_current_result', JSON.stringify(resultData));
      
      // Save to history (mock DB save)
      let history = [];
      if (localStorage.getItem('ntc_exam_results')) {
        history = JSON.parse(localStorage.getItem('ntc_exam_results'));
      }
      history.push(resultData);
      localStorage.setItem('ntc_exam_results', JSON.stringify(history));
      
      // Try to save to Supabase if configured
      if (window.supaDB) {
        const userStr = localStorage.getItem('ntc_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          // Pass full result data. In supaDB we will pick what to save to DB.
          window.supaDB.saveExamResult(user.id || 'demo_user', resultData);
        }
      }
      
      // Show loading and redirect
      document.getElementById('confirmSubmitBtn').innerHTML = '<span class="spinner spinner-sm" style="border-color: white; border-top-color: transparent;"></span> Processing...';
      
      setTimeout(() => {
        window.location.href = 'results.html';
      }, 1500);
    }
    
    function beforeUnloadHandler(e) {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
    }
    
    // Utility function
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
