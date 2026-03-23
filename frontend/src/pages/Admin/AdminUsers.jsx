import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { formatDate } from '../../utils/helpers';
import { useToast, useDialog } from '../../context/UIContext';

const ROLES = ['employee', 'coordinator', 'hr', 'accounts', 'admin'];
const ROLE_COLORS = {
  admin: '#ef4444', hr: '#8b5cf6', accounts: '#3b82f6',
  coordinator: '#f59e0b', employee: '#10b981'
};

const ROLE_PERMISSIONS = {
  employee:    ['Submit own expenses', 'View own expense status & history', 'Download own expense PDF', 'Upload receipts', 'Edit rejected expenses', 'Change password'],
  coordinator: ['All Employee permissions', 'View All Expenses tab (dept only)', 'Approve / Reject pending dept expenses', 'Export CSV of dept expenses'],
  hr:          ['All Coordinator permissions', 'View coordinator-approved expenses', 'Second-level approval', 'View & manage all employees'],
  accounts:    ['All HR permissions', 'Final approval (accounts_approved)', 'View all HR-approved expenses'],
  admin:       ['Full access to all sections', 'Manage employees, users, projects', 'Configure depts, designations, locations', 'Manage allowance rates & coordinator assignments', 'Bulk uploads for employees & projects', 'View all expenses (cannot approve/reject)'],
};

function RoleBadge({ role }) {
  return (
    <span style={{
      display:'inline-block', padding:'3px 10px', borderRadius:20,
      fontSize:11, fontWeight:700, textTransform:'capitalize',
      background: (ROLE_COLORS[role]||'#94a3b8')+'22', color: ROLE_COLORS[role]||'#94a3b8',
    }}>{role}</span>
  );
}

export default function AdminUsers() {
  const { success, error } = useToast();
  const { confirm }        = useDialog();

  const [users,        setUsers]        = useState([]);
  const [unlinked,     setUnlinked]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCreate,     setShowCreate]     = useState(false);
  const [editingUser,    setEditingUser]    = useState(null);
  const [showPerms,      setShowPerms]      = useState(false);
  const [showResetResult,setShowResetResult]= useState(false);
  const [resetResult,    setResetResult]    = useState(null);
  const [search,       setSearch]       = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [formError,    setFormError]    = useState('');
  const [saving,       setSaving]       = useState(false);

  // Create form — no password field, auto-generated on backend
  const [createForm,   setCreateForm]   = useState({ emp_id:'', role:'employee', send_email: true });
  const [createResult, setCreateResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, e] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/users/unlinked'),
      ]);
      setUsers(u.data); setUnlinked(e.data);
    } catch { error('Failed to load users.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Create user ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setCreateForm({ emp_id:'', role:'employee', send_email: true });
    setFormError(''); setCreateResult(null); setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createForm.emp_id) { setFormError('Please select an employee.'); return; }
    setFormError(''); setSaving(true);
    try {
      const { data } = await api.post('/admin/users', {
        emp_id:     createForm.emp_id,
        role:       createForm.role,
        send_email: createForm.send_email,
      });
      setCreateResult(data);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create user.');
    } finally { setSaving(false); }
  };

  // ── Edit role/status ──────────────────────────────────────────────────────
  const handleUpdateUser = async () => {
    setSaving(true); setFormError('');
    try {
      await api.put(`/admin/users/${editingUser.user_id}`, { role: editingUser.role, status: editingUser.status });
      success('User updated.'); setEditingUser(null); load();
    } catch (err) { setFormError(err.response?.data?.message || 'Update failed.'); }
    finally { setSaving(false); }
  };

  // ── Toggle active/inactive ────────────────────────────────────────────────
  const handleToggleStatus = async (u) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const ok = await confirm({
      title:        newStatus === 'inactive' ? 'Deactivate Account' : 'Activate Account',
      message:      `${newStatus === 'inactive' ? 'Deactivate' : 'Activate'} login for ${u.full_name}?`,
      details:      newStatus === 'inactive' ? 'They will not be able to log in until reactivated.' : undefined,
      confirmLabel: newStatus === 'inactive' ? 'Deactivate' : 'Activate',
      cancelLabel:  'Cancel',
      variant:      newStatus === 'inactive' ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      await api.patch(`/admin/users/${u.user_id}/status`, { status: newStatus });
      success(`${u.full_name} ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
      load();
    } catch { error('Status update failed.'); }
  };

  // ── Reset password ────────────────────────────────────────────────────────
  const handleResetPassword = async (u) => {
    const ok = await confirm({
      title:        'Reset Password',
      message:      `Reset password for ${u.full_name}?`,
      details:      'A new temporary password will be generated and emailed to the user. They must change it on next login.',
      confirmLabel: 'Reset Password',
      cancelLabel:  'Cancel',
      variant:      'warning',
    });
    if (!ok) return;
    try {
      const { data } = await api.post(`/admin/users/${u.user_id}/reset-password`);
      // Show result in a prominent way — same style as create-user
      setResetResult({ user: u, ...data });
      setShowResetResult(true);
      load();
    } catch (err) { error(err.response?.data?.message || 'Reset failed.'); }
  };

  // ── Remove user account ───────────────────────────────────────────────────
  const handleRemoveUser = async (u) => {
    const ok = await confirm({
      title:        'Remove Login Access',
      message:      `Remove login access for ${u.full_name}?`,
      details:      'The employee record is kept. You can grant access again later.',
      confirmLabel: 'Remove Access',
      cancelLabel:  'Cancel',
      variant:      'danger',
    });
    if (!ok) return;
    try { await api.delete(`/admin/users/${u.user_id}`); success('Login access removed.'); load(); }
    catch (err) { error(err.response?.data?.message || 'Failed.'); }
  };

  const filtered = users.filter(u => {
    const q  = search.toLowerCase();
    const ms = !q || u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const mr = !roleFilter || u.role === roleFilter;
    return ms && mr;
  });

  const selectedEmp = unlinked.find(e => e.emp_id === parseInt(createForm.emp_id));

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>🔐 User Accounts</h2>
          <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:4 }}>Control who can log in and what they can do.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => setShowPerms(true)}>📋 Role Permissions</button>
          <button className="btn btn-amber" onClick={openCreate}>➕ Create Account</button>
        </div>
      </div>

      {/* Role count bar */}
      <div className="stat-grid" style={{ marginBottom:16 }}>
        {ROLES.map(r => (
          <div key={r} style={{ background:'var(--white)', borderRadius:'var(--radius)', padding:'12px 16px', border:`2px solid ${ROLE_COLORS[r]}33`, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:ROLE_COLORS[r] }}/>
            <div>
              <div style={{ fontWeight:700, fontSize:18, color:'var(--navy)' }}>{users.filter(u=>u.role===r).length}</div>
              <div style={{ fontSize:11, color:'var(--gray-400)', textTransform:'capitalize' }}>{r}s</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding:12, marginBottom:12 }}>
        <div className="grid-2">
          <input className="form-control" placeholder="🔍 Search name, email…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0 }}>
        {loading ? <div className="loading-wrap"><div className="spinner"/></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.user_id}>
                    <td>
                      <div style={{ fontWeight:600 }}>{u.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{u.emp_code} · {u.designation_name||'—'}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{u.email}</div>
                    </td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:12 }}>{u.username}</td>
                    <td><RoleBadge role={u.role}/></td>
                    <td>
                      <span className={`badge ${u.status==='active'?'badge-accounts_approved':'badge-accounts_rejected'}`}>{u.status}</span>
                      {u.must_change_password ? <div style={{ fontSize:10, color:'var(--warning)', marginTop:2 }}>⚠️ Must change PW</div> : null}
                    </td>
                    <td style={{ fontSize:11, color:'var(--gray-400)' }}>{formatDate(u.created_at)}</td>
                    <td>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => { setFormError(''); setEditingUser({...u}); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggleStatus(u)} title={u.status==='active'?'Deactivate':'Activate'}>{u.status==='active'?'🔒':'🔓'}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(u)} title="Reset password">🔑</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleRemoveUser(u)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length===0 && <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--gray-300)' }}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CREATE USER MODAL ─────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <span className="modal-title">🔐 Create Login Access</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* SUCCESS STATE — show temp password */}
              {createResult ? (
                <div>
                  <div className="alert alert-success">✅ {createResult.message}</div>

                  <div style={{ background:'var(--navy)', borderRadius:'var(--radius)', padding:'20px 24px', marginTop:12 }}>
                    <div style={{ color:'rgba(255,255,255,.4)', fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
                      Temporary Password
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:800, color:'var(--amber)', letterSpacing:3 }}>
                      {createResult.tempPassword}
                    </div>
                    <div style={{ color:'rgba(255,255,255,.5)', fontSize:12, marginTop:10, lineHeight:1.6 }}>
                      {createResult.email_sent
                        ? '✉️ Invite email sent to the employee automatically.'
                        : createResult.email_error
                          ? `⚠️ Email failed (${createResult.email_error}). Share this password manually.`
                          : '📋 Email was not requested. Share this password manually.'}
                    </div>
                    <div style={{ color:'rgba(255,255,255,.4)', fontSize:11, marginTop:8 }}>
                      The employee must change this password on their first login.
                    </div>
                  </div>

                  <button className="btn btn-primary w-full" style={{ marginTop:16 }} onClick={() => setShowCreate(false)}>Done</button>
                </div>

              ) : (
                /* CREATION FORM */
                <>
                  {formError && <div className="alert alert-danger">⚠️ {formError}</div>}

                  {unlinked.length === 0 ? (
                    <div className="alert alert-info">✅ All employees already have login accounts.</div>
                  ) : (
                    <>
                      {/* Step 1: Select employee */}
                      <div className="form-group">
                        <label className="form-label">Select Employee <span className="required">*</span></label>
                        <select className="form-select" value={createForm.emp_id}
                          onChange={e => setCreateForm(p => ({ ...p, emp_id: e.target.value }))}>
                          <option value="">— Choose an employee to give access —</option>
                          {unlinked.map(e => (
                            <option key={e.emp_id} value={e.emp_id}>
                              {e.full_name} ({e.emp_code}){e.designation_name ? ` · ${e.designation_name}` : ''}
                            </option>
                          ))}
                        </select>

                        {/* Preview card */}
                        {selectedEmp && (
                          <div style={{ marginTop:8, padding:'10px 14px', background:'var(--gray-50)', borderRadius:'var(--radius)', border:'1px solid var(--gray-100)' }}>
                            <div style={{ fontWeight:600, color:'var(--navy)' }}>{selectedEmp.full_name}</div>
                            <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:2 }}>
                              {selectedEmp.emp_code} · {selectedEmp.department_name||'No dept'} · {selectedEmp.designation_name||'No designation'}
                            </div>
                            <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:2 }}>
                              📧 {selectedEmp.email}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step 2: Assign role */}
                      <div className="form-group">
                        <label className="form-label">Assign Role <span className="required">*</span></label>
                        <select className="form-select" value={createForm.role}
                          onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}>
                          {ROLES.map(r => (
                            <option key={r} value={r}>
                              {r.charAt(0).toUpperCase()+r.slice(1)}
                              {r==='coordinator' ? ' — approves dept expenses' :
                               r==='hr'          ? ' — second-level approver' :
                               r==='accounts'    ? ' — final approver' :
                               r==='admin'       ? ' — full system access' : ' — submits expenses'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Step 3: Send email option */}
                      <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius)', padding:'14px 16px', border:'1px solid var(--gray-100)' }}>
                        <label style={{ display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer' }}>
                          <input type="checkbox" checked={createForm.send_email}
                            onChange={e => setCreateForm(p => ({ ...p, send_email: e.target.checked }))}
                            style={{ width:16, height:16, marginTop:2, flexShrink:0 }} />
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>
                              📧 Send invitation email to {selectedEmp?.email || 'employee'}
                            </div>
                            <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:3, lineHeight:1.5 }}>
                              The email will contain their username, temporary password, and login link.
                              {!createForm.send_email && (
                                <span style={{ color:'var(--warning)', fontWeight:500 }}> The temporary password will be shown here after creation — share it manually.</span>
                              )}
                            </div>
                          </div>
                        </label>
                      </div>

                      <div className="alert alert-info" style={{ marginTop:12 }}>
                        🔑 A temporary password is auto-generated. The employee <strong>must change it</strong> on first login.
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {!createResult && unlinked.length > 0 && (
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !createForm.emp_id}>
                  {saving ? '⏳ Creating…' : '✅ Create Login Access'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EDIT ROLE MODAL ──────────────────────────────────────── */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Edit — {editingUser.full_name}</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingUser(null)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="alert alert-danger">⚠️ {formError}</div>}
              <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:14 }}>
                <div style={{ fontWeight:600 }}>{editingUser.full_name}</div>
                <div style={{ fontSize:12, color:'var(--gray-400)' }}>{editingUser.email}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={editingUser.role}
                  onChange={e => setEditingUser(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Account Status</label>
                <select className="form-select" value={editingUser.status}
                  onChange={e => setEditingUser(p => ({ ...p, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive (blocked from login)</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdateUser} disabled={saving}>
                {saving ? '⏳…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ROLE PERMISSIONS REFERENCE ───────────────────────────── */}
      {showPerms && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:640 }}>
            <div className="modal-header">
              <span className="modal-title">📋 Role Permissions Reference</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowPerms(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight:'70vh', overflowY:'auto' }}>
              {ROLES.map(role => (
                <div key={role} style={{ marginBottom:14, border:'1px solid var(--gray-100)', borderRadius:'var(--radius)', overflow:'hidden' }}>
                  <div style={{ padding:'10px 14px', background:`${ROLE_COLORS[role]}15`, borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:ROLE_COLORS[role] }}/>
                    <span style={{ fontWeight:700, fontSize:14, color:ROLE_COLORS[role], textTransform:'capitalize' }}>{role}</span>
                  </div>
                  <div style={{ padding:'10px 14px' }}>
                    <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:'var(--gray-600)', lineHeight:1.8 }}>
                      {ROLE_PERMISSIONS[role].map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowPerms(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* ── PASSWORD RESET RESULT MODAL ─────────────────────────── */}
      {showResetResult && resetResult && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title">🔑 Password Reset — {resetResult.user?.full_name}</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowResetResult(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-success">✅ {resetResult.message}</div>

              <div style={{ background:'var(--navy)', borderRadius:'var(--radius)', padding:'20px 24px', marginTop:12 }}>
                <div style={{ color:'rgba(255,255,255,.4)', fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>
                  New Temporary Password
                </div>
                <div style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:800, color:'var(--amber)', letterSpacing:3 }}>
                  {resetResult.tempPassword}
                </div>
                <div style={{ color:'rgba(255,255,255,.5)', fontSize:12, marginTop:10, lineHeight:1.6 }}>
                  {resetResult.email_sent
                    ? '✉️ Email sent to the user with their new temporary password.'
                    : resetResult.email_error
                      ? `⚠️ Email failed (${resetResult.email_error}). Share this password manually.`
                      : '📋 Share this password with the user manually.'}
                </div>
                <div style={{ color:'rgba(255,255,255,.4)', fontSize:11, marginTop:8 }}>
                  The user must change this password on their next login.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowResetResult(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
