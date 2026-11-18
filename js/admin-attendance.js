// ============================================
// PrepTrack - Course-Based Attendance Dashboard & Ranking Logic
// Transforms attendance into an intuitive course-driven dashboard
// while fully preserving all historical records, GPS verification & session controls
// ============================================

(function () {
  'use strict';

  // Expose immediate modal handlers on window and window.adminAttendance
  window.openAddCourseModal = openAddCourseModal;
  window.closeAddCourseModal = closeAddCourseModal;
  window.openEditCourseModal = openEditCourseModal;
  window.closeEditCourseModal = closeEditCourseModal;
  window.handleCreateCourse = handleCreateCourse;
  window.handleUpdateCourse = handleUpdateCourse;

  window.adminAttendance = window.adminAttendance || {};
  window.adminAttendance.openAddCourseModal = openAddCourseModal;
  window.adminAttendance.closeAddCourseModal = closeAddCourseModal;
  window.adminAttendance.openEditCourseModal = openEditCourseModal;
  window.adminAttendance.closeEditCourseModal = closeEditCourseModal;
  window.adminAttendance.handleCreateCourse = handleCreateCourse;
  window.adminAttendance.handleUpdateCourse = handleUpdateCourse;

  // Protect admin route (allow local development without forced redirect loop)
  const isAdmin = localStorage.getItem('preptrack_is_admin') === 'true' || localStorage.getItem('ntc_is_admin') === 'true';
  const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
  if (!isAdmin && !isLocalEnv) {
    window.location.href = (window.getAppPageUrl ? window.getAppPageUrl('dashboard.html') : 'dashboard.html');
    return;
  }

  // State
  let activeRealtimeChannel = null;
  let masterRealtimeChannel = null;
  let allCourses = [];               // [{ id, name, studentCount, sessionsHeld, classAverage, enrolledStudents: [] }]
  let allSessions = [];              // Raw attendance_sessions
  let allSubmissions = [];           // Raw attendance_submissions
  let allProfiles = [];              // Student profiles
  let allPreferences = [];           // Student course preferences
  let currentCourse = null;          // Currently opened course for ranking view
  let currentCourseRankings = [];    // Ranked students for currentCourse
  let activeRegisterView = 'detail'; // 'detail' or 'summary' in Master Register tab
  let studentDaysPresentMap = new Map();

  document.addEventListener('DOMContentLoaded', async () => {
    // Explicit event listener for Add Course button
    const addBtn = document.getElementById('addCourseBtn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openAddCourseModal();
      });
    }

    // Modal backdrop clicks & Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAddCourseModal();
        closeEditCourseModal();
      }
    });

    setupTabNavigation();
    await loadAllAttendanceData();
    setupMasterRealtimeSubscription();

    // Default sessionDate to today
    const dateInput = document.getElementById('sessionDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  });

  // --------------------------------------------
  // Tab Navigation
  // --------------------------------------------

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
    if (tabId === 'courses-tab' && currentCourse) {
      // Return to courses grid if switching back to courses tab
      closeCourseRanking();
    }
  }

  // --------------------------------------------
  // Data Loading & Aggregation
  // --------------------------------------------

  async function loadAllAttendanceData() {
    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;

    try {
      // 1. Fetch Subjects / Courses
      let subjects = [];
      try {
        if (window.supaDB && typeof window.supaDB.getSubjects === 'function') {
          subjects = await window.supaDB.getSubjects();
        }
      } catch (e) {
        console.warn('Could not load subjects from supaDB:', e);
      }
      if (!subjects || subjects.length === 0) {
        subjects = [
          { id: "415718a9-73a2-4b8d-b149-af72ae9f801b", name: "English language" },
          { id: "70ff49de-ee1a-404e-8026-93e57099dd6c", name: "Mathematics" },
          { id: "23a159a7-a2a4-484f-b07a-2fd60f43b997", name: "French" },
          { id: "3f259e90-19c4-4514-827d-0190346bcf08", name: "History" },
          { id: "b42dea7f-ae1c-44fc-99b8-cd6e62b705be", name: "Geography" },
          { id: "62eaf060-fe0d-4c13-90f2-d78f23c0f3ca", name: "General Professional Knowledge (GPK)" },
          { id: "f82c949f-e918-4685-81c5-8fdffee1998c", name: "Grade-Level Specialism Pedagogy" },
          { id: "25bf9c78-de15-477b-9cfc-f204605406a8", name: "Subject Content Knowledge" },
          { id: "68848472-e20d-4db5-97ce-14aba703af78", name: "Social studies" },
          { id: "51b3c836-7c2e-4c7f-8928-b7bbcfe4e86a", name: "Integrated Science" },
          { id: "93e2b273-ade6-4f4f-ae78-77e2b72c76c3", name: "Physics" },
          { id: "1fbeb6b5-b745-4599-9a58-4ea38e7668d7", name: "Biology" },
          { id: "f624d93f-f6d3-46fd-8dea-49317beb87a0", name: "Chemistry" },
          { id: "495a3ad0-26de-42b6-bca9-718c23d61b63", name: "RME" },
          { id: "d9eedb28-edc7-4d4d-8191-b951cb86f337", name: "BDT" },
          { id: "d178ae07-79f0-4060-9d87-61ce8a87b743", name: "ICT" }
        ];
      }

      // Merge locally created courses if present in localStorage
      try {
        const localCourses = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
        localCourses.forEach(lc => {
          if (lc && lc.name && !subjects.some(s => s.name.trim().toLowerCase() === lc.name.trim().toLowerCase())) {
            subjects.push(lc);
          }
        });
      } catch (le) {
        console.warn('Error reading local subjects:', le);
      }

      // 2. Fetch Sessions
      const { data: sessions } = await window.supaAttendance.getAttendanceSessions();
      allSessions = sessions || [];

      // 3. Fetch Submissions
      const { data: submissions } = await window.supaAttendance.getAllAttendanceSubmissions();
      allSubmissions = submissions || [];

      // 4. Fetch Profiles (students)
      if (client) {
        try {
          const { data: profs } = await client
            .from('profiles')
            .select('id, full_name, index_number, email, role, course');
          allProfiles = profs || [];
        } catch (pe) {
          console.warn('Error fetching profiles:', pe);
          allProfiles = [];
        }

        // 5. Fetch Preferences
        try {
          const { data: prefs } = await client
            .from('student_course_preferences')
            .select('user_id, subject_id');
          allPreferences = prefs || [];
        } catch (prefe) {
          console.warn('Error fetching preferences:', prefe);
          allPreferences = [];
        }
      }

      // Calculate Course Metrics & Days Present
      calculateCourseMetrics(subjects);
      recalculateDaysPresent(allSubmissions);

      // Render Dashboard & update overview KPI cards at top
      renderCoursesDashboard();
      updateRegisterKpis(allSubmissions);

      // Refresh session management table
      renderSessionsTable(allSessions);
      populateSessionSubjectDropdown(subjects);

    } catch (err) {
      console.error('Error loading attendance data:', err);
    }
  }

  // Calculate stats for each course card
  function calculateCourseMetrics(subjects) {
    allCourses = subjects.map(sub => {
      const courseName = sub.name.trim();
      const courseNameLower = courseName.toLowerCase();

      // Sessions held for this course
      const courseSessions = allSessions.filter(s =>
        (s.subject || '').trim().toLowerCase() === courseNameLower
      );
      const sessionsHeld = courseSessions.length;
      const courseSessionIds = new Set(courseSessions.map(s => s.id));

      // Submissions for this course
      const courseSubmissions = allSubmissions.filter(subm =>
        courseSessionIds.has(subm.session_id) ||
        (subm.attendance_sessions?.subject || subm.course || '').trim().toLowerCase() === courseNameLower
      );

      // Identify students enrolled in this course:
      // A student is enrolled if:
      // 1. They have a preference in student_course_preferences for this subject id
      // 2. OR they have submitted attendance in this course
      // 3. OR their profile.course matches this course
      // 4. (If zero students in system have selected courses yet, enrolled students from registry are included)
      const studentMap = new Map();

      // From preferences
      allPreferences.forEach(pref => {
        if (pref.subject_id === sub.id) {
          const prof = allProfiles.find(p => p.id === pref.user_id);
          const studentId = pref.user_id;
          studentMap.set(studentId, {
            id: studentId,
            fullName: prof?.full_name || 'Student',
            indexNumber: prof?.index_number || generateFallbackIndex(studentId)
          });
        }
      });

      // From submissions
      courseSubmissions.forEach(subm => {
        const studentId = subm.user_id || subm.index_number || subm.full_name;
        if (!studentMap.has(studentId)) {
          const prof = allProfiles.find(p => p.id === subm.user_id || p.full_name === subm.full_name);
          studentMap.set(studentId, {
            id: studentId,
            fullName: subm.full_name || prof?.full_name || 'Student',
            indexNumber: subm.index_number || prof?.index_number || generateFallbackIndex(studentId)
          });
        }
      });

      // From profiles if course matches
      allProfiles.forEach(prof => {
        if (prof.role !== 'admin' && (prof.course || '').trim().toLowerCase() === courseNameLower) {
          if (!studentMap.has(prof.id)) {
            studentMap.set(prof.id, {
              id: prof.id,
              fullName: prof.full_name || 'Student',
              indexNumber: prof.index_number || generateFallbackIndex(prof.id)
            });
          }
        }
      });

      // If preferences and submissions are completely empty across the system (e.g. brand new setup),
      // associate registered student profiles with standard core courses so the admin sees their students immediately!
      if (allPreferences.length === 0 && courseSubmissions.length === 0) {
        allProfiles.filter(p => p.role !== 'admin').forEach(prof => {
          if (!studentMap.has(prof.id)) {
            studentMap.set(prof.id, {
              id: prof.id,
              fullName: prof.full_name || 'Student',
              indexNumber: prof.index_number || generateFallbackIndex(prof.id)
            });
          }
        });
      }

      // Used indices to ensure strictly UNIQUE identification for every student
      const usedIndices = new Set();
      function getUniqueIndex(preferredIndex, studentId, studentOrder) {
        let clean = (preferredIndex || '').trim();
        if (clean && !usedIndices.has(clean.toUpperCase())) {
          usedIndices.add(clean.toUpperCase());
          return clean;
        }
        let baseNum = 301 + (studentOrder || 0);
        let candidate = `UENR/0${baseNum}`;
        while (usedIndices.has(candidate.toUpperCase())) {
          baseNum++;
          candidate = `UENR/0${baseNum}`;
        }
        usedIndices.add(candidate.toUpperCase());
        return candidate;
      }

      // Now calculate attendance percentage for each enrolled student in THIS course
      let studentOrderIdx = 0;
      const enrolledStudents = Array.from(studentMap.values()).map(st => {
        studentOrderIdx++;
        const uniqueIndex = getUniqueIndex(st.indexNumber, st.id, studentOrderIdx);

        // Count verified sessions attended by this student in this course
        const attendedSessionsCount = courseSubmissions.filter(subm => {
          const isThisStudent = (subm.user_id === st.id) ||
                                (subm.index_number && subm.index_number.toLowerCase() === (uniqueIndex || '').toLowerCase()) ||
                                (subm.full_name && subm.full_name.toLowerCase() === st.fullName.toLowerCase());
          const isVerified = subm.verification_status === 'verified';
          return isThisStudent && isVerified;
        }).length;

        // Attendance Percentage
        let attendancePercentage = 0;
        if (sessionsHeld > 0) {
          attendancePercentage = Math.min(100, Math.round((attendedSessionsCount / sessionsHeld) * 100));
        } else if (attendedSessionsCount > 0) {
          attendancePercentage = 100;
        } else {
          attendancePercentage = 0;
        }

        return {
          id: st.id,
          fullName: st.fullName,
          indexNumber: uniqueIndex,
          sessionsAttended: attendedSessionsCount,
          sessionsHeld: sessionsHeld,
          attendancePercentage: attendancePercentage
        };
      });

      // Class Average (percentage)
      const studentCount = enrolledStudents.length;
      let classAverage = 0;
      if (studentCount > 0) {
        const totalPct = enrolledStudents.reduce((acc, curr) => acc + curr.attendancePercentage, 0);
        classAverage = Math.round(totalPct / studentCount);
      }

      return {
        id: sub.id,
        name: sub.name,
        studentCount: studentCount,
        sessionsHeld: sessionsHeld,
        classAverage: classAverage,
        enrolledStudents: enrolledStudents
      };
    });
  }

  function generateFallbackIndex(seed) {
    if (!seed) return 'UENR/0001';
    const num = Math.abs(hashCode(String(seed))) % 900 + 100;
    return `UENR/0${num}`;
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // --------------------------------------------
  // 1. Main Attendance Page: Course Cards Dashboard
  // --------------------------------------------

  function renderCoursesDashboard() {
    const grid = document.getElementById('coursesGrid');
    if (!grid) return;

    const searchVal = (document.getElementById('courseSearchInput')?.value || '').toLowerCase().trim();
    const sortVal = document.getElementById('courseSortSelect')?.value || 'name-asc';

    // Filter
    let coursesToDisplay = allCourses.filter(c =>
      c.name.toLowerCase().includes(searchVal)
    );

    // Sort
    coursesToDisplay.sort((a, b) => {
      if (sortVal === 'name-asc') return a.name.localeCompare(b.name);
      if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
      if (sortVal === 'avg-desc') return b.classAverage - a.classAverage;
      if (sortVal === 'avg-asc') return a.classAverage - b.classAverage;
      if (sortVal === 'students-desc') return b.studentCount - a.studentCount;
      if (sortVal === 'sessions-desc') return b.sessionsHeld - a.sessionsHeld;
      return 0;
    });

    if (coursesToDisplay.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: #ffffff; border: 1px dashed var(--border); border-radius: 14px;">
          <div style="font-size: 32px; margin-bottom: 8px;">📚</div>
          <h3 style="margin: 0 0 6px; font-size: 16px; color: var(--text);">No Courses Found</h3>
          <p style="margin: 0 0 16px; font-size: 13px; color: var(--text-light);">
            ${searchVal ? 'No courses match your search criteria.' : 'No courses have been created yet. Click "+ Add Course" to get started.'}
          </p>
          ${searchVal ? '<button class="btn btn-outline btn-sm" onclick="window.adminAttendance.resetCourseSearch()">Clear Search</button>' : '<button class="btn btn-primary btn-sm" onclick="window.adminAttendance.openAddCourseModal()">+ Add Course</button>'}
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    coursesToDisplay.forEach(course => {
      const avgClass = course.classAverage >= 75 ? 'avg-high' : course.classAverage >= 50 ? 'avg-med' : 'avg-low';

      // Per prompt: Each course card must display ONLY:
      // Course Name, Number of Students, Sessions Held, Class Average (percentage)
      cardsHtml += `
        <div class="course-card" onclick="window.adminAttendance.openCourseRanking('${course.id}')" title="Click to open attendance rankings for ${escapeHtml(course.name)}">
          <div class="course-card-header">
            <h3 class="course-card-title">${escapeHtml(course.name)}</h3>
            <div class="course-card-actions" onclick="event.stopPropagation()">
              <button type="button" class="course-card-btn" title="Edit Course Name" onclick="window.adminAttendance.openEditCourseModal('${course.id}', '${escapeJs(course.name)}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button type="button" class="course-card-btn delete" title="Delete Course" onclick="window.adminAttendance.handleDeleteCourse('${course.id}', '${escapeJs(course.name)}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>

          <div class="course-card-metrics">
            <div class="course-metric-col">
              <span class="course-metric-label">Students</span>
              <span class="course-metric-value">${course.studentCount}</span>
            </div>
            <div class="course-metric-col">
              <span class="course-metric-label">Sessions Held</span>
              <span class="course-metric-value">${course.sessionsHeld}</span>
            </div>
            <div class="course-metric-col">
              <span class="course-metric-label">Class Average</span>
              <span class="course-metric-value ${avgClass}">${course.classAverage}%</span>
            </div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = cardsHtml;
  }

  function filterCoursesDashboard() {
    renderCoursesDashboard();
  }

  function sortCoursesDashboard() {
    renderCoursesDashboard();
  }

  function resetCourseSearch() {
    const input = document.getElementById('courseSearchInput');
    if (input) input.value = '';
    renderCoursesDashboard();
  }

  // --------------------------------------------
  // 2 & 3. Dedicated Course Attendance Ranking View
  // --------------------------------------------

  function openCourseRanking(courseId) {
    currentCourse = allCourses.find(c => c.id === courseId);
    if (!currentCourse) return;

    const dashboardView = document.getElementById('coursesDashboardView');
    const rankingView = document.getElementById('courseRankingView');

    if (dashboardView) dashboardView.style.display = 'none';
    if (rankingView) rankingView.style.display = 'flex';

    // Populate Header
    const titleEl = document.getElementById('rankingCourseTitle');
    const studentsEl = document.getElementById('rankingStatStudents');
    const sessionsEl = document.getElementById('rankingStatSessions');
    const averageEl = document.getElementById('rankingStatAverage');

    if (titleEl) titleEl.textContent = currentCourse.name;
    if (studentsEl) studentsEl.textContent = `${currentCourse.studentCount} Students`;
    if (sessionsEl) sessionsEl.textContent = `${currentCourse.sessionsHeld} Sessions`;
    if (averageEl) {
      averageEl.textContent = `${currentCourse.classAverage}%`;
      averageEl.style.color = currentCourse.classAverage >= 75 ? '#059669' : currentCourse.classAverage >= 50 ? '#d97706' : '#dc2626';
    }

    // Sort students DESCENDING by attendance percentage
    const sortedStudents = [...currentCourse.enrolledStudents].sort((a, b) => {
      if (b.attendancePercentage !== a.attendancePercentage) {
        return b.attendancePercentage - a.attendancePercentage;
      }
      if (b.sessionsAttended !== a.sessionsAttended) {
        return b.sessionsAttended - a.sessionsAttended;
      }
      const nameComp = (a.fullName || '').localeCompare(b.fullName || '');
      if (nameComp !== 0) return nameComp;
      return (a.indexNumber || '').localeCompare(b.indexNumber || '');
    });

    // Assign strictly UNIQUE ranking positions (1, 2, 3...) so every student has a unique identification
    sortedStudents.forEach((st, idx) => {
      st.rank = idx + 1;
    });

    currentCourseRankings = sortedStudents;

    // Reset ranking search input
    const searchInput = document.getElementById('rankingSearchInput');
    if (searchInput) searchInput.value = '';

    renderRankingTable(currentCourseRankings);
  }

  function closeCourseRanking() {
    currentCourse = null;
    currentCourseRankings = [];

    const dashboardView = document.getElementById('coursesDashboardView');
    const rankingView = document.getElementById('courseRankingView');

    if (rankingView) rankingView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';

    renderCoursesDashboard();
  }

  function filterRankingTable() {
    if (!currentCourse) return;
    const searchVal = (document.getElementById('rankingSearchInput')?.value || '').toLowerCase().trim();

    const filtered = currentCourseRankings.filter(st =>
      st.fullName.toLowerCase().includes(searchVal) ||
      st.indexNumber.toLowerCase().includes(searchVal)
    );

    renderRankingTable(filtered);
  }

  function renderRankingTable(students) {
    const tbody = document.getElementById('rankingTableBody');
    const countBadge = document.getElementById('rankingCountBadge');
    if (!tbody) return;

    if (countBadge) {
      countBadge.textContent = `${students.length} Student${students.length === 1 ? '' : 's'} Ranked`;
    }

    if (!students || students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-light);">
            <div style="font-size: 28px; margin-bottom: 8px;">🎓</div>
            <div style="font-weight: 700; font-size: 15px; color: var(--text); margin-bottom: 4px;">No Students Registered</div>
            <div>No students are currently registered for ${escapeHtml(currentCourse ? currentCourse.name : 'this course')}.</div>
          </td>
        </tr>
      `;
      return;
    }

    const sessionsHeld = currentCourse ? currentCourse.sessionsHeld : 0;
    let rowsHtml = '';

    // Dedicated columns: RANK, STUDENT NAME, INDEX NUMBER, SESSIONS ATTENDED, ATTENDANCE
    students.forEach(st => {
      const pct = st.attendancePercentage;
      const statusClass = pct >= 75 ? 'high' : pct >= 50 ? 'med' : 'low';

      rowsHtml += `
        <tr>
          <td style="text-align: center; width: 70px;">
            <div class="ranking-num-badge" style="display:inline-block; min-width:auto;">${st.rank}.</div>
          </td>
          <td>
            <div class="ranking-student-name">${escapeHtml(st.fullName)}</div>
          </td>
          <td>
            <span class="ranking-student-index">${escapeHtml(st.indexNumber)}</span>
          </td>
          <td>
            <span class="ranking-student-attended">${st.sessionsAttended} of ${sessionsHeld} sessions attended</span>
          </td>
          <td class="th-attendance">
            <div class="ranking-attendance-cell">
              <div class="ranking-pct-label ${statusClass}">${pct}%</div>
              <div class="ranking-bar-track">
                <div class="ranking-bar-fill ${statusClass}" style="width: ${Math.max(pct, 3)}%;"></div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // --------------------------------------------
  // Course Management: Add, Edit, Delete
  // (Prevents duplicate course creation)
  // --------------------------------------------

  function openAddCourseModal() {
    const modal = document.getElementById('addCourseModal');
    const input = document.getElementById('newCourseName');
    const err = document.getElementById('courseErrorMsg');
    if (err) err.style.display = 'none';
    if (input) input.value = '';
    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('z-index', '999999', 'important');
    }
    if (input) setTimeout(() => input.focus(), 60);
  }

  function closeAddCourseModal() {
    const modal = document.getElementById('addCourseModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
  }

  async function handleCreateCourse(e) {
    e.preventDefault();
    const input = document.getElementById('newCourseName');
    const err = document.getElementById('courseErrorMsg');
    const name = (input?.value || '').trim();

    if (!name) return;

    // Check duplicate course name (case-insensitive) against memory and local courses
    let localCourses = [];
    try { localCourses = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]'); } catch (e) {}
    const exists = allCourses.some(c => (c.name || '').toLowerCase() === name.toLowerCase()) ||
                   localCourses.some(c => (c.name || '').toLowerCase() === name.toLowerCase());
    if (exists) {
      if (err) {
        err.textContent = `A course named "${name}" already exists. Please choose a unique name.`;
        err.style.display = 'block';
      }
      return;
    }

    try {
      const btn = document.getElementById('btnSaveCourse');
      if (btn) btn.disabled = true;

      if (window.supaDB && typeof window.supaDB.addSubject === 'function') {
        const { error } = await window.supaDB.addSubject(name);
        if (error) {
          console.warn('Database insert failed, using local course storage:', error);
          saveCourseLocally(name);
        }
      } else {
        saveCourseLocally(name);
      }

      if (window.showToast) {
        window.showToast(`Course "${name}" created successfully!`, 'success');
      }

      closeAddCourseModal();
      await loadAllAttendanceData();
    } catch (err2) {
      console.error(err2);
      saveCourseLocally(name);
      closeAddCourseModal();
      await loadAllAttendanceData();
    } finally {
      const btn = document.getElementById('btnSaveCourse');
      if (btn) btn.disabled = false;
    }
  }

  function openEditCourseModal(courseId, courseName) {
    const modal = document.getElementById('editCourseModal');
    const idInput = document.getElementById('editCourseId');
    const nameInput = document.getElementById('editCourseName');
    const err = document.getElementById('editCourseErrorMsg');

    if (idInput) idInput.value = courseId;
    if (nameInput) nameInput.value = courseName;
    if (err) err.style.display = 'none';
    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('z-index', '999999', 'important');
    }
    if (nameInput) setTimeout(() => nameInput.focus(), 60);
  }

  function closeEditCourseModal() {
    const modal = document.getElementById('editCourseModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
  }

  async function handleUpdateCourse(e) {
    e.preventDefault();
    const idInput = document.getElementById('editCourseId');
    const nameInput = document.getElementById('editCourseName');
    const err = document.getElementById('editCourseErrorMsg');

    const id = idInput?.value;
    const name = (nameInput?.value || '').trim();

    if (!id || !name) return;

    // Check duplicate
    const exists = allCourses.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      if (err) {
        err.textContent = `Another course named "${name}" already exists.`;
        err.style.display = 'block';
      }
      return;
    }

    try {
      if (window.supaDB && typeof window.supaDB.updateSubject === 'function') {
        await window.supaDB.updateSubject(id, name);
      }
      updateCourseLocally(id, name);

      if (window.showToast) {
        window.showToast(`Course updated to "${name}"!`, 'success');
      }

      closeEditCourseModal();
      await loadAllAttendanceData();
    } catch (err2) {
      console.error(err2);
      updateCourseLocally(id, name);
      closeEditCourseModal();
      await loadAllAttendanceData();
    }
  }

  async function handleDeleteCourse(courseId, courseName) {
    if (!confirm(`Are you sure you want to delete the course "${courseName}"? Historical student attendance sessions linked to this course will remain preserved.`)) {
      return;
    }

    try {
      if (window.supaDB && typeof window.supaDB.deleteSubject === 'function') {
        await window.supaDB.deleteSubject(courseId);
      }
      deleteCourseLocally(courseId);

      if (window.showToast) {
        window.showToast(`Course "${courseName}" deleted.`, 'success');
      }

      await loadAllAttendanceData();
    } catch (err) {
      console.error(err);
      deleteCourseLocally(courseId);
      await loadAllAttendanceData();
    }
  }

  function saveCourseLocally(name) {
    const localCourses = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
    const newCourse = { id: 'course-' + Date.now(), name: name };
    localCourses.push(newCourse);
    localStorage.setItem('preptrack_subjects', JSON.stringify(localCourses));
  }

  function updateCourseLocally(id, name) {
    let localCourses = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
    localCourses = localCourses.map(c => c.id === id ? { ...c, name } : c);
    localStorage.setItem('preptrack_subjects', JSON.stringify(localCourses));
  }

  function deleteCourseLocally(id) {
    let localCourses = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
    localCourses = localCourses.filter(c => c.id !== id);
    localStorage.setItem('preptrack_subjects', JSON.stringify(localCourses));
  }

  // --------------------------------------------
  // Excel Export & Clipboard Copy for Course Ranking
  // --------------------------------------------

  function copyRankingToExcel() {
    if (!currentCourse || currentCourseRankings.length === 0) {
      alert('No ranking data to copy.');
      return;
    }

    const headers = ['Rank', 'Student Name', 'Index Number', 'Sessions Attended', 'Total Sessions Held', 'Attendance Percentage'];
    const lines = [headers.join('\t')];

    currentCourseRankings.forEach(st => {
      lines.push([
        st.rank,
        st.fullName,
        st.indexNumber,
        st.sessionsAttended,
        st.sessionsHeld,
        `${st.attendancePercentage}%`
      ].join('\t'));
    });

    const tsvData = lines.join('\r\n');
    navigator.clipboard.writeText(tsvData).then(() => {
      if (window.showToast) {
        window.showToast(`📋 Copied rankings for ${currentCourse.name} to clipboard! Paste into Excel (Ctrl+V).`, 'success');
      } else {
        alert('Rankings copied to clipboard! Paste into Excel.');
      }
    }).catch(err => {
      fallbackClipboardCopy(tsvData);
    });
  }

  function exportRankingCSV() {
    if (!currentCourse || currentCourseRankings.length === 0) {
      alert('No ranking data to export.');
      return;
    }

    const headers = ['Rank', 'Student Name', 'Index Number', 'Sessions Attended', 'Total Sessions Held', 'Attendance Percentage'];
    const rows = currentCourseRankings.map(st => [
      st.rank,
      st.fullName,
      st.indexNumber,
      st.sessionsAttended,
      st.sessionsHeld,
      `${st.attendancePercentage}%`
    ]);

    const escapeCsvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanCourseName = currentCourse.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${cleanCourseName}_Attendance_Rankings.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast(`Exported ${currentCourse.name} ranking to CSV!`, 'success');
    }
  }

  function createSessionForCurrentCourse() {
    if (!currentCourse) return;
    switchTab('sessions-tab');
    toggleCreateForm();

    const subjectSelect = document.getElementById('sessionSubject');
    if (subjectSelect) {
      subjectSelect.value = currentCourse.name;
    }
  }

  // --------------------------------------------
  // Helper: Sessions & Master Register dropdowns
  // --------------------------------------------

  function populateSessionSubjectDropdown(subjects) {
    const select = document.getElementById('sessionSubject');
    if (!select) return;

    let optionsHtml = '<option value="" disabled selected>Select a subject / course</option>';
    subjects.forEach(s => {
      optionsHtml += `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`;
    });
    select.innerHTML = optionsHtml;
  }

  function populateRegisterFilterOptions() {
    const classSelect = document.getElementById('regClassFilter');
    const subjectSelect = document.getElementById('regSubjectFilter');
    const weekSelect = document.getElementById('regWeekFilter');

    if (classSelect) {
      const classesSet = new Set(['Class A', 'Class B', 'Class C', 'General Class']);
      allSubmissions.forEach(s => {
        const cls = extractSessionClass(s.attendance_sessions);
        if (cls) classesSet.add(cls);
      });
      allSessions.forEach(s => {
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

    if (subjectSelect) {
      const subjectsSet = new Set();
      allCourses.forEach(c => subjectsSet.add(c.name));
      allSessions.forEach(s => { if (s.subject) subjectsSet.add(s.subject); });

      const currentVal = subjectSelect.value;
      let optionsHtml = '<option value="all">All Courses / Subjects</option>';
      Array.from(subjectsSet).sort().forEach(sub => {
        optionsHtml += `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`;
      });
      subjectSelect.innerHTML = optionsHtml;
      if (subjectsSet.has(currentVal)) subjectSelect.value = currentVal;
    }

    if (weekSelect) {
      const weeksSet = new Set();
      for (let w = 1; w <= 16; w++) weeksSet.add(`Week ${w}`);
      allSessions.forEach(s => {
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

  // Helper metadata extraction
  function extractSessionClass(session) {
    if (!session) return 'Class A';
    if (session.class_name && session.class_name.trim()) return session.class_name.trim();
    if (session.instructions) {
      const match = session.instructions.match(/\[Class:\s*([^\]]+)\]/i);
      if (match && match[1]) return match[1].trim();
    }
    if (session.title) {
      const match = session.title.match(/\[(?:Class|Cohort):\s*([^\]]+)\]/i) ||
                    session.title.match(/\((?:Class|Cohort):\s*([^\)]+)\)/i);
      if (match && match[1]) return match[1].trim();
    }
    return 'Class A';
  }

  function extractSessionWeek(session) {
    if (!session) return 'Week 1';
    if (session.week && session.week.trim()) return session.week.trim();
    if (session.instructions) {
      const match = session.instructions.match(/\[Week:\s*([^\]]+)\]/i);
      if (match && match[1]) return match[1].trim();
    }
    if (session.title) {
      const match = session.title.match(/\b(Week\s*\d+|Wk\s*\d+)\b/i);
      if (match && match[1]) return match[1].replace(/wk/i, 'Week ').trim();
    }
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

        if (!studentDaysPresentMap.has(studentKey)) {
          studentDaysPresentMap.set(studentKey, new Set());
        }
        studentDaysPresentMap.get(studentKey).add(dateKey);

        const courseKey = `${studentKey}:::${course}`;
        if (!studentDaysPresentMap.has(courseKey)) {
          studentDaysPresentMap.set(courseKey, new Set());
        }
        studentDaysPresentMap.get(courseKey).add(dateKey);

        const classCourseKey = `${studentKey}:::${className}:::${course}`;
        if (!studentDaysPresentMap.has(classCourseKey)) {
          studentDaysPresentMap.set(classCourseKey, new Set());
        }
        studentDaysPresentMap.get(classCourseKey).add(dateKey);
      }
    });
  }

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

  // --------------------------------------------
  // Historical Register Log (Tab 3) Logic
  // --------------------------------------------

  function filterMasterRegister() {
    const searchVal = (document.getElementById('regSearchInput')?.value || '').toLowerCase().trim();
    const classVal = document.getElementById('regClassFilter')?.value || 'all';
    const subjectVal = document.getElementById('regSubjectFilter')?.value || 'all';
    const weekVal = document.getElementById('regWeekFilter')?.value || 'all';
    const statusVal = document.getElementById('regStatusFilter')?.value || 'all';
    const dateVal = document.getElementById('regDateFilter')?.value || '';

    const filtered = allSubmissions.filter(s => {
      const session = s.attendance_sessions || {};
      const className = extractSessionClass(session);
      const weekName = extractSessionWeek(session);
      const courseName = session.subject || s.course || 'General';

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

      if (classVal !== 'all' && className.toLowerCase() !== classVal.toLowerCase()) return false;
      if (subjectVal !== 'all' && courseName.toLowerCase() !== subjectVal.toLowerCase()) return false;
      if (weekVal !== 'all' && weekName.toLowerCase() !== weekVal.toLowerCase()) return false;

      if (statusVal !== 'all') {
        const isVerified = s.verification_status === 'verified';
        if (statusVal === 'verified' && !isVerified) return false;
        if (statusVal === 'rejected' && isVerified) return false;
      }

      if (dateVal) {
        const sDate = session.session_date || (s.submitted_at ? s.submitted_at.split('T')[0] : '');
        if (sDate !== dateVal) return false;
      }

      return true;
    });

    updateRegisterKpis(filtered);
    renderMasterRegister(filtered);
  }

  function updateRegisterKpis(submissions) {
    submissions = submissions || allSubmissions || [];
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
            <div>No student submissions match your current filters.</div>
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
    if (window.showToast) window.showToast('Refreshing attendance records...', 'info');
    await loadAllAttendanceData();
    if (window.showToast) window.showToast('Attendance register updated!', 'success');
  }

  async function toggleMasterSubmissionStatus(submissionId, newStatus) {
    try {
      const { error } = await window.supaAttendance.updateAttendanceSubmissionStatus(submissionId, newStatus);
      if (error) {
        alert('Failed to update status: ' + error.message);
        return;
      }

      const item = allSubmissions.find(s => s.id === submissionId);
      if (item) item.verification_status = newStatus;
      await loadAllAttendanceData();

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

      allSubmissions = allSubmissions.filter(s => s.id !== submissionId);
      await loadAllAttendanceData();

      if (window.showToast) {
        window.showToast('Attendance record deleted successfully.', 'success');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting submission: ' + err.message);
    }
  }

  function doExportMasterCSV() {
    if (!allSubmissions || allSubmissions.length === 0) {
      alert('No attendance records available to export.');
      return;
    }

    const headers = ['Roll #', 'Student', 'Index', 'Class Name', 'Course', 'Week', 'Time', 'Total Days Present', 'Status'];
    const rows = allSubmissions.map((s, idx) => {
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
    if (!allSubmissions || allSubmissions.length === 0) {
      alert('No attendance records to copy.');
      return;
    }

    const headers = ['Roll #', 'Student', 'Index', 'Class Name', 'Course', 'Week', 'Time', 'Total Days Present', 'Status'];
    const lines = [headers.join('\t')];

    allSubmissions.forEach((s, idx) => {
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
        window.showToast(`📋 Copied ${allSubmissions.length} records! Ready to paste into Excel (Ctrl+V).`, 'success');
      } else {
        alert(`Copied ${allSubmissions.length} records for Excel!`);
      }
    }).catch(err => {
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
      if (window.showToast) window.showToast('📋 Copied records for Excel!', 'success');
      else alert('Copied attendance records! Paste into Excel.');
    } catch (e) {
      alert('Unable to copy automatically. Please use Export CSV instead.');
    }
    document.body.removeChild(textarea);
  }

  function doPrintMasterRegister() {
    if (!allSubmissions || allSubmissions.length === 0) {
      alert('No records to print.');
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Please allow popups to open printable register.');
      return;
    }

    const printDate = new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    let rowsHtml = '';
    allSubmissions.forEach((s, idx) => {
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
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: 700; color: #334155; }
          tr:nth-child(even) { background: #fcfcfd; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PREPTRACK - OFFICIAL ACADEMIC ATTENDANCE REGISTER</h1>
          <p>Generated on: ${printDate} | Records: Student, Index, Class Name, Course, Week, Time, Total Days Present</p>
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
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer">
          <div><p>Admin / Class Instructor: ___________________________</p></div>
          <div><p>Signature: ___________________________ Date: ____________</p></div>
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 250);
  }

  // --------------------------------------------
  // Session Management (Tab 2) Logic
  // --------------------------------------------

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

  function handleRadiusChange() {
    const select = document.getElementById('sessionRadius');
    const customContainer = document.getElementById('customRadiusContainer');
    if (!select || !customContainer) return;
    customContainer.style.display = select.value === 'custom' ? 'block' : 'none';
  }

  let adminLocationWatchId = null;

  function getAdminLocation() {
    const statusMsg = document.getElementById('locationAccuracyMsg');
    const latInput = document.getElementById('sessionLat');
    const lngInput = document.getElementById('sessionLng');
    const statusBox = document.getElementById('adminMapsStatusBox');
    const titleEl = document.getElementById('adminMapsTitle');
    const descEl = document.getElementById('adminMapsDesc');
    const pillEl = document.getElementById('adminMapsAccuracyPill');
    const btnEl = document.getElementById('btnAdminGetLocation');

    if (adminLocationWatchId !== null) {
      try { navigator.geolocation.clearWatch(adminLocationWatchId); } catch (e) {}
      adminLocationWatchId = null;
    }

    if (!navigator.geolocation) {
      if (statusMsg) {
        statusMsg.style.color = '#dc2626';
        statusMsg.textContent = 'Geolocation is not supported by your browser.';
      }
      return;
    }

    if (statusBox) {
      statusBox.style.display = 'flex';
      statusBox.className = 'maps-gps-container calibrating';
    }
    if (titleEl) titleEl.textContent = '🛰️ Triggering Google Maps GPS...';
    if (descEl) descEl.textContent = 'Please tap "Allow" if browser prompts for location permission. Calibrating true venue...';
    if (pillEl) pillEl.textContent = 'Satellite search...';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="attendance-spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></span> Calibrating GPS...';
    }
    if (statusMsg) {
      statusMsg.style.color = '#0284c7';
      statusMsg.textContent = 'Acquiring satellite lock for true lecture venue coordinates...';
    }

    let bestCoords = null;
    let sampleCount = 0;
    let isLocked = false;

    function handleNewFix(pos) {
      if (!pos || !pos.coords) return;
      sampleCount++;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy || 20);

      if (!bestCoords || acc < bestCoords.accuracy) {
        bestCoords = { lat, lng, accuracy: acc };
        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);
      }

      if (pillEl) pillEl.textContent = `±${bestCoords.accuracy}m accuracy (${sampleCount} fix${sampleCount > 1 ? 'es' : ''})`;
      if (descEl) descEl.textContent = `Live GPS tracking active. Refined coordinate: ${bestCoords.lat.toFixed(5)}, ${bestCoords.lng.toFixed(5)}`;

      // Convergence criteria: precision <= 15m or (>= 3 samples and precision <= 25m)
      if (!isLocked && (bestCoords.accuracy <= 15 || (sampleCount >= 3 && bestCoords.accuracy <= 25))) {
        lockTrueVenue(bestCoords);
      }
    }

    function lockTrueVenue(coords) {
      isLocked = true;
      if (adminLocationWatchId !== null) {
        try { navigator.geolocation.clearWatch(adminLocationWatchId); } catch (e) {}
        adminLocationWatchId = null;
      }
      if (statusBox) {
        statusBox.className = 'maps-gps-container verified';
      }
      if (titleEl) titleEl.textContent = '✔ True Lecture Venue Locked!';
      if (descEl) descEl.textContent = `High-accuracy GPS reference captured: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
      if (pillEl) pillEl.textContent = `±${coords.accuracy}m accuracy (Verified True Fix)`;
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = `✔ Venue Locked (±${coords.accuracy}m)`;
      }
      if (statusMsg) {
        statusMsg.style.color = '#059669';
        statusMsg.textContent = `✓ True Lecture Location Locked! Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)} (Accuracy: ~${coords.accuracy}m)`;
      }
    }

    function handleGeoError(err) {
      console.warn('Geolocation error:', err);
      if (isLocked) return;

      if (err.code === 1) {
        // PERMISSION_DENIED
        if (statusBox) statusBox.className = 'maps-gps-container error';
        if (titleEl) titleEl.textContent = '🔒 Location Permission Denied';
        if (descEl) descEl.innerHTML = 'Location access is blocked. Click the lock / settings icon (🔒) in your browser URL bar, change Location to <strong>Allow</strong>, and try again.';
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = '🔄 Retry Venue Location';
        }
        if (statusMsg) {
          statusMsg.style.color = '#dc2626';
          statusMsg.textContent = 'Permission denied. Please allow location in your browser.';
        }
      } else {
        // Fallback to low-accuracy Wi-Fi / IP if satellite watch is slow
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            handleNewFix(fallbackPos);
            if (bestCoords && !isLocked) {
              lockTrueVenue(bestCoords);
            }
          },
          (err2) => {
            if (isLocked) return;
            if (statusBox) statusBox.className = 'maps-gps-container error';
            if (titleEl) titleEl.textContent = '⚠️ Weak GPS Satellite Signal';
            if (descEl) descEl.textContent = 'Could not acquire satellite fix. You can enter venue coordinates manually or click retry.';
            if (btnEl) {
              btnEl.disabled = false;
              btnEl.innerHTML = '🔄 Retry Venue Location';
            }
            if (statusMsg) {
              statusMsg.style.color = '#d97706';
              statusMsg.textContent = 'Weak signal. You may enter coordinates manually or retry.';
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      }
    }

    // Trigger high-precision watchPosition immediately (Maps style)
    try {
      adminLocationWatchId = navigator.geolocation.watchPosition(
        handleNewFix,
        handleGeoError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    } catch (e) {
      handleGeoError(e);
    }

    // Also trigger immediate getCurrentPosition for fastest initial prompt
    try {
      navigator.geolocation.getCurrentPosition(
        handleNewFix,
        handleGeoError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );
    } catch (e) {}

    // Auto-lock best fix after 6 seconds if accuracy hasn't reached <= 15m (e.g. indoor laptop)
    setTimeout(() => {
      if (!isLocked && bestCoords) {
        lockTrueVenue(bestCoords);
      }
    }, 6000);
  }

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
        window.showToast(`Attendance session created for ${subject} (${week})!`, 'success');
      }

      toggleCreateForm();
      await loadAllAttendanceData();
    } catch (err) {
      console.error(err);
      alert('Error creating session: ' + err.message);
    }
  }

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
      await loadAllAttendanceData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

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
      await loadAllAttendanceData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  // --------------------------------------------
  // Single Session Feed / Live View
  // --------------------------------------------

  let currentSubmissions = [];

  async function viewSessionRecords(sessionId) {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    const recordsTabBtn = document.getElementById('recordsTabBtn');
    const sessionLabel = document.getElementById('currentSessionLabel');
    const headerInfo = document.getElementById('sessionInfoHeader');

    const className = extractSessionClass(session);
    const weekName = extractSessionWeek(session);

    if (recordsTabBtn) recordsTabBtn.style.display = 'inline-block';
    if (sessionLabel) sessionLabel.textContent = `(${session.title})`;
    if (headerInfo) {
      headerInfo.innerHTML = `
        <h3 style="margin:0 0 4px 0; font-size:1.1rem;">${escapeHtml(session.title)}</h3>
        <p style="margin:0; font-size:0.85rem; color:var(--text-light);">
          <strong>Class:</strong> ${escapeHtml(className)} | 
          <strong>Course:</strong> ${escapeHtml(session.subject || 'N/A')} | 
          <strong>Week:</strong> ${escapeHtml(weekName)} | 
          <strong>Date:</strong> ${escapeHtml(session.session_date || '')} | 
          <strong>Location:</strong> ${escapeHtml(session.location_name || 'N/A')} (${session.radius_meters || 30}m)
        </p>
      `;
    }

    switchTab('records-tab');
    await loadSingleSessionSubmissions(sessionId);
    setupRealtimeSubscription(sessionId);
  }

  function backToSessions() {
    cleanupSubscription();
    switchTab('sessions-tab');
  }

  async function loadSingleSessionSubmissions(sessionId) {
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
      renderSingleSubmissionsTable(currentSubmissions);
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Failed to load records.</td></tr>';
    }
  }

  function renderSingleSubmissionsTable(submissions) {
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

  function filterRecords() {
    const searchVal = (document.getElementById('recordsSearch')?.value || '').toLowerCase();
    const statusVal = document.getElementById('recordsFilter')?.value || 'all';

    let filtered = currentSubmissions.filter(s => {
      const matchesSearch = (s.full_name || '').toLowerCase().includes(searchVal) ||
                            (s.index_number || '').toLowerCase().includes(searchVal);
      const matchesStatus = statusVal === 'all' || s.verification_status === statusVal;
      return matchesSearch && matchesStatus;
    });

    renderSingleSubmissionsTable(filtered);
  }

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
        }, (payload) => {
          if (!payload || !payload.new) return;
          const exists = currentSubmissions.some(s => s.id === payload.new.id);
          if (!exists) {
            currentSubmissions.push(payload.new);
            filterRecords();
            if (window.showToast) {
              window.showToast(`New attendance check-in: ${payload.new.full_name}`, 'info');
            }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime error:', e);
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

  function doExportCSV() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to export.');
      return;
    }
    const rows = [['Name', 'Index Number', 'Time Submitted', 'Distance (m)', 'Status']];
    currentSubmissions.forEach(s => {
      rows.push([
        s.full_name,
        s.index_number,
        new Date(s.submitted_at).toLocaleString(),
        s.distance_meters != null ? s.distance_meters.toFixed(1) : 'N/A',
        s.verification_status
      ]);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'session_attendance.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doCopyToExcel() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to copy.');
      return;
    }
    const header = 'Name\tIndex Number\tTime Submitted\tDistance (m)\tStatus';
    const rows = currentSubmissions.map(s =>
      `${s.full_name}\t${s.index_number}\t${new Date(s.submitted_at).toLocaleString()}\t${s.distance_meters != null ? s.distance_meters.toFixed(1) : 'N/A'}\t${s.verification_status}`
    );
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => {
      if (window.showToast) window.showToast('Copied to clipboard!', 'success');
      else alert('Records copied to clipboard!');
    }).catch(err => {
      fallbackClipboardCopy([header, ...rows].join('\n'));
    });
  }

  function doPrint() {
    if (!currentSubmissions || currentSubmissions.length === 0) {
      alert('No records to print.');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Session Attendance</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body>`);
    w.document.write(`<h2>Session Attendance Report</h2>`);
    w.document.write(`<table><thead><tr><th>#</th><th>Name</th><th>Index</th><th>Time</th><th>Status</th></tr></thead><tbody>`);
    currentSubmissions.forEach((s, i) => {
      w.document.write(`<tr><td>${i+1}</td><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.index_number || '')}</td><td>${new Date(s.submitted_at).toLocaleTimeString()}</td><td>${escapeHtml(s.verification_status || 'verified')}</td></tr>`);
    });
    w.document.write(`</tbody></table></body></html>`);
    w.document.close();
    w.print();
  }

  // --------------------------------------------
  // Realtime System Subscription
  // --------------------------------------------

  function setupMasterRealtimeSubscription() {
    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
    if (!client || typeof client.channel !== 'function') return;

    try {
      masterRealtimeChannel = client.channel('attendance-master-dashboard-sync')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'attendance_submissions'
        }, async () => {
          await loadAllAttendanceData();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'attendance_sessions'
        }, async () => {
          await loadAllAttendanceData();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime dashboard sync error:', e);
    }
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

  function escapeJs(text) {
    if (!text) return '';
    return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // Expose methods globally for inline HTML handlers
  window.adminAttendance = Object.assign(window.adminAttendance || {}, {
    // Course Dashboard
    renderCoursesDashboard,
    filterCoursesDashboard,
    sortCoursesDashboard,
    resetCourseSearch,
    openAddCourseModal,
    closeAddCourseModal,
    handleCreateCourse,
    openEditCourseModal,
    closeEditCourseModal,
    handleUpdateCourse,
    handleDeleteCourse,

    // Course Rankings View
    openCourseRanking,
    closeCourseRanking,
    filterRankingTable,
    copyRankingToExcel,
    exportRankingCSV,
    createSessionForCurrentCourse,

    // Session Management (Tab 2)
    toggleCreateForm,
    handleRadiusChange,
    getAdminLocation,
    handleCreateSession,
    toggleSessionStatus,
    deleteSession,

    // Single Session Feed (Tab 4)
    viewSessionRecords,
    backToSessions,
    filterRecords,
    doExportCSV,
    doCopyToExcel,
    doPrint,

    // Historical Register Log (Tab 3)
    filterMasterRegister,
    resetMasterFilters,
    refreshMasterRegister,
    toggleMasterSubmissionStatus,
    deleteMasterSubmission,
    doExportMasterCSV,
    doCopyMasterToExcel,
    doPrintMasterRegister
  });

})();
