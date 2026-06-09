// ============================================
// NTC Exam Prep - Results Logic
// Displays exam score, charts, and review
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.results-page')) return;
  
  initResults();
  
  function initResults() {
    const resultStr = sessionStorage.getItem('ntc_current_result');
    
    if (!resultStr) {
      window.showToast('No recent exam results found. Redirecting to dashboard...', 'error');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 2000);
      return;
    }
    
    const result = JSON.parse(resultStr);
    renderResults(result);
  }
  
  function renderResults(result) {
    const isPass = result.percentage >= 50;
    
    // Status Header
    const statusEl = document.getElementById('resultStatus');
    statusEl.textContent = isPass ? 'PASS' : 'FAIL';
    statusEl.className = `score-status ${isPass ? 'pass' : 'fail'}`;
    
    // Main Score Card
    const scoreCard = document.getElementById('mainScoreCard');
    scoreCard.className = `score-card ${isPass ? 'pass' : 'fail'}`;
    
    // Score Percentage
    const percentageEl = document.getElementById('resultPercentage');
    percentageEl.textContent = `${result.percentage}%`;
    
    // Score Detail Stats
    document.getElementById('statScore').textContent = `${result.score} / ${result.total}`;
    
    // Format time
    const mins = Math.floor(result.timeUsed / 60);
    const secs = result.timeUsed % 60;
    document.getElementById('statTime').textContent = `${mins}m ${secs}s`;
    
    document.getElementById('statGrade').textContent = getGrade(result.percentage);
    document.getElementById('statSubject').textContent = result.subject;
    
    // Animate the ring
    setTimeout(() => {
      const ringFill = document.getElementById('scoreRingFill');
      const circumference = 339.29; // 2 * pi * 54
      const offset = circumference - (result.percentage / 100) * circumference;
      
      ringFill.style.strokeDashoffset = offset;
      ringFill.className = isPass ? 'fill-pass' : 'fill-fail';
    }, 100);
    
    // Render Subject Breakdown (Simulated based on categories if it's a general exam, or just the subject)
    renderSubjectBreakdown(result);
    
    // Render Answer Review
    renderAnswerReview(result);
  }
  
  function getGrade(percentage) {
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  }
  
  function renderSubjectBreakdown(result) {
    const container = document.getElementById('subjectBreakdown');
    if (!container) return;
    
    // For a single subject exam, we just show that one subject. 
    // In a real app with mixed subjects, we'd calculate per subject.
    let html = `
      <div class="subject-breakdown-item">
        <div class="subject-breakdown-name">${result.subject}</div>
        <div class="subject-breakdown-bar">
          <div class="subject-breakdown-fill" style="width: 0%; background: ${result.percentage >= 50 ? 'var(--accent)' : 'var(--danger)'}" data-width="${result.percentage}%"></div>
        </div>
        <div class="subject-breakdown-score">${result.percentage}%</div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Animate bars
    setTimeout(() => {
      const fills = container.querySelectorAll('.subject-breakdown-fill');
      fills.forEach(fill => {
        fill.style.width = fill.getAttribute('data-width');
      });
    }, 300);
  }
  
  function renderAnswerReview(result) {
    const container = document.getElementById('answerReview');
    if (!container || !result.reviewData) return;
    
    let html = '<div class="review-list">';
    const letters = ['A', 'B', 'C', 'D'];
    
    result.reviewData.forEach((item, index) => {
      const isCorrect = item.isCorrect;
      const statusClass = isCorrect ? 'correct-q' : 'wrong-q';
      
      let optionsHtml = '';
      item.options.forEach((opt, optIndex) => {
        let optClass = 'review-option';
        let icon = '';
        
        if (optIndex === item.correctAnswer) {
          optClass += ' correct-answer';
          icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); margin-left: auto;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (optIndex === item.userAnswer && !isCorrect) {
          optClass += ' wrong-answer';
          icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger); margin-left: auto;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        }
        
        optionsHtml += `
          <div class="${optClass}">
            <span style="font-weight: 700; width: 24px;">${letters[optIndex]}.</span> 
            ${opt}
            ${icon}
          </div>
        `;
      });
      
      html += `
        <div class="review-item">
          <div class="review-question-header">
            <div class="review-question-num ${statusClass}">Q${index + 1}</div>
            <div style="font-size: var(--text-xs); color: var(--text-lighter); margin-left: auto;">
              ${isCorrect ? 'Correct +1' : 'Incorrect 0'}
            </div>
          </div>
          <div class="review-question-text">${item.question}</div>
          <div class="review-options">
            ${optionsHtml}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }
  
  // Print functionality
  const printBtn = document.getElementById('printResultBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
});
