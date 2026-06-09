document.addEventListener('DOMContentLoaded', () => {
  // --- Tab Switching Logic ---
  const tabBtns = document.querySelectorAll('.admin-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab and corresponding content
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // --- Dynamic Form Logic ---
  const mediaTypeSelect = document.getElementById('lessonMediaType');
  const mediaLinkGroup = document.getElementById('mediaLinkGroup');

  if (mediaTypeSelect && mediaLinkGroup) {
    mediaTypeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'text') {
        mediaLinkGroup.style.display = 'none';
        document.getElementById('lessonMediaLink').required = false;
      } else {
        mediaLinkGroup.style.display = 'block';
        document.getElementById('lessonMediaLink').required = true;
        
        // Update placeholder based on type
        const input = document.getElementById('lessonMediaLink');
        if (e.target.value === 'video') {
          input.placeholder = 'e.g. https://youtube.com/watch?v=...';
        } else if (e.target.value === 'pdf') {
          input.placeholder = 'e.g. https://drive.google.com/file/d/...';
        }
      }
    });
  }

  // --- Form Submission Simulation ---
  const addLessonForm = document.getElementById('addLessonForm');
  if (addLessonForm) {
    addLessonForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = addLessonForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      
      // Basic visual feedback
      btn.textContent = 'Saving Lesson...';
      btn.disabled = true;
      
      // Collect data
      const lessonData = {
        topic: document.getElementById('lessonTopic').value,
        subtopic: document.getElementById('lessonSubtopic').value,
        type: document.getElementById('lessonMediaType').value,
        media_url: document.getElementById('lessonMediaLink').value,
        content: document.getElementById('lessonContent').value,
      };

      try {
        // Here you would normally send `lessonData` to Supabase
        // Example: await supabaseClient.from('lessons').insert(lessonData)
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        alert('Success! Lesson has been saved to the database.');
        addLessonForm.reset();
        
        // Switch back to manage tab to see it (in a real app we'd refresh the table here)
        document.querySelector('[data-tab="manage-lessons"]').click();
        
      } catch (error) {
        console.error('Error saving lesson:', error);
        alert('Failed to save lesson.');
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }
  // --- Subject Management Logic ---
  const loadSubjects = async () => {
    if (!window.supaDB || !window.supaDB.getSubjects) return;
    
    const subjects = await window.supaDB.getSubjects();
    
    // Populate lesson topic dropdown
    const topicSelect = document.getElementById('lessonTopic');
    if (topicSelect) {
      topicSelect.innerHTML = '<option value="" disabled selected>Select a subject area...</option>';
      subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.name;
        option.textContent = subject.name;
        topicSelect.appendChild(option);
      });
    }

    // Populate subjects table
    const tableBody = document.getElementById('subjectsTableBody');
    if (tableBody) {
      tableBody.innerHTML = '';
      if (subjects.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="2">No subjects found. Add one above.</td></tr>';
      } else {
        subjects.forEach(subject => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><strong>${subject.name}</strong></td>
            <td>
              <div class="table-actions">
                <button class="btn-icon delete delete-subject-btn" data-id="${subject.id}" aria-label="Delete">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            </td>
          `;
          tableBody.appendChild(row);
        });

        // Add delete listeners
        document.querySelectorAll('.delete-subject-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this subject?')) return;
            const id = e.currentTarget.getAttribute('data-id');
            e.currentTarget.disabled = true;
            const { error } = await window.supaDB.deleteSubject(id);
            if (error) {
              alert('Failed to delete subject: ' + error.message);
              e.currentTarget.disabled = false;
            } else {
              loadSubjects();
            }
          });
        });
      }
    }
  };

  // Initial load
  loadSubjects();

  // Add Subject Form
  const addSubjectForm = document.getElementById('addSubjectForm');
  if (addSubjectForm) {
    addSubjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('subjectName');
      const name = input.value.trim();
      if (!name) return;
      
      const btn = addSubjectForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Adding...';
      btn.disabled = true;

      try {
        const { error } = await window.supaDB.addSubject(name);
        if (error) throw error;
        input.value = '';
        await loadSubjects();
      } catch (err) {
        console.error(err);
        alert('Failed to add subject: ' + (err.message || 'Unknown error'));
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }
});
