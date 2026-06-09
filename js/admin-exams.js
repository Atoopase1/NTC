// ============================================
// NTC Exam Prep - Admin Scheduled Exams Logic
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.supaDB) return;

  // Admin page — auth guard is handled by auth.js

  const scheduleExamForm = document.getElementById('scheduleExamForm');
  const examSubjectSelect = document.getElementById('examSubject');
  const scheduledExamsTableBody = document.getElementById('scheduledExamsTableBody');

  // Tab switching
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.getAttribute('data-tab'));
      if (target) target.classList.add('active');
    });
  });

  // ─── Load Subjects ───────────────────────────────────────────────────────────
  const loadSubjects = async () => {
    try {
      const subjects = await window.supaDB.getSubjects();
      if (subjects && subjects.length > 0) {
        let html = '<option value="" disabled selected>Select a subject</option>';
        subjects.forEach(sub => {
          html += `<option value="${sub.name}">${sub.name}</option>`;
        });
        examSubjectSelect.innerHTML = html;
      } else {
        examSubjectSelect.innerHTML = '<option value="" disabled selected>No subjects — add subjects first</option>';
      }
    } catch (e) {
      console.error(e);
      examSubjectSelect.innerHTML = '<option value="" disabled selected>Error loading subjects</option>';
    }
  };

  // ─── Load Scheduled Exams Table ──────────────────────────────────────────────
  const loadScheduledExams = async () => {
    try {
      const exams = await window.supaDB.getScheduledExams();
      if (exams && exams.length > 0) {
        const now = new Date();
        let html = '';

        exams.forEach(exam => {
          const startTime = new Date(exam.start_time);
          const endTime   = new Date(exam.end_time);
          const qCount    = Array.isArray(exam.questions_data) ? exam.questions_data.length : '?';

          let statusHtml;
          if (now < startTime) {
            statusHtml = '<span class="badge-type" style="background:var(--secondary);color:white;padding:4px 10px;border-radius:99px;font-size:var(--text-xs);">Upcoming</span>';
          } else if (now >= startTime && now <= endTime) {
            statusHtml = '<span class="badge-type" style="background:var(--success);color:white;padding:4px 10px;border-radius:99px;font-size:var(--text-xs);">Active Now</span>';
          } else {
            statusHtml = '<span class="badge-type" style="background:var(--surface-hover);color:var(--text-light);padding:4px 10px;border-radius:99px;font-size:var(--text-xs);">Completed</span>';
          }

          html += `
            <tr>
              <td><strong>${exam.title}</strong></td>
              <td>${exam.subject}</td>
              <td>${qCount} Qs</td>
              <td>${startTime.toLocaleString()}</td>
              <td>${endTime.toLocaleString()}</td>
              <td>${exam.duration_minutes || 60} mins</td>
              <td>${statusHtml}</td>
              <td>
                <div class="table-actions">
                  <button class="btn-icon delete" aria-label="Delete" onclick="window.deleteExam('${exam.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
        });
        scheduledExamsTableBody.innerHTML = html;
      } else {
        scheduledExamsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-light);">No scheduled exams yet. Click "Schedule New Exam" to create one.</td></tr>';
      }
    } catch (e) {
      console.error(e);
      scheduledExamsTableBody.innerHTML = '<tr><td colspan="7" style="color:var(--danger);">Failed to load exams.</td></tr>';
    }
  };

  // ─── Plain Text Parser ───────────────────────────────────────────────────────
  /**
   * Parses plain-text questions like:
   *   1. What is X?
   *   A. Option one
   *   B. Option two
   *   C. Option three
   *   D. Option four
   *
   * And an answer key like: "A, B, C, D, A, ..."
   *
   * Returns an array of { question, options, answer } objects,
   * or throws an Error with a descriptive message.
   */
  function parsePlainTextExam(questionsText, answerKeyText) {
    const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };

    // ── Step 1: Parse the answer key ────────────────────────────────────────
    const rawKeys = answerKeyText.split(',').map(s => s.trim().toUpperCase());
    if (rawKeys.some(k => !['A','B','C','D'].includes(k))) {
      throw new Error(`Answer key contains invalid letters. Only A, B, C, D are allowed. Found: "${rawKeys.find(k => !['A','B','C','D'].includes(k))}"`);
    }
    const answerIndexes = rawKeys.map(k => letterToIndex[k]);

    // ── Step 2: Split text into question blocks ──────────────────────────────
    // Split on lines starting with a number followed by a dot/parenthesis
    const lines = questionsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Identify where each question starts (lines that begin with "N." or "N)")
    const questionStartRegex = /^(\d+)[.)]\s+(.+)/;
    const optionRegex        = /^([A-D])[.)]\s+(.+)/i;

    const questionBlocks = [];
    let currentBlock = null;

    for (const line of lines) {
      const qMatch = line.match(questionStartRegex);
      const oMatch = line.match(optionRegex);

      if (qMatch) {
        if (currentBlock) questionBlocks.push(currentBlock);
        currentBlock = { question: qMatch[2].trim(), options: [] };
      } else if (oMatch && currentBlock) {
        currentBlock.options.push(oMatch[2].trim());
      } else if (currentBlock && currentBlock.options.length === 0) {
        // Continuation of the question text on the next line
        currentBlock.question += ' ' + line;
      }
    }
    if (currentBlock) questionBlocks.push(currentBlock);

    // ── Step 3: Validate ────────────────────────────────────────────────────
    if (questionBlocks.length === 0) {
      throw new Error('No questions found. Make sure each question starts with a number (1. 2. etc.) and options start with letters (A. B. C. D.)');
    }

    // Every question must have exactly 4 options
    questionBlocks.forEach((block, i) => {
      if (block.options.length !== 4) {
        throw new Error(`Question ${i + 1} has ${block.options.length} option(s). Each question must have exactly 4 options (A, B, C, D).`);
      }
    });

    if (answerIndexes.length !== questionBlocks.length) {
      throw new Error(`Mismatch: You have ${questionBlocks.length} question(s) but ${answerIndexes.length} answer(s) in the key. They must match.`);
    }

    // ── Step 4: Build final JSON ─────────────────────────────────────────────
    return questionBlocks.map((block, i) => ({
      question: block.question,
      options:  block.options,
      answer:   answerIndexes[i]
    }));
  }

  // ─── Form Submission ─────────────────────────────────────────────────────────
  if (scheduleExamForm) {
    scheduleExamForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title         = document.getElementById('examTitle').value.trim();
      const subject       = examSubjectSelect.value;
      const startTimeStr  = document.getElementById('examStartTime').value;
      const endTimeStr    = document.getElementById('examEndTime').value;
      const durationMins  = parseInt(document.getElementById('examDuration').value) || 60;
      const questionsText = document.getElementById('examQuestionsText').value.trim();
      const answerKeyText = document.getElementById('examAnswerKey').value.trim();

      const startIso = new Date(startTimeStr).toISOString();
      const endIso   = new Date(endTimeStr).toISOString();

      // Validate dates
      if (new Date(startTimeStr) >= new Date(endTimeStr)) {
        window.showToast('End time must be after start time.', 'error');
        return;
      }

      // Parse plain text into structured questions
      let parsedQuestions;
      try {
        parsedQuestions = parsePlainTextExam(questionsText, answerKeyText);
      } catch (err) {
        window.showToast('Error: ' + err.message, 'error');
        return;
      }

      const submitBtn = scheduleExamForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner spinner-sm"></span> Scheduling...';

      const { error } = await window.supaDB.createScheduledExam({
        title,
        subject,
        start_time: startIso,
        end_time: endIso,
        duration_minutes: durationMins,
        questions_data: parsedQuestions
      });

      submitBtn.disabled = false;
      submitBtn.textContent = originalText;

      if (error) {
        console.error(error);
        window.showToast('Failed to schedule exam. See console for details.', 'error');
      } else {
        window.showToast(`Exam scheduled! (${parsedQuestions.length} questions parsed)`, 'success');
        scheduleExamForm.reset();
        document.querySelector('[data-tab="manage-exams"]').click();
        loadScheduledExams();
      }
    });
  }

  // ─── Global delete ───────────────────────────────────────────────────────────
  window.deleteExam = async (id) => {
    if (confirm('Are you sure you want to delete this scheduled exam? This cannot be undone.')) {
      const { error } = await window.supaDB.deleteScheduledExam(id);
      if (error) {
        window.showToast('Failed to delete exam.', 'error');
      } else {
        window.showToast('Exam deleted.', 'success');
        loadScheduledExams();
      }
    }
  };

  // ─── Init ────────────────────────────────────────────────────────────────────
  loadSubjects();
  loadScheduledExams();
});
