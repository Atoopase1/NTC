/**
 * Admin Admins Script - Manage NTC Prep Admins
 * Only accessible by atoopase@gmail.com
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce super admin constraint
  if (localStorage.getItem('ntc_admin_email') !== 'atoopase@gmail.com') {
    window.location.href = 'dashboard.html';
    return;
  }

  // UI Elements
  const tbody = document.getElementById('adminsTableBody');
  const tableEmpty = document.getElementById('tableEmpty');
  const tableLoading = document.getElementById('tableLoading');
  const statTotalAdmins = document.getElementById('statTotalAdmins');
  const searchInput = document.getElementById('adminSearch');
  const searchNewAdminBtn = document.getElementById('searchNewAdminBtn');

  // Modals
  const permissionsModal = document.getElementById('permissionsModal');
  const closePermissionsModal = document.getElementById('closePermissionsModal');
  const savePermissionsBtn = document.getElementById('savePermissionsBtn');
  const revokeAdminBtn = document.getElementById('revokeAdminBtn');
  const blockAdminBtn = document.getElementById('blockAdminBtn');
  const unblockAdminBtn = document.getElementById('unblockAdminBtn');

  let allAdmins = [];
  let currentTargetId = null;

  // Wait for Supabase to be ready
  const checkInterval = setInterval(() => {
    if (window.supaDB) {
      clearInterval(checkInterval);
      loadAdmins();
    }
  }, 100);

  // ─── Fetch Admins ─────────────────────────────────────────────────────────────
  async function loadAdmins() {
    tbody.style.display = 'none';
    tableLoading.style.display = 'block';
    tableEmpty.style.display = 'none';

    try {
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .order('full_name');

      if (error) throw error;
      allAdmins = data || [];
      statTotalAdmins.textContent = allAdmins.length;
      renderTable(allAdmins);
    } catch (error) {
      console.error('Error loading admins:', error);
      window.showToast('Failed to load admins', 'error');
    } finally {
      tableLoading.style.display = 'none';
    }
  }

  // ─── Render Table ─────────────────────────────────────────────────────────────
  function renderTable(adminsList) {
    if (!adminsList || adminsList.length === 0) {
      tbody.style.display = 'none';
      tableEmpty.style.display = 'flex';
      return;
    }

    tbody.style.display = '';
    tableEmpty.style.display = 'none';

    const html = adminsList.map(admin => {
      const isBlocked = admin.blocked_until && new Date(admin.blocked_until) > new Date();
      const perms = admin.admin_permissions || [];
      const permsText = perms.length > 0 ? perms.join(', ').replace(/manage_/g, '') : 'None (No Access)';
      
      let statusHtml = `<span class="status-badge status-active">Active</span>`;
      if (isBlocked) {
        statusHtml = `<span class="status-badge" style="background:rgba(239,68,68,0.1);color:var(--danger);">Blocked</span>`;
      }

      const avatarInitial = admin.full_name ? admin.full_name.charAt(0).toUpperCase() : '?';

      return `
        <tr data-name="${(admin.full_name||'').toLowerCase()}" data-email="${(admin.email||'').toLowerCase()}">
          <td>
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="user-avatar" style="width:36px;height:36px;border-radius:50%;background:var(--surface-light);display:flex;align-items:center;justify-content:center;font-weight:700;">${avatarInitial}</div>
              <div>
                <div style="font-weight:600;color:var(--text);">${admin.full_name || 'No Name'}</div>
              </div>
            </div>
          </td>
          <td>${admin.email || '-'}</td>
          <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${permsText}">${permsText}</td>
          <td>${statusHtml}</td>
          <td>
            <button class="btn btn-outline" style="padding:4px 10px; font-size:12px;" onclick="window.openPermissionsModal('${admin.id}')">Manage Access</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
  }

  // ─── Search Existing Admins ────────────────────────────────────────────────────
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#adminsTableBody tr').forEach(row => {
      const name = row.getAttribute('data-name');
      const email = row.getAttribute('data-email');
      row.style.display = (!q || name.includes(q) || email.includes(q)) ? '' : 'none';
    });
  });

  // ─── Promote New Admin ────────────────────────────────────────────────────────
  searchNewAdminBtn.addEventListener('click', async () => {
    const q = searchInput.value.trim();
    if (!q) {
      window.showToast('Please enter an email or name in the search box to find a student.', 'error');
      return;
    }

    const { data, error } = await window.supabaseClient
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(1);

    if (error) {
      window.showToast('Search failed: ' + error.message, 'error');
      return;
    }

    if (!data || data.length === 0) {
      window.showToast('No matching student found.', 'error');
      return;
    }

    const student = data[0];
    if (confirm(`Promote "${student.full_name} (${student.email})" to Admin?`)) {
      const { error: updateErr } = await window.supabaseClient
        .from('profiles')
        .update({ role: 'admin', admin_permissions: [] })
        .eq('id', student.id);
        
      if (updateErr) {
        window.showToast('Failed to promote user: ' + updateErr.message, 'error');
      } else {
        window.showToast('User promoted to Admin! Configure their access now.', 'success');
        searchInput.value = '';
        await loadAdmins();
        window.openPermissionsModal(student.id);
      }
    }
  });

  // ─── Manage Permissions Modal ──────────────────────────────────────────────────
  window.openPermissionsModal = (adminId) => {
    const admin = allAdmins.find(a => a.id === adminId);
    if (!admin) return;

    currentTargetId = adminId;
    document.getElementById('modalAdminName').textContent = admin.full_name || 'No Name';
    document.getElementById('modalAdminEmail').textContent = admin.email || '';

    // Checkboxes
    const perms = admin.admin_permissions || [];
    document.getElementById('permManageUsers').checked = perms.includes('manage_users');
    document.getElementById('permManageLessons').checked = perms.includes('manage_lessons');
    document.getElementById('permManageExams').checked = perms.includes('manage_exams');

    // Block status
    const isBlocked = admin.blocked_until && new Date(admin.blocked_until) > new Date();
    if (isBlocked) {
      blockAdminBtn.style.display = 'none';
      unblockAdminBtn.style.display = 'block';
    } else {
      blockAdminBtn.style.display = 'block';
      unblockAdminBtn.style.display = 'none';
    }

    permissionsModal.classList.add('active');
  };

  closePermissionsModal.addEventListener('click', () => {
    permissionsModal.classList.remove('active');
    currentTargetId = null;
  });

  // Save Permissions
  savePermissionsBtn.addEventListener('click', async () => {
    if (!currentTargetId) return;

    const newPerms = [];
    if (document.getElementById('permManageUsers').checked) newPerms.push('manage_users');
    if (document.getElementById('permManageLessons').checked) newPerms.push('manage_lessons');
    if (document.getElementById('permManageExams').checked) newPerms.push('manage_exams');

    const { error } = await window.supabaseClient
      .from('profiles')
      .update({ admin_permissions: newPerms })
      .eq('id', currentTargetId);

    if (error) {
      window.showToast('Failed to save permissions: ' + error.message, 'error');
    } else {
      window.showToast('Permissions saved successfully.', 'success');
      permissionsModal.classList.remove('active');
      loadAdmins();
    }
  });

  // Revoke Admin
  revokeAdminBtn.addEventListener('click', async () => {
    if (!currentTargetId) return;
    if (!confirm('Are you sure you want to demote this user to a student? They will lose all admin access.')) return;

    const { error } = await window.supabaseClient
      .from('profiles')
      .update({ role: 'student', admin_permissions: [] })
      .eq('id', currentTargetId);

    if (error) {
      window.showToast('Failed to revoke admin: ' + error.message, 'error');
    } else {
      window.showToast('Admin rights revoked.', 'success');
      permissionsModal.classList.remove('active');
      loadAdmins();
    }
  });

  // Block Admin
  blockAdminBtn.addEventListener('click', async () => {
    if (!currentTargetId) return;
    if (!confirm('Are you sure you want to block this admin? They will not be able to log in.')) return;

    // Block for 100 years basically
    const blockedUntil = new Date();
    blockedUntil.setFullYear(blockedUntil.getFullYear() + 100);

    const { error } = await window.supabaseClient
      .from('profiles')
      .update({ blocked_until: blockedUntil.toISOString() })
      .eq('id', currentTargetId);

    if (error) {
      window.showToast('Failed to block admin: ' + error.message, 'error');
    } else {
      window.showToast('Admin account blocked.', 'success');
      permissionsModal.classList.remove('active');
      loadAdmins();
    }
  });

  // Unblock Admin
  unblockAdminBtn.addEventListener('click', async () => {
    if (!currentTargetId) return;

    const { error } = await window.supabaseClient
      .from('profiles')
      .update({ blocked_until: null })
      .eq('id', currentTargetId);

    if (error) {
      window.showToast('Failed to unblock admin: ' + error.message, 'error');
    } else {
      window.showToast('Admin account unblocked.', 'success');
      permissionsModal.classList.remove('active');
      loadAdmins();
    }
  });

});
