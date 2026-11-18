// ============================================
// PrepTrack - Dashboard Logic
// Handles dashboard data, charts, course personalization, and interactions
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
      let userSelectedSubjectNames = null;
      let hasCustomPreferences = false;

      const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;

      if (window.supaDB && window.supaDB.getSubjects) {
        const fetched = await window.supaDB.getSubjects();
        if (fetched && fetched.length > 0) {
          subjects = fetched.map(s => s.name);
        }
      }

      // Check student course preferences (Phase 4 Personalization)
      if (client && window.supaAuth && window.supaAuth.getCurrentUser) {
        try {
          const user = await window.supaAuth.getCurrentUser();
          if (user) {
            const { data: prefs, error: prefErr } = await client
              .from('student_course_preferences')
              .select('subject_id')
              .eq('user_id', user.id);

            if (!prefErr && prefs && prefs.length > 0) {
              hasCustomPreferences = true;
              const subIds = prefs.map(p => p.subject_id);
              const { data: selectedSubs } = await client
                .from('subjects')
                .select('name')
                .in('id', subIds);

              if (selectedSubs && selectedSubs.length > 0) {
                userSelectedSubjectNames = selectedSubs.map(s => s.name);
                subjects = userSelectedSubjectNames; // Filter dashboard to student's chosen courses
              }
            }
          }
        } catch (prefCatch) {
          console.warn('Personalized course preferences check:', prefCatch);
        }
      }

      loadDashboardData(subjects, hasCustomPreferences);
    }, 600);
  }

  async function loadDashboardData(subjects, hasCustomPreferences) {
    // Get exam history to populate stats
    let history = [];
    if (window.supaDB && window.supaDB.getExamHistory && window.supaAuth && window.supaAuth.getCurrentUser) {
      const user = await window.supaAuth.getCurrentUser();
      if (user) {
        // Check if user is blocked
        const profile = window.supaDB.getProfile ? await window.supaDB.getProfile(user.id) : null;
        if (profile && profile.blocked_until && new Date(profile.blocked_until) > new Date()) {
          const until = new Date(profile.blocked_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          if (window.supaAuth.signOut) await window.supaAuth.signOut();
          localStorage.setItem('preptrack_blocked_until', until);
          localStorage.setItem('ntc_blocked_until', until); localStorage.setItem('preptrack_blocked_until', until);
          window.location.href = 'login.html';
          return;
        }
        history = await window.supaDB.getExamHistory(user.id);
      }
    }

    // Fallback to local storage if empty (for guests/offline)
    if (!history || history.length === 0) {
      const cached = localStorage.getItem('preptrack_exam_results') || localStorage.getItem('ntc_exam_results');
      if (cached) {
        history = JSON.parse(cached);
      }
    }
    
    // Filter to only show real (scheduled) exam results
    history = (history || []).filter(exam => exam.scheduledExamId || exam.isScheduled);

    // If student selected specific courses, filter history to those subjects
    if (hasCustomPreferences && subjects && subjects.length > 0) {
      history = history.filter(exam => subjects.includes(exam.subject));
    }

    // Provide placeholder data if still empty, so the dashboard doesn't look broken
    if (history.length === 0) {
      const defaultSub1 = subjects[0] || 'Pedagogy';
      const defaultSub2 = subjects[1] || 'General Knowledge';
      const defaultSub3 = subjects[2] || 'Curriculum Studies';
      history = [
        { subject: defaultSub1, score: 45, total: 60, percentage: 75, date: new Date(Date.now() - 86400000 * 2).toISOString(), isScheduled: true },
        { subject: defaultSub2, score: 50, total: 60, percentage: 83, date: new Date(Date.now() - 86400000 * 5).toISOString(), isScheduled: true },
        { subject: defaultSub3, score: 38, total: 60, percentage: 63, date: new Date(Date.now() - 86400000 * 10).toISOString(), isScheduled: true }
      ];
    }

    updateStats(history);
    updateRecentScores(history);
    updateSubjectOverview(history, subjects, hasCustomPreferences);
    initCharts(history);

    // Animate in widgets
    document.querySelectorAll('.widget').forEach((el, index) => {
      el.style.opacity = '0';
      el.style.animation = `fadeInUp 0.4s ease ${index * 0.08}s forwards`;
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

  function updateSubjectOverview(history, subjects, hasCustomPreferences) {
    const container = document.getElementById('subjectOverviewContainer');
    if (!container) return;

    if (!subjects || subjects.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-md); text-align:center;">
          <p style="color:var(--text-light); margin-bottom:12px; font-size:14px;">You haven't selected any courses yet.</p>
          <a href="courses.html" class="btn btn-sm btn-primary">Choose My Courses</a>
        </div>
      `;
      return;
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

    let html = '';
    if (!hasCustomPreferences) {
      html += `
        <div style="background:rgba(0,59,247,0.06); border:1px solid rgba(0,59,247,0.15); border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span style="font-size:13px; color:var(--text);"><strong style="color:var(--primary);">Personalize:</strong> Showing all courses. Select only your subjects for a customized portal.</span>
          <a href="courses.html" class="btn btn-sm btn-outline" style="font-size:12px; padding:4px 10px;">Select Courses &rarr;</a>
        </div>
      `;
    }

    html += '<div class="subject-overview-grid">';

    Object.entries(subjectScores).forEach(([subject, score]) => {
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

    // Sort chronologically, max 6 items for clean compact fit
    const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-6);

    let html = '<div class="bar-chart">';

    sortedHistory.forEach(exam => {
      const date = new Date(exam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const shortName = exam.subject.split(' ').map(w => w[0]).join('');

      html += `
        <div class="bar-chart-item">
          <div class="bar-chart-value">${exam.percentage}%</div>
          <div class="bar-chart-bar" style="height: 0%" data-height="${exam.percentage}%"></div>
          <div class="bar-chart-label" title="${exam.subject}\n${date}">${shortName}<br><span style="font-size: 8px; opacity:0.8;">${date}</span></div>
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
    }, 150);

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
