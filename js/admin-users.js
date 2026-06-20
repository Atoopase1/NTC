// ============================================
// NTC Exam Prep - Admin User Management Logic
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.supaDB) return;

  // Protect route
  if (localStorage.getItem('ntc_is_admin') !== 'true') {
    window.location.href = 'dashboard.html';
    return;
  }
  if (window.supaAuth && window.supaAuth.checkAdminAndRedirect) {
    const user = await window.supaAuth.getCurrentUser();
    if (!user) { window.location.href = 'login.html'; return; }
  }

  let allStudents = [];
  let allResults = [];
  let currentDisplayStudents = [];

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

    const sortVal = document.getElementById('studentSort') ? document.getElementById('studentSort').value : 'name';

    const resultsByUser = {};
    results.forEach(r => {
      if (!resultsByUser[r.user_id]) resultsByUser[r.user_id] = [];
      resultsByUser[r.user_id].push(r);
    });

    let displayStudents = [...students].map(student => {
      const userResults = resultsByUser[student.id] || [];
      const examCount = userResults.length;
      const avgScoreRaw = examCount > 0
        ? (userResults.reduce((s, r) => s + parseFloat(r.percentage), 0) / examCount)
        : -1;
      return { ...student, userResults, examCount, avgScoreRaw };
    });

    if (sortVal === 'name') {
      displayStudents.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
    } else if (sortVal === 'score_desc') {
      displayStudents.sort((a, b) => b.avgScoreRaw - a.avgScoreRaw);
    } else if (sortVal === 'score_asc') {
      displayStudents.sort((a, b) => {
        if (a.avgScoreRaw === -1) return 1;
        if (b.avgScoreRaw === -1) return -1;
        return a.avgScoreRaw - b.avgScoreRaw;
      });
    } else if (sortVal === 'recent') {
      displayStudents.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    }

    currentDisplayStudents = displayStudents;

    let html = '';
    displayStudents.forEach(student => {
      const examCount = student.examCount;
      const avgScore = examCount > 0 ? student.avgScoreRaw.toFixed(1) + '%' : '—';

      const initials = (student.full_name || student.email || 'U').slice(0, 2).toUpperCase();
      const avatarUrl = student.avatar_url;
      const avatarHtml = avatarUrl 
        ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : initials;

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

      const isBlocked = student.blocked_until && new Date(student.blocked_until) > new Date();
      const blockedUntilStr = isBlocked
        ? new Date(student.blocked_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;
        
      let avatarStyle = isBlocked ? (avatarUrl ? 'border:2px solid #f43f5e;' : 'background:rgba(244,63,94,0.12);color:#f43f5e;') : '';

      html += `
        <tr data-name="${name.toLowerCase()}" data-email="${email.toLowerCase()}">
          <td>
            <div class="student-info">
              <div class="student-avatar" style="${avatarStyle}">${avatarHtml}</div>
              <div>
                <div class="student-name">${name} ${isBlocked ? `<span class="badge-blocked"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Blocked until ${blockedUntilStr}</span>` : ''}</div>
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
              <button class="btn-icon" title="View Results" onclick="window.viewStudentResults('${student.id}', '${name.replace(/'/g, "\\'") }', '${email}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              ${isBlocked
                ? `<button class="btn-icon unblock-btn" title="Unblock Student" onclick="window.unblockStudentAction('${student.id}', '${name.replace(/'/g, "\\'")}')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg></button>`
                : `<button class="btn-icon block-btn" title="Block Student" onclick="window.openBlockModal('${student.id}', '${name.replace(/'/g, "\\'")}')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>`
              }
              <button class="btn-icon delete" title="Delete Student" onclick="window.deleteStudent('${student.id}', '${name.replace(/'/g, "\\'")}')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  };

  // ─── Search & Sort ────────────────────────────────────────────────────────────
  if (document.getElementById('studentSort')) {
    document.getElementById('studentSort').addEventListener('change', () => {
      renderTable(allStudents, allResults);
      // Re-trigger search filter if there's a search term
      document.getElementById('studentSearch').dispatchEvent(new Event('input'));
    });
  }

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

  // ─── Block Student ────────────────────────────────────────────────────────────
  let blockTargetId = null;
  let selectedDays = null;

  window.openBlockModal = (userId, name) => {
    blockTargetId = userId;
    selectedDays = null;
    document.getElementById('blockModalStudentName').textContent = name;
    document.getElementById('customDateSection').style.display = 'none';
    document.getElementById('blockUntilDate').value = '';
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('blockModal').classList.add('active');
  };

  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDays = parseInt(btn.getAttribute('data-days'));
      const customSection = document.getElementById('customDateSection');
      customSection.style.display = selectedDays === 0 ? '' : 'none';
    });
  });

  const closeBlockModal = () => {
    document.getElementById('blockModal').classList.remove('active');
    blockTargetId = null;
    selectedDays = null;
  };

  document.getElementById('closeBlockModal').addEventListener('click', closeBlockModal);
  document.getElementById('cancelBlockBtn').addEventListener('click', closeBlockModal);
  document.getElementById('blockModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBlockModal();
  });

  document.getElementById('confirmBlockBtn').addEventListener('click', async () => {
    if (!blockTargetId) return;
    let blockedUntil;
    if (selectedDays === null) { window.showToast('Please select a block duration.', 'error'); return; }
    if (selectedDays === 0) {
      const dateVal = document.getElementById('blockUntilDate').value;
      if (!dateVal) { window.showToast('Please pick a date.', 'error'); return; }
      blockedUntil = new Date(dateVal + 'T23:59:59').toISOString();
    } else {
      const until = new Date();
      until.setDate(until.getDate() + selectedDays);
      blockedUntil = until.toISOString();
    }
    const { error } = await window.supaDB.blockStudent(blockTargetId, blockedUntil);
    if (error) { window.showToast('Failed to block student: ' + error.message, 'error'); return; }
    window.showToast('Student blocked successfully.', 'success');
    closeBlockModal();
    loadStudents();
  });

  window.unblockStudentAction = async (userId, name) => {
    if (!confirm(`Unblock "${name}" and restore their access?`)) return;
    const { error } = await window.supaDB.unblockStudent(userId);
    if (error) { window.showToast('Failed to unblock: ' + error.message, 'error'); return; }
    window.showToast(`"${name}" has been unblocked.`, 'success');
    loadStudents();
  };

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

  // ─── Print Logic ────────────────────────────────────────────────────────
  document.getElementById('printBtn')?.addEventListener('click', () => {
    window.prepareDetailedPrint();
  });

  // ─── Prepare Detailed Print ───────────────────────────────────────────────────
  window.prepareDetailedPrint = () => {
    const printArea = document.getElementById('detailedPrintArea');
    if (!printArea) return;

    // We filter students that are currently visible
    const q = (document.getElementById('studentSearch')?.value || '').toLowerCase().trim();
    const filteredStudents = currentDisplayStudents.filter(student => {
      const n = (student.full_name || 'Unknown').toLowerCase();
      const e = (student.email || '').toLowerCase();
      return (!q || n.includes(q) || e.includes(q));
    });

    let printHtml = `
      <style>
        @media print {
          body { background: white; margin: 0; padding: 0; }
          body > *:not(style):not(script):not(#detailedPrintArea) { display: none !important; }
          #detailedPrintArea { display: block !important; }
          .print-doc-title { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 20px; color: black; }
          table.print-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
          table.print-table th, table.print-table td { border: 1px solid #000; padding: 8px; color: black; text-align: left; }
          table.print-table th { background: #f3f4f6; font-weight: bold; }
        }
      </style>
      <div class="print-doc-title">Student Results Report</div>
    `;

    if (filteredStudents.length === 0) {
      printHtml += '<p>No students found.</p>';
    } else {
      printHtml += `
        <table class="print-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Score</th>
              <th>Time Used</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      // We list every student's results
      filteredStudents.forEach(student => {
        const name = student.full_name || student.email || 'Unknown';
        let results = student.userResults || [];
        
        if (results.length === 0) {
          printHtml += `
            <tr>
              <td>${name}</td>
              <td colspan="2" style="font-style: italic; color: #555;">No exams taken</td>
            </tr>
          `;
        } else {
          // Sort results by date descending so the latest is first
          const sortedResults = [...results].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          sortedResults.forEach(r => {
            printHtml += `
              <tr>
                <td>${name}</td>
                <td>${parseFloat(r.percentage).toFixed(1)}% (${r.score}/${r.total})</td>
                <td>${r.time_used || 'N/A'}</td>
              </tr>
            `;
          });
        }
      });

      printHtml += `
          </tbody>
        </table>
      `;
    }

    printArea.innerHTML = printHtml;
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Init
  loadStudents();
});
