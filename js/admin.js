// ============================================
// NTC Exam Prep - Admin Logic
// Subjects, Lessons (with file uploads), Tabs
// ============================================

document.addEventListener('DOMContentLoaded', async () => {

  // Protect route
  if (localStorage.getItem('ntc_is_admin') !== 'true') {
    window.location.href = 'dashboard.html';
    return;
  }
  // ─── Admin Tabs ─────────────────────────────────────────────────────────────
  const adminTabs = document.querySelectorAll('.admin-tab');
  const tabContents = document.querySelectorAll('.tab-content');
  let editingLessonId = null;
  let editingLessonMediaUrl = null;

  adminTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      adminTabs.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // ─── Subjects ────────────────────────────────────────────────────────────────
  const loadSubjects = async () => {
    const subjects = await window.supaDB.getSubjects();
    renderSubjectsTable(Array.isArray(subjects) ? subjects : []);
    populateTopicDropdowns(Array.isArray(subjects) ? subjects : []);
  };

  const renderSubjectsTable = (subjects) => {
    const tbody = document.getElementById('subjectsTableBody');
    if (!tbody) return;
    if (!subjects.length) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-light);">No subjects yet.</td></tr>';
      return;
    }
    tbody.innerHTML = subjects.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>
          <div class="table-actions">
            <button class="btn-icon edit" data-id="${s.id}" data-name="${s.name}" title="Edit Subject">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            </button>
            <button class="btn-icon delete" data-id="${s.id}" title="Delete Subject">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-icon.edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        const oldName = btn.getAttribute('data-name');
        const newName = prompt('Edit Subject Name:', oldName);
        if (newName !== null && newName.trim() !== '' && newName.trim() !== oldName) {
          btn.disabled = true;
          const { error } = await window.supaDB.updateSubject(id, newName.trim());
          if (error) {
            alert('Failed to update subject: ' + error.message);
            btn.disabled = false;
          } else {
            loadSubjects();
            if (window.showToast) window.showToast('Subject updated!', 'success');
          }
        }
      });
    });

    tbody.querySelectorAll('.btn-icon.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('Are you sure you want to delete this subject?')) return;
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        const { error } = await window.supaDB.deleteSubject(id);
        if (error) {
          alert('Failed to delete subject: ' + error.message);
          btn.disabled = false;
        } else {
          loadSubjects();
        }
      });
    });
  };

  const populateTopicDropdowns = (subjects) => {
    ['lessonTopic'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const current = el.value;
      el.innerHTML = '<option value="" disabled selected>Select subject...</option>'
        + subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
      if (current) el.value = current;
    });
  };

  // Add Subject form
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
        window.showToast('Subject added!', 'success');
      } catch (err) {
        alert('Failed to add subject: ' + (err.message || 'Unknown error'));
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }

  // ─── Lessons Table ────────────────────────────────────────────────────────────
  const loadLessons = async () => {
    const tbody = document.getElementById('lessonsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);">Loading...</td></tr>';
    const { data, error } = await window.supaDB.getLessons();
    if (error || !data) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--danger);">Failed to load lessons.</td></tr>';
      return;
    }
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);">No lessons published yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(l => {
      let type = l.media_type || 'text';
      if (type === 'text' && l.media_url && l.media_url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i)) {
        type = 'image';
      }
      
      const badgeClass = type === 'video' ? 'badge-video' : type === 'pdf' ? 'badge-pdf' : type === 'image' ? 'badge-image' : type === 'audio' ? 'badge-audio' : type === 'file' ? 'badge-doc' : 'badge-text';
      const badgeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const date = new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <tr>
          <td><strong>${l.subject || '—'}</strong></td>
          <td>${l.title || l.subtopic || '—'}</td>
          <td><span class="badge-type ${badgeClass}">${badgeLabel}</span></td>
          <td>${date}</td>
          <td>
            <div class="table-actions">
              ${l.media_url ? `<a href="${l.media_url}" target="_blank" class="btn-icon" title="Open"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ''}
              <button class="btn-icon edit-lesson" data-id="${l.id}" title="Edit">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              </button>
              <button class="btn-icon delete" data-id="${l.id}" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-icon.edit-lesson').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const lesson = data.find(l => l.id == id);
        if (!lesson) return;

        editingLessonId = id;
        editingLessonMediaUrl = lesson.media_url || null;

        // Populate form
        const topicSelect = document.getElementById('lessonTopic');
        if (topicSelect.querySelector(`option[value="${lesson.subject}"]`)) {
          topicSelect.value = lesson.subject;
        }
        document.getElementById('lessonSubtopic').value = lesson.title || '';
        document.getElementById('lessonDescription').value = lesson.description || '';

        const formType = (lesson.media_type === 'video' || lesson.media_type === 'pdf' || lesson.media_type === 'image' || lesson.media_type === 'audio' || lesson.media_type === 'file') ? 'file' : lesson.media_type === 'link' ? 'link' : 'text';
        
        switchMaterialType(formType);
        const radio = document.querySelector(`input[name="lessonType"][value="${formType}"]`);
        if (radio) radio.checked = true;

        if (formType === 'file') {
          selectedFile = null;
          if (lesson.media_url) {
            const fileName = lesson.media_url.split('/').pop() || 'Existing File';
            document.getElementById('dropZone').style.display = 'none';
            document.getElementById('filePreviewIcon').innerHTML = getFileIcon(lesson.media_type || 'application/pdf');
            document.getElementById('filePreviewName').textContent = fileName;
            document.getElementById('filePreviewSize').textContent = '(Will keep existing file unless changed)';
            document.getElementById('filePreview').style.display = 'flex';
          }
        } else if (formType === 'link') {
          document.getElementById('lessonLink').value = lesson.media_url || '';
        } else {
          document.getElementById('lessonContent').value = lesson.content || '';
        }

        const btnSubmit = document.getElementById('publishBtn');
        btnSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg> Update Lesson`;

        document.querySelector('[data-tab="add-lesson"]')?.click();
      });
    });

    tbody.querySelectorAll('.btn-icon.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this lesson?')) return;
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        const { error } = await window.supaDB.deleteLesson(id);
        if (error) alert('Failed: ' + error.message);
        else loadLessons();
      });
    });
  };

  // ─── Material Type Switcher ───────────────────────────────────────────────────
  const typePills = document.querySelectorAll('.type-pill');
  const fileUploadSection = document.getElementById('fileUploadSection');
  const linkSection = document.getElementById('linkSection');
  const textSection = document.getElementById('textSection');

  const switchMaterialType = (type) => {
    typePills.forEach(p => p.classList.toggle('active', p.getAttribute('data-type') === type));
    fileUploadSection && (fileUploadSection.style.display = type === 'file' ? '' : 'none');
    linkSection && (linkSection.style.display = type === 'link' ? '' : 'none');
    textSection && (textSection.style.display = type === 'text' ? '' : 'none');
  };

  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const radio = pill.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      switchMaterialType(pill.getAttribute('data-type'));
    });
  });

  // Init with file upload visible
  switchMaterialType('file');

  // ─── Drag & Drop + File Preview ───────────────────────────────────────────────
  let selectedFile = null;

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('lessonFile');
  const browseBtn = document.getElementById('browseBtn');
  const filePreview = document.getElementById('filePreview');
  const removeFileBtn = document.getElementById('removeFileBtn');

  if (dropZone) {
    browseBtn && browseBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    });

    fileInput && fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
    });

    removeFileBtn && removeFileBtn.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      filePreview.style.display = 'none';
      dropZone.style.display = '';
    });
  }

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    if (type.startsWith('video/')) return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    if (type.startsWith('audio/')) return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    if (type === 'application/pdf') return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
  };

  const handleFileSelect = (file) => {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) { alert('File is too large. Maximum size is 50MB.'); return; }
    selectedFile = file;
    dropZone.style.display = 'none';
    document.getElementById('filePreviewIcon').innerHTML = getFileIcon(file.type);
    document.getElementById('filePreviewName').textContent = file.name;
    document.getElementById('filePreviewSize').textContent =
      file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(0) + ' KB';
    filePreview.style.display = 'flex';
  };

  // ─── Detect media type from file (must match DB CHECK: 'video'|'pdf'|'text') ──
  const getMediaType = (file) => {
    if (!file) return 'text';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type === 'application/pdf') return 'pdf';
    // images, audio, documents all stored as generic 'text' type in DB
    return 'text';
  };

  // ─── Publish Lesson Form ──────────────────────────────────────────────────────
  const addLessonForm = document.getElementById('addLessonForm');
  if (addLessonForm) {
    addLessonForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('publishBtn');
      const originalHTML = btn.innerHTML;
      const subject = document.getElementById('lessonTopic').value;
      const title = document.getElementById('lessonSubtopic').value.trim();
      const description = document.getElementById('lessonDescription')?.value.trim() || '';
      const typeRadio = document.querySelector('input[name="lessonType"]:checked');
      const materialType = typeRadio ? typeRadio.value : 'file';

      if (!subject || !title) { window.showToast('Please fill in Subject and Title.', 'error'); return; }

      btn.disabled = true;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;margin-right:6px;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Publishing...';

      try {
        let media_url = editingLessonMediaUrl; // Keep existing by default if updating
        let media_type = 'text';
        let content = null;

        if (materialType === 'file') {
          if (!selectedFile && !editingLessonId) { window.showToast('Please select a file to upload.', 'error'); return; }
          
          if (selectedFile) {
            // Show progress bar only if actually uploading a new file
            const progressEl = document.getElementById('uploadProgress');
            const barEl = document.getElementById('uploadBar');
            const pctEl = document.getElementById('uploadPercent');
            if (progressEl) progressEl.style.display = '';

            let fakeProgress = 0;
            const progressInterval = setInterval(() => {
              fakeProgress = Math.min(fakeProgress + Math.random() * 15, 90);
              if (barEl) barEl.style.width = fakeProgress + '%';
              if (pctEl) pctEl.textContent = Math.round(fakeProgress) + '%';
            }, 300);

            const { url, error: uploadError } = await window.supaDB.uploadLessonFile(selectedFile, subject);

            clearInterval(progressInterval);
            if (barEl) barEl.style.width = '100%';
            if (pctEl) pctEl.textContent = '100%';
            setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 600);

            if (uploadError) throw uploadError;
            media_url = url;
            media_type = getMediaType(selectedFile);
          } else if (editingLessonId) {
            // We are keeping the old file
            // Let the database keep the old media_type by not changing it
            // but we need to supply a type so the schema check passes
            // the previous code set media_type = 'text' at the top, let's omit type so it uses the old one if we don't supply it!
            // Actually our supabase.js wrapper updateLesson handles omitting undefined.
            media_type = undefined; // Signal to not update
          }

        } else if (materialType === 'link') {
          media_url = document.getElementById('lessonLink').value.trim();
          if (!media_url) { window.showToast('Please enter an external URL.', 'error'); return; }
          // Detect type from URL
          if (media_url.includes('youtube.com') || media_url.includes('youtu.be') || media_url.includes('vimeo.com')) {
            media_type = 'video';
          } else if (media_url.endsWith('.pdf')) {
            media_type = 'pdf';
          } else {
            media_type = 'link';
          }
        } else {
          content = document.getElementById('lessonContent').value.trim();
          if (!content) { window.showToast('Please write some text notes.', 'error'); return; }
          media_type = 'text';
        }

        if (editingLessonId) {
          const { error } = await window.supaDB.updateLesson(editingLessonId, { subject, title, description, media_url, media_type, content });
          if (error) throw error;
          window.showToast('Lesson updated successfully!', 'success');
        } else {
          const { error } = await window.supaDB.createLesson({ subject, title, description, media_url, media_type, content });
          if (error) throw error;
          window.showToast('Lesson published successfully!', 'success');
        }

        window.resetLessonForm();
        await loadLessons();

        // Switch to manage tab
        document.querySelector('[data-tab="manage-lessons"]')?.click();

      } catch (err) {
        console.error(err);
        window.showToast('Failed to publish: ' + (err.message || 'Unknown error'), 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });
  }

  // ─── Reset lesson form ────────────────────────────────────────────────────────
  window.resetLessonForm = () => {
    addLessonForm && addLessonForm.reset();
    editingLessonId = null;
    editingLessonMediaUrl = null;
    const btnSubmit = document.getElementById('publishBtn');
    if (btnSubmit) btnSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Publish Lesson`;
    
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.style.display = 'none';
    if (dropZone) dropZone.style.display = '';
    const progressEl = document.getElementById('uploadProgress');
    if (progressEl) progressEl.style.display = 'none';
    switchMaterialType('file');
  };

  // ─── Logout ───────────────────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (window.supaAuth) await window.supaAuth.signOut();
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  await loadSubjects();
  await loadLessons();
});
