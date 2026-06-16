// ============================================
// NTC Exam Prep - App JS
// Global app functionality, UI interactions, theme
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // === Theme Management ===
  const themeToggle = document.getElementById('themeToggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Initialize theme
  function initTheme() {
    const savedTheme = localStorage.getItem('ntc-theme');
    if (savedTheme === 'dark' || (!savedTheme && prefersDark.matches)) {
      document.body.setAttribute('data-theme', 'dark');
      updateThemeIcon(true);
    } else {
      document.body.removeAttribute('data-theme');
      updateThemeIcon(false);
    }
  }
  
  // Toggle theme
  function toggleTheme() {
    const isDark = document.body.hasAttribute('data-theme');
    if (isDark) {
      document.body.removeAttribute('data-theme');
      localStorage.setItem('ntc-theme', 'light');
      updateThemeIcon(false);
    } else {
      document.body.setAttribute('data-theme', 'dark');
      localStorage.setItem('ntc-theme', 'dark');
      updateThemeIcon(true);
    }
  }
  
  // Update icon based on theme
  function updateThemeIcon(isDark) {
    if (themeToggle) {
      if (isDark) {
        themeToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
      } else {
        themeToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      }
    }
  }
  
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  initTheme();
  
  // Listen for system theme changes
  prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('ntc-theme')) {
      if (e.matches) {
        document.body.setAttribute('data-theme', 'dark');
        updateThemeIcon(true);
      } else {
        document.body.removeAttribute('data-theme');
        updateThemeIcon(false);
      }
    }
  });
  
  // === Mobile Navigation ===
  const navbarToggle = document.getElementById('navbarToggle');
  const navbarNav = document.getElementById('navbarNav');
  
  if (navbarToggle && navbarNav) {
    navbarToggle.addEventListener('click', () => {
      navbarToggle.classList.toggle('active');
      navbarNav.classList.toggle('open');
      document.body.style.overflow = navbarNav.classList.contains('open') ? 'hidden' : '';
    });
  }
  
  // Close mobile nav when clicking outside
  document.addEventListener('click', (e) => {
    if (navbarNav && navbarNav.classList.contains('open') && !e.target.closest('.navbar')) {
      navbarToggle.classList.remove('active');
      navbarNav.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
  
  // === Navbar Scroll Effect ===
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }
  
  // === Scroll To Top ===
  const scrollTopBtn = document.getElementById('scrollTop');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    });
    
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  // === Accordions (FAQs) ===
  const accordions = document.querySelectorAll('.accordion-header');
  accordions.forEach(acc => {
    acc.addEventListener('click', function() {
      const item = this.parentElement;
      const isActive = item.classList.contains('active');
      
      // Close all accordions
      document.querySelectorAll('.accordion-item').forEach(el => {
        el.classList.remove('active');
      });
      
      // Open clicked one if it wasn't already open
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
  
  // === Tabs ===
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // Remove active class from all buttons and content
      btn.parentElement.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active class to current button and target content
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // === User Dropdown ===
  const userDropdown = document.querySelector('.user-dropdown');
  if (userDropdown) {
    const toggle = userDropdown.querySelector('.user-dropdown-toggle');
    toggle.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.supaAuth) {
        await window.supaAuth.signOut();
      } else {
        localStorage.removeItem('ntc_user');
        window.location.href = 'login.html';
      }
    });
    
    document.addEventListener('click', () => {
      userDropdown.classList.remove('active');
    });
  }
  
  // === Sidebar Toggle (Dashboard) ===
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  
  if (sidebarToggle && sidebar && sidebarOverlay) {
    sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth >= 1024) {
        document.querySelector('.dashboard-layout').classList.toggle('collapsed');
      } else {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
    
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  }
  
  // === Admin View Switching ===
  const isAdmin = localStorage.getItem('ntc_is_admin') === 'true';
  const isAdminSidebar = document.querySelector('.admin-sidebar');

  if (isAdmin) {
    // --- Inject into user dropdown (works on all pages) ---
    const dropdownMenu = document.getElementById('userDropdownMenu');
    if (dropdownMenu) {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';

      const switchLink = document.createElement('a');
      switchLink.className = 'dropdown-item';

      if (isAdminSidebar) {
        // Admin page — offer "View as Student"
        switchLink.href = 'dashboard.html';
        switchLink.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          View as Student
        `;
        switchLink.addEventListener('click', () => localStorage.setItem('ntc_view_mode', 'student'));
      } else {
        // Student page — offer "Return to Admin"
        switchLink.href = 'admin-lessons.html';
        switchLink.style.color = 'var(--accent)';
        switchLink.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          Admin Portal
        `;
        switchLink.addEventListener('click', () => localStorage.setItem('ntc_view_mode', 'admin'));
      }

      // Insert before the logout divider (last .dropdown-divider)
      const lastDivider = [...dropdownMenu.querySelectorAll('.dropdown-divider')].pop();
      if (lastDivider) {
        dropdownMenu.insertBefore(divider, lastDivider);
        dropdownMenu.insertBefore(switchLink, lastDivider);
      } else {
        dropdownMenu.appendChild(divider);
        dropdownMenu.appendChild(switchLink);
      }
    }

    // --- Inject into sidebar (admin pages vs student pages) ---
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
      const sections = sidebarNav.querySelectorAll('.sidebar-section');
      const lastSection = sections[sections.length - 1];
      
      if (isAdminSidebar && lastSection) {
        const studentLink = document.createElement('a');
        studentLink.href = 'dashboard.html';
        studentLink.className = 'sidebar-link';
        studentLink.innerHTML = `
          <span class="sidebar-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          View as Student
        `;
        studentLink.style.cssText = 'margin-top:var(--space-md);border-top:1px solid var(--border);padding-top:var(--space-md);';
        studentLink.addEventListener('click', () => localStorage.setItem('ntc_view_mode', 'student'));
        lastSection.appendChild(studentLink);
      } else if (!isAdminSidebar && lastSection) {
        // Inject into student sidebar (e.g. Dashboard, Profile)
        const adminLink = document.createElement('a');
        adminLink.href = 'admin-lessons.html';
        adminLink.className = 'sidebar-link';
        adminLink.style.cssText = 'margin-top:var(--space-md);border-top:1px solid var(--border);padding-top:var(--space-md);color:var(--accent);';
        adminLink.innerHTML = `
          <span class="sidebar-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          </span>
          Admin Portal
        `;
        adminLink.addEventListener('click', () => localStorage.setItem('ntc_view_mode', 'admin'));
        lastSection.appendChild(adminLink);
      }
    }
  }

  // === Intersection Observer for scroll animations ===
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  
  const revealOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
  };
  
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, revealOptions);
  
  revealElements.forEach(el => {
    revealObserver.observe(el);
  });
  // === Dynamic Subjects for Home Page ===
  const homeSubjectsGrid = document.getElementById('homeSubjectsGrid');
  if (homeSubjectsGrid && window.supaDB && window.supaDB.getSubjects) {
    window.supaDB.getSubjects().then(subjects => {
      if (subjects && subjects.length > 0) {
        let html = '';
        const iconClasses = ['pedagogy', 'general', 'curriculum', 'assessment', 'ict', 'psychology'];
        subjects.forEach((sub, idx) => {
          const iconClass = iconClasses[idx % iconClasses.length];
          let svgPath = '';
          switch (iconClass) {
            case 'pedagogy': svgPath = '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'; break;
            case 'general': svgPath = '<circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'; break;
            case 'curriculum': svgPath = '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'; break;
            case 'assessment': svgPath = '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/>'; break;
            case 'ict': svgPath = '<rect width="18" height="12" x="3" y="4" rx="2" ry="2"/><line x1="2" x2="22" y1="20" y2="20"/>'; break;
            case 'psychology': svgPath = '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'; break;
          }
          
          html += `
            <div class="subject-card reveal delay-${(idx % 6) + 1}">
              <div class="subject-icon ${iconClass}">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${svgPath}
                </svg>
              </div>
              <div class="subject-info">
                <h4>${sub.name}</h4>
                <p>${sub.description || 'Topics and practices related to ' + sub.name + '.'}</p>
                <div class="subject-meta" style="display: flex; align-items: center; gap: 6px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                  </svg>
                  <span>Questions Available</span>
                </div>
              </div>
            </div>
          `;
        });
        homeSubjectsGrid.innerHTML = html;
        
        // Re-trigger intersection observer for newly added elements.
        // Use requestAnimationFrame so the browser has painted the new elements
        // before we check their positions — this prevents the flash-and-vanish
        // bug where cards are invisible because the async observer fires too late.
        requestAnimationFrame(() => {
          const newReveals = homeSubjectsGrid.querySelectorAll('.reveal');
          newReveals.forEach(el => {
            const rect = el.getBoundingClientRect();
            const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
            if (alreadyVisible) {
              // Already in viewport — reveal immediately, no need to observe
              el.classList.add('revealed');
            } else {
              revealObserver.observe(el);
            }
          });
        });
      }
    }).catch(e => console.error("Error loading home subjects:", e));
  }
});

// === Toast Notification System ===
window.showToast = function(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  
  // Create container if it doesn't exist
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Set icon based on type
  let iconSvg = '';
  switch (type) {
    case 'success':
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      break;
    case 'error':
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      break;
    case 'warning':
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      break;
    default: // info
      iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }
  
  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Close button functionality
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    removeToast(toast);
  });
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      removeToast(toast);
    }
  }, 5000);
  
  function removeToast(toastElement) {
    toastElement.classList.add('toast-leaving');
    setTimeout(() => {
      if (toastElement.parentElement) {
        toastElement.parentElement.removeChild(toastElement);
      }
    }, 300); // Wait for animation
  }
};

// === Modal System ===
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

// Setup generic modal close handlers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });
  
  document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });
});

// === Global Notification System ===
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize on dashboard-like pages
  const isDashboard = document.querySelector('.user-dropdown') || document.querySelector('.admin-sidebar');
  if (!isDashboard) return;

  // 1. Inject Notification Button into Navbar
  const navbarLeft = document.querySelector('.navbar .container > div:first-child');
  if (navbarLeft && !document.getElementById('notificationBtn')) {
    const btnHtml = `
      <button id="notificationBtn" class="notification-btn" aria-label="Notifications" style="width: 36px; height: 36px; background: transparent; border: none; margin-left: 8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
      </button>
    `;
    navbarLeft.insertAdjacentHTML('beforeend', btnHtml);
  }

  // 2. Inject Notification Panel into Body
  if (!document.getElementById('notificationPanel')) {
    const panelHtml = `
      <div class="notification-panel" id="notificationPanel">
        <div class="notification-header" style="flex-direction: column; align-items: stretch; gap: var(--space-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: var(--text-lg);">Announcements</h3>
            <button class="viewer-btn" id="closeNotificationBtn" aria-label="Close Notifications">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <form id="newAnnouncementForm" style="display: none; gap: 8px; margin-top: 8px;">
            <input type="text" id="newAnnouncementInput" class="form-input" placeholder="Type a new announcement..." style="flex: 1; border-radius: 20px; padding: 8px 12px; font-size: 14px;" required>
            <button type="submit" class="btn btn-primary" style="border-radius: 20px; padding: 0 16px; font-size: 14px;">Post</button>
          </form>
        </div>
        <div class="notification-body" id="notificationList">
          <div class="empty-state" style="padding: var(--space-xl) var(--space-md);">
            <p>No messages available.</p>
          </div>
        </div>
        <div class="notification-footer" id="notificationFooter" style="display: none; padding: var(--space-md); border-top: 1px solid var(--border); background: var(--bg);">
          <form id="replyForm" style="display: flex; gap: 8px;">
            <input type="text" id="replyInput" class="form-input" placeholder="Type a reply..." style="flex: 1;" required>
            <button type="submit" class="btn btn-primary" style="padding: 0 16px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHtml);
  }

  // 3. Notification Logic
  const notificationBtn = document.getElementById('notificationBtn');
  const notificationBadge = document.getElementById('notificationBadge');
  const notificationPanel = document.getElementById('notificationPanel');
  const closeNotificationBtn = document.getElementById('closeNotificationBtn');
  const notificationList = document.getElementById('notificationList');
  const notificationFooter = document.getElementById('notificationFooter');
  const replyForm = document.getElementById('replyForm');
  const replyInput = document.getElementById('replyInput');
  let currentAnnouncementId = null;

  if (notificationBtn && notificationPanel) {
    notificationBtn.addEventListener('click', async () => {
      notificationPanel.classList.add('active');
      loadNotifications();
      
      // Check if admin to show new announcement form
      const newForm = document.getElementById('newAnnouncementForm');
      if (newForm && window.supaAuth) {
        const user = await window.supaAuth.getCurrentUser();
        if (user && user.email === 'atoopase@gmail.com') {
          newForm.style.display = 'flex';
        }
      }
    });

    closeNotificationBtn.addEventListener('click', () => {
      notificationPanel.classList.remove('active');
    });
  }

  // Handle New Announcement
  const newAnnouncementForm = document.getElementById('newAnnouncementForm');
  if (newAnnouncementForm) {
    newAnnouncementForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('newAnnouncementInput');
      if (!input.value.trim()) return;
      
      const client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
      if (!client) { window.showToast('No database connection', 'error'); return; }

      const user = await window.supaAuth.getCurrentUser();
      if (!user) { window.showToast('Please login first', 'error'); return; }
      if (user.email !== 'atoopase@gmail.com') { window.showToast('Only admin can post announcements', 'error'); return; }

      const submitBtn = newAnnouncementForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        const { error } = await client
          .from('messages')
          .insert({
            sender_id: user.id,
            content: input.value.trim()
            // parent_id intentionally omitted (defaults to null in DB)
          });

        if (error) throw error;
        
        input.value = '';
        window.showToast('Announcement posted!', 'success');
        loadNotifications();
        
      } catch (err) {
        console.error('Post error:', err);
        window.showToast(`Failed to post: ${err.message || 'Unknown error'}`, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function loadNotifications() {
    const client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
    if (!client) {
      notificationList.innerHTML = `<div class="empty-state" style="padding: var(--space-xl) var(--space-md); color: var(--danger);"><p>Not connected to database.</p></div>`;
      return;
    }
    notificationList.innerHTML = `<div class="empty-state" style="padding: var(--space-xl) var(--space-md);"><span class="spinner spinner-sm"></span><p>Loading messages...</p></div>`;
    notificationFooter.style.display = 'none';

    try {
      // Query messages table directly (no view needed)
      const { data: announcements, error } = await client
        .from('messages')
        .select('*')
        .is('parent_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch all profiles to map sender names
      const { data: allProfiles } = await client
        .from('profiles')
        .select('id, full_name');
      const profileMap = {};
      if (allProfiles) {
        allProfiles.forEach(p => { profileMap[p.id] = p.full_name; });
      }

      // Attach sender_name from profile map
      if (announcements) {
        announcements.forEach(a => {
          a.sender_name = profileMap[a.sender_id] || null;
        });
      }

      // Fetch reactions - non-fatal if table doesn't exist yet
      const reactionsResult = await client.from('message_reactions').select('*').then(r => r).catch(() => ({ data: null }));
      const allReactions = reactionsResult.data || null;
      const currentUser = window.supaAuth ? await window.supaAuth.getCurrentUser() : null;
      const currentUserId = currentUser ? currentUser.id : null;
      const isAdmin = currentUser && currentUser.email === 'atoopase@gmail.com';

      function getReactionsHtml(msgId) {
        if (!allReactions) return '';
        const likesCount = allReactions.filter(r => r.message_id === msgId && r.is_like).length;
        const dislikesCount = allReactions.filter(r => r.message_id === msgId && !r.is_like).length;
        let userReaction = null;
        if (currentUserId) {
          const uReaction = allReactions.find(r => r.message_id === msgId && r.user_id === currentUserId);
          if (uReaction) userReaction = uReaction.is_like ? 'like' : 'dislike';
        }
        
        return `
          <div class="msg-reactions">
            <button class="reaction-btn ${userReaction === 'like' ? 'active like' : ''}" onclick="window.handleReaction('${msgId}', true)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
              <span>${likesCount}</span>
            </button>
            <button class="reaction-btn ${userReaction === 'dislike' ? 'active dislike' : ''}" onclick="window.handleReaction('${msgId}', false)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"></path></svg>
              <span>${dislikesCount}</span>
            </button>
          </div>
        `;
      }

      function getActionsHtml(msgId, msgSenderId) {
        const isOwner = currentUserId && msgSenderId === currentUserId;
        if (!isOwner && !isAdmin) return '';
        return `
          <div class="msg-actions">
            ${isOwner ? `<button class="msg-action-btn edit" onclick="window.handleEditMessage('${msgId}')" title="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>` : ''}
            ${isOwner || isAdmin ? `<button class="msg-action-btn delete" onclick="window.handleDeleteMessage('${msgId}')" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>` : ''}
          </div>
        `;
      }

      if (!announcements || announcements.length === 0) {
        notificationList.innerHTML = `
          <div class="empty-state" style="padding: var(--space-xl) var(--space-md);">
            <p>No messages available.</p>
          </div>
        `;
        if (notificationBadge) notificationBadge.style.display = 'none';
        return;
      }

      if (notificationBadge) {
        notificationBadge.textContent = announcements.length;
        notificationBadge.style.display = 'flex';
      }

      let html = '';
      for (const ann of announcements) {
        // Query replies directly from messages table
        const { data: replies } = await client
          .from('messages')
          .select('*')
          .eq('parent_id', ann.id)
          .order('created_at', { ascending: true });

        const timeStr = new Date(ann.created_at).toLocaleString();
        const senderName = ann.sender_name || 'Admin';
        const avatar = senderName.charAt(0);
        
        let repliesHtml = '';
        if (replies && replies.length > 0) {
          repliesHtml = replies.map(r => {
            const rName = profileMap[r.sender_id] || 'User';
            const rTime = new Date(r.created_at).toLocaleString();
            const rAvatar = rName.charAt(0);
            return `
              <div class="msg-item msg-reply" data-msg-id="${r.id}">
                <div class="msg-avatar">${rAvatar}</div>
                <div class="msg-content">
                  <div class="msg-header">
                    <span class="msg-name">${rName}</span>
                    <span class="msg-time">${rTime}</span>
                    ${getActionsHtml(r.id, r.sender_id)}
                  </div>
                  <div class="msg-text" id="msg-text-${r.id}">${r.content}</div>
                  ${getReactionsHtml(r.id)}
                </div>
              </div>
            `;
          }).join('');
        }

        html += `
          <div class="msg-thread" data-msg-id="${ann.id}">
            <div class="msg-item">
              <div class="msg-avatar">${avatar}</div>
              <div class="msg-content">
                <div class="msg-header">
                  <span class="msg-name">${senderName}</span>
                  <span class="msg-time">${timeStr}</span>
                  ${getActionsHtml(ann.id, ann.sender_id)}
                </div>
                <div class="msg-text" id="msg-text-${ann.id}">${ann.content}</div>
                ${getReactionsHtml(ann.id)}
              </div>
            </div>
            ${repliesHtml}
            <button class="btn btn-ghost btn-sm" onclick="window.openReply('${ann.id}')" style="align-self: flex-start; margin-left: 50px;">Reply</button>
          </div>
        `;
      }

      notificationList.innerHTML = html;

    } catch (err) {
      console.error('Error loading notifications:', err);
      notificationList.innerHTML = `
        <div class="empty-state" style="padding: var(--space-xl) var(--space-md); color: var(--danger);">
          <p>Failed to load messages: ${err.message || err.toString()}</p>
        </div>
      `;
    }
  }

  window.openReply = (id) => {
    currentAnnouncementId = id;
    notificationFooter.style.display = 'block';
    replyInput.focus();
  };

  window.handleDeleteMessage = async (msgId) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    const client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
    if (!client) return;
    const { error } = await client.from('messages').delete().eq('id', msgId);
    if (error) {
      console.error('Delete error:', error);
      window.showToast('Failed to delete message', 'error');
    } else {
      window.showToast('Message deleted', 'success');
      loadNotifications();
    }
  };

  window.handleEditMessage = async (msgId) => {
    const textEl = document.getElementById(`msg-text-${msgId}`);
    if (!textEl) return;
    const currentText = textEl.textContent.trim();
    const newText = prompt('Edit your message:', currentText);
    if (!newText || newText.trim() === currentText) return;
    const client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
    if (!client) return;
    const { error } = await client.from('messages').update({ content: newText.trim() }).eq('id', msgId);
    if (error) {
      console.error('Edit error:', error);
      window.showToast('Failed to edit message', 'error');
    } else {
      window.showToast('Message updated', 'success');
      loadNotifications();
    }
  };

  window.handleReaction = async (msgId, isLike) => {
    const client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
    if (!client) return;

    const user = await window.supaAuth.getCurrentUser();
    if (!user) {
      window.showToast('Please login to react', 'error');
      return;
    }

    try {
      const { data: existing, error: selectError } = await client
        .from('message_reactions')
        .select('*')
        .eq('message_id', msgId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing reaction:', selectError);
        return;
      }

      if (existing) {
        if (existing.is_like === isLike) {
          // Toggle off
          const { error: delError } = await client.from('message_reactions').delete().eq('id', existing.id);
          if (delError) throw delError;
        } else {
          // Switch reaction
          const { error: updError } = await client.from('message_reactions').update({ is_like: isLike }).eq('id', existing.id);
          if (updError) throw updError;
        }
      } else {
        // Insert new
        const { error: insError } = await client.from('message_reactions').insert({
          message_id: msgId,
          user_id: user.id,
          is_like: isLike
        });
        if (insError) throw insError;
      }
      loadNotifications(); // Reload to show updated reactions
    } catch (err) {
      console.error('Reaction error:', err);
      window.showToast('Failed to save reaction', 'error');
    }
  };

  if (replyForm) {
    replyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentAnnouncementId || !replyInput.value.trim()) return;
      const client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
      if (!client) return;

      const user = await window.supaAuth.getCurrentUser();
      if (!user) {
        window.showToast('Please login to reply', 'error');
        return;
      }

      const submitBtn = replyForm.querySelector('button');
      submitBtn.disabled = true;

      try {
        const { error } = await client
          .from('messages')
          .insert({
            sender_id: user.id,
            content: replyInput.value.trim(),
            parent_id: currentAnnouncementId
          });

        if (error) throw error;
        
        replyInput.value = '';
        notificationFooter.style.display = 'none';
        currentAnnouncementId = null;
        loadNotifications();
        
      } catch (err) {
        console.error('Reply error:', err);
        window.showToast('Failed to post reply', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // Initial badge load
  const _client = window.getSupabaseClient ? window.getSupabaseClient() : supabaseClient;
  if (_client) {
    _client.from('messages').select('id', { count: 'exact', head: true }).is('parent_id', null).then(({ count }) => {
      if (count > 0 && document.getElementById('notificationBadge')) {
        document.getElementById('notificationBadge').textContent = count;
        document.getElementById('notificationBadge').style.display = 'flex';
      }
    });
  }
});
