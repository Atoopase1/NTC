// ============================================
// PrepTrack - Admin Attendance Management Logic
// Supports Class Name, Week, Time, Course, Total Days Present
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
  let activeRegisterView = 'detail'; // 'detail' or 'summary'
  let studentDaysPresentMap = new Map(); // key -> Set of distinct dates/sessions

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

  // Switch between 'detail' (individual logs) and 'summary' (class roll summary)
  function switchRegisterView(view) {
    activeRegisterView = view;
    const detailBtn = document.getElementById('viewDetailBtn');
    const summaryBtn = document.getElementById('viewSummaryBtn');

    if (view === 'detail') {
      if (detailBtn) detailBtn.classList.add('active');
      if (summaryBtn) summaryBtn.classList.remove('active');
    } else {
      if (detailBtn) detailBtn.classList.remove('active');
      if (summaryBtn) summaryBtn.classList.add('active');
    }

    updateRegisterThead();
    renderMasterRegister(filteredRegisterSubmissions);
  }

  function updateRegisterThead() {
    const thead = document.getElementById('masterRegisterThead');
    if (!thead) return;

    if (activeRegisterView === 'detail') {
      thead.innerHTML = `
        <tr>
          <th style="width: 70px;">Roll #</th>
          <th>Student</th>
          <th>Index Number</th>
          <th>Class Name</th>
          <th>Course</th>
          <th>Week</th>
          <th>Time</th>
          <th>Total Days Present</th>
          <th>Status</th>
          <th style="text-align: right; min-width: 110px;">Actions</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th style="width: 70px;">Roll #</th>
          <th>Student</th>
          <th>Index Number</th>
          <th>Class Name</th>
          <th>Course</th>
          <th>Total Days Present</th>
          <th>Attendance Rate</th>
          <th>Latest Week</th>
          <th>Latest Time</th>
          <th style="text-align: right; min-width: 110px;">Actions</th>
        </tr>
      `;
    }
  }

  // Helper: Extract or fallback Class Name from session metadata
  function extractSessionClass(session) {
    if (!session) return 'Class A';
    if (session.class_name && session.class_name.trim()) return session.class_name.trim();

    // Check instructions for [Class: ...]
    if (session.instructions) {
      const match = session.instructions.match(/\[Class:\s*([^\]]+)\]/i);
      if (match && match[1]) return match[1].trim();
    }

    // Check title for [Class: ...] or (Class ...)
    if (session.title) {
      const match = session.title.match(/\[(?:Class|Cohort):\s*([^\]]+)\]/i) ||
                    session.title.match(/\((?:Class|Cohort):\s*([^\)]+)\)/i);
      if (match && match[1]) return match[1].trim();
    }

    return 'Class A';
  }

  // Helper: Extract or fallback Week Number from session metadata
  function extractSessionWeek(session) {
    if (!session) return 'Week 1';
    if (session.week && session.week.trim()) return session.week.trim();

    // Check instructions for [Week: ...]
    if (session.instructions) {
      const match = session.instructions.match(/\[Week:\s*([^\]]+)\]/i);
      if (match && match[1]) return match[1].trim();
    }

    // Check title for Week X or Wk X
    if (session.title) {
      const match = session.title.match(/\b(Week\s*\d+|Wk\s*\d+)\b/i);
      if (match && match[1]) return match[1].replace(/wk/i, 'Week ').trim();
    }

    // Derive from session date
    if (session.session_date) {
      const d = new Date(session.session_date);
      if (!isNaN(d.getTime())) {
        const startOfYear = new Date(d.getFullYear(), 0, 1);
        const pastDays = (d - startOfYear) / 86400000;
        const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
        const academicWeek = ((weekNum - 1) % 16) + 1;
        return `Week ${academicWeek}`;
      }
    }

    return 'Week 1';
  }

  // Helper: Calculate Total Days Present map
  function recalculateDaysPresent(submissions) {
    studentDaysPresentMap.clear();

    submissions.forEach(sub => {
      if (sub.verification_status === 'verified') {
        const studentKey = (sub.user_id || sub.index_number || sub.full_name || '').trim().toLowerCase();
        if (!studentKey) return;

        const session = sub.attendance_sessions || {};
        const course = (session.subject || sub.course || 'General').trim().toLowerCase();
        const className = extractSessionClass(session).toLowerCase();
        const dateKey = session.session_date || (sub.submitted_at ? sub.submitted_at.split('T')[0] : sub.id);

        // Overall student days
        if (!studentDaysPresentMap.has(studentKey)) {
          studentDaysPresentMap.set(studentKey, new Set());
        }
        studentDaysPresentMap.get(studentKey).add(dateKey);

        // Course-specific student days
        const courseKey = `${studentKey}:::${course}`;
        if (!studentDaysPresentMap.has(courseKey)) {
          studentDaysPresentMap.set(courseKey, new Set());
        }
        studentDaysPresentMap.get(courseKey).add(dateKey);

        // Class & Course specific student days
        const classCourseKey = `${studentKey}:::${className}:::${course}`;
        if (!studentDaysPresentMap.has(classCourseKey)) {
          studentDaysPresentMap.set(classCourseKey, new Set());
        }
        studentDaysPresentMap.get(classCourseKey).add(dateKey);
      }
    });
  }

  // Get total days present for a student in context
  function getStudentDaysPresent(sub) {
    const studentKey = (sub.user_id || sub.index_number || sub.full_name || '').trim().toLowerCase();
    if (!studentKey) return 0;

    const session = sub.attendance_sessions || {};
    const course = (session.subject || sub.course || 'General').trim().toLowerCase();
    const className = extractSessionClass(session).toLowerCase();

    const classCourseKey = `${studentKey}:::${className}:::${course}`;
    if (studentDaysPresentMap.has(classCourseKey) && studentDaysPresentMap.get(classCourseKey).size > 0) {
      return studentDaysPresentMap.get(classCourseKey).size;
    }

    const courseKey = `${studentKey}:::${course}`;
    if (studentDaysPresentMap.has(courseKey) && studentDaysPresentMap.get(courseKey).size > 0) {
      return studentDaysPresentMap.get(courseKey).size;
    }

    return studentDaysPresentMap.get(studentKey)?.size || (sub.verification_status === 'verified' ? 1 : 0);
  }

  // Load subject options for creation form
  async function loadSubjects() {
    const select = document.getElementById('sessionSubject');
    if (!select) return;

    try {
      if (window.supaDB && typeof window.supaDB.getSubjects === 'function') {
        const subjects = await window.supaDB.getSubjects();
        if (subjects && subjects.length > 0) {
          select.innerHTML = '<option value="" disabled selected>Select a subject / course</option>' +
            subjects.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
          return;
        }
      }
    } catch (e) {
      console.warn('Could not load subjects from supaDB:', e);
    }

    // Default fallback subjects
    const defaults = ['General Education', 'Numeracy Skills', 'Literacy Skills', 'Essential Skills', 'Pedagogy'];
    select.innerHTML = '<option value="" disabled selected>Select a subject / course</option>' +
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
      recalculateDaysPresent(allRegisterSubmissions);
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
    const classSelect = document.getElementById('regClassFilter');
    const subjectSelect = document.getElementById('regSubjectFilter');
    const weekSelect = document.getElementById('regWeekFilter');
    const sessionSelect = document.getElementById('regSessionFilter');

    // 1. Populate Class Names
    if (classSelect) {
      const classesSet = new Set(['Class A', 'Class B', 'Class C', 'General Class']);
      allRegisterSubmissions.forEach(s => {
        const cls = extractSessionClass(s.attendance_sessions);
        if (cls) classesSet.add(cls);
      });
      cachedSessions.forEach(s => {
        const cls = extractSessionClass(s);
        if (cls) classesSet.add(cls);
      });

      const currentVal = classSelect.value;
      let optionsHtml = '<option value="all">All Classes</option>';
      Array.from(classesSet).sort().forEach(cls => {
        optionsHtml += `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`;
      });
      classSelect.innerHTML = optionsHtml;
      if (classesSet.has(currentVal)) classSelect.value = currentVal;
    }

    // 2. Populate Subjects / Courses
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

    // 3. Populate Weeks
    if (weekSelect) {
      const weeksSet = new Set();
      // Preload standard Weeks 1-16
      for (let w = 1; w <= 16; w++) weeksSet.add(`Week ${w}`);
      allRegisterSubmissions.forEach(s => {
        const wk = extractSessionWeek(s.attendance_sessions);
        if (wk) weeksSet.add(wk);
      });
      cachedSessions.forEach(s => {
        const wk = extractSessionWeek(s);
        if (wk) weeksSet.add(wk);
      });

      const currentVal = weekSelect.value;
      let optionsHtml = '<option value="all">All Weeks</option>';
      Array.from(weeksSet).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }).forEach(wk => {
        optionsHtml += `<option value="${escapeHtml(wk)}">${escapeHtml(wk)}</option>`;
      });
      weekSelect.innerHTML = optionsHtml;
      if (weeksSet.has(currentVal)) weekSelect.value = currentVal;
    }
  }

  function filterMasterRegister() {
    const searchVal = (document.getElementById('regSearchInput')?.value || '').toLowerCase().trim();
    const classVal = document.getElementById('regClassFilter')?.value || 'all';
    const subjectVal = document.getElementById('regSubjectFilter')?.value || 'all';
    const weekVal = document.getElementById('regWeekFilter')?.value || 'all';
    const statusVal = document.getElementById('regStatusFilter')?.value || 'all';
    const dateVal = document.getElementById('regDateFilter')?.value || '';

    filteredRegisterSubmissions = allRegisterSubmissions.filter(s => {
      const session = s.attendance_sessions || {};
      const className = extractSessionClass(session);
      const weekName = extractSessionWeek(session);
      const courseName = session.subject || s.course || 'General';

      // Search match
      if (searchVal) {
        const name = (s.full_name || '').toLowerCase();
        const indexNum = (s.index_number || '').toLowerCase();
        const cls = className.toLowerCase();
        const course = courseName.toLowerCase();
        const wk = weekName.toLowerCase();
        const title = (session.title || '').toLowerCase();
        if (!name.includes(searchVal) &&
            !indexNum.includes(searchVal) &&
            !cls.includes(searchVal) &&
            !course.includes(searchVal) &&
            !wk.includes(searchVal) &&
            !title.includes(searchVal)) {
          return false;
        }
      }

      // Class match
      if (classVal !== 'all') {
        if (className.toLowerCase() !== classVal.toLowerCase()) return false;
      }

      // Course / Subject match
      if (subjectVal !== 'all') {
        if (courseName.toLowerCase() !== subjectVal.toLowerCase()) return false;
      }

      // Week match
      if (weekVal !== 'all') {
        if (weekName.toLowerCase() !== weekVal.toLowerCase()) return false;
      }

      // Status match
      if (statusVal !== 'all') {
        const isVerified = s.verification_status === 'verified';
        if (statusVal === 'verified' && !isVerified) return false;
        if (statusVal === 'rejected' && isVerified) return false;
      }

      // Date match
      if (dateVal) {
        const sDate = session.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : '');
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

    if (activeRegisterView === 'detail') {
      renderDetailRegister(submissions, tbody);
    } else {
      renderSummaryRegister(submissions, tbody);
    }
  }

  // Render View 1: Detailed Attendance Logs (Student, Index, Class Name, Course, Week, Time, Total Days Present, Status)
  function renderDetailRegister(submissions, tbody) {
    let rowsHtml = '';
    submissions.forEach((s, idx) => {
      const rollNum = `#${String(idx + 1).padStart(3, '0')}`;
      const studentName = escapeHtml(s.full_name || 'Student');
      const indexNum = escapeHtml(s.index_number || 'N/A');

      const session = s.attendance_sessions || {};
      const className = escapeHtml(extractSessionClass(session));
      const courseName = escapeHtml(session.subject || s.course || 'General Education');
      const weekName = escapeHtml(extractSessionWeek(session));

      let timeStr = '—';
      if (s.submitted_at) {
        timeStr = new Date(s.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      const totalDays = getStudentDaysPresent(s);
      const isVerified = s.verification_status === 'verified';
      const statusBadge = isVerified
        ? `<span class="status-badge verified">Verified</span>`
        : `<span class="status-badge rejected">Flagged</span>`;

      const nextStatus = isVerified ? 'rejected' : 'verified';

      rowsHtml += `
        <tr>
          <td><span class="register-roll-tag">${rollNum}</span></td>
          <td><strong>${studentName}</strong></td>
          <td><span class="register-index-tag">${indexNum}</span></td>
          <td><span class="register-class-tag">${className}</span></td>
          <td>${courseName}</td>
          <td><span class="register-week-tag">${weekName}</span></td>
          <td>${timeStr}</td>
          <td><span class="register-days-tag">📅 ${totalDays} ${totalDays === 1 ? 'Day' : 'Days'} Present</span></td>
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

  // Render View 2: Class Roll Summary (Aggregated by Student per Class & Course)
  function renderSummaryRegister(submissions, tbody) {
    const studentSummaryMap = new Map();

    submissions.forEach(s => {
      const studentKey = (s.user_id || s.index_number || s.full_name || '').trim().toLowerCase();
      const session = s.attendance_sessions || {};
      const className = extractSessionClass(session);
      const courseName = session.subject || s.course || 'General Education';
      const mapKey = `${studentKey}:::${className}:::${courseName}`;

      if (!studentSummaryMap.has(mapKey)) {
        studentSummaryMap.set(mapKey, {
          studentName: s.full_name || 'Student',
          indexNumber: s.index_number || 'N/A',
          className: className,
          courseName: courseName,
          verifiedDates: new Set(),
          totalSessionsEncountered: 0,
          latestWeek: extractSessionWeek(session),
          latestTime: s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
          latestSubmissionId: s.id,
          latestStatus: s.verification_status
        });
      }

      const entry = studentSummaryMap.get(mapKey);
      entry.totalSessionsEncountered++;
      if (s.verification_status === 'verified') {
        const dateKey = session.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : s.id);
        entry.verifiedDates.add(dateKey);
      }
    });

    const summaryList = Array.from(studentSummaryMap.values()).sort((a, b) => a.studentName.localeCompare(b.studentName));

    let rowsHtml = '';
    summaryList.forEach((st, idx) => {
      const rollNum = `#${String(idx + 1).padStart(3, '0')}`;
      const daysCount = st.verifiedDates.size;
      const ratePct = st.totalSessionsEncountered > 0 ? Math.round((daysCount / st.totalSessionsEncountered) * 100) : 100;
      const rateBadgeColor = ratePct >= 75 ? '#059669' : ratePct >= 50 ? '#d97706' : '#dc2626';

      rowsHtml += `
        <tr>
          <td><span class="register-roll-tag">${rollNum}</span></td>
          <td><strong>${escapeHtml(st.studentName)}</strong></td>
          <td><span class="register-index-tag">${escapeHtml(st.indexNumber)}</span></td>
          <td><span class="register-class-tag">${escapeHtml(st.className)}</span></td>
          <td>${escapeHtml(st.courseName)}</td>
          <td><span class="register-days-tag">📅 ${daysCount} ${daysCount === 1 ? 'Day' : 'Days'} Present</span></td>
          <td><span style="font-weight:700; color:${rateBadgeColor};">${ratePct}%</span></td>
          <td><span class="register-week-tag">${escapeHtml(st.latestWeek)}</span></td>
          <td>${escapeHtml(st.latestTime)}</td>
          <td style="text-align: right;">
            <button class="btn btn-sm btn-outline" onclick="window.adminAttendance.filterByStudent('${escapeHtml(st.indexNumber)}')">
              View History
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  function filterByStudent(indexNum) {
    const searchInput = document.getElementById('regSearchInput');
    if (searchInput) searchInput.value = indexNum;
    switchRegisterView('detail');
    filterMasterRegister();
  }

  function resetMasterFilters() {
    const searchInput = document.getElementById('regSearchInput');
    const classSelect = document.getElementById('regClassFilter');
    const subjectSelect = document.getElementById('regSubjectFilter');
    const weekSelect = document.getElementById('regWeekFilter');
    const statusSelect = document.getElementById('regStatusFilter');
    const dateInput = document.getElementById('regDateFilter');

    if (searchInput) searchInput.value = '';
    if (classSelect) classSelect.value = 'all';
    if (subjectSelect) subjectSelect.value = 'all';
    if (weekSelect) weekSelect.value = 'all';
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
      recalculateDaysPresent(allRegisterSubmissions);
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
      recalculateDaysPresent(allRegisterSubmissions);
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
  // (student, index, class name, course, week, time, total days present)
  // --------------------------------------------

  function doExportMasterCSV() {
    if (!filteredRegisterSubmissions || filteredRegisterSubmissions.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const headers = [
      'Roll #',
      'Student',
      'Index',
      'Class Name',
      'Course',
      'Week',
      'Time',
      'Total Days Present',
      'Status'
    ];

    const rows = filteredRegisterSubmissions.map((s, idx) => {
      const session = s.attendance_sessions || {};
      const roll = `#${String(idx + 1).padStart(3, '0')}`;
      const student = s.full_name || '';
      const index = s.index_number || '';
      const className = extractSessionClass(session);
      const course = session.subject || s.course || 'General Education';
      const week = extractSessionWeek(session);
      const time = s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : '';
      const totalDays = getStudentDaysPresent(s);
      const status = s.verification_status === 'verified' ? 'Verified' : 'Flagged';

      return [roll, student, index, className, course, week, time, `${totalDays} Days Present`, status];
    });

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
      'Student',
      'Index',
      'Class Name',
      'Course',
      'Week',
      'Time',
      'Total Days Present',
      'Status'
    ];

    const lines = [headers.join('\t')];
    filteredRegisterSubmissions.forEach((s, idx) => {
      const session = s.attendance_sessions || {};
      const roll = `#${String(idx + 1).padStart(3, '0')}`;
      const student = s.full_name || '';
      const index = s.index_number || '';
      const className = extractSessionClass(session);
      const course = session.subject || s.course || 'General Education';
      const week = extractSessionWeek(session);
      const time = s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : '';
      const totalDays = getStudentDaysPresent(s);
      const status = s.verification_status === 'verified' ? 'Verified' : 'Flagged';

      lines.push([roll, student, index, className, course, week, time, `${totalDays} Days Present`, status].join('\t'));
    });

    const tsvData = lines.join('\r\n');

    navigator.clipboard.writeText(tsvData).then(() => {
      if (window.showToast) {
        window.showToast(`📋 Copied ${filteredRegisterSubmissions.length} records! Ready to paste directly into Excel (Ctrl+V).`, 'success');
      } else {
        alert(`Copied ${filteredRegisterSubmissions.length} records for Excel!`);
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
      const session = s.attendance_sessions || {};
      const roll = `#${String(idx + 1).padStart(3, '0')}`;
      const student = escapeHtml(s.full_name || 'Student');
      const index = escapeHtml(s.index_number || 'N/A');
      const className = escapeHtml(extractSessionClass(session));
      const course = escapeHtml(session.subject || s.course || 'General Education');
      const week = escapeHtml(extractSessionWeek(session));
      const time = s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : '—';
      const totalDays = getStudentDaysPresent(s);
      const status = s.verification_status === 'verified' ? 'Verified' : 'Flagged';

      rowsHtml += `
        <tr>
          <td style="text-align:center; font-family:monospace; font-weight:bold;">${roll}</td>
          <td><strong>${student}</strong></td>
          <td style="font-family:monospace;">${index}</td>
          <td>${className}</td>
          <td>${course}</td>
          <td>${week}</td>
          <td>${time}</td>
          <td style="font-weight:bold;">${totalDays} Days Present</td>
          <td>${status}</td>
        </tr>
      `;
    });

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PrepTrack - Official Academic Attendance Register</title>
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
          <h1>PREPTRACK - OFFICIAL ACADEMIC ATTENDANCE REGISTER</h1>
          <p>Generated on: ${printDate} | Records: Student, Index, Class Name, Course, Week, Time, Total Days Present</p>
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
              <th>Student</th>
              <th>Index</th>
              <th>Class Name</th>
              <th>Course</th>
              <th>Week</th>
              <th>Time</th>
              <th>Total Days Present</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>
            <p>Admin / Class Instructor: ___________________________</p>
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
            recalculateDaysPresent(allRegisterSubmissions);
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

    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Loading sessions...</td></tr>';

    try {
      const { data: sessions, error } = await window.supaAttendance.getAttendanceSessions();
      if (error) {
        console.error('Error fetching sessions:', error);
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:red;">Error: ${escapeHtml(error.message)}</td></tr>`;
        return;
      }

      cachedSessions = sessions || [];
      renderSessionsTable(cachedSessions);
      populateRegisterFilterOptions();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:red;">Failed to load attendance sessions.</td></tr>';
    }
  }

  // Render Sessions Table (Includes Title, Class Name, Subject/Course, Week, Date, Times, Radius, Status, Actions)
  function renderSessionsTable(sessions) {
    const tbody = document.getElementById('sessionsTableBody');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-light);padding:30px;">No attendance sessions found. Click "+ Create New Session" to get started.</td></tr>';
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
      const className = extractSessionClass(session);
      const weekName = extractSessionWeek(session);

      rowsHtml += `
        <tr>
          <td><strong>${escapeHtml(session.title)}</strong></td>
          <td><span class="register-class-tag">${escapeHtml(className)}</span></td>
          <td>${escapeHtml(session.subject || 'General')}</td>
          <td><span class="register-week-tag">${escapeHtml(weekName)}</span></td>
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

  // Create Session Handler (Saves Class Name & Week)
  async function handleCreateSession(e) {
    e.preventDefault();

    const title = document.getElementById('sessionTitle').value.trim();
    const subject = document.getElementById('sessionSubject').value;
    const className = (document.getElementById('sessionClassName')?.value || '').trim() || 'Class A';
    const week = document.getElementById('sessionWeek')?.value || 'Week 1';
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
      class_name: className,
      week: week,
      session_date: sessionDate,
      start_time: new Date(startTimeVal).toISOString(),
      end_time: new Date(endTimeVal).toISOString(),
      duration_minutes: durationMinutes,
      instructions: instructions ? `[Class: ${className}] [Week: ${week}] ${instructions}` : `[Class: ${className}] [Week: ${week}]`,
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
        window.showToast(`Attendance session created for ${className} (${week})!`, 'success');
      } else {
        alert(`Attendance session created for ${className} (${week})!`);
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

    const className = extractSessionClass(currentSession);
    const weekName = extractSessionWeek(currentSession);

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
          <strong>Class:</strong> ${escapeHtml(className)} | 
          <strong>Subject:</strong> ${escapeHtml(currentSession.subject || 'N/A')} | 
          <strong>Week:</strong> ${escapeHtml(weekName)} | 
          <strong>Date:</strong> ${escapeHtml(currentSession.session_date || '')} | 
          <strong>Location:</strong> ${escapeHtml(currentSession.location_name || 'N/A')} (${currentSession.radius_meters || 30}m)
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
    // Master Register & Views
    loadMasterRegister,
    switchRegisterView,
    populateRegisterFilterOptions,
    filterMasterRegister,
    filterByStudent,
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
