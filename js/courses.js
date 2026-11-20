/**
 * PrepTrack - Student Course Management ("My Courses")
 * Shows only the student's selected courses.
 * Allows selecting/editing course preferences with one-click Clear options.
 */

const DEFAULT_FALLBACK_SUBJECTS = [
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

document.addEventListener('DOMContentLoaded', async () => {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
  if (!client) {
    console.error('Supabase client not initialized');
  }

  // Check auth
  let user = null;
  if (client && client.auth) {
    try {
      const { data: { user: currentUser }, error: authError } = await client.auth.getUser();
      user = currentUser;
    } catch (e) {
      console.warn('Auth check error:', e);
    }
  }

  // Demo fallback user check if not in Supabase session
  if (!user) {
    const demoUser = localStorage.getItem('preptrack_user') || localStorage.getItem('ntc_user');
    if (!demoUser && !user) {
      window.location.href = (window.getAppPageUrl ? window.getAppPageUrl('login.html') : 'login.html');
      return;
    }
    user = { id: 'demo-student-id', email: 'demo@preptrack.com' };
  }

  let allSubjects = [];
  let selectedCourseIds = new Set();
  let isEditMode = false;
  let searchQuery = '';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const pageTitle           = document.getElementById('coursesPageTitle');
  const pageSubtitle        = document.getElementById('coursesPageSubtitle');
  const coursesContent      = document.getElementById('coursesContent');
  const coursesEmptyState   = document.getElementById('coursesEmptyState');
  const reloadCoursesBtn    = document.getElementById('reloadCoursesBtn');
  
  // Enrolled section (View Mode)
  const enrolledSection     = document.getElementById('enrolledCoursesSection');
  const enrolledGrid        = document.getElementById('enrolledCoursesGrid');
  const enrolledBadgeCount  = document.getElementById('enrolledBadgeCount');
  const editSelectionsBtn   = document.getElementById('editSelectionsBtn');
  const clearAllEnrolledBtn = document.getElementById('clearAllEnrolledBtn');

  // Picker section (Edit Mode)
  const pickerSection       = document.getElementById('pickerSection');
  const availableGrid       = document.getElementById('availableCoursesGrid');
  const selectedList        = document.getElementById('selectedCoursesList');
  const saveBtn             = document.getElementById('saveCoursesBtn');
  const clearSelectionBtn   = document.getElementById('clearSelectionBtn');
  const clearChipsBtn       = document.getElementById('clearChipsBtn');
  const selectionCounter    = document.getElementById('selectionCounter');
  const searchInput         = document.getElementById('courseSearchInput');
  const headerActions       = document.getElementById('headerActions');

  // ── Toast Notification Helper ──────────────────────────────────────────
  function showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#003bf7'};
      color: white;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      z-index: 99999;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // ── Load all subjects from Supabase ────────────────────────────────────
  async function loadSubjects() {
    let deletedKeys = new Set();
    try {
      const list = JSON.parse(localStorage.getItem('preptrack_deleted_courses') || '[]');
      deletedKeys = new Set(list.map(k => String(k).trim().toLowerCase()));
    } catch(e) {}

    // 1. Try supaDB helper first (guaranteed permanent synchronization with deletion tombstones)
    if (window.supaDB && window.supaDB.getSubjects) {
      try {
        const dbData = await window.supaDB.getSubjects();
        if (dbData && dbData.length > 0) {
          allSubjects = dbData.filter(s => {
            if (!s || !s.name) return false;
            return !deletedKeys.has(s.name.trim().toLowerCase()) && !deletedKeys.has(String(s.id || '').toLowerCase());
          });
          return;
        }
      } catch (e) { }
    }

    try {
      if (client) {
        const { data, error } = await client.from('subjects').select('*').order('name');
        if (!error && data && data.length > 0) {
          allSubjects = data.filter(s => {
            if (!s || !s.name) return false;
            return !deletedKeys.has(s.name.trim().toLowerCase()) && !deletedKeys.has(String(s.id || '').toLowerCase());
          });
          localStorage.setItem('preptrack_subjects_cache', JSON.stringify(allSubjects));
          return;
        }
      }
    } catch (err) {
      console.warn('Direct subjects query failed, trying fallback:', err);
    }

    // Check localStorage master / cache
    try {
      const cached = localStorage.getItem('preptrack_master_courses') || localStorage.getItem('preptrack_subjects_cache') || localStorage.getItem('preptrack_subjects');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allSubjects = parsed.filter(s => {
            if (!s || !s.name) return false;
            return !deletedKeys.has(s.name.trim().toLowerCase()) && !deletedKeys.has(String(s.id || '').toLowerCase());
          });
          return;
        }
      }
    } catch(e) {}

    // Use default curriculum fallback list filtered by deleted courses
    allSubjects = DEFAULT_FALLBACK_SUBJECTS.filter(s => {
      return !deletedKeys.has(s.name.trim().toLowerCase()) && !deletedKeys.has(String(s.id || '').toLowerCase());
    });
  }

  // ── Load student's saved course preferences ────────────────────────────
  async function loadStudentCourses() {
    try {
      if (client && user && user.id !== 'demo-student-id') {
        const { data, error } = await client.from('student_course_preferences')
          .select('subject_id').eq('user_id', user.id);
        if (!error && data) {
          selectedCourseIds = new Set(data.map(p => p.subject_id));
          localStorage.setItem('preptrack_selected_courses', JSON.stringify(Array.from(selectedCourseIds)));
          return;
        }
      }
    } catch (err) {
      console.warn('Error loading student course preferences from DB:', err);
    }

    // Fallback to local storage
    try {
      const cached = localStorage.getItem('preptrack_selected_courses');
      if (cached) {
        selectedCourseIds = new Set(JSON.parse(cached));
      }
    } catch (e) { }
  }

  // ── Save course preferences to Supabase & localStorage ─────────────────
  async function saveCoursePreferences(idsToSave = selectedCourseIds, showToastMsg = true) {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }
    try {
      if (client && user && user.id !== 'demo-student-id') {
        const { error: delError } = await client.from('student_course_preferences')
          .delete().eq('user_id', user.id);
        if (delError) console.warn('Delete old preferences warning:', delError);

        if (idsToSave.size > 0) {
          const inserts = Array.from(idsToSave).map(sid => ({ user_id: user.id, subject_id: sid }));
          const { error: insertError } = await client.from('student_course_preferences').insert(inserts);
          if (insertError) {
            console.error('Insert preferences error:', insertError);
            showToast('Failed to save to database: ' + insertError.message, 'error');
            return false;
          }
        }
      }

      // Update in-memory and local cache
      selectedCourseIds = new Set(idsToSave);
      localStorage.setItem('preptrack_selected_courses', JSON.stringify(Array.from(selectedCourseIds)));

      if (showToastMsg) {
        if (selectedCourseIds.size > 0) {
          showToast('Course preferences saved successfully!', 'success');
        } else {
          showToast('All course selections have been cleared.', 'info');
        }
      }

      // If user cleared everything, stay or return to picker mode so they can select
      isEditMode = (selectedCourseIds.size === 0);
      renderAll();
      return true;
    } catch (err) {
      console.error('Error in saveCoursePreferences:', err);
      showToast('Unexpected error while saving.', 'error');
      return false;
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save My Selections';
      }
    }
  }

  // ── VIEW MODE: Show only enrolled courses ──────────────────────────────
  function renderMyCourses() {
    if (pageTitle) pageTitle.textContent = 'My Courses';
    if (pageSubtitle) pageSubtitle.textContent = 'Your enrolled courses for this programme.';

    const selected = allSubjects.filter(s => selectedCourseIds.has(s.id));

    // If student has no selected courses, automatically direct to picker mode
    if (selected.length === 0) {
      isEditMode = true;
      renderEditMode();
      return;
    }

    if (coursesEmptyState) coursesEmptyState.style.display = 'none';
    if (coursesContent) coursesContent.style.display = 'block';

    if (enrolledSection) enrolledSection.style.display = 'block';
    if (pickerSection) pickerSection.style.display = 'none';

    if (enrolledBadgeCount) {
      enrolledBadgeCount.textContent = `${selected.length} Enrolled Course${selected.length !== 1 ? 's' : ''}`;
    }

    if (headerActions) {
      headerActions.innerHTML = `
        <button class="btn btn-outline" id="headerChangeBtn" style="font-size:13px; padding:8px 16px;">
          Change Selections
        </button>
      `;
      document.getElementById('headerChangeBtn')?.addEventListener('click', () => {
        isEditMode = true;
        renderAll();
      });
    }

    if (enrolledGrid) {
      enrolledGrid.innerHTML = selected.map(subject => `
        <div class="course-card selected" data-id="${subject.id}">
          <div class="course-card-check">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3>${escapeHtml(subject.name)}</h3>
          <p class="course-card-status">Enrolled</p>
          <div class="course-card-footer">
            <span style="font-size:11px; color:var(--text-light);">Active module</span>
            <button class="btn-remove-course" data-id="${subject.id}" data-name="${escapeHtml(subject.name)}" title="Remove this course">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Remove
            </button>
          </div>
        </div>
      `).join('');

      // Attach remove handlers to individual enrolled cards
      enrolledGrid.querySelectorAll('.btn-remove-course').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const name = btn.dataset.name || 'Course';
          selectedCourseIds.delete(id);
          showToast(`Removed "${name}" from your courses.`, 'info');
          await saveCoursePreferences(selectedCourseIds, false);
        });
      });
    }
  }

  // ── EDIT / PICKER MODE: Show all subjects to select/deselect ───────────
  function renderEditMode() {
    if (pageTitle) pageTitle.textContent = 'Select Your Courses';
    if (pageSubtitle) pageSubtitle.textContent = 'Click on any course to select or unselect it. Use the Clear All button to reset.';

    if (allSubjects.length === 0) {
      if (coursesEmptyState) coursesEmptyState.style.display = 'flex';
      if (coursesContent) coursesContent.style.display = 'none';
      return;
    }

    if (coursesEmptyState) coursesEmptyState.style.display = 'none';
    if (coursesContent) coursesContent.style.display = 'block';

    if (enrolledSection) enrolledSection.style.display = 'none';
    if (pickerSection) pickerSection.style.display = 'block';

    const hasExisting = selectedCourseIds.size > 0;
    if (headerActions) {
      if (hasExisting) {
        headerActions.innerHTML = `
          <button class="btn btn-ghost" id="cancelEditBtn" style="font-size:13px; padding:8px 16px;">
            ← Back to Enrolled Courses
          </button>
        `;
        document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
          isEditMode = false;
          renderAll();
        });
      } else {
        headerActions.innerHTML = '';
      }
    }

    updateSelectionCounter();
    renderFilteredAvailableGrid();
    renderSelectedList();
  }

  // ── Update selection counter badge ────────────────────────────────────
  function updateSelectionCounter() {
    if (selectionCounter) {
      const count = selectedCourseIds.size;
      selectionCounter.textContent = `${count} selected`;
      selectionCounter.style.color = count > 0 ? 'var(--primary)' : 'var(--text-light)';
    }
    if (clearChipsBtn) {
      clearChipsBtn.style.display = selectedCourseIds.size > 0 ? 'inline-flex' : 'none';
    }
  }

  // ── Render available courses grid with search filtering ───────────────
  function renderFilteredAvailableGrid() {
    if (!availableGrid) return;

    let filtered = allSubjects;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = allSubjects.filter(s => s.name.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      availableGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: var(--text-light);">
          <p style="font-size:15px; margin-bottom:8px;">No courses matching "<strong>${escapeHtml(searchQuery)}</strong>"</p>
          <button class="btn btn-sm btn-ghost" id="clearSearchBtn" style="font-size:13px;">Clear Search</button>
        </div>
      `;
      document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
        searchQuery = '';
        if (searchInput) searchInput.value = '';
        renderFilteredAvailableGrid();
      });
      return;
    }

    availableGrid.innerHTML = filtered.map(subject => {
      const isSel = selectedCourseIds.has(subject.id);
      return `
        <div class="course-card ${isSel ? 'selected' : ''}" data-id="${subject.id}" role="button" tabindex="0">
          <div class="course-card-check">
            ${isSel ? `
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ` : `
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity:0.35;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            `}
          </div>
          <h3>${escapeHtml(subject.name)}</h3>
          <p class="course-card-status">${isSel ? 'Selected (Click to deselect)' : 'Click to select'}</p>
        </div>
      `;
    }).join('');

    // Attach card click toggles
    availableGrid.querySelectorAll('.course-card').forEach(card => {
      const handleToggle = () => {
        const id = card.dataset.id;
        if (!id) return;
        if (selectedCourseIds.has(id)) {
          selectedCourseIds.delete(id);
          card.classList.remove('selected');
          const checkEl = card.querySelector('.course-card-check');
          if (checkEl) checkEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity:0.35;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
          const statusEl = card.querySelector('.course-card-status');
          if (statusEl) statusEl.textContent = 'Click to select';
        } else {
          selectedCourseIds.add(id);
          card.classList.add('selected');
          const checkEl = card.querySelector('.course-card-check');
          if (checkEl) checkEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
          const statusEl = card.querySelector('.course-card-status');
          if (statusEl) statusEl.textContent = 'Selected (Click to deselect)';
        }
        updateSelectionCounter();
        renderSelectedList();
      };

      card.addEventListener('click', handleToggle);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      });
    });
  }

  // ── Chips list of current selections ───────────────────────────────────
  function renderSelectedList() {
    if (!selectedList) return;
    const selected = allSubjects.filter(s => selectedCourseIds.has(s.id));
    if (selected.length === 0) {
      selectedList.innerHTML = `
        <div style="background:var(--surface,#ffffff); border:1px dashed var(--border,#e2e8f0); border-radius:12px; padding:20px; text-align:center;">
          <p style="color:var(--text-light); font-size:14px; margin:0;">
            No courses selected yet. Click any course above to add it.
          </p>
        </div>
      `;
      return;
    }

    selectedList.innerHTML = `
      <div class="selected-courses-chips">
        ${selected.map(s => `
          <span class="course-chip">
            ${escapeHtml(s.name)}
            <button class="chip-remove" data-id="${s.id}" title="Remove ${escapeHtml(s.name)}">×</button>
          </span>
        `).join('')}
      </div>
    `;

    selectedList.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        selectedCourseIds.delete(id);
        updateSelectionCounter();
        renderFilteredAvailableGrid();
        renderSelectedList();
      });
    });
  }

  // ── Master render ──────────────────────────────────────────────────────
  function renderAll() {
    if (isEditMode) {
      renderEditMode();
    } else {
      renderMyCourses();
    }
  }

  // ── Event Listeners ────────────────────────────────────────────────────

  // Save button
  saveBtn?.addEventListener('click', () => saveCoursePreferences(selectedCourseIds, true));

  // Edit selections from enrolled view
  editSelectionsBtn?.addEventListener('click', () => {
    isEditMode = true;
    renderAll();
  });

  // Clear ALL enrolled courses from view mode
  clearAllEnrolledBtn?.addEventListener('click', async () => {
    if (selectedCourseIds.size === 0) {
      showToast('No courses to clear.', 'info');
      return;
    }
    const confirmClear = confirm('Are you sure you want to clear all your enrolled courses? You will be able to select new courses immediately.');
    if (!confirmClear) return;

    selectedCourseIds.clear();
    await saveCoursePreferences(selectedCourseIds, false);
    showToast('All enrolled courses have been cleared. Select your courses below.', 'info');
  });

  // Clear All button in picker toolbar
  clearSelectionBtn?.addEventListener('click', () => {
    if (selectedCourseIds.size === 0) {
      showToast('No courses are currently selected.', 'info');
      return;
    }
    selectedCourseIds.clear();
    updateSelectionCounter();
    renderFilteredAvailableGrid();
    renderSelectedList();
    showToast('All course selections cleared.', 'info');
  });

  // Clear chips button
  clearChipsBtn?.addEventListener('click', () => {
    if (selectedCourseIds.size === 0) return;
    selectedCourseIds.clear();
    updateSelectionCounter();
    renderFilteredAvailableGrid();
    renderSelectedList();
    showToast('All selections cleared.', 'info');
  });

  // Search input filter
  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderFilteredAvailableGrid();
  });

  // Reload courses button if empty state is reached
  reloadCoursesBtn?.addEventListener('click', async () => {
    await loadSubjects();
    renderAll();
  });

  // ── Init ───────────────────────────────────────────────────────────────
  await Promise.all([loadSubjects(), loadStudentCourses()]);
  renderAll();

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});

// Expose for other pages (attendance.js, dashboard.js use this)
window.getStudentSelectedSubjectIds = async function() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
  if (!client) return null;
  let userId = null;
  try {
    const { data: { user } } = await client.auth.getUser();
    userId = user?.id;
  } catch (e) { }

  if (!userId) {
    try {
      const cached = localStorage.getItem('preptrack_selected_courses');
      if (cached) return JSON.parse(cached);
    } catch(e) {}
    return null;
  }

  try {
    const { data, error } = await client.from('student_course_preferences')
      .select('subject_id').eq('user_id', userId);
    if (!error && data && data.length > 0) {
      return data.map(p => p.subject_id);
    }
  } catch (e) { }

  try {
    const cached = localStorage.getItem('preptrack_selected_courses');
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  return null;
};
