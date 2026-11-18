// ============================================
// PrepTrack - Admin Attendance Management Logic
// ============================================

(function () {
  'use strict';

  // Protect admin route
  const isAdmin = localStorage.getItem('preptrack_is_admin') === 'true' || localStorage.getItem('ntc_is_admin') === 'true';
  if (!isAdmin) {
    window.location.href = (window.getAppPageUrl ? window.getAppPageUrl('dashboard.html') : 'dashboard.html');
    return;
  }

  let activeRealtimeChannel = null;
  let masterRealtimeChannel = null;
  let currentSession = null;
  let currentSubmissions = [];
  let cachedSessions = [];
  let allRegisterSubmissions = [];
  let filteredRegisterSubmissions = [];

  document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    await loadSubjects();
    await loadSessions();
    await loadMasterRegister();
    setupMasterRealtimeSubscription();

    // Default sessionDate to today
    const dateInput = document.getElementById('sessionDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  });

  // Tab switching
  function setupTabNavigation() {
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const tabBtn = document.querySelector(`.admin-tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    const tabContent = document.getElementById(tabId);
    if (tabContent) tabContent.classList.add('active');

    if (tabId !== 'records-tab' && activeRealtimeChannel) {
      cleanupSubscription();
    }
    if (tabId === 'register-tab') {
      filterMasterRegister();
    }
  }

  // Load subject options for creation form
  async function loadSubjects() {
    const select = document.getElementById('sessionSubject');
    if (!select) return;

    try {
      if (window.supaDB && typeof window.supaDB.getSubjects === 'function') {
        const subjects = await window.supaDB.getSubjects();
        if (subjects && subjects.length > 0) {
          select.innerHTML = '<option value="" disabled selected>Select a subject</option>' +
            subjects.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
          return;
        }
      }
    } catch (e) {
      console.warn('Could not load subjects from supaDB:', e);
    }

    // Default fallback subjects
    const defaults = ['General Education', 'Numeracy Skills', 'Literacy Skills', 'Essential Skills', 'Pedagogy'];
    select.innerHTML = '<option value="" disabled selected>Select a subject</option>' +
      defaults.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  // Toggle create session form visibility
  function toggleCreateForm() {
    const formCard = document.getElementById('createSessionForm');
    const btn = document.getElementById('toggleCreateFormBtn');
    if (!formCard) return;

    if (formCard.style.display === 'none' || !formCard.style.display) {
      formCard.style.display = 'block';
      if (btn) btn.textContent = '✕ Close Form';
    } else {
      formCard.style.display = 'none';
      if (btn) btn.textContent = '+ Create New Session';
      document.getElementById('sessionForm')?.reset();
    }
  }

  // Radius selection change
  function handleRadiusChange() {
    const select = document.getElementById('sessionRadius');
    const customContainer = document.getElementById('customRadiusContainer');
    if (!select || !customContainer) return;

    if (select.value === 'custom') {
      customContainer.style.display = 'block';
    } else {
      customContainer.style.display = 'none';
    }
  }

  // Capture Admin GPS Coordinates
  function getAdminLocation() {
    const statusMsg = document.getElementById('locationAccuracyMsg');
    const latInput = document.getElementById('sessionLat');
    const lngInput = document.getElementById('sessionLng');

    if (!navigator.geolocation) {
      if (statusMsg) {
        statusMsg.style.color = '#dc2626';
        statusMsg.textContent = 'Geolocation is not supported by your browser.';
      }
      return;
    }

    if (statusMsg) {
      statusMsg.style.color = 'var(--text-light)';
      statusMsg.textContent = 'Acquiring GPS location...';
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);

        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);

        if (statusMsg) {
          statusMsg.style.color = acc <= 50 ? '#059669' : '#d97706';
          statusMsg.textContent = `✓ Captured! Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (Accuracy: ~${acc}m)`;
        }
      },
      (err) => {
        console.error('Location error:', err);
        if (statusMsg) {
          statusMsg.style.color = '#dc2626';
          statusMsg.textContent = `Location error: ${err.message}. Please allow location permissions.`;
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // --------------------------------------------
  // Master Attendance Register Functions
  // --------------------------------------------

  async function loadMasterRegister() {
    const tbody = document.getElementById('masterRegisterTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 30px;">Loading attendance register...</td></tr>';
    }

    try {
      const { data, error } = await window.supaAttendance.getAllAttendanceSubmissions();
      if (error) {
        console.error('Error fetching all submissions:', error);
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#ef4444;padding:30px;">Error loading register: ${escapeHtml(error.message)}</td></tr>`;
        }
        return;
      }

      allRegisterSubmissions = data || [];
      populateRegisterFilterOptions();
      filterMasterRegister();
    } catch (err) {
      console.error('Failed to load master register:', err);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#ef4444;padding:30px;">Failed to load attendance register.</td></tr>';
      }
    }
  }

  function populateRegisterFilterOptions() {
    const subjectSelect = document.getElementById('regSubjectFilter');
    const sessionSelect = document.getElementById('regSessionFilter');

    // Populate Subjects
    if (subjectSelect) {
      const subjectsSet = new Set();
      allRegisterSubmissions.forEach(s => {
        const sub = s.attendance_sessions?.subject || s.course;
        if (sub) subjectsSet.add(sub);
      });
      cachedSessions.forEach(s => {
        if (s.subject) subjectsSet.add(s.subject);
      });

      const currentVal = subjectSelect.value;
      let optionsHtml = '<option value="all">All Courses / Subjects</option>';
      Array.from(subjectsSet).sort().forEach(sub => {
        optionsHtml += `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`;
      });
      subjectSelect.innerHTML = optionsHtml;
      if (subjectsSet.has(currentVal)) subjectSelect.value = currentVal;
    }

    // Populate Sessions
    if (sessionSelect) {
      const sessionMap = new Map();
      allRegisterSubmissions.forEach(s => {
        if (s.session_id) {
          const title = s.attendance_sessions?.title || `Session ${s.session_id.substring(0, 8)}`;
          sessionMap.set(s.session_id, title);
        }
      });
      cachedSessions.forEach(s => {
        if (s.id && s.title) sessionMap.set(s.id, s.title);
      });

      const currentVal = sessionSelect.value;
      let optionsHtml = '<option value="all">All Sessions</option>';
      sessionMap.forEach((title, id) => {
        optionsHtml += `<option value="${escapeHtml(id)}">${escapeHtml(title)}</option>`;
      });
      sessionSelect.innerHTML = optionsHtml;
      if (sessionMap.has(currentVal)) sessionSelect.value = currentVal;
    }
  }

  function filterMasterRegister() {
    const searchVal = (document.getElementById('regSearchInput')?.value || '').toLowerCase().trim();
    const subjectVal = document.getElementById('regSubjectFilter')?.value || 'all';
    const sessionVal = document.getElementById('regSessionFilter')?.value || 'all';
    const statusVal = document.getElementById('regStatusFilter')?.value || 'all';
    const dateVal = document.getElementById('regDateFilter')?.value || '';

    filteredRegisterSubmissions = allRegisterSubmissions.filter(s => {
      // Search match
      if (searchVal) {
        const name = (s.full_name || '').toLowerCase();
        const indexNum = (s.index_number || '').toLowerCase();
        const subject = (s.attendance_sessions?.subject || s.course || '').toLowerCase();
        const title = (s.attendance_sessions?.title || '').toLowerCase();
        if (!name.includes(searchVal) && !indexNum.includes(searchVal) && !subject.includes(searchVal) && !title.includes(searchVal)) {
          return false;
        }
      }

      // Subject match
      if (subjectVal !== 'all') {
        const sub = s.attendance_sessions?.subject || s.course || '';
        if (sub.toLowerCase() !== subjectVal.toLowerCase()) return false;
      }

      // Session match
      if (sessionVal !== 'all') {
        if (s.session_id !== sessionVal) return false;
      }

      // Status match
      if (statusVal !== 'all') {
        const isVerified = s.verification_status === 'verified';
        if (statusVal === 'verified' && !isVerified) return false;
        if (statusVal === 'rejected' && isVerified) return false;
      }

      // Date match
      if (dateVal) {
        const sDate = s.attendance_sessions?.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : '');
        if (sDate !== dateVal) return false;
      }

      return true;
    });

    updateRegisterKpis(filteredRegisterSubmissions);
    renderMasterRegister(filteredRegisterSubmissions);
  }

  function updateRegisterKpis(submissions) {
    const totalEl = document.getElementById('regKpiTotal');
    const verifiedEl = document.getElementById('regKpiVerified');
    const flaggedEl = document.getElementById('regKpiFlagged');
    const sessionsEl = document.getElementById('regKpiSessions');
    const countBadge = document.getElementById('masterRegisterCount');

    const total = submissions.length;
    const verified = submissions.filter(s => s.verification_status === 'verified').length;
    const flagged = total - verified;

    const uniqueSessions = new Set(submissions.map(s => s.session_id).filter(Boolean));

    if (totalEl) totalEl.textContent = total;
    if (verifiedEl) verifiedEl.textContent = verified;
    if (flaggedEl) flaggedEl.textContent = flagged;
    if (sessionsEl) sessionsEl.textContent = uniqueSessions.size;
    if (countBadge) countBadge.textContent = `${total} Record${total === 1 ? '' : 's'}`;
  }

  function renderMasterRegister(submissions) {
    const tbody = document.getElementById('masterRegisterTableBody');
    if (!tbody) return;

    if (!submissions || submissions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding: 40px 20px; color: var(--text-light);">
            <div style="font-size: 28px; margin-bottom: 8px;">📋</div>
            <div style="font-weight: 600; font-size: 15px; color: var(--text); margin-bottom: 4px;">No Attendance Records Found</div>
            <div>No student submissions match your current filters. Adjust your search or clear filters above.</div>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    submissions.forEach((s, idx) => {
      const rollNum = `#${String(idx + 1).padStart(3, '0')}`;
      const studentName = escapeHtml(s.full_name || 'Student');
      const indexNum = escapeHtml(s.index_number || 'N/A');
      const subject = escapeHtml(s.attendance_sessions?.subject || s.course || 'General');
      const title = escapeHtml(s.attendance_sessions?.title || 'Session');
      
      let dateStr = '—';
      if (s.attendance_sessions?.session_date) {
        dateStr = escapeHtml(s.attendance_sessions.session_date);
      } else if (s.submitted_at) {
        dateStr = new Date(s.submitted_at).toLocaleDateString();
      }

      let timeStr = '—';
      if (s.submitted_at) {
        timeStr = new Date(s.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }

      let distanceStr = '—';
      if (typeof s.distance_meters === 'number') {
        distanceStr = `${s.distance_meters.toFixed(1)}m`;
      } else if (s.is_within_radius) {
        distanceStr = 'Within Range';
      }

      const isVerified = s.verification_status === 'verified';
      const statusBadge = isVerified
        ? `<span class="status-badge verified">Verified Present</span>`
        : `<span class="status-badge rejected">Flagged / Out of Range</span>`;

      const nextStatus = isVerified ? 'rejected' : 'verified';

      rowsHtml += `
        <tr>
          <td><span class="register-roll-tag">${rollNum}</span></td>
          <td><strong>${studentName}</strong></td>
          <td><span class="register-index-tag">${indexNum}</span></td>
          <td>${subject}</td>
          <td>${title}</td>
          <td>${dateStr}</td>
          <td>${timeStr}</td>
          <td><span style="font-size: 12px; font-weight: 600;">${distanceStr}</span></td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">
              <button class="btn btn-sm btn-outline" title="Toggle Verification Status" onclick="window.adminAttendance.toggleMasterSubmissionStatus('${s.id}', '${nextStatus}')">
                ${isVerified ? 'Flag' : 'Verify'}
              </button>
              <button class="btn btn-sm btn-outline" style="color:#ef4444; border-color:#ef4444;" title="Delete Record" onclick="window.adminAttendance.deleteMasterSubmission('${s.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  function resetMasterFilters() {
    const searchInput = document.getElementById('regSearchInput');
    const subjectSelect = document.getElementById('regSubjectFilter');
    const sessionSelect = document.getElementById('regSessionFilter');
    const statusSelect = document.getElementById('regStatusFilter');
    const dateInput = document.getElementById('regDateFilter');

    if (searchInput) searchInput.value = '';
    if (subjectSelect) subjectSelect.value = 'all';
    if (sessionSelect) sessionSelect.value = 'all';
    if (statusSelect) statusSelect.value = 'all';
    if (dateInput) dateInput.value = '';

    filterMasterRegister();
  }

  async function refreshMasterRegister() {
    if (window.showToast) window.showToast('Refreshing attendance register...', 'info');
    await loadMasterRegister();
    if (window.showToast) window.showToast('Attendance register updated!', 'success');
  }

  async function toggleMasterSubmissionStatus(submissionId, newStatus) {
    try {
      const { error } = await window.supaAttendance.updateAttendanceSubmissionStatus(submissionId, newStatus);
      if (error) {
        alert('Failed to update status: ' + error.message);
        return;
      }

      // Update locally
      const item = allRegisterSubmissions.find(s => s.id === submissionId);
      if (item) item.verification_status = newStatus;
      filterMasterRegister();

      if (window.showToast) {
        window.showToast(`Updated status to ${newStatus === 'verified' ? 'Verified Present' : 'Flagged'}`, 'success');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating status: ' + err.message);
    }
  }

  async function deleteMasterSubmission(submissionId) {
    if (!confirm('Are you sure you want to permanently delete this attendance submission? This cannot be undone.')) {
      return;
    }

    try {
      const { error } = await window.supaAttendance.deleteAttendanceSubmission(submissionId);
      if (error) {
        alert('Failed to delete submission: ' + error.message);
        return;
      }

      allRegisterSubmissions = allRegisterSubmissions.filter(s => s.id !== submissionId);
      filterMasterRegister();

      if (window.showToast) {
        window.showToast('Attendance record deleted successfully.', 'success');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting submission: ' + err.message);
    }
  }

  // --------------------------------------------
  // Master Register Export & Excel Copy
  // --------------------------------------------

  function doExportMasterCSV() {
    if (!filteredRegisterSubmissions || filteredRegisterSubmissions.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const headers = [
      'Roll #',
      'Student Name',
      'Index Number',
      'Course / Subject',
      'Session Title',
      'Session Date',
      'Time Checked In',
      'Distance (m)',
      'Status'
    ];

    const rows = filteredRegisterSubmissions.map((s, idx) => [
      `#${String(idx + 1).padStart(3, '0')}`,
      s.full_name || '',
      s.index_number || '',
      s.attendance_sessions?.subject || s.course || 'General',
      s.attendance_sessions?.title || 'Session',
      s.attendance_sessions?.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : ''),
      s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : '',
      typeof s.distance_meters === 'number' ? s.distance_meters.toFixed(1) : (s.is_within_radius ? 'Within Range' : 'N/A'),
      s.verification_status === 'verified' ? 'Verified' : 'Flagged'
    ]);

    const escapeCsvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `PrepTrack_Attendance_Register_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast(`Exported ${rows.length} records to Excel CSV!`, 'success');
    }
  }

  function doCopyMasterToExcel() {
    if (!filteredRegisterSubmissions || filteredRegisterSubmissions.length === 0) {
      alert('No attendance records to copy.');
      return;
    }

    const headers = [
      'Roll #',
      'Student Name',
      'Index Number',
      'Course / Subject',
      'Session Title',
      'Date',
      'Time Checked In',
      'Distance (m)',
      'Status'
    ];

    const lines = [headers.join('\t')];
    filteredRegisterSubmissions.forEach((s, idx) => {
      const roll = `#${String(idx + 1).padStart(3, '0')}`;
      const name = s.full_name || '';
      const indexNum = s.index_number || '';
      const course = s.attendance_sessions?.subject || s.course || 'General';
      const title = s.attendance_sessions?.title || 'Session';
      const date = s.attendance_sessions?.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : '');
      const time = s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : '';
      const dist = typeof s.distance_meters === 'number' ? s.distance_meters.toFixed(1) : (s.is_within_radius ? 'Within Range' : 'N/A');
      const status = s.verification_status === 'verified' ? 'Verified' : 'Flagged';

      lines.push([roll, name, indexNum, course, title, date, time, dist, status].join('\t'));
    });

    const tsvData = lines.join('\r\n');

    navigator.clipboard.writeText(tsvData).then(() => {
      if (window.showToast) {
        window.showToast(`📋 Copied ${filteredRegisterSubmissions.length} records! Paste directly into Excel (Ctrl+V).`, 'success');
      } else {
        alert(`Copied ${filteredRegisterSubmissions.length} attendance records! Paste directly into Excel.`);
      }
    }).catch(err => {
      console.warn('Clipboard write error, falling back to textarea:', err);
      fallbackClipboardCopy(tsvData);
    });
  }

  function fallbackClipboardCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      if (window.showToast) {
        window.showToast('📋 Copied records for Excel!', 'success');
      } else {
        alert('Copied attendance records! Paste into Excel.');
      }
    } catch (e) {
      alert('Unable to copy automatically. Please use the "Export to Excel (CSV)" button instead.');
    }
    document.body.removeChild(textarea);
  }

  function doPrintMasterRegister() {
    if (!filteredRegisterSubmissions || filteredRegisterSubmissions.length === 0) {
      alert('No records to print.');
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Please allow popups to open the printable register.');
      return;
    }

    const printDate = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const total = filteredRegisterSubmissions.length;
    const verified = filteredRegisterSubmissions.filter(s => s.verification_status === 'verified').length;
    const flagged = total - verified;

    let rowsHtml = '';
    filteredRegisterSubmissions.forEach((s, idx) => {
      const roll = `#${String(idx + 1).padStart(3, '0')}`;
      const name = escapeHtml(s.full_name || 'Student');
      const indexNum = escapeHtml(s.index_number || 'N/A');
      const course = escapeHtml(s.attendance_sessions?.subject || s.course || 'General');
      const title = escapeHtml(s.attendance_sessions?.title || 'Session');
      const date = escapeHtml(s.attendance_sessions?.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : ''));
      const time = s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : '';
      const dist = typeof s.distance_meters === 'number' ? `${s.distance_meters.toFixed(1)}m` : 'N/A';
      const status = s.verification_status === 'verified' ? 'Verified Present' : 'Flagged / Out of Range';

      rowsHtml += `
        <tr>
          <td style="text-align:center; font-family:monospace; font-weight:bold;">${roll}</td>
          <td><strong>${name}</strong></td>
          <td style="font-family:monospace;">${indexNum}</td>
          <td>${course}</td>
          <td>${title}</td>
          <td>${date}</td>
          <td>${time}</td>
          <td>${dist}</td>
          <td>${status}</td>
        </tr>
      `;
    });

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PrepTrack - Official Attendance Register</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 28px; color: #1e293b; }
          .header { border-bottom: 2px solid #003bf7; padding-bottom: 14px; margin-bottom: 20px; }
          .header h1 { font-size: 22px; margin: 0 0 6px; color: #003bf7; }
          .header p { margin: 0; font-size: 13px; color: #64748b; }
          .summary-grid { display: flex; gap: 24px; margin-bottom: 20px; font-size: 13px; background: #f8fafc; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: 700; color: #334155; }
          tr:nth-child(even) { background: #fcfcfd; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
          @media print {
            body { padding: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PREPTRACK - OFFICIAL ATTENDANCE REGISTER</h1>
          <p>Generated on: ${printDate} | System-Verified GPS Attendance Roll</p>
        </div>

        <div class="summary-grid">
          <div><strong>Total Records:</strong> ${total}</div>
          <div><strong style="color:#059669;">Verified Present:</strong> ${verified}</div>
          <div><strong style="color:#d97706;">Flagged / Out of Range:</strong> ${flagged}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 55px; text-align:center;">Roll #</th>
              <th>Student Name</th>
              <th>Index Number</th>
              <th>Course / Subject</th>
              <th>Session Title</th>
              <th>Date</th>
              <th>Time</th>
              <th>Distance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>
            <p>Admin / Instructor In Charge: ___________________________</p>
            <p>Designation: ___________________________</p>
          </div>
          <div>
            <p>Signature: ___________________________</p>
            <p>Date: ___________________________</p>
          </div>
        </div>
      </body>
      </html>
    `);

    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 250);
  }

  // --------------------------------------------
  // Realtime Subscriptions
  // --------------------------------------------

  function setupMasterRealtimeSubscription() {
    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
    if (!client || typeof client.channel !== 'function') return;

    try {
      masterRealtimeChannel = client.channel('master-attendance-submissions')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_submissions'
        }, async (payload) => {
          if (!payload || !payload.new) return;
          // Refresh submissions
          const { data } = await window.supaAttendance.getAllAttendanceSubmissions();
          if (data) {
            allRegisterSubmissions = data;
            populateRegisterFilterOptions();
            filterMasterRegister();
            if (window.showToast) {
              window.showToast(`New student check-in: ${payload.new.full_name || 'Student'}`, 'info');
            }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Master realtime subscription error:', e);
    }
  }

  // --------------------------------------------
  // Sessions Management
  // --------------------------------------------

  // Load Sessions
  async function loadSessions() {
    const tbody = document.getElementById('sessionsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading sessions...</td></tr>';

    try {
      const { data: sessions, error } = await window.supaAttendance.getAttendanceSessions();
      if (error) {
        console.error('Error fetching sessions:', error);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:red;">Error: ${escapeHtml(error.message)}</td></tr>`;
        return;
      }

      cachedSessions = sessions || [];
      renderSessionsTable(cachedSessions);
      populateRegisterFilterOptions();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red;">Failed to load attendance sessions.</td></tr>';
    }
  }

  // Render Sessions Table
  function renderSessionsTable(sessions) {
    const tbody = document.getElementById('sessionsTableBody');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:30px;">No attendance sessions found. Click "+ Create New Session" to get started.</td></tr>';
      return;
    }

    const now = new Date();
    let rowsHtml = '';

    sessions.forEach(session => {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      let statusClass = 'scheduled';
      let statusText = session.status || 'scheduled';

      if (session.status === 'active') {
        if (now >= start && now <= end) {
          statusClass = 'active';
          statusText = 'Active Now';
        } else if (now > end) {
          statusClass = 'closed';
          statusText = 'Expired';
        } else {
          statusClass = 'scheduled';
          statusText = 'Active (Upcoming)';
        }
      } else if (session.status === 'closed') {
        statusClass = 'closed';
        statusText = 'Closed';
      }

      const radiusDisplay = session.radius_meters ? `${session.radius_meters}m` : '30m';

      rowsHtml += `
        <tr>
          <td><strong>${escapeHtml(session.title)}</strong></td>
          <td>${escapeHtml(session.subject || 'General')}</td>
          <td>${escapeHtml(session.session_date || '')}</td>
          <td>${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td><span style="font-size:12px;font-weight:600;">${radiusDisplay}</span></td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-sm btn-primary" onclick="window.adminAttendance.viewSessionRecords('${session.id}')">
                Records
              </button>
              <button class="btn btn-sm btn-outline" onclick="window.adminAttendance.toggleSessionStatus('${session.id}', '${session.status}')">
                Toggle Status
              </button>
              <button class="btn btn-sm btn-outline" style="color:#ef4444;border-color:#ef4444;" onclick="window.adminAttendance.deleteSession('${session.id}')">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // Create Session Handler
  async function handleCreateSession(e) {
    e.preventDefault();

    const title = document.getElementById('sessionTitle').value.trim();
    const subject = document.getElementById('sessionSubject').value;
    const sessionDate = document.getElementById('sessionDate').value;
    const startTimeVal = document.getElementById('sessionStartTime').value;
    const endTimeVal = document.getElementById('sessionEndTime').value;
    const durationMinutes = parseInt(document.getElementById('sessionDuration').value, 10) || 60;
    const instructions = document.getElementById('sessionInstructions').value.trim();
    const status = document.getElementById('sessionStatus').value;
    const locationName = document.getElementById('sessionLocationName').value.trim();
    const lat = parseFloat(document.getElementById('sessionLat').value);
    const lng = parseFloat(document.getElementById('sessionLng').value);

    let radius = 30;
    const radiusSelect = document.getElementById('sessionRadius').value;
    if (radiusSelect === 'custom') {
      radius = parseInt(document.getElementById('sessionCustomRadius').value, 10) || 30;
    } else {
      radius = parseInt(radiusSelect, 10) || 30;
    }

    if (!title || !subject || !sessionDate || !startTimeVal || !endTimeVal) {
      alert('Please fill in all required fields.');
      return;
    }

    if (isNaN(lat) || isNaN(lng)) {
      const proceed = confirm('No reference location coordinates captured. Geofencing verification will fail for students. Do you want to proceed anyway?');
      if (!proceed) return;
    }

    const payload = {
      title,
      subject,
      session_date: sessionDate,
      start_time: new Date(startTimeVal).toISOString(),
      end_time: new Date(endTimeVal).toISOString(),
      duration_minutes: durationMinutes,
      instructions: instructions || null,
      status: status || 'scheduled',
      location_name: locationName || null,
      reference_lat: !isNaN(lat) ? lat : null,
      reference_lng: !isNaN(lng) ? lng : null,
      radius_meters: radius
    };

    try {
      const { data, error } = await window.supaAttendance.createAttendanceSession(payload);
      if (error) {
        alert('Failed to create session: ' + error.message);
        return;
      }

      if (window.showToast) {
        window.showToast('Attendance session created successfully!', 'success');
      } else {
        alert('Attendance session created successfully!');
      }

      toggleCreateForm();
      await loadSessions();
      await loadMasterRegister();
    } catch (err) {
      console.error(err);
      alert('Error creating session: ' + err.message);
    }
  }

  // Toggle Status: scheduled -> active -> closed -> scheduled
  async function toggleSessionStatus(id, currentStatus) {
    let nextStatus = 'active';
    if (currentStatus === 'scheduled') nextStatus = 'active';
    else if (currentStatus === 'active') nextStatus = 'closed';
    else nextStatus = 'scheduled';

    try {
      const { error } = await window.supaAttendance.updateAttendanceSession(id, { status: nextStatus });
      if (error) {
        alert('Failed to update status: ' + error.message);
        return;
      }
      await loadSessions();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // Delete Session
  async function deleteSession(id) {
    if (!confirm('Are you sure you want to delete this session and all its attendance records?')) {
      return;
    }

    try {
      const { error } = await window.supaAttendance.deleteAttendanceSession(id);
      if (error) {
        alert('Failed to delete session: ' + error.message);
        return;
      }
      await loadSessions();
      await loadMasterRegister();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // --------------------------------------------
  // Single Session Feed / Records View
  // --------------------------------------------

  async function viewSessionRecords(sessionId) {
    currentSession = cachedSessions.find(s => s.id === sessionId);
    if (!currentSession) {
      const { data } = await window.supaAttendance.getAttendanceSessions();
      cachedSessions = data || [];
      currentSession = cachedSessions.find(s => s.id === sessionId);
    }

    const recordsTabBtn = document.getElementById('recordsTabBtn');
    const sessionLabel = document.getElementById('currentSessionLabel');
    const headerInfo = document.getElementById('sessionInfoHeader');

    if (recordsTabBtn) {
      recordsTabBtn.style.display = 'inline-block';
    }
    if (sessionLabel && currentSession) {
      sessionLabel.textContent = `(${currentSession.title})`;
    }
    if (headerInfo && currentSession) {
      headerInfo.innerHTML = `
        <h3 style="margin:0 0 4px 0; font-size:1.1rem;">${escapeHtml(currentSession.title)}</h3>
        <p style="margin:0; font-size:0.85rem; color:var(--text-light);">
          <strong>Subject:</strong> ${escapeHtml(currentSession.subject || 'N/A')} | 
          <strong>Date:</strong> ${escapeHtml(currentSession.session_date || '')} | 
          <strong>Location:</strong> ${escapeHtml(currentSession.location_name || 'N/A')} (${currentSession.radius_meters || 30}m radius)
        </p>
      `;
    }

    switchTab('records-tab');
    await loadSubmissions(sessionId);
    setupRealtimeSubscription(sessionId);
  }

  function backToSessions() {
    cleanupSubscription();
    switchTab('sessions-tab');
  }

  async function loadSubmissions(sessionId) {
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading submissions...</td></tr>';

    try {
      const { data, error } = await window.supaAttendance.getAttendanceSubmissions(sessionId);
      if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error: ${escapeHtml(error.message)}</td></tr>`;
        return;
      }
      currentSubmissions = data || [];
      renderSubmissionsTable(currentSubmissions);
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Failed to load records.</td></tr>';
    }
  }

  function renderSubmissionsTable(submissions) {
    const tbody = document.getElementById('recordsTableBody');
    const totalPresentBadge = document.getElementById('totalPresentBadge');
    if (!tbody) return;

    if (totalPresentBadge) {
      const presentCount = submissions.filter(s => s.verification_status === 'verified').length;
      totalPresentBadge.textContent = `Total Present: ${presentCount}`;
    }

    if (!submissions || submissions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-light);">No attendance records submitted yet.</td></tr>';
      return;
    }

    let rowsHtml = '';
    submissions.forEach((s, idx) => {
      const timeStr = s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : 'N/A';
      const distStr = typeof s.distance_meters === 'number' ? `${s.distance_meters.toFixed(1)}m` : 'N/A';
      const isVerified = s.verification_status === 'verified';

      rowsHtml += `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(s.full_name || 'Student')}</strong></td>
          <td><span class="register-index-tag">${escapeHtml(s.index_number || 'N/A')}</span></td>
          <td>${timeStr}</td>
          <td>${distStr}</td>
          <td><span class="status-badge ${isVerified ? 'verified' : 'rejected'}">${isVerified ? 'Verified' : 'Flagged'}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // Filter Records in single session view
  function filterRecords() {
    const searchVal = (document.getElementById('recordsSearch')?.value || '').toLowerCase();
    const statusVal = document.getElementById('recordsFilter')?.value || 'all';

    let filtered = currentSubmissions.filter(s => {
      const matchesSearch = (s.full_name || '').toLowerCase().includes(searchVal) ||
                            (s.index_number || '').toLowerCase().includes(searchVal);
      const matchesStatus = statusVal === 'all' || s.verification_status === statusVal;
      return matchesSearch && matchesStatus;
    });

    renderSubmissionsTable(filtered);
  }

  // Real-time Postgres Changes for single session
  function setupRealtimeSubscription(sessionId) {
    cleanupSubscription();

    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
    if (!client || typeof client.channel !== 'function') return;

    try {
      activeRealtimeChannel = client.channel(`attendance-${sessionId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_submissions',
          filter: `session_id=eq.${sessionId}`
        }, handleNewSubmission)
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription error:', e);
    }
  }

  function handleNewSubmission(payload) {
    if (!payload || !payload.new) return;
    const exists = currentSubmissions.some(s => s.id === payload.new.id);
    if (!exists) {
      currentSubmissions.push(payload.new);
      filterRecords();
      if (window.showToast) {
        window.showToast(`New attendance check-in: ${payload.new.full_name}`, 'info');
      }
    }
  }

  function cleanupSubscription() {
    if (activeRealtimeChannel) {
      const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
      if (client && typeof client.removeChannel === 'function') {
        client.removeChannel(activeRealtimeChannel);
      }
      activeRealtimeChannel = null;
    }
  }

  // Single session export CSV
  function exportCSV(submissions, sessionTitle) {
    const rows = [['Name', 'Index Number', 'Course', 'Time Submitted', 'Distance (m)', 'Status']];
    submissions.forEach(s => {
      rows.push([
        s.full_name,
        s.index_number,
        s.course || '',
        new Date(s.submitted_at).toLocaleString(),
        s.distance_meters != null ? s.distance_meters.toFixed(1) : 'N/A',
        s.verification_status
      ]);
    });

    const csv = '\uFEFF' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (sessionTitle || 'attendance') + '_attendance.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doExportCSV() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to export.');
      return;
    }
    const title = currentSession ? currentSession.title.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Session';
    exportCSV(currentSubmissions, title);
  }

  // Single session copy to clipboard for Excel
  function copyToClipboard(submissions) {
    const header = 'Name\tIndex Number\tTime Submitted\tDistance (m)\tStatus';
    const rows = submissions.map(s =>
      `${s.full_name}\t${s.index_number}\t${new Date(s.submitted_at).toLocaleString()}\t${s.distance_meters != null ? s.distance_meters.toFixed(1) : 'N/A'}\t${s.verification_status}`
    );
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => {
      if (window.showToast) window.showToast('Copied to clipboard!', 'success');
      else alert('Records copied to clipboard! Paste into Excel.');
    }).catch(err => {
      fallbackClipboardCopy([header, ...rows].join('\n'));
    });
  }

  function doCopyToExcel() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to copy.');
      return;
    }
    copyToClipboard(currentSubmissions);
  }

  // Single session print
  function printAttendance(submissions, session) {
    const w = window.open('', '_blank');
    if (!w) {
      alert('Please allow pop-ups to print attendance sheet.');
      return;
    }

    const title = session ? session.title : 'Attendance';
    const subject = session ? session.subject : '';
    const dateStr = session ? session.session_date : '';
    const startStr = session ? new Date(session.start_time).toLocaleTimeString() : '';
    const endStr = session ? new Date(session.end_time).toLocaleTimeString() : '';

    w.document.write(`<html><head><title>Attendance - ${escapeHtml(title)}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1e293b}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #cbd5e1;padding:8px 12px;text-align:left;font-size:13px}
      th{background:#f1f5f9;font-weight:bold}
      h1{font-size:20px;margin-bottom:6px}
      h2{font-size:14px;color:#64748b;margin-top:0}
      .footer{margin-top:40px;display:flex;justify-content:space-between}
      @media print{button{display:none}}
    </style></head><body>`);

    w.document.write(`<h1>${escapeHtml(title)}</h1>`);
    w.document.write(`<h2>Subject: ${escapeHtml(subject)} | Date: ${escapeHtml(dateStr)} | Time: ${startStr} - ${endStr}</h2>`);
    w.document.write(`<p><strong>Total Present:</strong> ${submissions.length}</p>`);
    w.document.write(`<table><thead><tr><th>#</th><th>Full Name</th><th>Index Number</th><th>Time Submitted</th><th>Distance (m)</th><th>Status</th></tr></thead><tbody>`);

    submissions.forEach((s, i) => {
      const dist = s.distance_meters != null ? s.distance_meters.toFixed(1) + 'm' : 'N/A';
      w.document.write(`<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(s.full_name)}</td>
        <td>${escapeHtml(s.index_number || '')}</td>
        <td>${new Date(s.submitted_at).toLocaleString()}</td>
        <td>${dist}</td>
        <td>${escapeHtml(s.verification_status || 'verified')}</td>
      </tr>`);
    });

    w.document.write(`</tbody></table>`);
    w.document.write(`<div class="footer"><p>Admin Signature: _____________________</p><p>Date: _______________</p></div></body></html>`);
    w.document.close();
    w.print();
  }

  function doPrint() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to print.');
      return;
    }
    printAttendance(currentSubmissions, currentSession);
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose to window for inline HTML handlers
  window.adminAttendance = {
    // Master Register
    loadMasterRegister,
    populateRegisterFilterOptions,
    filterMasterRegister,
    resetMasterFilters,
    refreshMasterRegister,
    toggleMasterSubmissionStatus,
    deleteMasterSubmission,
    doExportMasterCSV,
    doCopyMasterToExcel,
    doPrintMasterRegister,

    // Session Management
    toggleCreateForm,
    handleRadiusChange,
    getAdminLocation,
    handleCreateSession,
    toggleSessionStatus,
    deleteSession,

    // Individual Session Records Feed
    viewSessionRecords,
    backToSessions,
    filterRecords,
    doExportCSV,
    doCopyToExcel,
    doPrint
  };

})();
