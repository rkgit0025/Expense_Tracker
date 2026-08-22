import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { formatDate } from '../../utils/helpers';
import { useToast, useDialog } from '../../context/UIContext';
import Pagination from '../../components/Pagination';

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
  admin:       ['Full access to all sections', 'Manage employees, users, projects', 'Configure depts, designations, locations', 'Manage allowance rates & coordinator assignments', 'Bulk uploads for employees & projects', 'View all expenses; can reject one at any stage, including already fully approved (cannot approve)'],
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
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(25);
  const [formError,    setFormError]    = useState('');
  const [saving,       setSaving]       = useState(false);

  // Create form — no password field, auto-generated on backend
  const [createForm,   setCreateForm]   = useState({ emp_id:'', role:'employee', send_email: true });
  const [createResult, setCreateResult] = useState(null);

  // Bulk create — select multiple employees (optionally via dept/designation filter)
  const [showBulkCreate,  setShowBulkCreate]  = useState(false);
  const [bulkDeptFilter,  setBulkDeptFilter]  = useState('');
  const [bulkDesigFilter, setBulkDesigFilter] = useState('');
  const [bulkSearch,      setBulkSearch]      = useState('');
  const [bulkSelected,    setBulkSelected]    = useState([]); // emp_ids
  const [bulkRole,        setBulkRole]        = useState('employee');
  const [bulkSendEmail,   setBulkSendEmail]   = useState(true);
  const [bulkResult,      setBulkResult]      = useState(null);
  const [bulkSaving,      setBulkSaving]      = useState(false);

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

  // ── Bulk create users ────────────────────────────────────────────────────
  const openBulkCreate = () => {
    setBulkDeptFilter(''); setBulkDesigFilter(''); setBulkSearch('');
    setBulkSelected([]); setBulkRole('employee'); setBulkSendEmail(true);
    setBulkResult(null); setShowBulkCreate(true);
  };

  const bulkFiltered = unlinked.filter(e => {
    const q = bulkSearch.toLowerCase();
    const ms = !q || e.full_name?.toLowerCase().includes(q) || e.emp_code?.toLowerCase().includes(q);
    const md = !bulkDeptFilter  || String(e.department_id)   === bulkDeptFilter;
    const mg = !bulkDesigFilter || String(e.designation_id)  === bulkDesigFilter;
    return ms && md && mg;
  });
  const bulkDepts = [...new Map(unlinked.filter(e=>e.department_id).map(e => [e.department_id, e.department_name])).entries()];
  const bulkDesigs = [...new Map(unlinked.filter(e=>e.designation_id).map(e => [e.designation_id, e.designation_name])).entries()];

  const toggleBulkSelect = (emp_id) => {
    setBulkSelected(prev => prev.includes(emp_id) ? prev.filter(id => id !== emp_id) : [...prev, emp_id]);
  };
  const allFilteredSelected = bulkFiltered.length > 0 && bulkFiltered.every(e => bulkSelected.includes(e.emp_id));
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setBulkSelected(prev => prev.filter(id => !bulkFiltered.some(e => e.emp_id === id)));
    } else {
      setBulkSelected(prev => [...new Set([...prev, ...bulkFiltered.map(e => e.emp_id)])]);
    }
  };

  const handleBulkCreate = async () => {
    if (bulkSelected.length === 0) { setFormError('Select at least one employee.'); return; }
    setFormError(''); setBulkSaving(true);
    try {
      const { data } = await api.post('/admin/users/bulk-create', {
        emp_ids: bulkSelected, role: bulkRole, send_email: bulkSendEmail,
      });
      setBulkResult(data);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Bulk creation failed.');
    } finally { setBulkSaving(false); }
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

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, roleFilter, users.length]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage  = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

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
          <button className="btn btn-ghost" onClick={openBulkCreate}>👥 Bulk Create Accounts</button>
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
                {paginated.map(u => (
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
        <Pagination page={safePage} pageSize={pageSize} total={filtered.length}
          onPageChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1); }}
          itemLabel="users" />
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

      {/* ── BULK CREATE USERS MODAL ─────────────────────────────────── */}
      {showBulkCreate && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:640 }}>
            <div className="modal-header">
              <span className="modal-title">👥 Bulk Create Login Accounts</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowBulkCreate(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight:'75vh', overflowY:'auto' }}>

              {/* RESULT STATE */}
              {bulkResult ? (
                <div>
                  <div className="alert alert-success">✅ {bulkResult.message}</div>

                  {bulkResult.results?.length > 0 && (
                    <div style={{ marginTop:12, border:'1px solid var(--gray-100)', borderRadius:'var(--radius)', overflow:'hidden' }}>
                      <table style={{ width:'100%', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'var(--gray-50)' }}>
                            <th style={{ padding:'6px 10px', textAlign:'left' }}>Employee</th>
                            <th style={{ padding:'6px 10px', textAlign:'left' }}>Username</th>
                            <th style={{ padding:'6px 10px', textAlign:'left' }}>Temp Password</th>
                            <th style={{ padding:'6px 10px', textAlign:'left' }}>Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResult.results.map(r => (
                            <tr key={r.emp_id} style={{ borderTop:'1px solid var(--gray-100)' }}>
                              <td style={{ padding:'6px 10px' }}>{r.full_name} <span style={{ color:'var(--gray-400)' }}>({r.emp_code})</span></td>
                              <td style={{ padding:'6px 10px', fontFamily:'var(--mono)' }}>{r.username}</td>
                              <td style={{ padding:'6px 10px', fontFamily:'var(--mono)', fontWeight:700 }}>{r.tempPassword}</td>
                              <td style={{ padding:'6px 10px' }}>{r.email_sent ? '✉️ Sent' : '⚠️ Not sent'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {bulkResult.errors?.length > 0 && (
                    <div className="alert alert-danger" style={{ marginTop:12 }}>
                      <div style={{ fontWeight:600, marginBottom:4 }}>⚠️ Some rows were skipped:</div>
                      <ul style={{ margin:0, paddingLeft:18, fontSize:12 }}>
                        {bulkResult.errors.map((e,i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}

                  <button className="btn btn-primary w-full" style={{ marginTop:16 }} onClick={() => setShowBulkCreate(false)}>Done</button>
                </div>
              ) : (
                /* SELECTION FORM */
                <>
                  {formError && <div className="alert alert-danger">⚠️ {formError}</div>}

                  {unlinked.length === 0 ? (
                    <div className="alert alert-info">✅ All employees already have login accounts.</div>
                  ) : (
                    <>
                      {/* Filters */}
                      <div className="grid-2" style={{ marginBottom:10 }}>
                        <select className="form-select" value={bulkDeptFilter} onChange={e => setBulkDeptFilter(e.target.value)}>
                          <option value="">All Departments</option>
                          {bulkDepts.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                        <select className="form-select" value={bulkDesigFilter} onChange={e => setBulkDesigFilter(e.target.value)}>
                          <option value="">All Designations</option>
                          {bulkDesigs.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                      </div>
                      <input className="form-control" style={{ marginBottom:10 }}
                        placeholder="🔍 Search name or emp code…"
                        value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} />

                      {/* Select-all + count */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                          <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
                          Select all shown ({bulkFiltered.length})
                        </label>
                        <span style={{ fontSize:12, color:'var(--gray-400)' }}>{bulkSelected.length} selected</span>
                      </div>

                      {/* Employee checklist */}
                      <div style={{ border:'1px solid var(--gray-100)', borderRadius:'var(--radius)', maxHeight:240, overflowY:'auto' }}>
                        {bulkFiltered.map(e => (
                          <label key={e.emp_id} style={{
                            display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                            borderBottom:'1px solid var(--gray-100)', cursor:'pointer',
                          }}>
                            <input type="checkbox" checked={bulkSelected.includes(e.emp_id)}
                              onChange={() => toggleBulkSelect(e.emp_id)} />
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:600, fontSize:13 }}>{e.full_name} <span style={{ color:'var(--gray-400)', fontWeight:400 }}>({e.emp_code})</span></div>
                              <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.department_name||'No dept'} · {e.designation_name||'No designation'} · {e.email}</div>
                            </div>
                          </label>
                        ))}
                        {bulkFiltered.length === 0 && (
                          <div style={{ padding:20, textAlign:'center', color:'var(--gray-300)', fontSize:13 }}>No employees match this filter.</div>
                        )}
                      </div>

                      {/* Role for the whole batch */}
                      <div className="form-group" style={{ marginTop:12 }}>
                        <label className="form-label">Assign Role to all selected <span className="required">*</span></label>
                        <select className="form-select" value={bulkRole} onChange={e => setBulkRole(e.target.value)}>
                          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                        </select>
                      </div>

                      <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius)', padding:'12px 14px', border:'1px solid var(--gray-100)' }}>
                        <label style={{ display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer' }}>
                          <input type="checkbox" checked={bulkSendEmail}
                            onChange={e => setBulkSendEmail(e.target.checked)}
                            style={{ width:16, height:16, marginTop:2, flexShrink:0 }} />
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>📧 Send invitation emails to all selected employees</div>
                            <div style={{ fontSize:12, color:'var(--gray-400)', marginTop:3 }}>
                              Each employee's username and temporary password will also be shown here after creation.
                            </div>
                          </div>
                        </label>
                      </div>

                      <div className="alert alert-info" style={{ marginTop:12 }}>
                        🔑 A unique temporary password is auto-generated per employee. Everyone must change it on first login.
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {!bulkResult && unlinked.length > 0 && (
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowBulkCreate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleBulkCreate} disabled={bulkSaving || bulkSelected.length === 0}>
                  {bulkSaving ? '⏳ Creating…' : `✅ Create ${bulkSelected.length || ''} Account${bulkSelected.length===1?'':'s'}`}
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
