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
    const subjectCards = document.querySelectorAll('.exam-subject-card');
    const startBtn = document.getElementById('startExamBtn');
    let selectedSubject = null;
    
    subjectCards.forEach(card => {
      card.addEventListener('click', () => {
        // Remove selection from all
        subjectCards.forEach(c => c.classList.remove('selected'));
        // Add to clicked
        card.classList.add('selected');
        selectedSubject = card.getAttribute('data-subject');
        
        // Enable start button
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.classList.remove('disabled');
        }
      });
    });
    
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (!selectedSubject) return;
        
        const questionCount = document.getElementById('questionCount').value;
        const examTime = document.getElementById('examTime').value;
        
        // Save config to session storage to use in exam interface
        sessionStorage.setItem('ntc_exam_config', JSON.stringify({
          subject: selectedSubject,
          count: parseInt(questionCount),
          timeMinutes: parseInt(examTime)
        }));
        
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
      document.getElementById('examSubjectTitle').textContent = examConfig.subject;
      
      // Load questions
      await loadQuestions();
      
      // Setup UI
      buildNavigator();
      showQuestion(0);
      startTimer(examConfig.timeMinutes * 60);
      
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
      timerEl.innerHTML = `<span class="timer-icon">⏱️</span> ${display}`;
      
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
      const timeUsed = (examConfig.timeMinutes * 60) - timeRemaining;
      
      // Create Result Object
      const resultData = {
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
