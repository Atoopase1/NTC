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
    if (typeof result.timeUsed === 'number') {
      const mins = Math.floor(result.timeUsed / 60);
      const secs = result.timeUsed % 60;
      document.getElementById('statTime').textContent = `${mins}m ${secs}s`;
    } else {
      document.getElementById('statTime').textContent = result.timeUsed;
    }
    
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
    printBtn.addEventListener('click', async () => {
      const originalText = printBtn.innerHTML;
      printBtn.innerHTML = '<span class="spinner spinner-sm" style="display:inline-block;width:16px;height:16px;border:2px solid currentColor;border-bottom-color:transparent;border-radius:50%;margin-right:8px;animation:spin 1s linear infinite;"></span> Preparing...';
      printBtn.disabled = true;

      // Get student name
      let fullName = 'Student';
      try {
        const fetchUser = async () => {
          if (window.supaAuth && window.supaAuth.getCurrentUser) {
            const user = await window.supaAuth.getCurrentUser();
            if (user) {
              if (user.user_metadata?.full_name) fullName = user.user_metadata.full_name;
              else if (user.user_metadata?.name) fullName = user.user_metadata.name;
              else if (user.email) fullName = user.email.split('@')[0];
              
              // Try to fetch from profiles table just in case
              if (window.supaDB && window.supaDB.getProfile) {
                const profile = await window.supaDB.getProfile(user.id);
                if (profile && profile.full_name) fullName = profile.full_name;
              }
            }
          }
        };

        // Race condition: wait max 2 seconds for user fetch
        await Promise.race([
          fetchUser(),
          new Promise(resolve => setTimeout(resolve, 2000))
        ]);
      } catch (e) {
        console.error('Failed to fetch user name for certificate:', e);
      }

      printBtn.innerHTML = originalText;
      printBtn.disabled = false;

      const resultStr = sessionStorage.getItem('ntc_current_result');
      if (!resultStr) return;
      
      const result = JSON.parse(resultStr);
      const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const isPass = result.percentage >= 50;
      const grade = getGrade(result.percentage);

      const printWindow = window.open('', '_blank', 'width=1000,height=700');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Certificate - ${fullName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Inter', Arial, sans-serif;
              background: white;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 20px;
            }
            .cert-card {
              width: 100%;
              max-width: 900px;
              border: 14px solid #4f46e5;
              padding: 18px;
              background: #fdfdfd;
            }
            .cert-inner {
              border: 3px solid #f43f5e;
              padding: 50px 60px;
              background: radial-gradient(ellipse at center, #ffffff 0%, #fdf2f8 100%);
              text-align: center;
              position: relative;
            }
            .cert-title {
              font-size: 42px;
              font-weight: 800;
              color: #1e1b4b;
              text-transform: uppercase;
              letter-spacing: 4px;
              margin-bottom: 8px;
            }
            .cert-subtitle {
              font-size: 17px;
              color: #4f46e5;
              font-style: italic;
              margin-bottom: 36px;
            }
            .cert-text { font-size: 17px; color: #4b5563; margin-bottom: 10px; }
            .cert-name {
              font-size: 52px;
              font-weight: 700;
              color: #f43f5e;
              font-family: Georgia, serif;
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 10px;
              margin-bottom: 26px;
              display: inline-block;
              min-width: 55%;
            }
            .cert-details {
              display: flex;
              justify-content: center;
              gap: 60px;
              margin: 30px 0;
            }
            .cert-detail-box { text-align: center; }
            .cert-detail-value { font-size: 28px; font-weight: 800; color: #1e1b4b; }
            .cert-detail-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
            .cert-footer {
              display: flex;
              justify-content: space-between;
              margin-top: 50px;
              padding: 0 40px;
            }
            .cert-signature { text-align: center; }
            .cert-line {
              width: 220px;
              height: 44px;
              border-bottom: 1px solid #1e1b4b;
              display: flex;
              align-items: flex-end;
              justify-content: center;
              margin-bottom: 5px;
            }
            .cert-badge {
              position: absolute;
              bottom: -20px;
              left: 50%;
              transform: translateX(-50%);
              width: 90px;
              height: 90px;
              background: ${isPass ? '#f43f5e' : '#6b7280'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 800;
              font-size: 11px;
              text-align: center;
              line-height: 1.3;
              border: 4px dashed white;
              box-shadow: 0 0 0 4px ${isPass ? '#f43f5e' : '#6b7280'};
            }
            @media print {
              body { padding: 0; min-height: unset; }
              .cert-card { border-width: 14px; }
              @page { size: A4 landscape; margin: 0.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="cert-card">
            <div class="cert-inner">
              <div class="cert-title">Certificate of Achievement</div>
              <div class="cert-subtitle">NTC Exam Preparation Platform</div>
              <div class="cert-text">This is to certify that</div>
              <div class="cert-name">${fullName}</div>
              <div class="cert-text">has successfully completed the examination for</div>
              <div style="font-size:22px;font-weight:700;color:#1e1b4b;margin:12px 0 20px;">${result.subject || 'NTC Prep Mock Exam'}</div>
              <div class="cert-details">
                <div class="cert-detail-box">
                  <div class="cert-detail-value">${result.percentage}%</div>
                  <div class="cert-detail-label">Score</div>
                </div>
                <div class="cert-detail-box">
                  <div class="cert-detail-value">${grade}</div>
                  <div class="cert-detail-label">Grade</div>
                </div>
                <div class="cert-detail-box">
                  <div class="cert-detail-value">${result.score} / ${result.total}</div>
                  <div class="cert-detail-label">Correct</div>
                </div>
              </div>
              <div class="cert-footer">
                <div class="cert-signature">
                  <div class="cert-line" style="font-family:Georgia,serif;font-style:italic;font-size:22px;">Atoopase</div>
                  <div class="cert-detail-label">Lead Instructor</div>
                </div>
                <div class="cert-signature">
                  <div class="cert-line" style="font-size:16px;">${date}</div>
                  <div class="cert-detail-label">Date Issued</div>
                </div>
              </div>
              <div class="cert-badge">${isPass ? 'EXCELLENCE<br>AWARD' : 'PARTICIPATION<br>AWARD'}</div>
            </div>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    });
  }
});
