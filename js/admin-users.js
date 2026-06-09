// ============================================
// NTC Exam Prep - Admin User Management Logic
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.supaDB) return;

  // Protect route
  if (window.supaAuth && window.supaAuth.checkAdminAndRedirect) {
    const user = await window.supaAuth.getCurrentUser();
    if (!user) { window.location.href = 'login.html'; return; }
  }

  let allStudents = [];
  let allResults = [];

  // ─── Load Stats & Students ────────────────────────────────────────────────────
  const loadStudents = async () => {
    try {
      const { data: profiles, error } = await window.supaDB.getAllStudents();
      if (error) { console.error(error); showError(); return; }

      const { data: results } = await window.supaDB.getAllExamResults();
      allStudents = profiles || [];
      allResults = results || [];

      // Compute stats
      document.getElementById('statTotal').textContent = allStudents.length;
      document.getElementById('statExams').textContent = allResults.length;

      if (allResults.length > 0) {
        const avg = allResults.reduce((sum, r) => sum + parseFloat(r.percentage), 0) / allResults.length;
        document.getElementById('statAvg').textContent = avg.toFixed(1) + '%';
      } else {
        document.getElementById('statAvg').textContent = 'N/A';
      }

      renderTable(allStudents, allResults);
    } catch (e) {
      console.error(e);
      showError();
    }
  };

  const showError = () => {
    document.getElementById('studentsTableBody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:var(--danger);">Failed to load students. Make sure you have run the latest database.sql in Supabase.</td></tr>';
  };

  // ─── Render Table ─────────────────────────────────────────────────────────────
  const renderTable = (students, results) => {
    const tbody = document.getElementById('studentsTableBody');

    if (!students || students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-light);">No students registered yet.</td></tr>';
      return;
    }

    const resultsByUser = {};
    results.forEach(r => {
      if (!resultsByUser[r.user_id]) resultsByUser[r.user_id] = [];
      resultsByUser[r.user_id].push(r);
    });

    let html = '';
    students.forEach(student => {
      const userResults = resultsByUser[student.id] || [];
      const examCount = userResults.length;
      const avgScore = examCount > 0
        ? (userResults.reduce((s, r) => s + parseFloat(r.percentage), 0) / examCount).toFixed(1) + '%'
        : '—';

      const initials = (student.full_name || student.email || 'U').slice(0, 2).toUpperCase();
      const name = student.full_name || 'Unknown';
      const email = student.email || '';
      const phone = student.phone || '—';
      const school = student.school || '—';
      const joined = student.updated_at
        ? new Date(student.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';

      // Colour the avg score
      let scoreColor = 'var(--text)';
      if (examCount > 0) {
        const num = parseFloat(avgScore);
        if (num >= 70) scoreColor = 'var(--success)';
        else if (num >= 50) scoreColor = 'var(--warning)';
        else scoreColor = 'var(--danger)';
      }

      html += `
        <tr data-name="${name.toLowerCase()}" data-email="${email.toLowerCase()}">
          <td>
            <div class="student-info">
              <div class="student-avatar">${initials}</div>
              <div>
                <div class="student-name">${name}</div>
                <div class="student-email">${email}</div>
              </div>
            </div>
          </td>
          <td>${phone}</td>
          <td>${school}</td>
          <td>${joined}</td>
          <td><strong>${examCount}</strong></td>
          <td style="color:${scoreColor};font-weight:600;">${avgScore}</td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" title="View Results" onclick="window.viewStudentResults('${student.id}', '${name.replace(/'/g,"\\'")}', '${email}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="btn-icon delete" title="Delete Student" onclick="window.deleteStudent('${student.id}', '${name.replace(/'/g,"\\'")}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  };

  // ─── Search ───────────────────────────────────────────────────────────────────
  document.getElementById('studentSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#studentsTableBody tr[data-name]').forEach(row => {
      const name = row.getAttribute('data-name');
      const email = row.getAttribute('data-email');
      row.style.display = (!q || name.includes(q) || email.includes(q)) ? '' : 'none';
    });
  });

  // ─── View Results Modal ───────────────────────────────────────────────────────
  window.viewStudentResults = (userId, name, email) => {
    document.getElementById('modalStudentName').textContent = name;
    document.getElementById('modalStudentEmail').textContent = email;
    document.getElementById('resultsModal').classList.add('active');

    const userResults = allResults.filter(r => r.user_id === userId);

    const pillsEl = document.getElementById('modalStatPills');
    const listEl = document.getElementById('modalResultsList');

    if (userResults.length === 0) {
      pillsEl.innerHTML = '';
      listEl.innerHTML = '<div class="empty-state"><p>This student has not taken any exams yet.</p></div>';
      return;
    }

    const avg = (userResults.reduce((s, r) => s + parseFloat(r.percentage), 0) / userResults.length).toFixed(1);
    const best = Math.max(...userResults.map(r => parseFloat(r.percentage))).toFixed(1);

    pillsEl.innerHTML = `
      <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> <strong>${userResults.length}</strong> Exams</div>
      <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> Avg: <strong>${avg}%</strong></div>
      <div class="stat-pill"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> Best: <strong>${best}%</strong></div>
    `;

    const sorted = [...userResults].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    listEl.innerHTML = sorted.map(r => {
      const pct = parseFloat(r.percentage);
      const gradeClass = pct >= 75 ? 'grade-a' : pct >= 60 ? 'grade-b' : pct >= 50 ? 'grade-c' : 'grade-d';
      const grade = pct >= 75 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'F';
      const date = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div class="result-row">
          <div>
            <div style="font-weight:600;font-size:var(--text-sm);">${r.subject}</div>
            <div style="font-size:var(--text-xs);color:var(--text-light);">${date} &bull; ${r.score}/${r.total} correct &bull; ${r.time_used || 'N/A'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <span style="font-weight:700;font-size:var(--text-base);">${pct.toFixed(1)}%</span>
            <span class="grade-badge ${gradeClass}">${grade}</span>
          </div>
        </div>
      `;
    }).join('');
  };

  document.getElementById('closeResultsModal').addEventListener('click', () => {
    document.getElementById('resultsModal').classList.remove('active');
  });
  document.getElementById('resultsModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
  });

  // ─── Delete Student ───────────────────────────────────────────────────────────
  window.deleteStudent = async (userId, name) => {
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis will permanently remove their profile and all exam results. This cannot be undone.`)) return;

    const { error } = await window.supaDB.deleteStudentProfile(userId);
    if (error) {
      window.showToast('Failed to delete student: ' + error.message, 'error');
    } else {
      window.showToast(`"${name}" has been deleted successfully.`, 'success');
      loadStudents();
    }
  };

  // Init
  loadStudents();
});
