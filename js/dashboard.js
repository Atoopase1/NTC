// ============================================
// NTC Exam Prep - Dashboard Logic
// Handles dashboard data, charts, and interactions
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Only execute on dashboard page
  if (!document.querySelector('.dashboard-layout')) return;

  // Initialize Dashboard
  initDashboard();

  async function initDashboard() {
    // Fetch subjects dynamically, then load dashboard data
    setTimeout(async () => {
      let subjects = ['Pedagogy', 'General Knowledge', 'Curriculum Studies', 'Assessment', 'ICT in Education', 'Educational Psychology'];
      if (window.supaDB && window.supaDB.getSubjects) {
        const fetched = await window.supaDB.getSubjects();
        if (fetched && fetched.length > 0) {
          subjects = fetched.map(s => s.name);
        }
      }
      loadDashboardData(subjects);
    }, 800);
  }

  async function loadDashboardData(subjects) {
    // Get exam history to populate stats
    let history = [];
    if (window.supaDB && window.supaDB.getExamHistory && window.supaAuth && window.supaAuth.getCurrentUser) {
      const user = await window.supaAuth.getCurrentUser();
      if (user) {
        history = await window.supaDB.getExamHistory(user.id);
      }
    }

    // Fallback to local storage if empty (for guests/offline)
    if (!history || history.length === 0) {
      if (localStorage.getItem('ntc_exam_results')) {
        history = JSON.parse(localStorage.getItem('ntc_exam_results'));
      } else {
        // Mock data for fresh users
        history = [
          { subject: 'Pedagogy', score: 45, total: 60, percentage: 75, date: new Date(Date.now() - 86400000 * 2).toISOString() },
          { subject: 'General Knowledge', score: 50, total: 60, percentage: 83, date: new Date(Date.now() - 86400000 * 5).toISOString() },
          { subject: 'Curriculum Studies', score: 38, total: 60, percentage: 63, date: new Date(Date.now() - 86400000 * 10).toISOString() }
        ];
        localStorage.setItem('ntc_exam_results', JSON.stringify(history));
      }
    }

    updateStats(history);
    updateRecentScores(history);
    updateSubjectOverview(history, subjects);
    initCharts(history);

    // Remove loading skeletons if any (we'll just animate in the content)
    document.querySelectorAll('.widget').forEach((el, index) => {
      el.style.opacity = '0';
      el.style.animation = `fadeInUp 0.5s ease ${index * 0.1}s forwards`;
    });
  }

  function updateStats(history) {
    const examsTakenEl = document.getElementById('statExamsTaken');
    const avgScoreEl = document.getElementById('statAvgScore');
    const bestSubjectEl = document.getElementById('statBestSubject');

    if (!examsTakenEl || !avgScoreEl || !bestSubjectEl) return;

    if (history.length === 0) {
      examsTakenEl.textContent = '0';
      avgScoreEl.textContent = '0%';
      bestSubjectEl.textContent = 'N/A';
      return;
    }

    // Total Exams
    examsTakenEl.textContent = history.length;

    // Average Score
    const totalPercentage = history.reduce((acc, curr) => acc + curr.percentage, 0);
    const avgScore = Math.round(totalPercentage / history.length);
    avgScoreEl.textContent = `${avgScore}%`;

    // Best Subject
    const bestExam = history.reduce((prev, current) => (prev.percentage > current.percentage) ? prev : current);
    bestSubjectEl.textContent = bestExam.subject;
  }

  function updateRecentScores(history) {
    const container = document.getElementById('recentScoresContainer');
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No exams taken yet.</p>
        </div>
      `;
      return;
    }

    // Get 4 most recent
    const recent = [...history].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);

    let html = '<div class="recent-scores-list">';
    recent.forEach(exam => {
      const date = new Date(exam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const isPass = exam.percentage >= 50;
      const statusClass = isPass ? 'pass' : 'fail';

      html += `
        <div class="recent-score-item">
          <div class="recent-score-subject">
            <h5>${exam.subject}</h5>
            <p>${date}</p>
          </div>
          <div class="recent-score-value ${statusClass}">
            ${exam.percentage}%
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  function updateSubjectOverview(history, subjects) {
    const container = document.getElementById('subjectOverviewContainer');
    if (!container) return;

    if (!subjects || subjects.length === 0) {
      subjects = ['Pedagogy', 'General Knowledge', 'Curriculum Studies', 'Assessment', 'ICT in Education', 'Educational Psychology'];
    }

    // Calculate best score for each subject
    const subjectScores = {};
    subjects.forEach(sub => {
      const exams = history.filter(h => h.subject === sub);
      if (exams.length > 0) {
        const best = Math.max(...exams.map(e => e.percentage));
        subjectScores[sub] = best;
      } else {
        subjectScores[sub] = 0;
      }
    });

    let html = '<div class="subject-overview-grid">';

    Object.entries(subjectScores).forEach(([subject, score]) => {
      // Get an icon class based on subject
      let iconClass = 'pedagogy';
      if (subject.includes('General')) iconClass = 'general';
      if (subject.includes('Curriculum')) iconClass = 'curriculum';
      if (subject.includes('Assessment')) iconClass = 'assessment';
      if (subject.includes('ICT')) iconClass = 'ict';
      if (subject.includes('Psychology')) iconClass = 'psychology';

      let fillClass = '';
      if (score === 0) fillClass = 'style="background: var(--border-light);"';
      else if (score >= 70) fillClass = 'style="background: var(--accent);"';
      else if (score >= 50) fillClass = 'style="background: var(--warning);"';
      else fillClass = 'style="background: var(--danger);"';

      html += `
        <div class="subject-overview-card">
          <div class="subject-overview-header">
            <div class="subject-overview-name">
              <span style="width: 8px; height: 8px; border-radius: 50%; display: inline-block;" class="subject-icon ${iconClass}"></span>
              ${subject}
            </div>
            <div class="subject-overview-score">${score}%</div>
          </div>
          <div class="subject-overview-bar">
            <div class="subject-overview-fill" ${fillClass} style="width: ${score}%"></div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Trigger animations
    setTimeout(() => {
      const fills = container.querySelectorAll('.subject-overview-fill');
      fills.forEach(fill => {
        const width = fill.style.width;
        fill.style.width = '0';
        setTimeout(() => {
          fill.style.width = width;
        }, 100);
      });
    }, 100);
  }

  function initCharts(history) {
    const chartContainer = document.getElementById('performanceChart');
    if (!chartContainer) return;

    if (history.length === 0) {
      chartContainer.innerHTML = `
        <div class="chart-placeholder">
          Take some exams to see your performance graph
        </div>
      `;
      return;
    }

    // Sort chronologically
    const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-6);

    let html = '<div class="bar-chart">';

    sortedHistory.forEach(exam => {
      const date = new Date(exam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      // Create a short name
      const shortName = exam.subject.split(' ').map(w => w[0]).join('');

      html += `
        <div class="bar-chart-item">
          <div class="bar-chart-value">${exam.percentage}%</div>
          <div class="bar-chart-bar" style="height: 0%" data-height="${exam.percentage}%"></div>
          <div class="bar-chart-label" title="${exam.subject}\n${date}">${shortName}<br><span style="font-size: 8px">${date}</span></div>
        </div>
      `;
    });

    html += '</div>';
    chartContainer.innerHTML = html;

    // Animate bars
    setTimeout(() => {
      const bars = chartContainer.querySelectorAll('.bar-chart-bar');
      bars.forEach(bar => {
        bar.style.height = bar.getAttribute('data-height');
      });
    }, 200);

    // Also update overall progress ring
    const overallProgress = document.getElementById('overallProgressRing');
    const overallValue = document.getElementById('overallProgressValue');

    if (overallProgress && overallValue) {
      const totalPercentage = history.reduce((acc, curr) => acc + curr.percentage, 0);
      const avgScore = Math.round(totalPercentage / history.length);

      overallValue.textContent = `${avgScore}%`;

      // Calculate stroke dashoffset (circumference = 2 * pi * r = 2 * 3.14 * 54 = 339.29)
      const circumference = 339.29;
      const offset = circumference - (avgScore / 100) * circumference;

      overallProgress.style.strokeDashoffset = offset;

      // Change color based on score
      if (avgScore >= 70) overallProgress.style.stroke = 'var(--accent)';
      else if (avgScore >= 50) overallProgress.style.stroke = 'var(--warning)';
      else overallProgress.style.stroke = 'var(--danger)';
    }
  }
});
