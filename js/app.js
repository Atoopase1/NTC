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
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('active');
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
      sidebar.classList.add('open');
      sidebarOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
    
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
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
