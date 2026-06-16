// ============================================
// NTC Exam Prep - Authentication Logic
// Login and Registration form handling
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Common Elements
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const googleBtn = document.getElementById('googleLoginBtn');
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  const togglePasswordBtns = document.querySelectorAll('.input-toggle');

  // Toggle Password Visibility
  togglePasswordBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const icon = btn.querySelector('svg');
      
      if (input.type === 'password') {
        input.type = 'text';
        // Eye-off icon
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
      } else {
        input.type = 'password';
        // Eye icon
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      }
    });
  });

  // Password Strength Indicator (Registration)
  const passwordRegister = document.getElementById('password');
  if (passwordRegister && document.querySelector('.password-strength-segment')) {
    passwordRegister.addEventListener('input', (e) => {
      const val = e.target.value;
      const segments = document.querySelectorAll('.password-strength-segment');
      const text = document.querySelector('.password-strength-text');
      
      // Reset
      segments.forEach(s => {
        s.className = 'password-strength-segment';
      });
      
      if (val.length === 0) {
        text.textContent = 'Password strength';
        return;
      }
      
      let strength = 0;
      if (val.length >= 6) strength += 1;
      if (val.match(/[A-Z]/) && val.match(/[0-9]/)) strength += 1;
      if (val.match(/[^A-Za-z0-9]/) && val.length >= 8) strength += 1;
      
      if (strength === 1) {
        segments[0].classList.add('active', 'weak');
        text.textContent = 'Weak';
        text.style.color = 'var(--danger)';
      } else if (strength === 2) {
        segments[0].classList.add('active', 'medium');
        segments[1].classList.add('active', 'medium');
        text.textContent = 'Medium';
        text.style.color = 'var(--warning)';
      } else if (strength >= 3) {
        segments[0].classList.add('active', 'strong');
        segments[1].classList.add('active', 'strong');
        segments[2].classList.add('active', 'strong');
        text.textContent = 'Strong';
        text.style.color = 'var(--accent)';
      }
    });
  }

  // Handle Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const btn = loginForm.querySelector('button[type="submit"]');
      
      if (!email || !password) {
        window.showToast('Please enter both email and password', 'error');
        return;
      }
      
      // UI Loading state
      const originalText = btn.textContent;
      btn.classList.add('btn-loading');
      btn.disabled = true;
      
      try {
        if (window.supaAuth) {
          const { data, error } = await window.supaAuth.signIn(email, password);
          
          if (error) {
            window.showToast(error.message || 'Login failed', 'error');
            btn.classList.remove('btn-loading');
            btn.disabled = false;
          } else {
            window.showToast('Login successful! Redirecting...', 'success');
            localStorage.setItem('ntc_user', JSON.stringify({ email }));
            // Use the shared role-check redirect (admin vs student)
            if (window.supaAuth && window.supaAuth.checkAdminAndRedirect) {
              await window.supaAuth.checkAdminAndRedirect(email);
            } else {
              // Fallback if supabase not loaded
              if (email === 'atoopase@gmail.com') {
                window.location.href = 'admin-lessons.html';
              } else {
                window.location.href = 'dashboard.html';
              }
            }
          }
        } else {
          // Mock login for demo purposes if supabase isn't loaded
          setTimeout(() => {
            window.showToast('Demo Login successful! Redirecting...', 'success');
            localStorage.setItem('ntc_user', JSON.stringify({ email }));
            window.location.href = 'dashboard.html';
          }, 1500);
        }
      } catch (err) {
        window.showToast('An unexpected error occurred', 'error');
        btn.classList.remove('btn-loading');
        btn.disabled = false;
      }
    });
  }

  // Handle Registration
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const fullName = document.getElementById('fullName').value;
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const terms = document.getElementById('terms').checked;
      const btn = registerForm.querySelector('button[type="submit"]');
      
      // Validation
      if (!fullName || !email || !phone || !password || !confirmPassword) {
        window.showToast('Please fill all fields', 'error');
        return;
      }
      
      if (password !== confirmPassword) {
        window.showToast('Passwords do not match', 'error');
        return;
      }
      
      if (password.length < 6) {
        window.showToast('Password must be at least 6 characters', 'error');
        return;
      }
      
      if (!terms) {
        window.showToast('You must agree to the Terms & Conditions', 'error');
        return;
      }
      
      // UI Loading state
      btn.classList.add('btn-loading');
      btn.disabled = true;
      
      try {
        if (window.supaAuth) {
          const { data, error } = await window.supaAuth.signUp(email, password, fullName, phone);
          
          if (error) {
            window.showToast(error.message || 'Registration failed', 'error');
            btn.classList.remove('btn-loading');
            btn.disabled = false;
          } else {
            window.showToast('Registration successful! Please login.', 'success');
            setTimeout(() => {
              window.location.href = 'login.html';
            }, 1500);
          }
        } else {
          // Mock register
          setTimeout(() => {
            window.showToast('Demo Registration successful! Redirecting to login...', 'success');
            window.location.href = 'login.html';
          }, 1500);
        }
      } catch (err) {
        window.showToast('An unexpected error occurred', 'error');
        btn.classList.remove('btn-loading');
        btn.disabled = false;
      }
    });
  }

  // Handle Google Login
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      if (window.supaAuth) {
        window.supaAuth.signInWithGoogle();
      } else {
        window.showToast('Google login is not configured in demo mode', 'info');
      }
    });
  }

  // Authentication Guard for protected pages
  const isProtectedPage = 
    window.location.pathname.includes('dashboard') ||
    window.location.pathname.includes('exam') ||
    window.location.pathname.includes('results') ||
    window.location.pathname.includes('profile') ||
    window.location.pathname.includes('leaderboard') ||
    window.location.pathname.includes('resources') ||
    window.location.pathname.includes('admin');

  if (isProtectedPage) {
    checkAuth();
  }

  async function checkAuth() {
    let isAuthenticated = false;
    
    if (window.supaAuth) {
      const user = await window.supaAuth.getCurrentUser();
      isAuthenticated = !!user;
    } else {
      // Check demo storage
      isAuthenticated = !!localStorage.getItem('ntc_user');
    }
    
    if (!isAuthenticated) {
      // Not logged in, redirect to login
      window.location.href = '/pages/login.html';
    } else {
      // Update UI with user info if possible
      updateUserInfo();
    }
  }

  async function updateUserInfo() {
    const userNames = document.querySelectorAll('.user-name');
    const userAvatars = document.querySelectorAll('.user-avatar-initials, .user-avatar');
    
    if (userNames.length === 0 && userAvatars.length === 0) return;
    
    let displayName = 'Student User';
    let avatarUrl = null;
    
    if (window.supaAuth && window.supaDB) {
      const user = await window.supaAuth.getCurrentUser();
      if (user) {
        // Fallback to Google metadata if profile is slow
        if (user.user_metadata && user.user_metadata.avatar_url) {
          avatarUrl = user.user_metadata.avatar_url;
        }
        if (user.user_metadata && user.user_metadata.full_name) {
          displayName = user.user_metadata.full_name;
        }

        try {
          const profile = await window.supaDB.getProfile(user.id);
          if (profile) {
            if (profile.full_name) displayName = profile.full_name;
            if (profile.avatar_url) avatarUrl = profile.avatar_url;
          } else if (!displayName || displayName === 'Student User') {
            displayName = user.email.split('@')[0];
          }
        } catch (e) {
           // profile fetch failed
           if (displayName === 'Student User') displayName = user.email.split('@')[0];
        }
      }
    } else {
      const storedUser = JSON.parse(localStorage.getItem('ntc_user') || '{}');
      if (storedUser.email) {
        displayName = storedUser.email.split('@')[0];
      }
    }
    
    userNames.forEach(el => {
      const parts = displayName.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      if (lastName) {
        el.innerHTML = `<span class="first-name">${firstName}</span><span class="last-name"> ${lastName}</span>`;
      } else {
        el.textContent = firstName;
      }
    });

    userAvatars.forEach(el => {
      if (avatarUrl) {
        // Change from initials to actual image
        el.textContent = '';
        if (el.tagName === 'IMG') {
          el.src = avatarUrl;
        } else {
          el.style.backgroundImage = `url(${avatarUrl})`;
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
        }
        // Remove initials classes if any, add general avatar class
        el.classList.remove('user-avatar-initials');
        if (!el.classList.contains('user-avatar')) el.classList.add('user-avatar');
      } else {
        if (el.tagName !== 'IMG') {
          el.textContent = displayName.charAt(0).toUpperCase();
        }
      }
    });
  }

  // Handle Logout
  const logoutBtns = document.querySelectorAll('#logoutBtn');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      if (window.supaAuth) {
        await window.supaAuth.signOut();
      } else {
        localStorage.removeItem('ntc_user');
        window.location.href = 'login.html';
      }
    });
  });

  // ── Navbar Profile Dropdown Toggle ─────────────────────────────────
  const profileBtn = document.getElementById('userProfileBtn');
  const dropdownMenu = document.getElementById('userDropdownMenu');

  if (profileBtn && dropdownMenu) {
    profileBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 1023) {
        if (window.supaAuth) {
          await window.supaAuth.signOut();
        } else {
          localStorage.removeItem('ntc_user');
          window.location.href = 'login.html';
        }
        return;
      }
      dropdownMenu.classList.toggle('open');
    });

    // Prevent clicks inside the dropdown from closing it
    dropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Close dropdown when clicking anywhere outside
    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('open');
    });
  }
});
