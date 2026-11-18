// ============================================
// PrepTrack - Student Attendance Submission Logic
// ============================================

(function () {
  'use strict';

  let currentUser = null;
  let userProfile = null;
  let allSessions = [];
  let currentActiveSession = null;

  document.addEventListener('DOMContentLoaded', async () => {
    await initAuthAndLoad();
  });

  // Haversine Distance in metres
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Initialize authentication and load sessions
  async function initAuthAndLoad() {
    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
    if (!client) {
      setTimeout(initAuthAndLoad, 300);
      return;
    }

    try {
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) {
        window.location.href = 'login.html';
        return;
      }
      currentUser = user;

      // Fetch user profile for name and index number
      try {
        const { data: profile } = await client
          .from('profiles')
          .select('full_name, index_number, course')
          .eq('id', user.id)
          .maybeSingle();

        userProfile = profile || {};
      } catch (e) {
        userProfile = {};
      }

      await loadSessions();
    } catch (err) {
      console.error('Auth error in attendance.js:', err);
      window.location.href = 'login.html';
    }
  }

  // Load all sessions & student submission statuses
  async function loadSessions() {
    const container = document.getElementById('sessionsContainer');
    if (!container) return;

    container.innerHTML = '<p style="color:var(--text-light);">Loading attendance sessions...</p>';

    try {
      const { data: sessions, error } = await window.supaAttendance.getAllSessionsForStudent();
      if (error) {
        container.innerHTML = `<div class="attendance-status-box error">Error loading sessions: ${escapeHtml(error.message)}</div>`;
        return;
      }

      allSessions = sessions || [];

      if (allSessions.length === 0) {
        container.innerHTML = `
          <div class="attendance-card" style="text-align:center; padding:40px 20px;">
            <h3 style="margin-bottom:8px;">No Attendance Sessions</h3>
            <p style="color:var(--text-light); margin:0;">There are currently no active or scheduled attendance sessions for you.</p>
          </div>
        `;
        return;
      }

      // Check submissions for each session
      const submissionChecks = await Promise.all(
        allSessions.map(session =>
          window.supaAttendance.checkAlreadySubmitted(session.id, currentUser.id)
        )
      );

      let gridHtml = '<div class="attendance-grid">';
      allSessions.forEach((session, idx) => {
        const submitted = submissionChecks[idx] && submissionChecks[idx].data;
        gridHtml += renderSessionCard(session, Boolean(submitted));
      });
      gridHtml += '</div>';

      container.innerHTML = gridHtml;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      container.innerHTML = '<div class="attendance-status-box error">Failed to load attendance sessions. Please try refreshing.</div>';
    }
  }

  // Render Session Card
  function renderSessionCard(session, alreadySubmitted) {
    const now = new Date();
    const start = new Date(session.start_time);
    const end = new Date(session.end_time);
    const isOpen = session.status === 'active' && now >= start && now <= end;
    const isScheduled = now < start && session.status !== 'closed';
    const isClosed = session.status === 'closed' || now > end;

    let badgeClass = 'scheduled';
    let badgeText = 'Scheduled';

    if (isOpen) {
      badgeClass = 'active';
      badgeText = 'Open Now';
    } else if (isClosed) {
      badgeClass = 'closed';
      badgeText = 'Closed';
    }

    return `
      <div class="attendance-card">
        <div class="attendance-card-header">
          <h3>${escapeHtml(session.title)}</h3>
          <span class="status-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="attendance-card-body">
          <p><strong>Subject:</strong> ${escapeHtml(session.subject || 'General')}</p>
          <p><strong>Date:</strong> ${escapeHtml(session.session_date || '')}</p>
          <p><strong>Time:</strong> ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          ${session.location_name ? `<p><strong>Location:</strong> ${escapeHtml(session.location_name)}</p>` : ''}
          ${session.instructions ? `<p><em>${escapeHtml(session.instructions)}</em></p>` : ''}
        </div>
        <div class="attendance-card-footer">
          ${alreadySubmitted ?
            '<p class="success-text"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Attendance Submitted</p>' :
            isOpen ?
            `<button class="btn btn-primary" onclick="window.studentAttendance.openSubmitForm('${session.id}')">Submit Attendance</button>` :
            isClosed ?
            '<p class="text-muted">Attendance is closed</p>' :
            `<p class="text-muted">Opens at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>`
          }
        </div>
      </div>
    `;
  }

  // Open Modal
  function openSubmitForm(sessionId) {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    currentActiveSession = session;
    const modal = document.getElementById('submitModal');
    const title = document.getElementById('modalSessionTitle');
    const details = document.getElementById('modalSessionDetails');
    const nameInput = document.getElementById('studentFullName');
    const indexInput = document.getElementById('studentIndexNumber');
    const statusContainer = document.getElementById('modalStatusContainer');
    const submitBtn = document.getElementById('btnSubmitAttendance');

    if (title) title.textContent = `Check-In: ${session.title}`;
    if (details) {
      details.textContent = `${session.subject} | Required within ${session.radius_meters || 30}m of ${session.location_name || 'session venue'}`;
    }

    if (nameInput) {
      nameInput.value = (userProfile && userProfile.full_name) ||
                         (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) ||
                         localStorage.getItem('preptrack_user_name') ||
                         localStorage.getItem('preptrack_user_name') || localStorage.getItem('ntc_user_name') || '';
    }

    if (indexInput) {
      indexInput.value = (userProfile && userProfile.index_number) ||
                          localStorage.getItem('preptrack_index_number') ||
                          localStorage.getItem('preptrack_index_number') || localStorage.getItem('ntc_index_number') || '';
    }

    if (statusContainer) statusContainer.innerHTML = '';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Location & Submit';
    }

    if (modal) modal.style.display = 'flex';
  }

  function closeSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (modal) modal.style.display = 'none';
    currentActiveSession = null;
  }

  function showModalStatus(message, type = 'info') {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;

    let spinner = '';
    if (type === 'info') {
      spinner = '<span class="attendance-spinner"></span>';
    }

    container.innerHTML = `
      <div class="attendance-status-box ${type}">
        ${spinner}
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  // Submit attendance button handler
  async function handleSubmitClick() {
    if (!currentActiveSession) return;

    const nameInput = document.getElementById('studentFullName');
    const indexInput = document.getElementById('studentIndexNumber');
    const submitBtn = document.getElementById('btnSubmitAttendance');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const indexNumber = indexInput ? indexInput.value.trim() : '';

    if (!fullName) {
      showModalStatus('Please enter your full name.', 'error');
      return;
    }
    if (!indexNumber) {
      showModalStatus('Please enter your index / ID number.', 'error');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    await submitAttendanceForm(currentActiveSession.id, fullName, indexNumber, currentActiveSession);
    if (submitBtn) submitBtn.disabled = false;
  }

  // Submission Flow
  async function submitAttendanceForm(sessionId, fullName, indexNumber, session) {
    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;

    // 1. Time check
    const now = new Date();
    if (now < new Date(session.start_time)) {
      showModalStatus('Attendance is not open yet.', 'error');
      return;
    }
    if (now > new Date(session.end_time) || session.status === 'closed') {
      showModalStatus('Attendance has closed.', 'error');
      return;
    }

    // 2. Duplicate check
    const { data: existing } = await window.supaAttendance.checkAlreadySubmitted(sessionId, currentUser.id);
    if (existing) {
      showModalStatus('You have already submitted attendance for this session.', 'error');
      return;
    }

    // 3. Request GPS
    showModalStatus('Requesting your GPS location...', 'info');

    try {
      const position = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by your browser.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      const { latitude, longitude, accuracy } = position.coords;

      if (accuracy > 150) {
        showModalStatus(`GPS accuracy is low (~${Math.round(accuracy)}m). Please move near an open window or outside and try again.`, 'error');
        return;
      }

      let distance = 0;
      let isWithinRadius = true;

      // 4. Calculate Distance if session has reference coords
      if (session.reference_lat != null && session.reference_lng != null) {
        distance = haversineDistance(latitude, longitude, session.reference_lat, session.reference_lng);
        const allowedRadius = session.radius_meters || 30;

        if (distance > allowedRadius) {
          showModalStatus(`Location verification failed: You are ${Math.round(distance)}m away from the venue. You must be within ${allowedRadius}m to submit.`, 'error');
          return;
        }
      }

      // 5. Submit record
      showModalStatus('Submitting attendance...', 'info');

      const payload = {
        session_id: sessionId,
        full_name: fullName,
        index_number: indexNumber,
        student_lat: latitude,
        student_lng: longitude,
        distance_meters: parseFloat(distance.toFixed(2)),
        location_accuracy: parseFloat(accuracy.toFixed(2)),
        is_within_radius: isWithinRadius,
        verification_status: 'verified',
        submitted_at: new Date().toISOString()
      };

      const { data, error } = await window.supaAttendance.submitAttendance(payload);

      if (error) {
        if (error.code === '23505') {
          showModalStatus('Attendance already submitted for this session.', 'error');
        } else {
          showModalStatus('Failed to submit: ' + error.message, 'error');
        }
        return;
      }

      showModalStatus(`✓ Attendance submitted successfully! (Distance: ${Math.round(distance)}m from reference)`, 'success');

      // Update cached profile
      if (userProfile) {
        userProfile.full_name = fullName;
        userProfile.index_number = indexNumber;
      }

      setTimeout(() => {
        closeSubmitModal();
        loadSessions();
      }, 1500);

    } catch (err) {
      console.error('Attendance location error:', err);
      if (err.code === 1) {
        showModalStatus('Location access denied. Please allow location permissions in your browser and try again.', 'error');
      } else if (err.code === 2) {
        showModalStatus('Location unavailable. Please check your device location settings.', 'error');
      } else if (err.code === 3) {
        showModalStatus('Location request timed out. Please try again.', 'error');
      } else {
        showModalStatus('Location error: ' + err.message, 'error');
      }
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

  // Expose global methods
  window.studentAttendance = {
    openSubmitForm,
    closeSubmitModal,
    handleSubmitClick
  };

})();
