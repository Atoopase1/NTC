/**
 * PrepTrack - Student Course Management ("My Courses")
 * Handles loading available subjects and saving student course selections.
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
  
  // Load subjects from supabase subjects table
  async function loadSubjects() {
    try {
      const { data, error } = await client.from('subjects').select('*').order('name');
      if (error) {
        console.error('Error fetching subjects:', error);
        return;
      }
      allSubjects = data || [];
    } catch (err) {
      console.error('Failed to load subjects:', err);
    }
  }
  
  // Load student's course preferences
  async function loadStudentCourses() {
    try {
      const { data, error } = await client.from('student_course_preferences')
        .select('subject_id').eq('user_id', user.id);
      if (error) {
        console.warn('Error fetching preferences:', error.message);
      }
      if (data) {
        selectedCourseIds = new Set(data.map(p => p.subject_id));
      }
    } catch (err) {
      console.error('Failed to load student course preferences:', err);
    }
  }
  
  // Save course preferences
  async function saveCoursePreferences() {
    const saveBtn = document.getElementById('saveCoursesBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      // Delete existing preferences
      const { error: delError } = await client.from('student_course_preferences').delete().eq('user_id', user.id);
      if (delError) {
        console.warn('Delete old preferences warning:', delError);
      }
      
      // Insert new preferences
      if (selectedCourseIds.size > 0) {
        const inserts = Array.from(selectedCourseIds).map(sid => ({
          user_id: user.id,
          subject_id: sid
        }));
        const { error } = await client.from('student_course_preferences').insert(inserts);
        if (error) { 
          if (window.showToast) {
            window.showToast('Failed to save preferences: ' + error.message, 'error');
          } else {
            alert('Failed to save preferences: ' + error.message);
          }
          return;
        }
      }

      if (window.showToast) {
        window.showToast('Course preferences saved!', 'success');
      } else {
        alert('Course preferences saved successfully!');
      }
      renderAll();
    } catch (err) {
      console.error('Error in saveCoursePreferences:', err);
      if (window.showToast) {
        window.showToast('An unexpected error occurred while saving.', 'error');
      } else {
        alert('An unexpected error occurred while saving.');
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save My Selections';
      }
    }
  }
  
  // Render courses grid
  function renderCoursesGrid() {
    const grid = document.getElementById('availableCoursesGrid');
    const emptyState = document.getElementById('coursesEmptyState');
    const content = document.getElementById('coursesContent');
    if (!grid) return;

    if (allSubjects.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      if (content) content.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (content) content.style.display = 'block';
    
    grid.innerHTML = allSubjects.map(subject => {
      const isSelected = selectedCourseIds.has(subject.id);
      return `<div class="course-card ${isSelected ? 'selected' : ''}" data-id="${subject.id}">
        <div class="course-card-check">${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>
        <h3>${subject.name}</h3>
        <p class="course-card-status">${isSelected ? 'Selected' : 'Click to select'}</p>
      </div>`;
    }).join('');
    
    grid.querySelectorAll('.course-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (selectedCourseIds.has(id)) {
          selectedCourseIds.delete(id);
          card.classList.remove('selected');
        } else {
          selectedCourseIds.add(id);
          card.classList.add('selected');
        }
        renderSelectedList();
        // Update check icon
        const check = card.querySelector('.course-card-check');
        if (check) {
          check.innerHTML = selectedCourseIds.has(id) ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : '';
        }
        const status = card.querySelector('.course-card-status');
        if (status) {
          status.textContent = selectedCourseIds.has(id) ? 'Selected' : 'Click to select';
        }
      });
    });
  }
  
  function renderSelectedList() {
    const list = document.getElementById('selectedCoursesList');
    if (!list) return;
    const selected = allSubjects.filter(s => selectedCourseIds.has(s.id));
    if (selected.length === 0) {
      list.innerHTML = '<p class="text-muted" style="color: var(--text-light); font-size: 14px;">No courses selected yet. Click courses above to select them.</p>';
      return;
    }
    list.innerHTML = `<div class="selected-courses-chips">${selected.map(s => `<span class="course-chip">${s.name} <button class="chip-remove" data-id="${s.id}" title="Remove course">×</button></span>`).join('')}</div>`;
    list.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedCourseIds.delete(btn.dataset.id);
        renderCoursesGrid();
        renderSelectedList();
      });
    });
  }
  
  function renderAll() {
    renderCoursesGrid();
    renderSelectedList();
  }
  
  document.getElementById('saveCoursesBtn')?.addEventListener('click', saveCoursePreferences);
  
  // Init
  await Promise.all([loadSubjects(), loadStudentCourses()]);
  renderAll();
});

// Also expose getStudentSelectedSubjectIds for other pages to use
window.getStudentSelectedSubjectIds = async function() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null; // null = not logged in
  const { data, error } = await client.from('student_course_preferences').select('subject_id').eq('user_id', user.id);
  if (error || !data || data.length === 0) return null; // null = no preferences set
  return data.map(p => p.subject_id);
};
