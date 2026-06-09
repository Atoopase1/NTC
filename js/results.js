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
    
    // Render Subject Breakdown
    renderSubjectBreakdown(result);

    // Fetch and display class rank if scheduled exam
    if (result.isScheduled && result.scheduledExamId) {
      fetchClassRank(result.scheduledExamId, result.percentage);
    }
  }

  async function fetchClassRank(examId, userPercentage) {
    const rankContainer = document.getElementById('statRankContainer');
    const rankEl = document.getElementById('statRank');
    if (!rankContainer || !window.supaDB) return;

    try {
      rankContainer.style.display = 'flex';
      rankEl.innerHTML = '<span class="spinner spinner-sm"></span>';
      
      const rankings = await window.supaDB.getExamRankings(examId);
      if (rankings && rankings.length > 0) {
        rankings.sort((a, b) => b.percentage - a.percentage);
        
        let rankIndex = rankings.findIndex(r => r.percentage <= userPercentage);
        if (rankIndex === -1) rankIndex = rankings.length - 1;
        
        const rank = rankIndex + 1;
        const total = rankings.length;
        
        const suffix = (rank % 10 === 1 && rank !== 11) ? 'st' :
                       (rank % 10 === 2 && rank !== 12) ? 'nd' :
                       (rank % 10 === 3 && rank !== 13) ? 'rd' : 'th';
                       
        rankEl.textContent = `${rank}${suffix} / ${total}`;
      } else {
        rankEl.textContent = 'N/A';
      }
    } catch (e) {
      console.error(e);
      rankEl.textContent = 'Err';
    }
  }
  
  function getGrade(percentage) {
    if (percentage >= 80) return 'A1';
    if (percentage >= 70) return 'B2';
    if (percentage >= 65) return 'B3';
    if (percentage >= 60) return 'C4';
    if (percentage >= 55) return 'C5';
    if (percentage >= 50) return 'C6';
    if (percentage >= 45) return 'D7';
    if (percentage >= 40) return 'E8';
    return 'F9';
  }
  
  function renderSubjectBreakdown(result) {
    const container = document.getElementById('subjectBreakdown');
    if (!container) return;
    
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
  
  // Print functionality
  const printBtn = document.getElementById('printResultBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
});
