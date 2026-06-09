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
      
      // Render Exam History
      const historyContainer = document.getElementById('profileExamHistory');
      if (historyContainer) {
        // Reverse so newest is first
        const sortedHistory = [...history].reverse();
        let html = '';
        
        sortedHistory.forEach((exam, idx) => {
          const date = new Date(exam.date).toLocaleDateString();
          const passClass = exam.percentage >= 50 ? 'success' : 'danger';
          
          html += `
            <div class="admin-card" style="margin-bottom: var(--space-md); padding: var(--space-md); border-left: 4px solid var(--${passClass}); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h4 style="margin-bottom: 4px;">${exam.title || exam.subject}</h4>
                <div style="font-size: var(--text-xs); color: var(--text-light); display: flex; gap: 12px;">
                  <span style="display:flex;align-items:center;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${date}</span>
                  <span style="display:flex;align-items:center;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> Score: ${exam.score}/${exam.total} (${exam.percentage}%)</span>
                </div>
              </div>
              <button class="btn btn-outline btn-sm" onclick="window.openReviewModal(${history.length - 1 - idx})">
                View Review
              </button>
            </div>
          `;
        });
        historyContainer.innerHTML = html;
      }
    } else {
      const historyContainer = document.getElementById('profileExamHistory');
      if (historyContainer) {
        historyContainer.innerHTML = '<p style="color: var(--text-light);">No exams taken yet. Your history will appear here.</p>';
      }
    }
    
    let userData = {
      fullName: '',
      email: '',
      phone: '',
      dob: '',
      school: '',
      bio: '',
      avatar_url: null
    };
    
    if (window.supaAuth && window.supaDB) {
      const user = await window.supaAuth.getCurrentUser();
      if (user) {
        if (user.user_metadata && user.user_metadata.avatar_url) {
          userData.avatar_url = user.user_metadata.avatar_url;
        }
        if (user.user_metadata && user.user_metadata.full_name) {
          userData.fullName = user.user_metadata.full_name;
        }
        const profile = await window.supaDB.getProfile(user.id);
        if (profile) {
          userData.fullName = profile.full_name || userData.fullName;
          userData.email = profile.email || user.email;
          userData.phone = profile.phone || '';
          userData.dob = profile.dob || '';
          userData.school = profile.school || '';
          userData.bio = profile.bio || '';
          userData.avatar_url = profile.avatar_url || userData.avatar_url;
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
    if (document.getElementById('profileDob')) document.getElementById('profileDob').value = userData.dob;
    if (document.getElementById('profileSchool')) document.getElementById('profileSchool').value = userData.school;
    if (document.getElementById('profileBio')) document.getElementById('profileBio').value = userData.bio;
    
    // Display names
    const displayName = userData.fullName || userData.email.split('@')[0];
    document.getElementById('profileDisplayName').textContent = displayName;
    document.getElementById('profileDisplayEmail').textContent = userData.email;
    
    // Display avatar
    const avatarInitials = document.getElementById('profileAvatarInitials');
    if (userData.avatar_url) {
      avatarInitials.style.display = 'none';
      const container = avatarInitials.parentElement;
      container.style.backgroundImage = `url(${userData.avatar_url})`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
      container.style.border = '2px solid var(--primary)';
    } else {
      avatarInitials.textContent = displayName.substring(0, 2).toUpperCase();
    }
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
      const dob = document.getElementById('profileDob') ? document.getElementById('profileDob').value : '';
      const school = document.getElementById('profileSchool') ? document.getElementById('profileSchool').value : '';
      const bio = document.getElementById('profileBio') ? document.getElementById('profileBio').value : '';
      
      try {
        if (window.supaAuth && window.supaDB) {
          const user = await window.supaAuth.getCurrentUser();
          if (user) {
            // Check if profile exists, if not create, if yes update
            await window.supabaseClient.from('profiles').upsert({
              id: user.id,
              full_name: fullName,
              phone: phone,
              dob: dob,
              school: school,
              bio: bio,
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
        const initialsEl = document.getElementById('profileAvatarInitials');
        if (initialsEl.style.display !== 'none') {
           initialsEl.textContent = (fullName || 'U').substring(0, 2).toUpperCase();
        }
        
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
  
  // Global function to open Review Modal
  window.openReviewModal = (historyIndex) => {
    const historyStr = localStorage.getItem('ntc_exam_results');
    if (!historyStr) return;
    
    const history = JSON.parse(historyStr);
    const examResult = history[historyIndex];
    if (!examResult || !examResult.reviewData) {
      window.showToast('Detailed review data not available for this exam.', 'error');
      return;
    }
    
    const container = document.getElementById('reviewModalContent');
    let html = '<div class="review-list">';
    const letters = ['A', 'B', 'C', 'D'];
    
    examResult.reviewData.forEach((item, index) => {
      const isCorrect = item.isCorrect;
      const statusClass = isCorrect ? 'correct-q' : 'wrong-q';
      
      let optionsHtml = '';
      item.options.forEach((opt, optIndex) => {
        let optClass = 'review-option';
        let icon = '';
        
        if (optIndex === item.correctAnswer) {
          optClass += ' correct-answer';
          icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); margin-left: auto;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (optIndex === item.userAnswer && !isCorrect) {
          optClass += ' wrong-answer';
          icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--danger); margin-left: auto;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        }
        
        optionsHtml += `
          <div class="${optClass}">
            <span style="font-weight: 700; width: 24px;">${letters[optIndex]}.</span> 
            ${opt}
            ${icon}
          </div>
        `;
      });
      
      html += `
        <div class="review-item">
          <div class="review-question-header">
            <div class="review-question-num ${statusClass}">Q${index + 1}</div>
            <div style="font-size: var(--text-xs); color: var(--text-lighter); margin-left: auto;">
              ${isCorrect ? 'Correct +1' : 'Incorrect 0'}
            </div>
          </div>
          <div class="review-question-text">${item.question}</div>
          <div class="review-options">
            ${optionsHtml}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    window.openModal('reviewModal');
  };
});
