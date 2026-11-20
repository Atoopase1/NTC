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

  // Track realtime channel and auto-refresh interval
  let _sessionRealtimeChannel = null;
  let _sessionRefreshInterval = null;

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
      startSessionSync(client);  // ← live session sync
    } catch (err) { window.location.href = 'login.html'; }
  }

  /**
   * Subscribe to realtime session changes so students instantly see when
   * admin edits/reopens a session, and fall back to a 30-second poll.
   */
  function startSessionSync(client) {
    // ── Realtime subscription ──────────────────────────────────────
    try {
      if (_sessionRealtimeChannel) {
        client.removeChannel(_sessionRealtimeChannel);
        _sessionRealtimeChannel = null;
      }
      _sessionRealtimeChannel = client
        .channel('student-session-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance_sessions' },
          () => { loadSessions(); }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'attendance_submissions' },
          () => { loadSessions(); }  // admin deleted a submission → recheck submission state
        )
        .subscribe();
    } catch (rtErr) {
      console.warn('[attendance] Realtime subscription unavailable, using poll only:', rtErr);
    }

    // ── 30-second fallback poll ────────────────────────────────────
    if (_sessionRefreshInterval) clearInterval(_sessionRefreshInterval);
    _sessionRefreshInterval = setInterval(() => {
      // Only refresh if the submit modal is NOT open (avoid disrupting mid-submission)
      const modal = document.getElementById('submitModal');
      if (!modal || modal.style.display === 'none' || modal.style.display === '') {
        loadSessions();
      }
    }, 30000);
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
        gridHtml += renderSessionCard(session, submitted);
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

    // ── Determine whether this was reopened by admin (was closed, now open) ──
    // We detect "reopened" state by checking if the session end_time was
    // recently extended past "now" (i.e. it is active but end is in future).
    // We display a subtle banner so students know to try again.
    const wasReopened = !isClosed && session.status === 'active' && !isOpen === false &&
      session._reopened; // set by realtime reload logic below (flag approach)
    // Simpler: show a "Reopened" badge whenever isOpen AND session has a
    // 'reopened' status hint.  We use the existing status field as proxy:
    // admin changes status back to 'active'; the badge colour already says
    // 'Open Now'.  Extra hint shown only when student couldn't previously submit.

    let badgeClass = 'scheduled', badgeText = 'Scheduled';
    if (isOpen) { badgeClass = 'active'; badgeText = 'Open Now'; }
    else if (isClosed) { badgeClass = 'closed'; badgeText = 'Closed'; }

    // Footer logic:
    // 1. Student has an existing submission → show its status (no resubmit)
    // 2. Session is open + no submission → show Submit button
    // 3. Session is scheduled (future) → show opens-at time
    // 4. Session is closed + no submission → show "Attendance is closed"
    //    BUT also check: if student has no submission AND admin previously
    //    reopened (now isOpen again), we still show the Submit button (case 2 handles this)
    let footerHtml;
    if (alreadySubmitted) {
      if (alreadySubmitted.verification_status === 'rejected') {
        footerHtml = '<p class="warning-text" style="color:#d97706;font-weight:600;display:inline-flex;align-items:center;gap:6px;">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>' +
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          ' Attendance Submitted (Flagged Out of Range)</p>';
      } else {
        footerHtml = '<p class="success-text"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Attendance Submitted (Verified)</p>';
      }
    } else if (isOpen) {
      // Session open and student hasn't submitted (or submission was deleted by admin)
      footerHtml = `<button class="btn btn-primary" onclick="window.studentAttendance.openSubmitForm('${session.id}')">Submit Attendance</button>`;
    } else if (!isClosed) {
      // Scheduled — not yet open
      footerHtml = `<p class="text-muted">Opens at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>`;
    } else {
      // Closed — student missed it
      footerHtml = '<p class="text-muted">Attendance is closed</p>';
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
          ${footerHtml}
        </div>
      </div>
    `;
  }

  // ─── Google Maps Precision Geolocation Tracker ────────────────────────────
  let studentWatchId = null;
  let isLocationLocked = false;
  let bestGpsFix = null;
  let gpsSamplesCount = 0;

  function renderStudentMapsWidget(statusClass, title, desc, pillText, actionsHtml = '') {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="maps-gps-container ${statusClass}" id="studentGpsWidget">
        <div class="maps-radar-wrapper">
          <div class="maps-radar-ring"></div>
          <div class="maps-radar-dot"></div>
        </div>
        <div class="maps-gps-content">
          <div class="maps-gps-title">${title}</div>
          <div class="maps-gps-desc">${desc}</div>
          <div class="maps-gps-meta">
            <span class="maps-accuracy-pill">${pillText}</span>
          </div>
          ${actionsHtml ? `<div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">${actionsHtml}</div>` : ''}
        </div>
      </div>
    `;
  }

  function showSubmittingStatus(message, type = 'info') {
    const container = document.getElementById('modalStatusContainer');
    if (!container) return;
    const spinner = type === 'info' ? '<span class="attendance-spinner"></span>' : '';
    container.innerHTML = `<div class="attendance-status-box ${type}">${spinner}<span>${escapeHtml(message)}</span></div>`;
  }

  function startMapsLocationTracking() {
    isLocationLocked = false;
    bestGpsFix = null;
    gpsSamplesCount = 0;
    verifiedPosition = null;

    const submitBtn = document.getElementById('btnSubmitAttendance');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.className = 'btn btn-primary';
      submitBtn.innerHTML = '<span class="attendance-spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></span> Calibrating GPS...';
    }

    if (studentWatchId !== null) {
      try { navigator.geolocation.clearWatch(studentWatchId); } catch (e) { }
      studentWatchId = null;
    }

    if (!navigator.geolocation) {
      handleLocationFailure({ code: 0, message: 'Geolocation is not supported by your browser.' });
      return;
    }

    renderStudentMapsWidget(
      'calibrating',
      'Acquiring True Location (Maps GPS)...',
      'Please tap <strong>"Allow"</strong> if your browser prompts for location permission. Calibrating true coordinates...',
      'Satellite search...'
    );

    function onFix(pos) {
      if (!pos || !pos.coords) return;
      gpsSamplesCount++;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy || 20);

      const session = currentActiveSession;
      const hasReference = session && session.reference_lat != null && session.reference_lng != null;
      let dist = 0;
      if (hasReference) {
        dist = haversineDistance(lat, lng, session.reference_lat, session.reference_lng);
      }

      if (!bestGpsFix || acc < bestGpsFix.accuracy) {
        bestGpsFix = { lat, lng, accuracy: acc, distance: dist };
      } else if (hasReference) {
        bestGpsFix.distance = dist;
      }

      if (!isLocationLocked) {
        const distStr = hasReference ? ` | ~${Math.round(dist)}m from venue` : '';
        renderStudentMapsWidget(
          'calibrating',
          'Calibrating High-Precision GPS...',
          `Acquired ${gpsSamplesCount} satellite fix${gpsSamplesCount > 1 ? 'es' : ''}. Refined coordinate: ${bestGpsFix.lat.toFixed(5)}, ${bestGpsFix.lng.toFixed(5)}${distStr}`,
          `±${bestGpsFix.accuracy}m accuracy`
        );
      }

      // Maps convergence logic: accuracy <= 20m, or (samples >= 3 and accuracy <= 35m)
      if (!isLocationLocked && (bestGpsFix.accuracy <= 20 || (gpsSamplesCount >= 3 && bestGpsFix.accuracy <= 35))) {
        lockLocationAndEnableSubmission(bestGpsFix);
      }
    }

    function onErr(err) {
      if (isLocationLocked) return;
      handleLocationFailure(err);
    }

    // Trigger high-precision watchPosition (Google Maps style)
    try {
      studentWatchId = navigator.geolocation.watchPosition(
        onFix,
        onErr,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 }
      );
    } catch (e) {
      onErr(e);
    }

    // Also trigger immediate getCurrentPosition for fastest initial browser prompt
    try {
      navigator.geolocation.getCurrentPosition(
        onFix,
        onErr,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );
    } catch (e) { }

    // Auto-lock best fix after 5.5 seconds so students are not delayed
    setTimeout(() => {
      if (!isLocationLocked && bestGpsFix) {
        lockLocationAndEnableSubmission(bestGpsFix);
      }
    }, 5500);
  }

  function lockLocationAndEnableSubmission(coords) {
    isLocationLocked = true;
    if (studentWatchId !== null) {
      try { navigator.geolocation.clearWatch(studentWatchId); } catch (e) { }
      studentWatchId = null;
    }

    const session = currentActiveSession;
    const hasReference = session && session.reference_lat != null && session.reference_lng != null;
    const allowedRadius = (session && session.radius_meters) || 30;
    let distance = coords.distance || 0;
    if (hasReference) {
      distance = haversineDistance(coords.lat, coords.lng, session.reference_lat, session.reference_lng);
    }
    const isWithinRadius = hasReference ? distance <= allowedRadius : true;

    verifiedPosition = {
      latitude: coords.lat,
      longitude: coords.lng,
      accuracy: coords.accuracy || 10,
      distance: distance,
      isWithinRadius: isWithinRadius
    };

    const submitBtn = document.getElementById('btnSubmitAttendance');

    if (isWithinRadius) {
      // IN RANGE: Verified
      renderStudentMapsWidget(
        'verified',
        'Location Verified (Within Venue Radius)',
        `You are ~<strong>${Math.round(distance)}m</strong> from the lecture venue (allowed radius: <strong>${allowedRadius}m</strong>). Satellite GPS confirmed.`,
        `±${coords.accuracy}m accuracy (Verified In-Range)`
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.className = 'btn btn-primary';
        submitBtn.innerHTML = 'Submit Attendance';
      }
    } else {
      // REQUIREMENT 2: OUT OF RANGE / FAR LOCATION: Allowed to submit, but FLAGGED!
      renderStudentMapsWidget(
        'flagged',
        `Outside Venue Range (~${Math.round(distance)}m away)`,
        `The lecture venue radius is <strong>${allowedRadius}m</strong>. You are in a far location (~${Math.round(distance)}m away), but <strong>you are permitted to submit your attendance</strong>. Your submission will be recorded with your exact GPS location and <strong>flagged as Out of Range</strong> for instructor review.`,
        `Out of Range: ~${Math.round(distance)}m (Venue: ${allowedRadius}m)`
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.className = 'btn btn-warning-submit';
        submitBtn.innerHTML = 'Submit Attendance (Flagged Out of Range)';
      }
    }
  }

  function handleLocationFailure(err) {
    if (isLocationLocked) return;

    if (err && err.code === 1) {
      // User blocked permission
      renderStudentMapsWidget(
        'error',
        'Location Permission Blocked',
        'Location access is blocked by your browser. To allow: click the lock or site settings icon in your address bar, set Location to <strong>Allow</strong>, and click Retry.',
        'Permission Denied',
        `<button type="button" class="btn btn-primary btn-sm" onclick="window.studentAttendance._retryLocation()">Retry Location</button>
         <button type="button" class="btn btn-outline btn-sm" onclick="window.studentAttendance.submitWithoutGps()" style="color:#d97706;border-color:#d97706;">Submit as Flagged (No GPS)</button>`
      );
      const submitBtn = document.getElementById('btnSubmitAttendance');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.className = 'btn btn-warning-submit';
        submitBtn.innerHTML = 'Submit Attendance (Flagged)';
      }
      return;
    }

    // Try fallback to low-accuracy Wi-Fi/IP location
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy || 100);
        const session = currentActiveSession;
        let dist = 0;
        if (session && session.reference_lat != null) {
          dist = haversineDistance(lat, lng, session.reference_lat, session.reference_lng);
        }
        lockLocationAndEnableSubmission({ lat, lng, accuracy: acc, distance: dist });
      },
      (err2) => {
        // Even if completely failed: allow submission with Flagged status so student is NEVER blocked!
        renderStudentMapsWidget(
          'flagged',
          'GPS Satellite Signal Weak Indoors',
          'Could not lock precision satellite GPS. You can still submit your attendance — it will be recorded and <strong>flagged for instructor review</strong>.',
          'Signal Weak / Indoor Coarse',
          `<button type="button" class="btn btn-primary btn-sm" onclick="window.studentAttendance._retryLocation()">Retry GPS</button>`
        );
        verifiedPosition = {
          latitude: 0,
          longitude: 0,
          accuracy: 500,
          distance: 9999,
          isWithinRadius: false
        };
        const submitBtn = document.getElementById('btnSubmitAttendance');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.className = 'btn btn-warning-submit';
          submitBtn.innerHTML = 'Submit Attendance (Flagged)';
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  function submitWithoutGps() {
    verifiedPosition = {
      latitude: 0,
      longitude: 0,
      accuracy: 999,
      distance: 9999,
      isWithinRadius: false
    };
    renderStudentMapsWidget(
      'flagged',
      'Submitting without GPS Verification',
      'Your attendance will be submitted and <strong>flagged as Out of Range / Unverified</strong> for your instructor.',
      'Flagged Submission'
    );
    const submitBtn = document.getElementById('btnSubmitAttendance');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.className = 'btn btn-warning-submit';
      submitBtn.innerHTML = 'Submit Attendance (Flagged)';
    }
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

    if (title) title.textContent = `Check-In: ${session.title}`;
    if (details) details.textContent = `${session.subject || 'General'} | Venue: ${session.location_name || 'Designated Venue'} (${session.radius_meters || 30}m radius)`;

    // Pre-fill form values immediately
    if (nameInput) nameInput.value = (userProfile && userProfile.full_name) || (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) || '';
    if (indexInput) indexInput.value = (userProfile && userProfile.index_number) || '';

    // Show modal
    if (modal) modal.style.display = 'flex';

    // Immediately start Google Maps-style location check & satellite tracking
    startMapsLocationTracking();
  }

  function closeSubmitModal() {
    const modal = document.getElementById('submitModal');
    if (modal) modal.style.display = 'none';
    if (studentWatchId !== null) {
      try { navigator.geolocation.clearWatch(studentWatchId); } catch (e) { }
      studentWatchId = null;
    }
    currentActiveSession = null;
    verifiedPosition = null;
    isLocationLocked = false;
  }

  async function handleSubmitClick() {
    if (!currentActiveSession) return;

    // If verifiedPosition not yet set, use fallback flagged position so student can ALWAYS submit!
    if (!verifiedPosition) {
      if (bestGpsFix) {
        lockLocationAndEnableSubmission(bestGpsFix);
      } else {
        verifiedPosition = {
          latitude: 0,
          longitude: 0,
          accuracy: 999,
          distance: 9999,
          isWithinRadius: false
        };
      }
    }

    const nameInput = document.getElementById('studentFullName');
    const indexInput = document.getElementById('studentIndexNumber');
    const submitBtn = document.getElementById('btnSubmitAttendance');

    const fullName = nameInput ? nameInput.value.trim() : '';
    const indexNumber = indexInput ? indexInput.value.trim() : '';

    if (!fullName) {
      alert('Please enter your full name.');
      if (nameInput) nameInput.focus();
      return;
    }
    if (!indexNumber) {
      alert('Please enter your index / ID number.');
      if (indexInput) indexInput.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    await submitAttendanceForm(currentActiveSession.id, fullName, indexNumber, currentActiveSession);
    if (submitBtn) submitBtn.disabled = false;
  }

  async function submitAttendanceForm(sessionId, fullName, indexNumber, session) {
    // ── Re-fetch the session live so we have admin's latest end_time/status ──
    let liveSession = session;
    try {
      const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
      if (client) {
        const { data: freshSession } = await client
          .from('attendance_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();
        if (freshSession) {
          liveSession = freshSession;
          // Keep allSessions in sync with admin's latest edit
          const idx = allSessions.findIndex(s => s.id === sessionId);
          if (idx !== -1) allSessions[idx] = freshSession;
        }
      }
    } catch (refetchErr) {
      console.warn('[attendance] Could not re-fetch live session, using cached copy:', refetchErr);
    }

    const now = new Date();
    if (now < new Date(liveSession.start_time)) {
      showSubmittingStatus('Attendance is not open yet.', 'error');
      return;
    }
    if (now > new Date(liveSession.end_time) || liveSession.status === 'closed') {
      showSubmittingStatus('Attendance has closed. If you believe this is a mistake, ask your lecturer to extend the session.', 'error');
      return;
    }

    // ── Fresh DB check — prevents true duplicate, allows resubmit after deletion ──
    const { data: existing } = await window.supaAttendance.checkAlreadySubmitted(sessionId, currentUser.id);
    if (existing) {
      showSubmittingStatus('You have already submitted attendance for this session.', 'error');
      return;
    }

    const { latitude, longitude, accuracy, distance, isWithinRadius } = verifiedPosition;
    const verificationStatus = isWithinRadius ? 'verified' : 'rejected';

    showSubmittingStatus('Submitting your attendance...', 'info');

    const payload = {
      session_id: sessionId,
      full_name: fullName,
      index_number: indexNumber,
      student_lat: latitude,
      student_lng: longitude,
      distance_meters: parseFloat((distance || 0).toFixed(2)),
      location_accuracy: parseFloat((accuracy || 10).toFixed(2)),
      is_within_radius: Boolean(isWithinRadius),
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
      showSubmittingStatus(`Attendance verified & submitted! (${Math.round(distance)}m from lecture venue)`, 'success');
    } else {
      showSubmittingStatus(`Attendance submitted and flagged as Out of Range (${Math.round(distance)}m from venue).`, 'warning');
    }

    if (userProfile) {
      userProfile.full_name = fullName;
      userProfile.index_number = indexNumber;
    }

    setTimeout(() => {
      closeSubmitModal();
      loadSessions();
    }, 1600);
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Expose student attendance API
  window.studentAttendance = {
    openSubmitForm,
    closeSubmitModal,
    handleSubmitClick,
    submitWithoutGps,
    _retryLocation: startMapsLocationTracking
  };
})();
