// ============================================
// NTC Exam Prep - Supabase Integration
// Connects to Supabase backend for Auth & DB
// ============================================

// Configuration provided in prompt
const SUPABASE_URL = 'https://wyaadzxbuvaehxvxikgw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5YWFkenhidXZhZWh4dnhpa2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjYxMDUsImV4cCI6MjA5NjU0MjEwNX0.fktLQXecCzaFxp9Dco0XppEoMjpPdTlypYzVA1RGlQI';

// Initialize Supabase Client
// Note: Requires supabase-js library to be loaded in HTML via CDN:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
let supabaseClient = null;

function initSupabase() {
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized');
  } else {
    console.error('Supabase library not loaded. Please include the CDN script in HTML.');
  }
}

// Initialize on load
initSupabase();

// --- Auth Functions --- //

/**
 * Register a new user
 */
async function signUp(email, password, fullName, phone) {
  if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
  
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone
        }
      }
    });
    
    if (error) throw error;
    
    // Create profile record if signup was successful
    if (data.user) {
      await createProfile(data.user.id, fullName, phone, email);
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Signup error:', error);
    return { data: null, error };
  }
}

/**
 * Login existing user
 */
async function signIn(email, password) {
  if (!supabaseClient) return { error: { message: 'Supabase not initialized' } };
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Signin error:', error);
    return { data: null, error };
  }
}

/**
 * Logout user
 */
async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  window.location.href = '../pages/login.html';
}

/**
 * Get current session/user
 */
async function getCurrentUser() {
  if (!supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.user : null;
}

/**
 * Google OAuth Login
 */
async function signInWithGoogle() {
  if (!supabaseClient) return;
  
  // Redirect to the auth callback page so we can check admin role after login
  const redirectTo = window.location.origin.includes('localhost') || window.location.protocol === 'file:'
    ? window.location.href.replace(/pages\/.*$/, 'pages/auth-callback.html')  // local file
    : window.location.origin + '/pages/auth-callback.html';

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) console.error('Google login error:', error);
}

/**
 * Check user role and redirect to the correct page.
 * Called after any login method (email+password or Google OAuth).
 */
async function checkAdminAndRedirect(userEmail) {
  const ADMIN_EMAIL = 'atoopase@gmail.com';
  let isAdmin = false;

  try {
    if (userEmail === ADMIN_EMAIL) {
      isAdmin = true;
    } else if (supabaseClient) {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile && profile.role === 'admin') {
          isAdmin = true;
        }
      }
    }
  } catch (err) {
    console.warn('Role check failed, defaulting to dashboard', err);
  }

  if (isAdmin) {
    localStorage.setItem('ntc_is_admin', 'true');
    const viewMode = localStorage.getItem('ntc_view_mode') || 'admin';
    if (viewMode === 'admin') {
      window.location.href = 'admin-lessons.html';
      return;
    }
  } else {
    localStorage.removeItem('ntc_is_admin');
  }

  window.location.href = 'dashboard.html';
}

// --- Database Functions --- //

/**
 * Create user profile after signup
 */
async function createProfile(userId, fullName, phone, email) {
  try {
    // Check if profiles table exists by doing a silent select
    const { error: checkError } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
      
    // We ignore errors here as table might not exist yet, 
    // but we'll try to insert anyway
    const { error } = await supabaseClient
      .from('profiles')
      .upsert({
        id: userId,
        full_name: fullName,
        phone: phone,
        email: email,
        updated_at: new Date().toISOString(),
      });
      
    if (error) {
      console.warn('Could not save profile to DB (table might not exist yet). Will save locally.', error);
      // Fallback for demo purposes if DB not setup
      localStorage.setItem(`user_${userId}_profile`, JSON.stringify({ fullName, phone, email }));
    }
  } catch (err) {
    console.warn('Profile creation failed', err);
  }
}

/**
 * Get user profile data
 */
async function getProfile(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.log('Using local profile data fallback');
    // Fallback if DB not setup
    const localData = localStorage.getItem(`user_${userId}_profile`);
    if (localData) return JSON.parse(localData);
    return null;
  }
}

/**
 * Update an existing user profile
 */
async function updateProfile(userId, fields) {
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .upsert({ id: userId, ...fields });
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Profile update failed:', error);
    return { error };
  }
}

/**
 * Save exam result
 */
async function saveExamResult(userId, examData) {
  try {
    const { error } = await supabaseClient
      .from('exam_results')
      .insert({
        user_id: userId,
        scheduled_exam_id: examData.isScheduled ? examData.scheduledExamId : null,
        subject: examData.subject,
        score: examData.score,
        total: examData.total,
        percentage: examData.percentage,
        time_used: examData.timeUsed,
        created_at: new Date().toISOString()
      });
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Could not save exam to DB. Saving locally.', error);
    // Fallback local storage
    const results = JSON.parse(localStorage.getItem('ntc_exam_results') || '[]');
    results.push({ ...examData, userId, date: new Date().toISOString() });
    localStorage.setItem('ntc_exam_results', JSON.stringify(results));
    return true;
  }
}

/**
 * Get user's exam history
 */
async function getExamHistory(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('exam_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  } catch (error) {
    // Fallback local storage
    const results = JSON.parse(localStorage.getItem('ntc_exam_results') || '[]');
    return results.filter(r => r.userId === userId).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

// --- Subject Functions --- //

/**
 * Fetch all subjects
 */
async function getSubjects() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.warn('Could not fetch subjects from DB. Using local fallback.', error);
    const localData = localStorage.getItem('ntc_subjects');
    if (localData) return JSON.parse(localData);
    
    // Default fallback
    return [
      { id: '1', name: 'Pedagogy' },
      { id: '2', name: 'General Knowledge' },
      { id: '3', name: 'Curriculum Studies' },
      { id: '4', name: 'Assessment' },
      { id: '5', name: 'ICT in Education' },
      { id: '6', name: 'Educational Psychology' }
    ];
  }
}

/**
 * Add a new subject
 */
async function addSubject(name) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('subjects')
      .insert([{ name }])
      .select()
      .single();
      
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to add subject:', error);
    return { data: null, error };
  }
}

/**
 * Update an existing subject
 */
async function updateSubject(id, name) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('subjects')
      .update({ name })
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to update subject:', error);
    return { data: null, error };
  }
}

/**
 * Delete a subject
 */
async function deleteSubject(id) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { error } = await supabaseClient
      .from('subjects')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Failed to delete subject:', error);
    return { error };
  }
}

// --- Scheduled Exams Functions --- //

// --- Admin Functions --- //

/**
 * Get all student profiles (admin only)
 */
async function getAllStudents() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch students:', error);
    return { data: null, error };
  }
}

/**
 * Get all exam results (admin only)
 */
async function getAllExamResults() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('exam_results')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch all exam results:', error);
    return { data: null, error };
  }
}

/**
 * Delete a student's profile (removes all their app data)
 */
async function deleteStudentProfile(userId) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    // Delete exam results first (FK may not cascade)
    await supabaseClient.from('exam_results').delete().eq('user_id', userId);
    // Delete profile
    const { error } = await supabaseClient.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Failed to delete student:', error);
    return { error };
  }
}

/**
 * Block a student until a given ISO date string.
 * Sets the blocked_until column on the profiles table.
 */
async function blockStudent(userId, blockedUntil) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { error } = await supabaseClient
      .from('profiles')
      .update({ blocked_until: blockedUntil })
      .eq('id', userId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Failed to block student:', error);
    return { error };
  }
}

/**
 * Unblock a student by clearing the blocked_until column.
 */
async function unblockStudent(userId) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { error } = await supabaseClient
      .from('profiles')
      .update({ blocked_until: null })
      .eq('id', userId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Failed to unblock student:', error);
    return { error };
  }
}

// --- Scheduled Exams Functions --- //

/**
 * Fetch all scheduled exams
 */
async function getScheduledExams() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('scheduled_exams')
      .select('*')
      .order('start_time', { ascending: true });
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch scheduled exams:', error);
    return [];
  }
}

/**
 * Create a scheduled exam
 */
async function createScheduledExam(examData) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('scheduled_exams')
      .insert([examData])
      .select()
      .single();
      
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to create scheduled exam:', error);
    return { data: null, error };
  }
}

/**
 * Delete a scheduled exam
 */
async function deleteScheduledExam(id) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { error } = await supabaseClient
      .from('scheduled_exams')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Failed to delete scheduled exam:', error);
    return { error };
  }
}

/**
 * Get rankings for a specific scheduled exam
 */
async function getExamRankings(scheduled_exam_id) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('exam_results')
      .select('id, user_id, percentage, profiles(full_name)')
      .eq('scheduled_exam_id', scheduled_exam_id)
      .order('percentage', { ascending: false });
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to fetch exam rankings:', error);
    return [];
  }
}

// Export functions for global use
window.supaAuth = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  signInWithGoogle,
  checkAdminAndRedirect
};

// --- Lesson CRUD & File Upload --- //

/**
 * Upload a lesson file to Supabase Storage
 */
async function uploadLessonFile(file, subject) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const ext = file.name.split('.').pop();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${subject.replace(/\s+/g, '_')}/${Date.now()}_${safeName}`;

    const { data, error } = await supabaseClient.storage
      .from('lesson-materials')
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (error) throw error;

    const { data: { publicUrl } } = supabaseClient.storage
      .from('lesson-materials')
      .getPublicUrl(filePath);

    return { url: publicUrl, error: null };
  } catch (error) {
    console.error('Upload failed:', error);
    return { url: null, error };
  }
}

/**
 * Upload an avatar image to Supabase Storage
 */
async function uploadAvatar(userId, file) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const ext = file.name.split('.').pop();
    const filePath = `avatars/${userId}_${Date.now()}.${ext}`;

    const { data, error } = await supabaseClient.storage
      .from('lesson-materials')
      .upload(filePath, file, { contentType: file.type, upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabaseClient.storage
      .from('lesson-materials')
      .getPublicUrl(filePath);

    return { url: publicUrl, error: null };
  } catch (error) {
    console.error('Avatar upload failed:', error);
    return { url: null, error };
  }
}

/**
 * Create a lesson record in the database
 */
async function createLesson({ subject, title, description, media_url, media_type, content }) {
  // Map to actual DB column names: topic, subtopic, type
  // Coerce media_type to one of the allowed values: 'video', 'pdf', 'text'
  const dbType = ['video', 'pdf', 'text'].includes(media_type) ? media_type
    : (media_type === 'link' ? 'text' : 'text');

  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('lessons')
      .insert([{ topic: subject, subtopic: title, type: dbType, media_url, content }])
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to create lesson:', error);
    return { data: null, error };
  }
}

/**
 * Update an existing lesson record in the database
 */
async function updateLesson(id, { subject, title, description, media_url, media_type, content }) {
  // Map to actual DB column names: topic, subtopic, type
  const dbType = ['video', 'pdf', 'text'].includes(media_type) ? media_type
    : (media_type === 'link' ? 'text' : 'text');

  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    
    // Build update payload dynamically to omit undefined values
    const payload = {};
    if (subject !== undefined) payload.topic = subject;
    if (title !== undefined) payload.subtopic = title;
    if (dbType !== undefined) payload.type = dbType;
    if (media_url !== undefined) payload.media_url = media_url;
    if (content !== undefined) payload.content = content;
    // Note: description isn't in the DB schema in createLesson either

    const { data, error } = await supabaseClient
      .from('lessons')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to update lesson:', error);
    return { data: null, error };
  }
}

/**
 * Fetch all lessons
 */
async function getLessons() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('lessons')
      .select('id, topic, subtopic, type, media_url, content, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    // Normalize to expected field names used in the UI
    const normalized = (data || []).map(l => ({
      ...l,
      subject: l.topic,
      title: l.subtopic,
      media_type: l.type
    }));
    return { data: normalized, error: null };
  } catch (error) {
    console.error('Failed to fetch lessons:', error);
    return { data: null, error };
  }
}

/**
 * Delete a lesson by ID
 */
async function deleteLesson(id) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { error } = await supabaseClient.from('lessons').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Failed to delete lesson:', error);
    return { error };
  }
}

window.supaDB = {
  createProfile,
  getProfile,
  updateProfile,
  saveExamResult,
  getExamHistory,
  getSubjects,
  addSubject,
  updateSubject,
  deleteSubject,
  getAllStudents,
  getAllExamResults,
  deleteStudentProfile,
  blockStudent,
  unblockStudent,
  getScheduledExams,
  createScheduledExam,
  deleteScheduledExam,
  getExamRankings,
  uploadLessonFile,
  uploadAvatar,
  createLesson,
  updateLesson,
  getLessons,
  deleteLesson
};
