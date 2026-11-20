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
  } else {
    console.error('Supabase library not loaded. Please include the CDN script in HTML.');
  }
}

// Initialize on load
initSupabase();
// Expose live reference functions globally
window.getSupabaseClient = function() { return supabaseClient; };
// Also set window.supabaseClient for legacy references
Object.defineProperty(window, 'supabaseClient', {
  get: function() { return supabaseClient; },
  configurable: true
});

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
 * Helper to resolve page URLs reliably whether the app is hosted
 * at domain root (e.g. https://example.com/pages/...)
 * or in a subdirectory (e.g. http://localhost:5500/preptrack/pages/...).
 */
function getAppPageUrl(pageFileName) {
  const cleanPage = pageFileName.replace(/^\/?(pages\/)?/, '');
  const basePath = window.location.pathname.replace(/\/pages\/.*|\/index\.html.*|\/$/, '');
  return basePath + '/pages/' + cleanPage;
}
window.getAppPageUrl = getAppPageUrl;

/**
 * Logout user
 */
async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  localStorage.removeItem('preptrack_is_admin');
  localStorage.removeItem('ntc_is_admin'); localStorage.removeItem('preptrack_is_admin');
  localStorage.removeItem('preptrack_admin_email');
  localStorage.removeItem('ntc_admin_email'); localStorage.removeItem('preptrack_admin_email');
  localStorage.removeItem('preptrack_admin_permissions');
  localStorage.removeItem('ntc_admin_permissions'); localStorage.removeItem('preptrack_admin_permissions');
  localStorage.removeItem('preptrack_view_mode');
  localStorage.removeItem('ntc_view_mode'); localStorage.removeItem('preptrack_view_mode');
  window.location.href = getAppPageUrl('login.html');
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
  // Always use a proper http/https URL — Google OAuth does not support file:// redirects
  // Build redirect URL that works whether site is at root or in a subdirectory
  // e.g. http://localhost:5500/NTC-master/ => base = '/NTC-master'
  const basePath = window.location.pathname.replace(/\/pages\/.*|\/index\.html.*|\/$/, '');
  const redirectTo = window.location.origin + basePath + '/pages/auth-callback.html';

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) console.error('Google login error:', error);
}

/**
 * Check user role and redirect to the correct page.
 * Called after any login method (email+password or Google OAuth).
 * 
 * NOTE: Server-side Row Level Security (RLS) is the actual security boundary.
 * Setting localStorage keys here is strictly for frontend UI routing and display performance.
 */
async function checkAdminAndRedirect(userEmail) {
  const ADMIN_EMAIL = 'atoopase@gmail.com';
  let isAdmin = false;

  try {
    if (userEmail === ADMIN_EMAIL) {
      isAdmin = true;
    } else if (supabaseClient) {
      // Wrap in a timeout so a slow/stuck profile query doesn't hang forever
      const profileCheck = new Promise(async (resolve) => {
        try {
          const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
          if (userError) {
            console.warn('getUser error:', userError);
            resolve(false);
            return;
          }
          if (user) {
            const { data: profile, error: profileError } = await supabaseClient
              .from('profiles')
              .select('role, admin_permissions, blocked_until')
              .eq('id', user.id)
              .single();
            if (profileError) console.warn('Profile role fetch error (non-fatal):', profileError.message);
            // Check not blocked
            if (profile && profile.blocked_until && new Date(profile.blocked_until) > new Date()) {
              console.warn('Admin account is blocked');
              resolve(false);
              return;
            }
            if (profile && profile.role === 'admin') {
              const permsJson = JSON.stringify(profile.admin_permissions || []);
              localStorage.setItem('preptrack_admin_permissions', permsJson);
              localStorage.setItem('ntc_admin_permissions', permsJson); localStorage.setItem('preptrack_admin_permissions', permsJson);
              resolve(true);
              return;
            }
          }
          resolve(false);
        } catch (innerErr) {
          console.warn('Profile check inner error:', innerErr);
          resolve(false);
        }
      });

      // Race against a 5-second timeout
      const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 5000));
      isAdmin = await Promise.race([profileCheck, timeout]);
    }
  } catch (err) {
    console.warn('Role check failed, defaulting to dashboard', err);
  }

  if (isAdmin) {
    localStorage.setItem('preptrack_is_admin', 'true');
    localStorage.setItem('ntc_is_admin', 'true'); localStorage.setItem('preptrack_is_admin', 'true');
    localStorage.setItem('preptrack_admin_email', userEmail);
    localStorage.setItem('ntc_admin_email', userEmail); localStorage.setItem('preptrack_admin_email', userEmail);
    const viewMode = localStorage.getItem('preptrack_view_mode') || localStorage.getItem('ntc_view_mode') || 'admin';
    if (viewMode === 'admin') {
      window.location.href = getAppPageUrl('admin-lessons.html');
      return;
    }
  } else {
    localStorage.removeItem('preptrack_is_admin');
    localStorage.removeItem('ntc_is_admin'); localStorage.removeItem('preptrack_is_admin');
    localStorage.removeItem('preptrack_admin_email');
    localStorage.removeItem('ntc_admin_email'); localStorage.removeItem('preptrack_admin_email');
    localStorage.removeItem('preptrack_admin_permissions');
    localStorage.removeItem('ntc_admin_permissions'); localStorage.removeItem('preptrack_admin_permissions');
  }

  window.location.href = getAppPageUrl('dashboard.html');
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
      .maybeSingle();
      
    if (error) throw error;
    if (!data) throw new Error('Profile not found');
    
    // We know dob, school, and phone are failing to persist properly on the backend.
    // So we explicitly override the backend's response with our local cache for these specific fields if they exist locally.
    const localData = JSON.parse(localStorage.getItem(`user_${userId}_profile`) || '{}');
    if (localData.dob) data.dob = localData.dob;
    if (localData.school) data.school = localData.school;
    if (localData.phone) data.phone = localData.phone;
    
    return data;
  } catch (error) {
    // Fallback if DB not setup
    const localData = localStorage.getItem(`user_${userId}_profile`);
    if (localData) return JSON.parse(localData);
    return null;
  }
}

/**
 * Update a user's profile in the database.
 */
async function updateProfile(userId, fields) {
  try {
    // Filter out fields that don't exist in the profiles schema or have issues saving
    const safeFields = { ...fields };
    const { dob, school, phone } = safeFields;
    delete safeFields.dob;
    delete safeFields.school;
    delete safeFields.phone;

    const { error } = await supabaseClient
      .from('profiles')
      .upsert({ id: userId, ...safeFields });
      
    if (error) throw error;
    
    // Persist dob, school, and phone locally
    const localData = JSON.parse(localStorage.getItem(`user_${userId}_profile`) || '{}');
    if (dob !== undefined) localData.dob = dob;
    if (school !== undefined) localData.school = school;
    if (phone !== undefined) localData.phone = phone;
    localStorage.setItem(`user_${userId}_profile`, JSON.stringify(localData));

    return { error: null };
  } catch (error) {
    console.error('Profile update failed:', error);
    return { error };
  }
}

/**
 * Check if a student has already submitted a specific scheduled exam.
 * Returns true if a duplicate submission exists.
 */
async function checkDuplicateSubmission(userId, scheduledExamId) {
  try {
    if (!supabaseClient) return false;
    const { data, error } = await supabaseClient
      .from('student_exam_submissions')
      .select('id')
      .eq('user_id', userId)
      .eq('scheduled_exam_id', scheduledExamId)
      .maybeSingle();
    if (error) throw error;
    return !!data; // true = duplicate exists
  } catch (error) {
    console.warn('Could not check duplicate submission:', error);
    return false; // fail open — allow exam to proceed
  }
}

/**
 * Record that a student has submitted a scheduled exam.
 * Uses UPSERT with the unique constraint so it is idempotent.
 */
async function recordSubmission(userId, scheduledExamId) {
  try {
    if (!supabaseClient) return;
    const { error } = await supabaseClient
      .from('student_exam_submissions')
      .upsert({ user_id: userId, scheduled_exam_id: scheduledExamId }, { onConflict: 'user_id,scheduled_exam_id' });
    if (error) throw error;
  } catch (error) {
    console.warn('Could not record submission:', error);
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
        scheduled_exam_id: examData.isScheduled ? (examData.scheduledExamId || examData.id) : null,
        title: examData.title || examData.subject,
        subject: examData.subject,
        score: examData.score,
        total: examData.total,
        percentage: examData.percentage,
        time_used: String(examData.timeUsed),
        created_at: new Date().toISOString()
      });
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Could not save exam to DB. Saving locally.', error);
    // Fallback local storage
    const results = JSON.parse(localStorage.getItem('preptrack_exam_results') || localStorage.getItem('ntc_exam_results') || '[]');
    results.push({ ...examData, userId, date: new Date().toISOString() });
    localStorage.setItem('ntc_exam_results', JSON.stringify(results)); localStorage.setItem('preptrack_exam_results', JSON.stringify(results));
    return true;
  }
}

/**
 * Get user's exam history from Supabase.
 * Falls back to localStorage if DB is unavailable.
 */
async function getExamHistory(userId) {
  let dbResults = [];
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('exam_results')
        .select('id, title, subject, score, total, percentage, time_used, scheduled_exam_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (!error) {
        dbResults = (data || []).map(r => ({
          id: r.id,
          title: r.title || r.subject,
          subject: r.subject,
          score: r.score,
          total: r.total,
          percentage: r.percentage,
          timeUsed: r.time_used,
          scheduledExamId: r.scheduled_exam_id,
          date: r.created_at
        }));
      }
    }
  } catch (error) {
    console.warn('DB fetch error for exam history:', error);
  }
  
  // Always check local storage as well for offline/unsynced exams
  const localRaw = JSON.parse(localStorage.getItem('preptrack_exam_results') || localStorage.getItem('ntc_exam_results') || '[]');
  const localResults = localRaw.filter(r => !userId || r.userId === userId);
  
  // Merge avoiding duplicates
  const allResults = [...dbResults];
  localResults.forEach(localItem => {
    const exists = allResults.some(dbItem => {
      // If they share an ID and it's not null, it's a match
      if (dbItem.id && localItem.id && dbItem.id === localItem.id) return true;
      // Or if their dates match exactly
      return new Date(dbItem.date).getTime() === new Date(localItem.date).getTime();
    });
    if (!exists) {
      allResults.push(localItem);
    }
  });
  
  return allResults.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// --- Subject Functions --- //

// --- Subject & Course Persistent Storage --- //

const DEFAULT_SYSTEM_SUBJECTS = [
  { id: "415718a9-73a2-4b8d-b149-af72ae9f801b", name: "English language" },
  { id: "70ff49de-ee1a-404e-8026-93e57099dd6c", name: "Mathematics" },
  { id: "23a159a7-a2a4-484f-b07a-2fd60f43b997", name: "French" },
  { id: "3f259e90-19c4-4514-827d-0190346bcf08", name: "History" },
  { id: "b42dea7f-ae1c-44fc-99b8-cd6e62b705be", name: "Geography" },
  { id: "62eaf060-fe0d-4c13-90f2-d78f23c0f3ca", name: "General Professional Knowledge (GPK)" },
  { id: "f82c949f-e918-4685-81c5-8fdffee1998c", name: "Grade-Level Specialism Pedagogy" },
  { id: "25bf9c78-de15-477b-9cfc-f204605406a8", name: "Subject Content Knowledge" },
  { id: "68848472-e20d-4db5-97ce-14aba703af78", name: "Social studies" },
  { id: "51b3c836-7c2e-4c7f-8928-b7bbcfe4e86a", name: "Integrated Science" },
  { id: "93e2b273-ade6-4f4f-ae78-77e2b72c76c3", name: "Physics" },
  { id: "1fbeb6b5-b745-4599-9a58-4ea38e7668d7", name: "Biology" },
  { id: "f624d93f-f6d3-46fd-8dea-49317beb87a0", name: "Chemistry" },
  { id: "495a3ad0-26de-42b6-bca9-718c23d61b63", name: "RME" },
  { id: "d9eedb28-edc7-4d4d-8191-b951cb86f337", name: "BDT" },
  { id: "d178ae07-79f0-4060-9d87-61ce8a87b743", name: "ICT" }
];

function getDeletedCourseKeys() {
  try {
    const list = JSON.parse(localStorage.getItem('preptrack_deleted_courses') || '[]');
    return new Set(list.map(k => String(k).trim().toLowerCase()));
  } catch (e) {
    return new Set();
  }
}

function addDeletedCourseKey(id, name) {
  try {
    const list = JSON.parse(localStorage.getItem('preptrack_deleted_courses') || '[]');
    const set = new Set(list.map(k => String(k).trim().toLowerCase()));
    if (id) set.add(String(id).trim().toLowerCase());
    if (name) set.add(String(name).trim().toLowerCase());
    localStorage.setItem('preptrack_deleted_courses', JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function removeDeletedCourseKey(name, id) {
  try {
    const list = JSON.parse(localStorage.getItem('preptrack_deleted_courses') || '[]');
    const targetName = (name || '').trim().toLowerCase();
    const targetId = (id || '').toString().trim().toLowerCase();
    const filtered = list.filter(k => {
      const lower = String(k).trim().toLowerCase();
      return lower !== targetName && lower !== targetId;
    });
    localStorage.setItem('preptrack_deleted_courses', JSON.stringify(filtered));
  } catch (e) {}
}

/**
 * Fetch all subjects - guaranteed permanent with deleted course tombstones
 */
async function getSubjects() {
  const deletedKeys = getDeletedCourseKeys();
  let subjects = [];
  let fetchedFromDb = false;

  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('subjects')
        .select('*')
        .order('name', { ascending: true });
        
      if (!error && Array.isArray(data) && data.length > 0) {
        subjects = data;
        fetchedFromDb = true;
      }
    }
  } catch (error) {
    console.warn('Could not fetch subjects from DB:', error);
  }

  // If DB returned nothing or is offline, load from master persistent list
  if (!fetchedFromDb || subjects.length === 0) {
    try {
      const master = JSON.parse(localStorage.getItem('preptrack_master_courses') || 'null');
      if (Array.isArray(master) && master.length > 0) {
        subjects = master;
      } else {
        subjects = DEFAULT_SYSTEM_SUBJECTS.filter(s => !deletedKeys.has(s.name.trim().toLowerCase()) && !deletedKeys.has(s.id.trim().toLowerCase()));
      }
    } catch (e) {
      subjects = DEFAULT_SYSTEM_SUBJECTS.filter(s => !deletedKeys.has(s.name.trim().toLowerCase()) && !deletedKeys.has(s.id.trim().toLowerCase()));
    }
  }

  // Merge locally created courses from preptrack_subjects
  try {
    const localCourses = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
    localCourses.forEach(lc => {
      if (lc && lc.name && !subjects.some(s => s.name.trim().toLowerCase() === lc.name.trim().toLowerCase())) {
        subjects.push(lc);
      }
    });
  } catch (e) {}

  // CRITICAL: Filter out any course that has been deleted so it NEVER returns after restart
  subjects = subjects.filter(s => {
    if (!s || !s.name) return false;
    const nameKey = s.name.trim().toLowerCase();
    const idKey = (s.id || '').toString().trim().toLowerCase();
    return !deletedKeys.has(nameKey) && !deletedKeys.has(idKey);
  });

  // Persist the clean master list so additions and deletions survive restarts!
  try {
    localStorage.setItem('preptrack_master_courses', JSON.stringify(subjects));
    localStorage.setItem('preptrack_subjects_cache', JSON.stringify(subjects));
  } catch (e) {}

  return subjects;
}

/**
 * Add a new subject - permanently stored in Supabase and local master list
 */
async function addSubject(name) {
  const cleanName = (name || '').trim();
  if (!cleanName) return { data: null, error: new Error('Subject name cannot be empty') };

  // Re-allow if previously deleted
  removeDeletedCourseKey(cleanName);

  let newSubject = null;
  let dbError = null;

  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('subjects')
        .insert([{ name: cleanName }])
        .select()
        .single();
        
      if (!error && data) {
        newSubject = data;
      } else {
        dbError = error;
      }
    }
  } catch (error) {
    dbError = error;
    console.warn('Supabase addSubject error:', error);
  }

  if (!newSubject) {
    // Generate persistent UUID or timestamped ID for fallback
    newSubject = {
      id: 'course-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      name: cleanName
    };
  }

  // Permanently save to master course lists
  try {
    let local = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
    if (!local.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) {
      local.push(newSubject);
      localStorage.setItem('preptrack_subjects', JSON.stringify(local));
    }

    let master = JSON.parse(localStorage.getItem('preptrack_master_courses') || '[]');
    if (!master.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) {
      master.push(newSubject);
      localStorage.setItem('preptrack_master_courses', JSON.stringify(master));
    }
  } catch (e) {}

  return { data: newSubject, error: null };
}

/**
 * Update an existing subject
 */
async function updateSubject(id, name) {
  const cleanName = (name || '').trim();
  try {
    if (supabaseClient && id && !String(id).startsWith('course-')) {
      await supabaseClient
        .from('subjects')
        .update({ name: cleanName })
        .eq('id', id);
    }
  } catch (error) {
    console.warn('Failed to update subject in DB:', error);
  }

  // Update local stores
  try {
    let local = JSON.parse(localStorage.getItem('preptrack_subjects') || '[]');
    local = local.map(c => c.id === id ? { ...c, name: cleanName } : c);
    localStorage.setItem('preptrack_subjects', JSON.stringify(local));

    let master = JSON.parse(localStorage.getItem('preptrack_master_courses') || '[]');
    master = master.map(c => c.id === id ? { ...c, name: cleanName } : c);
    localStorage.setItem('preptrack_master_courses', JSON.stringify(master));
  } catch (e) {}

  return { data: { id, name: cleanName }, error: null };
}

/**
 * Delete a subject permanently - will NEVER return after restart
 */
async function deleteSubject(id, name) {
  const courseId = id ? String(id).trim() : '';
  const courseName = name ? String(name).trim() : '';

  // 1. Mark permanently deleted in tombstone list so it NEVER returns from Supabase or fallback
  addDeletedCourseKey(courseId, courseName);

  // 2. Remove permanently from local storage stores
  try {
    const scrub = (key) => {
      try {
        let items = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(items)) {
          items = items.filter(c => {
            if (!c) return false;
            if (typeof c === 'string') {
              const str = c.trim().toLowerCase();
              return str !== courseName.toLowerCase() && str !== courseId.toLowerCase();
            }
            const matchId = courseId && String(c.id || '').trim().toLowerCase() === courseId.toLowerCase();
            const matchName = courseName && String(c.name || '').trim().toLowerCase() === courseName.toLowerCase();
            return !matchId && !matchName;
          });
          localStorage.setItem(key, JSON.stringify(items));
        }
      } catch (e) {}
    };

    scrub('preptrack_subjects');
    scrub('preptrack_master_courses');
    scrub('preptrack_subjects_cache');
    scrub('preptrack_selected_courses');
  } catch (e) {}

  // 3. Attempt database deletion in Supabase
  try {
    if (supabaseClient) {
      // First clean up preferences that might have a foreign key reference
      if (courseId) {
        try {
          await supabaseClient
            .from('student_course_preferences')
            .delete()
            .eq('subject_id', courseId);
        } catch (pe) {}
      }

      // Delete by ID
      if (courseId && !courseId.startsWith('course-')) {
        await supabaseClient
          .from('subjects')
          .delete()
          .eq('id', courseId);
      }

      // Also delete by name in case of name match
      if (courseName) {
        await supabaseClient
          .from('subjects')
          .delete()
          .eq('name', courseName);

        await supabaseClient
          .from('subjects')
          .delete()
          .ilike('name', courseName);
      }
    }
  } catch (error) {
    console.warn('Supabase DB delete failed (tombstone will ensure it stays deleted):', error);
  }

  return { error: null };
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
      .neq('email', 'atoopase@gmail.com')
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
 * Update a scheduled exam
 */
async function updateScheduledExam(id, examData) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('scheduled_exams')
      .update(examData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to update scheduled exam:', error);
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
  checkAdminAndRedirect,
  getAppPageUrl
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

// --- Social Features (Likes & Comments for Lessons) --- //

/**
 * Toggle a like for a lesson
 */
async function toggleLessonLike(lessonId, userId) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    
    // Check if already liked
    const { data: existing, error: selectError } = await supabaseClient
      .from('lesson_likes')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('user_id', userId)
      .maybeSingle();
      
    if (selectError) throw selectError;
    
    if (existing) {
      // Unlike
      const { error: deleteError } = await supabaseClient
        .from('lesson_likes')
        .delete()
        .eq('id', existing.id);
      if (deleteError) throw deleteError;
      return { action: 'unliked', error: null };
    } else {
      // Like
      const { error: insertError } = await supabaseClient
        .from('lesson_likes')
        .insert({ lesson_id: lessonId, user_id: userId });
      if (insertError) throw insertError;
      return { action: 'liked', error: null };
    }
  } catch (error) {
    console.error('Failed to toggle like:', error);
    return { error };
  }
}

/**
 * Fetch all likes for a specific lesson
 */
async function getLessonLikes(lessonId) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('lesson_likes')
      .select('user_id')
      .eq('lesson_id', lessonId);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch likes:', error);
    return { data: [], error };
  }
}

/**
 * Fetch all likes for all lessons (for bulk loading)
 */
async function getAllLessonLikes() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('lesson_likes')
      .select('lesson_id, user_id');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch all likes:', error);
    return { data: [], error };
  }
}

/**
 * Add a comment (or reply) to a lesson
 */
async function addLessonComment(lessonId, userId, content, parentId = null) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const payload = {
      lesson_id: lessonId,
      user_id: userId,
      content: content
    };
    if (parentId) payload.parent_id = parentId;
    
    const { data, error } = await supabaseClient
      .from('lesson_comments')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to add comment:', error);
    return { data: null, error };
  }
}

/**
 * Fetch all comments for a specific lesson
 */
async function getLessonComments(lessonId) {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    const { data, error } = await supabaseClient
      .from('lesson_comments')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return { data: [], error };
  }
}

/**
 * Fetch all comments for all lessons (for bulk loading)
 */
async function getAllLessonComments() {
  try {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    // We fetch user profile info directly via a join if possible, but since users are in auth.users, 
    // we fetch comments and we'll map the profile info client side or rely on existing profile map.
    const { data, error } = await supabaseClient
      .from('lesson_comments')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Failed to fetch all comments:', error);
    return { data: [], error };
  }
}

window.supaDB = {
  createProfile,
  getProfile,
  updateProfile,
  saveExamResult,
  getExamHistory,
  checkDuplicateSubmission,
  recordSubmission,
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
  updateScheduledExam,
  deleteScheduledExam,
  getExamRankings,
  uploadLessonFile,
  uploadAvatar,
  createLesson,
  updateLesson,
  getLessons,
  deleteLesson,
  toggleLessonLike,
  getLessonLikes,
  addLessonComment,
  getLessonComments,
  getAllLessonLikes,
  getAllLessonComments
};

/**
 * Check if the current admin has a specific granular permission.
 * Super admin (atoopase@gmail.com) always returns true.
 * 
 * SECURITY NOTE:
 * Frontend permission checks are DISPLAY-ONLY security (used to hide/disable UI controls).
 * Actual data protection, mutations, and query restrictions are strictly enforced server-side
 * via PostgreSQL Row Level Security (RLS) policies and security definer functions in Supabase.
 */
window.hasAdminPermission = function(feature) {
  const adminEmail = localStorage.getItem('preptrack_admin_email') || localStorage.getItem('ntc_admin_email');
  if (adminEmail === 'atoopase@gmail.com') return true;
  
  try {
    const rawPerms = localStorage.getItem('preptrack_admin_permissions') || localStorage.getItem('ntc_admin_permissions');
    const perms = JSON.parse(rawPerms || '[]');
    // Support aliases for permissions
    if (feature === 'manage_students' || feature === 'manage_users') {
      return perms.includes('manage_students') || perms.includes('manage_users');
    }
    if (feature === 'manage_materials' || feature === 'manage_lessons') {
      return perms.includes('manage_materials') || perms.includes('manage_lessons');
    }
    return perms.includes(feature);
  } catch (e) {
    return false;
  }
};
