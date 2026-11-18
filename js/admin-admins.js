/**
 * Admin Admins Script - Manage PrepTrack Admins
 * Only accessible by atoopase@gmail.com (Super Admin)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const SUPER_ADMIN_EMAIL = 'atoopase@gmail.com';

  // Fast client-side check
  const localEmail = localStorage.getItem('preptrack_admin_email') || localStorage.getItem('ntc_admin_email');
  const localIsAdmin = localStorage.getItem('preptrack_is_admin') || localStorage.getItem('ntc_is_admin');
  if (localIsAdmin !== 'true' || localEmail !== SUPER_ADMIN_EMAIL) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Server-side identity & authorization verification
  (async () => {
    try {
      const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
      if (!client) return;
      const { data: { user }, error: userErr } = await client.auth.getUser();
      if (userErr || !user || user.email !== SUPER_ADMIN_EMAIL) {
        localStorage.removeItem('preptrack_is_admin');
        localStorage.removeItem('ntc_is_admin'); localStorage.removeItem('preptrack_is_admin');
        window.location.href = 'dashboard.html';
      }
    } catch (e) {
      console.warn('Super admin server verification check:', e);
    }
  })();

  // UI Elements
  const tbody = document.getElementById('adminsTableBody');
  const tableEmpty = document.getElementById('tableEmpty');
  const tableLoading = document.getElementById('tableLoading');
  const statTotalAdmins = document.getElementById('statTotalAdmins');
  const searchInput = document.getElementById('adminSearch');

  // Promote Elements
  const promoteSearchInput = document.getElementById('promoteSearchInput');
  const promoteSearchBtn = document.getElementById('promoteSearchBtn');
  const foundUserBox = document.getElementById('foundUserBox');
  const foundUserName = document.getElementById('foundUserName');
  const foundUserEmail = document.getElementById('foundUserEmail');
  const foundUserRoleBadge = document.getElementById('foundUserRoleBadge');
  const foundUserAvatar = document.getElementById('foundUserAvatar');
  const promoteCancelBtn = document.getElementById('promoteCancelBtn');
  const promoteSubmitBtn = document.getElementById('promoteSubmitBtn');

  // Modals
  const permissionsModal = document.getElementById('permissionsModal');
  const closePermissionsModal = document.getElementById('closePermissionsModal');
  const cancelPermissionsModalBtn = document.getElementById('cancelPermissionsModalBtn');
  const savePermissionsBtn = document.getElementById('savePermissionsBtn');
  const revokeAdminBtn = document.getElementById('revokeAdminBtn');
  const blockAdminBtn = document.getElementById('blockAdminBtn');
  const unblockAdminBtn = document.getElementById('unblockAdminBtn');

  let allAdmins = [];
  let currentTargetId = null;
  let searchedUser = null;

  // Wait for Supabase to be ready
  const checkInterval = setInterval(() => {
    if (window.supaDB && window.getSupabaseClient && window.getSupabaseClient()) {
      clearInterval(checkInterval);
      loadAdmins();
    }
  }, 100);

  // ─── Fetch Admins ─────────────────────────────────────────────────────────────
  async function loadAdmins() {
    if (tbody) tbody.style.display = 'none';
    if (tableLoading) tableLoading.style.display = 'block';
    if (tableEmpty) tableEmpty.style.display = 'none';

    try {
      const client = window.getSupabaseClient();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .order('full_name');

      if (error) throw error;
      allAdmins = data || [];
      if (statTotalAdmins) statTotalAdmins.textContent = allAdmins.length;
      renderTable(allAdmins);
    } catch (error) {
      console.error('Error loading admins:', error);
      if (window.showToast) window.showToast('Failed to load admins', 'error');
    } finally {
      if (tableLoading) tableLoading.style.display = 'none';
    }
  }

  // ─── Render Table ─────────────────────────────────────────────────────────────
  function renderTable(adminsList) {
    if (!tbody) return;

    if (!adminsList || adminsList.length === 0) {
      tbody.style.display = 'none';
      if (tableEmpty) tableEmpty.style.display = 'flex';
      return;
    }

    tbody.style.display = '';
    if (tableEmpty) tableEmpty.style.display = 'none';

    const html = adminsList.map(admin => {
      const isSuperAdmin = admin.email === SUPER_ADMIN_EMAIL;
      const isBlocked = admin.blocked_until && new Date(admin.blocked_until) > new Date();
      const perms = admin.admin_permissions || [];
      
      let permsText = 'None (No Access)';
      if (isSuperAdmin) {
        permsText = 'Super Admin (Unrestricted)';
      } else if (perms.length > 0) {
        permsText = perms.map(p => p.replace(/^manage_/, '')).join(', ');
      }

      let statusHtml = `<span class="status-badge status-active" style="background:rgba(16,185,129,0.15);color:#10b981;padding:4px 8px;border-radius:99px;font-size:12px;font-weight:600;">Active</span>`;
      if (isBlocked) {
        statusHtml = `<span class="status-badge" style="background:rgba(239,68,68,0.15);color:#ef4444;padding:4px 8px;border-radius:99px;font-size:12px;font-weight:600;">Blocked</span>`;
      } else if (isSuperAdmin) {
        statusHtml = `<span class="status-badge" style="background:rgba(0,59,247,0.15);color:var(--primary);padding:4px 8px;border-radius:99px;font-size:12px;font-weight:700;">Super Admin</span>`;
      }

      const avatarInitial = admin.full_name ? admin.full_name.charAt(0).toUpperCase() : '?';

      return `
        <tr data-name="${(admin.full_name || '').toLowerCase()}" data-email="${(admin.email || '').toLowerCase()}">
          <td>
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="user-avatar" style="width:36px;height:36px;border-radius:50%;background:rgba(0,59,247,0.1);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;">${avatarInitial}</div>
              <div>
                <div style="font-weight:600;color:var(--text);">${admin.full_name || 'No Name'}</div>
                ${admin.index_number ? `<div style="font-size:11px;color:var(--text-light);">${admin.index_number}</div>` : ''}
              </div>
            </div>
          </td>
          <td>${admin.email || '-'}</td>
          <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${permsText}">${permsText}</td>
          <td>${statusHtml}</td>
          <td>
            ${isSuperAdmin ? `<span style="font-size:12px;color:var(--text-light);font-style:italic;">Protected</span>` : `
              <button class="btn btn-outline" style="padding:4px 10px; font-size:12px;" onclick="window.openPermissionsModal('${admin.id}')">Manage Access</button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
  }

  // ─── Filter Admins ────────────────────────────────────────────────────────────
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#adminsTableBody tr').forEach(row => {
        const name = row.getAttribute('data-name') || '';
        const email = row.getAttribute('data-email') || '';
        row.style.display = (!q || name.includes(q) || email.includes(q)) ? '' : 'none';
      });
    });
  }

  // ─── Search User to Promote ──────────────────────────────────────────────────
  if (promoteSearchBtn && promoteSearchInput) {
    const handleSearch = async () => {
      const q = promoteSearchInput.value.trim();
      if (!q) {
        if (window.showToast) window.showToast('Please enter an email, name, or index number.', 'error');
        return;
      }

      promoteSearchBtn.disabled = true;
      promoteSearchBtn.textContent = 'Searching...';

      try {
        const client = window.getSupabaseClient();
        const { data, error } = await client
          .from('profiles')
          .select('*')
          .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,index_number.ilike.%${q}%`)
          .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
          if (window.showToast) window.showToast('No user found matching "' + q + '".', 'error');
          if (foundUserBox) foundUserBox.style.display = 'none';
          searchedUser = null;
          return;
        }

        searchedUser = data[0];
        if (foundUserBox) {
          foundUserBox.style.display = 'block';
          if (foundUserName) foundUserName.textContent = searchedUser.full_name || 'No Name';
          if (foundUserEmail) foundUserEmail.textContent = searchedUser.email || '';
          if (foundUserAvatar) foundUserAvatar.textContent = (searchedUser.full_name || '?').charAt(0).toUpperCase();
          if (foundUserRoleBadge) {
            foundUserRoleBadge.textContent = 'Role: ' + (searchedUser.role || 'student');
            foundUserRoleBadge.style.background = searchedUser.role === 'admin' ? 'rgba(0,59,247,0.1)' : 'var(--surface-hover)';
            foundUserRoleBadge.style.color = searchedUser.role === 'admin' ? 'var(--primary)' : 'var(--text)';
          }
        }
      } catch (err) {
        console.error('Search error:', err);
        if (window.showToast) window.showToast('Error searching: ' + err.message, 'error');
      } finally {
        promoteSearchBtn.disabled = false;
        promoteSearchBtn.textContent = 'Search User';
      }
    };

    promoteSearchBtn.addEventListener('click', handleSearch);
    promoteSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSearch();
    });
  }

  if (promoteCancelBtn) {
    promoteCancelBtn.addEventListener('click', () => {
      if (foundUserBox) foundUserBox.style.display = 'none';
      if (promoteSearchInput) promoteSearchInput.value = '';
      searchedUser = null;
    });
  }

  // ─── Submit Promotion ────────────────────────────────────────────────────────
  if (promoteSubmitBtn) {
    promoteSubmitBtn.addEventListener('click', async () => {
      if (!searchedUser) return;
      if (searchedUser.email === SUPER_ADMIN_EMAIL) {
        if (window.showToast) window.showToast('This account is already the Super Admin.', 'error');
        return;
      }

      const perms = [];
      if (document.getElementById('promotePermStudents')?.checked) perms.push('manage_students');
      if (document.getElementById('promotePermCourses')?.checked) perms.push('manage_courses');
      if (document.getElementById('promotePermMaterials')?.checked) perms.push('manage_lessons');
      if (document.getElementById('promotePermExams')?.checked) perms.push('manage_exams');
      if (document.getElementById('promotePermAttendance')?.checked) perms.push('manage_attendance');
      if (document.getElementById('promotePermResults')?.checked) perms.push('view_results');
      if (document.getElementById('promotePermAdmins')?.checked) perms.push('manage_admins');

      promoteSubmitBtn.disabled = true;
      promoteSubmitBtn.textContent = 'Promoting...';

      try {
        const client = window.getSupabaseClient();
        const { error } = await client
          .from('profiles')
          .update({
            role: 'admin',
            admin_permissions: perms,
            updated_at: new Date().toISOString()
          })
          .eq('id', searchedUser.id);

        if (error) throw error;

        if (window.showToast) window.showToast(`User ${searchedUser.full_name || searchedUser.email} promoted to Admin!`, 'success');
        if (foundUserBox) foundUserBox.style.display = 'none';
        if (promoteSearchInput) promoteSearchInput.value = '';
        searchedUser = null;
        await loadAdmins();
      } catch (err) {
        console.error('Promotion error:', err);
        if (window.showToast) window.showToast('Failed to promote user: ' + err.message, 'error');
      } finally {
        promoteSubmitBtn.disabled = false;
        promoteSubmitBtn.textContent = 'Promote to Admin';
      }
    });
  }

  // ─── Manage Permissions Modal ──────────────────────────────────────────────────
  window.openPermissionsModal = (adminId) => {
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    if (admin.email === SUPER_ADMIN_EMAIL) {
      if (window.showToast) window.showToast('Super Admin access cannot be modified or revoked.', 'error');
      return;
    }

    currentTargetId = adminId;
    const nameEl = document.getElementById('modalAdminName');
    const emailEl = document.getElementById('modalAdminEmail');
    if (nameEl) nameEl.textContent = admin.full_name || 'No Name';
    if (emailEl) emailEl.textContent = admin.email || '';

    // Checkboxes
    const perms = admin.admin_permissions || [];
    const setCheck = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = perms.includes(val);
    };
    setCheck('permManageUsers', 'manage_students');
    setCheck('permManageCourses', 'manage_courses');
    setCheck('permManageLessons', 'manage_lessons');
    setCheck('permManageExams', 'manage_exams');
    setCheck('permManageAttendance', 'manage_attendance');
    setCheck('permViewResults', 'view_results');
    setCheck('permManageAdmins', 'manage_admins');

    // Block status
    const isBlocked = admin.blocked_until && new Date(admin.blocked_until) > new Date();
    if (blockAdminBtn && unblockAdminBtn) {
      if (isBlocked) {
        blockAdminBtn.style.display = 'none';
        unblockAdminBtn.style.display = 'block';
      } else {
        blockAdminBtn.style.display = 'block';
        unblockAdminBtn.style.display = 'none';
      }
    }

    if (permissionsModal) permissionsModal.classList.add('active');
  };

  const closeModal = () => {
    if (permissionsModal) permissionsModal.classList.remove('active');
    currentTargetId = null;
  };

  if (closePermissionsModal) closePermissionsModal.addEventListener('click', closeModal);
  if (cancelPermissionsModalBtn) cancelPermissionsModalBtn.addEventListener('click', closeModal);

  // Save Permissions
  if (savePermissionsBtn) {
    savePermissionsBtn.addEventListener('click', async () => {
      if (!currentTargetId) return;

      const newPerms = [];
      if (document.getElementById('permManageUsers')?.checked) newPerms.push('manage_students');
      if (document.getElementById('permManageCourses')?.checked) newPerms.push('manage_courses');
      if (document.getElementById('permManageLessons')?.checked) newPerms.push('manage_lessons');
      if (document.getElementById('permManageExams')?.checked) newPerms.push('manage_exams');
      if (document.getElementById('permManageAttendance')?.checked) newPerms.push('manage_attendance');
      if (document.getElementById('permViewResults')?.checked) newPerms.push('view_results');
      if (document.getElementById('permManageAdmins')?.checked) newPerms.push('manage_admins');

      savePermissionsBtn.disabled = true;
      savePermissionsBtn.textContent = 'Saving...';

      try {
        const client = window.getSupabaseClient();
        const { error } = await client
          .from('profiles')
          .update({ admin_permissions: newPerms, updated_at: new Date().toISOString() })
          .eq('id', currentTargetId);

        if (error) throw error;

        if (window.showToast) window.showToast('Permissions saved successfully.', 'success');
        closeModal();
        loadAdmins();
      } catch (err) {
        console.error('Save permissions error:', err);
        if (window.showToast) window.showToast('Failed to save permissions: ' + err.message, 'error');
      } finally {
        savePermissionsBtn.disabled = false;
        savePermissionsBtn.textContent = 'Save Permissions';
      }
    });
  }

  // Revoke Admin Rights
  if (revokeAdminBtn) {
    revokeAdminBtn.addEventListener('click', async () => {
      if (!currentTargetId) return;
      const targetAdmin = allAdmins.find(a => a.id === currentTargetId);
      if (targetAdmin && targetAdmin.email === SUPER_ADMIN_EMAIL) {
        if (window.showToast) window.showToast('The Super Admin cannot be demoted.', 'error');
        return;
      }

      if (!confirm('Are you sure you want to demote this user to a student? They will lose all admin access.')) return;

      try {
        const client = window.getSupabaseClient();
        const { error } = await client
          .from('profiles')
          .update({ role: 'student', admin_permissions: [], updated_at: new Date().toISOString() })
          .eq('id', currentTargetId);

        if (error) throw error;

        if (window.showToast) window.showToast('Admin rights revoked.', 'success');
        closeModal();
        loadAdmins();
      } catch (err) {
        console.error('Revoke admin error:', err);
        if (window.showToast) window.showToast('Failed to revoke admin: ' + err.message, 'error');
      }
    });
  }

  // Block Admin
  if (blockAdminBtn) {
    blockAdminBtn.addEventListener('click', async () => {
      if (!currentTargetId) return;
      const targetAdmin = allAdmins.find(a => a.id === currentTargetId);
      if (targetAdmin && targetAdmin.email === SUPER_ADMIN_EMAIL) {
        if (window.showToast) window.showToast('The Super Admin cannot be blocked.', 'error');
        return;
      }

      if (!confirm('Are you sure you want to block this admin? They will be locked out of the platform.')) return;

      const blockedUntil = new Date();
      blockedUntil.setFullYear(blockedUntil.getFullYear() + 100);

      try {
        const client = window.getSupabaseClient();
        const { error } = await client
          .from('profiles')
          .update({ blocked_until: blockedUntil.toISOString(), updated_at: new Date().toISOString() })
          .eq('id', currentTargetId);

        if (error) throw error;

        if (window.showToast) window.showToast('Admin account blocked.', 'success');
        closeModal();
        loadAdmins();
      } catch (err) {
        console.error('Block admin error:', err);
        if (window.showToast) window.showToast('Failed to block admin: ' + err.message, 'error');
      }
    });
  }

  // Unblock Admin
  if (unblockAdminBtn) {
    unblockAdminBtn.addEventListener('click', async () => {
      if (!currentTargetId) return;

      try {
        const client = window.getSupabaseClient();
        const { error } = await client
          .from('profiles')
          .update({ blocked_until: null, updated_at: new Date().toISOString() })
          .eq('id', currentTargetId);

        if (error) throw error;

        if (window.showToast) window.showToast('Admin account unblocked.', 'success');
        closeModal();
        loadAdmins();
      } catch (err) {
        console.error('Unblock admin error:', err);
        if (window.showToast) window.showToast('Failed to unblock admin: ' + err.message, 'error');
      }
    });
  }
});
