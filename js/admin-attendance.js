// ============================================
// PrepTrack - Admin Attendance Management Logic
// ============================================

(function () {
  'use strict';

  // Protect admin route
  const isAdmin = localStorage.getItem('preptrack_is_admin') === 'true' || localStorage.getItem('ntc_is_admin') === 'true';
  if (!isAdmin) {
    window.location.href = '/pages/dashboard.html';
    return;
  }

  let activeRealtimeChannel = null;
  let currentSession = null;
  let currentSubmissions = [];
  let cachedSessions = [];

  document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    await loadSubjects();
    await loadSessions();

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

    if (tabId === 'sessions-tab' && activeRealtimeChannel) {
      cleanupSubscription();
    }
  }

  // Load subject options
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
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // Records View
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
          <td>${escapeHtml(s.index_number || 'N/A')}</td>
          <td>${timeStr}</td>
          <td>${distStr}</td>
          <td><span class="status-badge ${isVerified ? 'verified' : 'rejected'}">${escapeHtml(s.verification_status || 'verified')}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // Filter Records
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

  // Real-time Postgres Changes
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

  // Export CSV
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

    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (sessionTitle || 'attendance') + '_attendance.csv';
    a.click();
  }

  function doExportCSV() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to export.');
      return;
    }
    const title = currentSession ? currentSession.title.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Session';
    exportCSV(currentSubmissions, title);
  }

  // Copy To Clipboard for Excel
  function copyToClipboard(submissions) {
    const header = 'Name\tIndex Number\tTime Submitted\tDistance (m)\tStatus';
    const rows = submissions.map(s =>
      `${s.full_name}\t${s.index_number}\t${new Date(s.submitted_at).toLocaleString()}\t${s.distance_meters != null ? s.distance_meters.toFixed(1) : 'N/A'}\t${s.verification_status}`
    );
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => {
      if (window.showToast) window.showToast('Copied to clipboard!', 'success');
      else alert('Records copied to clipboard! Paste into Excel.');
    }).catch(err => {
      alert('Failed to copy to clipboard: ' + err.message);
    });
  }

  function doCopyToExcel() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to copy.');
      return;
    }
    copyToClipboard(currentSubmissions);
  }

  // Print Attendance Sheet
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
    toggleCreateForm,
    handleRadiusChange,
    getAdminLocation,
    handleCreateSession,
    toggleSessionStatus,
    deleteSession,
    viewSessionRecords,
    backToSessions,
    filterRecords,
    doExportCSV,
    doCopyToExcel,
    doPrint
  };

})();
