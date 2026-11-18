/**
 * PrepTrack - Student Course Management ("My Courses")
 * Shows only the student's selected courses.
 * Allows selecting/editing course preferences.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
  if (!client) {
    console.error('Supabase client not initialized');
    return;
  }

  // Check auth
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (!user) {
    window.location.href = '/pages/login.html';
    return;
  }

  let allSubjects = [];
  let selectedCourseIds = new Set();
  let isEditMode = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const coursesContent   = document.getElementById('coursesContent');
  const coursesEmptyState = document.getElementById('coursesEmptyState');
  const grid             = document.getElementById('availableCoursesGrid');
  const selectedList     = document.getElementById('selectedCoursesList');
  const saveBtn          = document.getElementById('saveCoursesBtn');
  const pageSubtitle     = document.querySelector('.page-header p');

  // ── Load all subjects from Supabase ────────────────────────────────────
  async function loadSubjects() {
    try {
      const { data, error } = await client.from('subjects').select('*').order('name');
      if (error) { console.error('Error fetching subjects:', error); return; }
      allSubjects = data || [];
    } catch (err) { console.error('Failed to load subjects:', err); }
  }

  // ── Load student's saved course preferences ────────────────────────────
  async function loadStudentCourses() {
    try {
      const { data, error } = await client.from('student_course_preferences')
        .select('subject_id').eq('user_id', user.id);
      if (error) {
        if ((error.message || '').includes('schema cache') || (error.message || '').includes('does not exist')) {
          console.warn('student_course_preferences table not found. Run preptrack_migration.sql in Supabase.');
          return;
        }
        console.warn('Error fetching preferences:', error.message);
      }
      if (data) selectedCourseIds = new Set(data.map(p => p.subject_id));
    } catch (err) { console.error('Failed to load student course preferences:', err); }
  }

  // ── Save course preferences then switch back to view mode ──────────────
  async function saveCoursePreferences() {
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
    try {
      const { error: delError } = await client.from('student_course_preferences')
        .delete().eq('user_id', user.id);
      if (delError) console.warn('Delete old preferences warning:', delError);

      if (selectedCourseIds.size > 0) {
        const inserts = Array.from(selectedCourseIds).map(sid => ({ user_id: user.id, subject_id: sid }));
        const { error } = await client.from('student_course_preferences').insert(inserts);
        if (error) {
          window.showToast ? window.showToast('Failed to save: ' + error.message, 'error') : alert('Failed to save: ' + error.message);
          return;
        }
      }

      window.showToast ? window.showToast('Course preferences saved!', 'success') : alert('Saved!');
      isEditMode = false;
      renderAll();
    } catch (err) {
      console.error('Error in saveCoursePreferences:', err);
      window.showToast ? window.showToast('Unexpected error while saving.', 'error') : alert('Unexpected error.');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save My Selections'; }
    }
  }

  // ── VIEW MODE: show only selected courses ──────────────────────────────
  function renderMyCourses() {
    if (pageSubtitle) pageSubtitle.textContent = 'Your enrolled courses for this programme.';

    // Hide the picker section header / save button / selected chips list
    const availSection = document.querySelector('.available-courses-section');
    const selectedSection = document.querySelector('.selected-courses-section');
    if (availSection) availSection.style.display = 'none';
    if (selectedSection) selectedSection.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'none';

    const selected = allSubjects.filter(s => selectedCourseIds.has(s.id));

    if (selected.length === 0) {
      // No selections yet — push into edit mode automatically
      isEditMode = true;
      renderEditMode();
      return;
    }

    if (coursesEmptyState) coursesEmptyState.style.display = 'none';
    if (coursesContent) coursesContent.style.display = 'block';

    grid.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
        <p style="margin:0; color:var(--text-light); font-size:var(--text-sm);">
          You are enrolled in <strong>${selected.length}</strong> course${selected.length !== 1 ? 's' : ''}.
        </p>
        <button class="btn btn-outline" id="editCoursesBtn" style="font-size:0.85rem; padding:6px 16px;">
          ✏️ Edit Selections
        </button>
      </div>
      <div class="courses-grid" id="myCoursesGrid">
        ${selected.map(subject => `
          <div class="course-card selected" style="cursor:default;">
            <div class="course-card-check">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3>${escapeHtml(subject.name)}</h3>
            <p class="course-card-status">Enrolled</p>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('editCoursesBtn')?.addEventListener('click', () => {
      isEditMode = true;
      renderAll();
    });
  }

  // ── EDIT MODE: show all subjects for picking ───────────────────────────
  function renderEditMode() {
    if (pageSubtitle) pageSubtitle.textContent = 'Select the courses you are studying to personalise your experience.';

    const availSection = document.querySelector('.available-courses-section');
    const selectedSection = document.querySelector('.selected-courses-section');
    if (availSection) availSection.style.display = '';
    if (selectedSection) selectedSection.style.display = '';
    if (saveBtn) saveBtn.style.display = '';

    if (allSubjects.length === 0) {
      if (coursesEmptyState) coursesEmptyState.style.display = 'flex';
      if (coursesContent) coursesContent.style.display = 'none';
      return;
    }

    if (coursesEmptyState) coursesEmptyState.style.display = 'none';
    if (coursesContent) coursesContent.style.display = 'block';

    // Cancel button (only visible if student already has selections)
    const hasExisting = selectedCourseIds.size > 0;
    grid.innerHTML = `
      ${hasExisting ? `<div style="margin-bottom:14px;">
        <button class="btn btn-ghost" id="cancelEditBtn" style="font-size:0.85rem; padding:6px 14px;">← Back to My Courses</button>
      </div>` : ''}
      <div class="courses-grid-inner" id="subjectsPickerGrid">
        ${allSubjects.map(subject => {
          const isSel = selectedCourseIds.has(subject.id);
          return `<div class="course-card ${isSel ? 'selected' : ''}" data-id="${subject.id}">
            <div class="course-card-check">${isSel ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>
            <h3>${escapeHtml(subject.name)}</h3>
            <p class="course-card-status">${isSel ? 'Selected' : 'Click to select'}</p>
          </div>`;
        }).join('')}
      </div>
    `;

    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
      isEditMode = false;
      renderAll();
    });

    grid.querySelectorAll('.course-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (!id) return;
        if (selectedCourseIds.has(id)) {
          selectedCourseIds.delete(id);
          card.classList.remove('selected');
          card.querySelector('.course-card-check').innerHTML = '';
          card.querySelector('.course-card-status').textContent = 'Click to select';
        } else {
          selectedCourseIds.add(id);
          card.classList.add('selected');
          card.querySelector('.course-card-check').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
          card.querySelector('.course-card-status').textContent = 'Selected';
        }
        renderSelectedList();
      });
    });
  }

  // ── Chips list of current selections (shown in edit mode) ──────────────
  function renderSelectedList() {
    if (!selectedList) return;
    const selected = allSubjects.filter(s => selectedCourseIds.has(s.id));
    if (selected.length === 0) {
      selectedList.innerHTML = '<p style="color:var(--text-light); font-size:14px;">No courses selected yet. Click courses above to select them.</p>';
      return;
    }
    selectedList.innerHTML = `<div class="selected-courses-chips">${selected.map(s =>
      `<span class="course-chip">${escapeHtml(s.name)} <button class="chip-remove" data-id="${s.id}" title="Remove">×</button></span>`
    ).join('')}</div>`;
    selectedList.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        selectedCourseIds.delete(btn.dataset.id);
        renderEditMode();
        renderSelectedList();
      });
    });
  }

  // ── Master render ──────────────────────────────────────────────────────
  function renderAll() {
    if (isEditMode) {
      renderEditMode();
      renderSelectedList();
    } else {
      renderMyCourses();
    }
  }

  saveBtn?.addEventListener('click', saveCoursePreferences);

  // ── Init ───────────────────────────────────────────────────────────────
  await Promise.all([loadSubjects(), loadStudentCourses()]);
  renderAll();

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
});

// Expose for other pages (attendance.js uses this)
window.getStudentSelectedSubjectIds = async function() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  try {
    const { data, error } = await client.from('student_course_preferences')
      .select('subject_id').eq('user_id', user.id);
    if (error || !data || data.length === 0) return null;
    return data.map(p => p.subject_id);
  } catch (e) { return null; }
};
