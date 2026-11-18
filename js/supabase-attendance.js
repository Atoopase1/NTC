// ============================================
// PrepTrack - Supabase Attendance Integration
// Attendance sessions & submissions API
// ============================================

(function () {
  'use strict';

  function getClient() {
    if (typeof window.getSupabaseClient === 'function') {
      const client = window.getSupabaseClient();
      if (client) return client;
    }
    if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) {
      return window.supabaseClient;
    }
    console.error('Supabase client is not available.');
    return null;
  }

  /**
   * Create an attendance session
   */
  async function createAttendanceSession(data) {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data: { user } } = await client.auth.getUser();
    const payload = {
      ...data,
      created_by: user ? user.id : null
    };

    const { data: session, error } = await client
      .from('attendance_sessions')
      .insert([payload])
      .select()
      .single();

    return { data: session, error };
  }

  /**
   * Fetch all attendance sessions ordered by date
   */
  async function getAttendanceSessions() {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data, error } = await client
      .from('attendance_sessions')
      .select('*')
      .order('session_date', { ascending: false });

    return { data, error };
  }

  /**
   * Update an existing attendance session
   */
  async function updateAttendanceSession(id, updates) {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data, error } = await client
      .from('attendance_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    return { data, error };
  }

  /**
   * Delete an attendance session
   */
  async function deleteAttendanceSession(id) {
    const client = getClient();
    if (!client) return { error: new Error('Supabase client not initialized') };

    const { error } = await client
      .from('attendance_sessions')
      .delete()
      .eq('id', id);

    return { error };
  }

  /**
   * Get active sessions currently open for students
   */
  async function getActiveSessionsForStudent() {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const now = new Date().toISOString();
    const { data, error } = await client
      .from('attendance_sessions')
      .select('*')
      .eq('status', 'active')
      .lte('start_time', now)
      .gte('end_time', now)
      .order('session_date', { ascending: false });

    return { data, error };
  }

  /**
   * Get all active & scheduled sessions for student viewing
   */
  async function getAllSessionsForStudent() {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data, error } = await client
      .from('attendance_sessions')
      .select('*')
      .in('status', ['active', 'scheduled', 'closed'])
      .order('session_date', { ascending: false });

    return { data, error };
  }

  /**
   * Submit student attendance record with upsert conflict check
   */
  async function submitAttendance(submissionData) {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data: { user } } = await client.auth.getUser();
    if (!user) return { data: null, error: new Error('User not authenticated') };

    const payload = {
      ...submissionData,
      user_id: user.id
    };

    const { data, error } = await client
      .from('attendance_submissions')
      .upsert(payload, { onConflict: 'session_id,user_id', ignoreDuplicates: false })
      .select()
      .single();

    return { data, error };
  }

  /**
   * Check whether the user has already submitted for this session
   */
  async function checkAlreadySubmitted(sessionId, userId) {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data, error } = await client
      .from('attendance_submissions')
      .select('id, submitted_at, verification_status')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    return { data, error };
  }

  /**
   * Get all submissions for a specific session (for admin view)
   */
  async function getAttendanceSubmissions(sessionId) {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data, error } = await client
      .from('attendance_submissions')
      .select('*')
      .eq('session_id', sessionId)
      .order('submitted_at', { ascending: true });

    return { data, error };
  }

  /**
   * Get past attendance history for the logged-in student
   */
  async function getStudentAttendanceHistory(userId) {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase client not initialized') };

    const { data, error } = await client
      .from('attendance_submissions')
      .select('*, attendance_sessions(title, subject, session_date)')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });

    return { data, error };
  }

  window.supaAttendance = {
    createAttendanceSession,
    getAttendanceSessions,
    updateAttendanceSession,
    deleteAttendanceSession,
    getActiveSessionsForStudent,
    getAllSessionsForStudent,
    submitAttendance,
    checkAlreadySubmitted,
    getAttendanceSubmissions,
    getStudentAttendanceHistory
  };

})();
