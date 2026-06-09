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
});
