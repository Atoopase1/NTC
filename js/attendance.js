// ============================================
// PrepTrack - Student Attendance Submission Logic
// ============================================

(function () {
  'use strict';

  let currentUser = null;
  let userProfile = null;
  let allSessions = [];
  let currentActiveSession = null;
  let verifiedPosition = null; // Stores GPS coords after successful location check

  document.addEventListener('DOMContentLoaded', async () => {
    await initAuthAndLoad();
  });

  // Haversine Distance in metres
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function initAuthAndLoad() {
    // Show admin banner if current user is an administrator
    const isAdmin = localStorage.getItem('preptrack_is_admin') === 'true' || localStorage.getItem('ntc_is_admin') === 'true';
    const adminBanner = document.getElementById('adminNoticeBanner');
    if (adminBanner && isAdmin) {
      adminBanner.style.display = 'block';
    }

    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
    if (!client) { setTimeout(initAuthAndLoad, 300); return; }
    try {
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) { window.location.href = 'login.html'; return; }
      currentUser = user;
      try {
        const { data: profile } = await client.from('profiles').select('full_name, index_number, course, role').eq('id', user.id).maybeSingle();
        userProfile = profile || {};
        if (adminBanner && (profile?.role === 'admin' || isAdmin)) {
          adminBanner.style.display = 'block';
        }
      } catch (e) { userProfile = {}; }
      await loadSessions();
    } catch (err) { window.location.href = 'login.html'; }
  }

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

      // ── Filter to student's selected courses ──────────────────────────
      let filteredSessions = allSessions;
      try {
        const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
        if (client) {
          const { data: prefs, error: prefErr } = await client
            .from('student_course_preferences')
            .select('subject_id')
            .eq('user_id', currentUser.id);
          if (!prefErr && prefs && prefs.length > 0) {
            // Get subject names for the selected IDs
            const selectedIds = prefs.map(p => p.subject_id);
            const { data: subjects } = await client
              .from('subjects')
              .select('id, name')
              .in('id', selectedIds);
            if (subjects && subjects.length > 0) {
              const selectedNames = new Set(subjects.map(s => s.name.toLowerCase()));
              filteredSessions = allSessions.filter(session => {
                const sub = (session.subject || '').toLowerCase();
                // Keep session if subject matches one of the student's courses
                // or if session has no subject (general)
                return !sub || sub === 'general' || selectedNames.has(sub);
              });
            }
          }
          // If no prefs set → show nothing, nudge student to pick courses
          else if (!prefErr && prefs && prefs.length === 0) {
            container.innerHTML = `
              <div class="attendance-card" style="text-align:center; padding:40px 20px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-light); margin-bottom:12px;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="9" y1="9" x2="15" y2="9"/></svg>
                <h3 style="margin-bottom:8px;">No Courses Selected</h3>
                <p style="color:var(--text-light); margin:0 0 16px;">You haven't selected any courses yet. Attendance sessions will appear here once you enrol in your courses.</p>
                <a href="courses.html" class="btn btn-primary">Select My Courses</a>
              </div>`;
            return;
          }
        }
      } catch (filterErr) {
        // Filter failed — fall back to showing all sessions
        console.warn('Could not filter sessions by courses:', filterErr);
        filteredSessions = allSessions;
      }
      // ─────────────────────────────────────────────────────────────────

      if (filteredSessions.length === 0) {
        container.innerHTML = `<div class="attendance-card" style="text-align:center; padding:40px 20px;"><h3>No Attendance Sessions</h3><p style="color:var(--text-light); margin:0;">There are currently no active or scheduled attendance sessions for your enrolled courses.</p></div>`;
        return;
      }
      const submissionChecks = await Promise.all(filteredSessions.map(session => window.supaAttendance.checkAlreadySubmitted(session.id, currentUser.id)));
      let gridHtml = '<div class="attendance-grid">';
      filteredSessions.forEach((session, idx) => {
        const submitted = submissionChecks[idx] && submissionChecks[idx].data;
        gridHtml += renderSessionCard(session, Boolean(submitted));
      });
      gridHtml += '</div>';
      container.innerHTML = gridHtml;
    } catch (err) {
      container.innerHTML = '<div class="attendance-status-box error">Failed to load attendance sessions. Please try refreshing.</div>';
    }
  }

  function renderSessionCard(session, alreadySubmitted) {
    const now = new Date();
    const start = new Date(session.start_time);
    const end = new Date(session.end_time);
    const isOpen = session.status === 'active' && now >= start && now <= end;
    const isClosed = session.status === 'closed' || now > end;
    let badgeClass = 'scheduled', badgeText = 'Scheduled';
    if (isOpen) { badgeClass = 'active'; badgeText = 'Open Now'; }
    else if (isClosed) { badgeClass = 'closed'; badgeText = 'Closed'; }
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

  // ─── Helpers to show/hide modal form fields ───────────────────────────────

  function getFormGroups() {
    // Returns the .form-group wrappers for name and index inputs
    const nameInput = document.getElementById('studentFullName');
    const indexInput = document.getElementById('studentIndexNumber');
    const groups = [];
    if (nameInput) {
      const grp = nameInput.closest('.form-group') || nameInput.parentElement;
      if (grp) groups.push(grp);
    }
    if (indexInput) {
      const grp = indexInput.closest('.form-group') || indexInput.parentElement;
      if (grp) groups.push(grp);
    }
    return groups;
  }

  function hideFormFields() {
    getFormGroups().forEach(g => { g.style.display = 'none'; });
    const submitBtn = document.getElementById('btnSubmitAttendance');
    if (submitBtn) submitBtn.style.display = 'none';
  }

  function showFormFields() {
    getFormGroups().forEach(g => { g.style.display = ''; });
    const submitBtn = document.getElementById('btnSubmitAttendance');
    if (submitBtn) {
      submitBtn.style.display = '';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Attendance';
    }
  }

  // ─── Location-step UI helpers ─────────────────────────────────────────────

  function showLocationChecking() {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="attendance-status-box info" id="locationStepBox">
        <span class="attendance-spinner"></span>
        <span>Verifying your location&hellip;</span>
      </div>`;
  }

  function showLocationDenied() {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="attendance-status-box error" id="locationStepBox">
        <span>&#x1F6AB; Location access is required to submit attendance. Please enable it in your browser settings.</span>
        <div style="margin-top:12px;">
          <button class="btn btn-secondary" onclick="window.studentAttendance.closeSubmitModal()">Close</button>
        </div>
      </div>`;
  }

  function showLocationRetryable(message) {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="attendance-status-box error" id="locationStepBox">
        <span>${escapeHtml(message)}</span>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="window.studentAttendance._retryLocation()">Try Again</button>
          <button class="btn btn-secondary" onclick="window.studentAttendance.closeSubmitModal()">Cancel</button>
        </div>
      </div>`;
  }

  function showLocationOutOfRangeNotice(distance, allowedRadius) {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="attendance-status-box warning" id="locationStepBox">
        <div style="width:100%;">
          <strong style="display:block; margin-bottom:4px; font-size:14px;">⚠️ Outside Venue Range (~${Math.round(distance)}m away)</strong>
          <span style="font-size:13px; line-height:1.4;">The designated venue radius is <strong>${allowedRadius}m</strong>. You can still submit your attendance, but your check-in will be <strong>flagged as Out of Range</strong> for instructor review.</span>
        </div>
      </div>`;
  }

  function showLocationVerified(distance, hasReference) {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    const distanceText = hasReference
      ? `✔ Location verified &mdash; ${Math.round(distance)}m from venue (within radius)`
      : `✔ Location verified`;
    container.innerHTML = `
      <div class="attendance-status-box success" id="locationStepBox">
        <span>${distanceText}</span>
      </div>`;
  }

  function showSubmittingStatus(message, type = 'info') {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    const spinner = type === 'info' ? '<span class="attendance-spinner"></span>' : '';
    container.innerHTML = `<div class="attendance-status-box ${type}">${spinner}<span>${escapeHtml(message)}</span></div>`;
  }

  // ─── Resilient Multi-Tier Geolocation Engine ──────────────────────────────
  // Guarantees resilient location acquisition without fragile timeouts or failures

  function acquireResilientLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject({ code: 0, message: 'Geolocation is not supported by your browser.' });
      }

      let resolved = false;
      let watchId = null;

      function onPositionSuccess(pos) {
        if (resolved) return;
        resolved = true;
        if (watchId !== null) {
          try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
        }
        resolve(pos);
      }

      // Tier 1: High accuracy GPS attempt (8000ms window)
      navigator.geolocation.getCurrentPosition(
        onPositionSuccess,
        (err) => {
          if (resolved) return;
          if (err.code === 1) {
            // Permission denied explicitly by user
            resolved = true;
            if (watchId !== null) {
              try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
            }
            return reject(err);
          }

          // Tier 2: Immediate fallback to standard network/Wi-Fi/cell triangulation
          navigator.geolocation.getCurrentPosition(
            onPositionSuccess,
            (err2) => {
              if (resolved) return;
              // If watch is active, wait an extra 2.5s for hardware fix
              setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  if (watchId !== null) {
                    try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
                  }
                  reject(err2 || err);
                }
              }, 2500);
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 60000
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 15000
        }
      );

      // Tier 3: Concurrently listen to watchPosition for faster mobile hardware updates
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (pos && pos.coords && pos.coords.latitude != null) {
              onPositionSuccess(pos);
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 15000 }
        );
      } catch (e) {}

      // Master safety timeout (18 seconds)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (watchId !== null) {
            try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
          }
          reject({ code: 3, message: 'Location request timed out. Please ensure GPS is enabled and try again.' });
        }
      }, 18000);
    });
  }

  // ─── Core GPS check ───────────────────────────────────────────────────────

  async function runLocationCheck() {
    verifiedPosition = null;
    showLocationChecking();

    if (!navigator.geolocation) {
      showLocationDenied();
      return;
    }

    let position;
    try {
      position = await acquireResilientLocation();
    } catch (err) {
      if (err.code === 1) {
        showLocationDenied();
      } else if (err.code === 2) {
        showLocationRetryable('Location unavailable. Please check your device location / GPS toggle and try again.');
      } else if (err.code === 3) {
        showLocationRetryable('Location request timed out. Please move to an open area and try again.');
      } else {
        showLocationRetryable(err.message || 'Unable to acquire location.');
      }
      return;
    }

    const { latitude, longitude, accuracy } = position.coords;
    const session = currentActiveSession;
    const hasReference = session.reference_lat != null && session.reference_lng != null;
    let distance = 0;
    let isWithinRadius = true;

    if (hasReference) {
      distance = haversineDistance(latitude, longitude, session.reference_lat, session.reference_lng);
      const allowedRadius = session.radius_meters || 30;
      isWithinRadius = distance <= allowedRadius;
    }

    // Store verified position
    verifiedPosition = { latitude, longitude, accuracy: accuracy || 10, distance, isWithinRadius };

    if (!isWithinRadius && hasReference) {
      // REQUIREMENT 4: Students out of range CAN submit, but flagged!
      showLocationOutOfRangeNotice(distance, session.radius_meters || 30);
    } else {
      showLocationVerified(distance, hasReference);
    }

    // Always reveal form fields so student can submit
    showFormFields();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  function openSubmitForm(sessionId) {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;
    currentActiveSession = session;
    verifiedPosition = null;

    const modal = document.getElementById('submitModal');
    const title = document.getElementById('modalSessionTitle');
    const details = document.getElementById('modalSessionDetails');
    const nameInput = document.getElementById('studentFullName');
    const indexInput = document.getElementById('studentIndexNumber');
    const submitBtn = document.getElementById('btnSubmitAttendance');

    if (title) title.textContent = `Check-In: ${session.title}`;
    if (details) details.textContent = `${session.subject || 'General'} | Required within ${session.radius_meters || 30}m of ${session.location_name || 'session venue'}`;

    // Pre-fill form values (even though hidden initially)
    if (nameInput) nameInput.value = (userProfile && userProfile.full_name) || (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) || '';
    if (indexInput) indexInput.value = (userProfile && userProfile.index_number) || '';

    // Reset submit button state
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Attendance';
    }

    // Hide form fields until location is verified
    hideFormFields();

    // Show modal
    if (modal) modal.style.display = 'flex';

    // Immediately start GPS check
    runLocationCheck();
  }

  function closeSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (modal) modal.style.display = 'none';
    currentActiveSession = null;
    verifiedPosition = null;
  }

  async function handleSubmitClick() {
    if (!currentActiveSession) return;
    if (!verifiedPosition) {
      showSubmittingStatus('Location has not been verified. Please close and try again.', 'error');
      return;
    }

    const nameInput = document.getElementById('studentFullName');
    const indexInput = document.getElementById('studentIndexNumber');
    const submitBtn = document.getElementById('btnSubmitAttendance');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const indexNumber = indexInput ? indexInput.value.trim() : '';

    if (!fullName) { showSubmittingStatus('Please enter your full name.', 'error'); return; }
    if (!indexNumber) { showSubmittingStatus('Please enter your index / ID number.', 'error'); return; }

    if (submitBtn) submitBtn.disabled = true;
    await submitAttendanceForm(currentActiveSession.id, fullName, indexNumber, currentActiveSession);
    if (submitBtn) submitBtn.disabled = false;
  }

  async function submitAttendanceForm(sessionId, fullName, indexNumber, session) {
    const now = new Date();
    if (now < new Date(session.start_time)) { showSubmittingStatus('Attendance is not open yet.', 'error'); return; }
    if (now > new Date(session.end_time) || session.status === 'closed') { showSubmittingStatus('Attendance has closed.', 'error'); return; }

    const { data: existing } = await window.supaAttendance.checkAlreadySubmitted(sessionId, currentUser.id);
    if (existing) { showSubmittingStatus('You have already submitted attendance for this session.', 'error'); return; }

    const { latitude, longitude, accuracy, distance } = verifiedPosition;
    const hasReference = session.reference_lat != null && session.reference_lng != null;
    const isWithinRadius = hasReference ? distance <= (session.radius_meters || 30) : true;
    const verificationStatus = isWithinRadius ? 'verified' : 'rejected';

    showSubmittingStatus('Submitting attendance...', 'info');

    const payload = {
      session_id: sessionId,
      full_name: fullName,
      index_number: indexNumber,
      student_lat: latitude,
      student_lng: longitude,
      distance_meters: parseFloat(distance.toFixed(2)),
      location_accuracy: parseFloat(accuracy.toFixed(2)),
      is_within_radius: isWithinRadius,
      verification_status: verificationStatus,
      submitted_at: new Date().toISOString()
    };

    const { data, error } = await window.supaAttendance.submitAttendance(payload);
    if (error) {
      if (error.code === '23505') {
        showSubmittingStatus('Attendance already submitted for this session.', 'error');
      } else {
        showSubmittingStatus('Failed to submit: ' + error.message, 'error');
      }
      return;
    }

    if (isWithinRadius) {
      showSubmittingStatus(`✓ Attendance verified & submitted! (Distance: ${Math.round(distance)}m from reference)`, 'success');
    } else {
      showSubmittingStatus(`⚠️ Attendance submitted & flagged as Out of Range (${Math.round(distance)}m from venue).`, 'warning');
    }
    if (userProfile) { userProfile.full_name = fullName; userProfile.index_number = indexNumber; }
    setTimeout(() => { closeSubmitModal(); loadSessions(); }, 1500);
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Expose retry so the inline onclick in showLocationRetryable can call it
  window.studentAttendance = {
    openSubmitForm,
    closeSubmitModal,
    handleSubmitClick,
    _retryLocation: runLocationCheck
  };
})();
