// ============================================
// NTC Exam Prep - Profile Logic
// Handles profile updates, password changes, stats
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.profile-grid')) return;

  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');
  const avatarUpload = document.getElementById('avatarUpload');
  
  initProfile();

  async function initProfile() {
    // Populate stats
    let history = [];
    if (localStorage.getItem('ntc_exam_results')) {
      history = JSON.parse(localStorage.getItem('ntc_exam_results'));
    }
    
    document.getElementById('profileExamsCount').textContent = history.length;
    
    if (history.length > 0) {
      const totalPercentage = history.reduce((acc, curr) => acc + curr.percentage, 0);
      const avgScore = Math.round(totalPercentage / history.length);
      document.getElementById('profileAvgScore').textContent = `${avgScore}%`;
    }
    
    // Load User Data
    let userData = {
      fullName: '',
      email: '',
      phone: '',
      school: '',
      bio: ''
    };
    
    if (window.supaAuth && window.supaDB) {
      const user = await window.supaAuth.getCurrentUser();
      if (user) {
        const profile = await window.supaDB.getProfile(user.id);
        if (profile) {
          userData.fullName = profile.full_name || '';
          userData.email = profile.email || user.email;
          userData.phone = profile.phone || '';
        } else {
          userData.email = user.email;
        }
      }
    } else {
      const storedUser = JSON.parse(localStorage.getItem('ntc_user') || '{}');
      userData.email = storedUser.email || 'student@example.com';
      userData.fullName = storedUser.fullName || '';
      userData.phone = storedUser.phone || '';
    }
    
    // Fill forms
    if (document.getElementById('profileName')) document.getElementById('profileName').value = userData.fullName;
    if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = userData.email;
    if (document.getElementById('profilePhone')) document.getElementById('profilePhone').value = userData.phone;
    
    // Display names
    const displayName = userData.fullName || userData.email.split('@')[0];
    document.getElementById('profileDisplayName').textContent = displayName;
    document.getElementById('profileDisplayEmail').textContent = userData.email;
    document.getElementById('profileAvatarInitials').textContent = displayName.substring(0, 2).toUpperCase();
  }

  // Handle Profile Update
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = profileForm.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner spinner-sm" style="border-color: white; border-top-color: transparent;"></span>';
      btn.disabled = true;
      
      const fullName = document.getElementById('profileName').value;
      const phone = document.getElementById('profilePhone').value;
      const school = document.getElementById('profileSchool').value;
      const bio = document.getElementById('profileBio').value;
      
      try {
        if (window.supaAuth && window.supaDB) {
          const user = await window.supaAuth.getCurrentUser();
          if (user) {
            // Check if profile exists, if not create, if yes update
            await window.supabaseClient.from('profiles').upsert({
              id: user.id,
              full_name: fullName,
              phone: phone,
              updated_at: new Date().toISOString()
            });
            window.showToast('Profile updated successfully', 'success');
          }
        } else {
          // Mock update
          const storedUser = JSON.parse(localStorage.getItem('ntc_user') || '{}');
          storedUser.fullName = fullName;
          storedUser.phone = phone;
          localStorage.setItem('ntc_user', JSON.stringify(storedUser));
          window.showToast('Profile updated successfully (Demo)', 'success');
        }
        
        // Update display
        document.getElementById('profileDisplayName').textContent = fullName || storedUser.email.split('@')[0];
        document.getElementById('profileAvatarInitials').textContent = (fullName || 'U').substring(0, 2).toUpperCase();
        
        // Update name in navbar if it exists
        const userNames = document.querySelectorAll('.user-name');
        userNames.forEach(el => el.textContent = fullName);
        
      } catch (err) {
        console.error(err);
        window.showToast('Failed to update profile', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  }

  // Handle Password Change
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmNewPassword = document.getElementById('confirmNewPassword').value;
      
      if (newPassword !== confirmNewPassword) {
        window.showToast('New passwords do not match', 'error');
        return;
      }
      
      if (newPassword.length < 6) {
        window.showToast('Password must be at least 6 characters', 'error');
        return;
      }
      
      const btn = passwordForm.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner spinner-sm" style="border-color: white; border-top-color: transparent;"></span>';
      btn.disabled = true;
      
      try {
        if (window.supaAuth) {
          const { error } = await window.supabaseClient.auth.updateUser({
            password: newPassword
          });
          
          if (error) throw error;
          window.showToast('Password updated successfully', 'success');
          passwordForm.reset();
        } else {
          // Mock update
          setTimeout(() => {
            window.showToast('Password updated successfully (Demo)', 'success');
            passwordForm.reset();
            btn.innerHTML = originalText;
            btn.disabled = false;
          }, 1000);
          return;
        }
      } catch (err) {
        console.error(err);
        window.showToast(err.message || 'Failed to update password', 'error');
      }
      
      btn.innerHTML = originalText;
      btn.disabled = false;
    });
  }

  // Avatar Upload (Mock visual effect)
  if (avatarUpload) {
    avatarUpload.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const initials = document.getElementById('profileAvatarInitials');
          const avatarContainer = initials.parentElement;
          
          // Remove initials and set background image
          initials.style.display = 'none';
          avatarContainer.style.backgroundImage = `url('${e.target.result}')`;
          avatarContainer.style.backgroundSize = 'cover';
          avatarContainer.style.backgroundPosition = 'center';
          
          window.showToast('Profile photo updated', 'success');
        }
        reader.readAsDataURL(e.target.files[0]);
      }
    });
  }
});
