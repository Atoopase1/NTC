// ============================================
// NTC Exam Prep - Profile Logic
// Handles profile updates, password changes, stats
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('profileDisplayName')) return;

  const profileForm = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');
  const avatarUpload = document.getElementById('avatarUpload');
  
  initProfile();

  async function initProfile() {
    // ── Load exam history from Supabase ────────────────────────────
    let history = [];
    
    if (window.supaAuth && window.supaDB) {
      try {
        const user = await window.supaAuth.getCurrentUser();
        if (user) {
          history = await window.supaDB.getExamHistory(user.id);
        }
      } catch(e) {
        console.warn('Could not fetch exam history from Supabase:', e);
      }
    }
    
    // Fallback to localStorage if nothing came back
    if (!history || history.length === 0) {
      try {
        const local = JSON.parse(localStorage.getItem('ntc_exam_results') || '[]');
        if (local.length > 0) history = local;
      } catch(e) {}
    }
    
    // ── Stats ───────────────────────────────────────────────────────
    document.getElementById('profileExamsCount').textContent = history.length;
    
    if (history.length > 0) {
      const avgScore = Math.round(
        history.reduce((acc, r) => acc + (r.percentage || 0), 0) / history.length
      );
      const avgEl = document.getElementById('profileAvgScore');
      if (avgEl) avgEl.textContent = `${avgScore}%`;
      
      // ── Exam History Table ────────────────────────────────────────
      const historyContainer = document.getElementById('profileExamHistory');
      if (historyContainer) {
        let html = '';
        history.forEach((exam, idx) => {
          const date = new Date(exam.date || exam.created_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
          });
          const passClass = exam.percentage >= 50 ? 'success' : 'danger';
          const passLabel = exam.percentage >= 50 ? 'PASSED' : 'FAILED';
          
          html += `
            <div style="margin-bottom: var(--space-md); padding: var(--space-md) var(--space-lg); border-left: 4px solid var(--${passClass}); border-radius: 0 var(--radius-md) var(--radius-md) 0; background: var(--surface-hover); display: flex; justify-content: space-between; align-items: center; gap: var(--space-md); flex-wrap: wrap;">
              <div style="flex:1; min-width: 200px;">
                <div style="display:flex; align-items:center; gap: var(--space-sm); margin-bottom: 6px;">
                  <span style="font-size: var(--text-xs); font-weight: 700; padding: 2px 10px; border-radius: 99px; background: var(--${passClass}); color: white;">${passLabel}</span>
                  <h4 style="margin:0; font-size: var(--text-base);">${exam.title || exam.subject}</h4>
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-light); display: flex; gap: 16px; flex-wrap: wrap;">
                  <span>📚 ${exam.subject || '—'}</span>
                  <span>📅 ${date}</span>
                  <span>🏆 Score: <strong>${exam.score}/${exam.total}</strong> (${exam.percentage}%)</span>
                </div>
              </div>
            </div>
          `;
        });
        historyContainer.innerHTML = html;
      }
    } else {
      const avgEl = document.getElementById('profileAvgScore');
      if (avgEl) avgEl.textContent = '—';
      const historyContainer = document.getElementById('profileExamHistory');
      if (historyContainer) {
        historyContainer.innerHTML = `
          <div style="text-align: center; padding: var(--space-xl); color: var(--text-light);">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 12px; opacity: 0.4;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
            <p style="margin: 0; font-size: var(--text-sm);">No exams taken yet. Your history will appear here.</p>
          </div>
        `;
      }
    }

    
    let userData = {
      fullName: '',
      email: '',
      phone: '',
      dob: '',
      school: '',
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
      
      try {
        if (window.supaAuth && window.supaDB) {
          const user = await window.supaAuth.getCurrentUser();
          if (user) {
            const { error } = await window.supaDB.updateProfile(user.id, {
              full_name: fullName,
              phone,
              dob,
              school,
              updated_at: new Date().toISOString()
            });
            if (error) throw error;
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
        
        // Update display (safe — fullName is always defined here)
        const displayName = fullName || document.getElementById('profileDisplayEmail').textContent.split('@')[0];
        document.getElementById('profileDisplayName').textContent = displayName;
        const initialsEl = document.getElementById('profileAvatarInitials');
        if (initialsEl && initialsEl.style.display !== 'none') {
           initialsEl.textContent = (fullName || 'U').substring(0, 2).toUpperCase();
        }
        
        // Update name in navbar if it exists
        const userNames = document.querySelectorAll('.user-name');
        userNames.forEach(el => el.textContent = fullName);
        
      } catch (err) {
        console.error(err);
        window.showToast('Failed to update profile: ' + (err.message || 'Unknown error'), 'error');
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

  // Avatar Upload
  if (avatarUpload) {
    avatarUpload.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const initials = document.getElementById('profileAvatarInitials');
        const avatarContainer = initials.parentElement;
        
        // Show loading state
        window.showToast('Uploading profile photo...', 'info');
        
        try {
          let newUrl = null;
          
          if (window.supaAuth && window.supaDB && window.supaDB.uploadAvatar) {
            const user = await window.supaAuth.getCurrentUser();
            if (user) {
              const { url, error } = await window.supaDB.uploadAvatar(user.id, file);
              if (error) throw error;
              
              // Update profile in DB
              await window.supaDB.updateProfile(user.id, { avatar_url: url });
              newUrl = url;
            }
          } else {
            // Mock upload
            const reader = new FileReader();
            newUrl = await new Promise((resolve) => {
              reader.onload = (ev) => resolve(ev.target.result);
              reader.readAsDataURL(file);
            });
            const storedUser = JSON.parse(localStorage.getItem('ntc_user') || '{}');
            storedUser.avatar_url = newUrl;
            localStorage.setItem('ntc_user', JSON.stringify(storedUser));
          }
          
          if (newUrl) {
            // Update profile page avatar
            initials.style.display = 'none';
            avatarContainer.style.backgroundImage = `url('${newUrl}')`;
            avatarContainer.style.backgroundSize = 'cover';
            avatarContainer.style.backgroundPosition = 'center';
            avatarContainer.style.border = '2px solid var(--primary)';
            
            // Update all navbar avatars
            const allAvatars = document.querySelectorAll('.avatar');
            allAvatars.forEach(av => {
              if (av !== avatarContainer && !av.closest('.user-dropdown-menu')) {
                const initSpan = av.querySelector('span') || av;
                if (initSpan.tagName === 'SPAN' || initSpan.classList.contains('user-avatar-initials')) {
                  initSpan.textContent = '';
                }
                av.style.backgroundImage = `url('${newUrl}')`;
                av.style.backgroundSize = 'cover';
                av.style.backgroundPosition = 'center';
              }
            });
            
            window.showToast('Profile photo updated', 'success');
          }
        } catch (err) {
          console.error(err);
          window.showToast('Failed to upload photo', 'error');
        }
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
