import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useToast, useDialog } from '../../context/UIContext';

export default function AdminCoordinators() {
  const { success, error, warning } = useToast();
  const { confirm }                 = useDialog();

  const [assignments,  setAssignments]  = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState({ coordinator_emp_id: '', department_id: '' });
  const [formError,    setFormError]    = useState('');
  const [saving,       setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, u, d] = await Promise.all([
        api.get('/admin/coordinator-departments'),
        api.get('/admin/users'),
        api.get('/admin/departments'),
      ]);
      setAssignments(a.data);
      setCoordinators(u.data.filter(u => u.role === 'coordinator'));
      setDepartments(d.data);
    } catch { error('Failed to load.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async () => {
    if (!form.coordinator_emp_id || !form.department_id) { setFormError('Both fields required.'); return; }
    setFormError(''); setSaving(true);
    try {
      await api.post('/admin/coordinator-departments', form);
      success('Coordinator assigned to department.');
      setShowModal(false); setForm({ coordinator_emp_id:'', department_id:'' }); load();
    } catch (err) { setFormError(err.response?.data?.message || 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleRemove = async (id, coordName, deptName) => {
    const ok = await confirm({
      title: 'Remove Assignment',
      message: `Remove ${coordName} from "${deptName}"?`,
      details: 'They will no longer receive or be able to approve expenses from this department.',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      variant: 'warning',
    });
    if (!ok) return;
    try { await api.delete(`/admin/coordinator-departments/${id}`); success('Assignment removed.'); load(); }
    catch { error('Remove failed.'); }
  };

  // Group by department
  const byDept = departments.map(d => ({
    ...d, coordinators: assignments.filter(a => a.department_id === d.department_id)
  }));
  const unassigned = byDept.filter(d => d.coordinators.length === 0);

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>🏢 Department Coordinators</h2>
          <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:4 }}>
            Assign coordinators to departments. Expenses from those departments go to them first.
          </p>
        </div>
        <button className="btn btn-amber" onClick={() => { setFormError(''); setShowModal(true); }}
          disabled={coordinators.length === 0}>
          ➕ Assign Coordinator
        </button>
      </div>

      {coordinators.length === 0 && (
        <div className="alert alert-warning">
          ⚠️ No users have the <strong>Coordinator</strong> role. Go to <strong>User Accounts</strong> and assign the coordinator role first.
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="alert alert-warning">
          ⚠️ <strong>{unassigned.length} department{unassigned.length > 1 ? 's' : ''} without a coordinator:</strong>{' '}
          {unassigned.map(d => d.department_name).join(', ')}
        </div>
      )}

      {loading ? <div className="loading-wrap"><div className="spinner"/></div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
          {byDept.map(dept => (
            <div key={dept.department_id} className="card" style={{ marginBottom:0 }}>
              <div className="card-header" style={{ paddingBottom:12, marginBottom:12 }}>
                <span style={{ fontSize:18 }}>🏢</span>
                <span className="card-title">{dept.department_name}</span>
                {dept.coordinators.length === 0 && (
                  <span className="badge badge-draft" style={{ marginLeft:'auto' }}>No Coordinator</span>
                )}
              </div>

              {dept.coordinators.length === 0 ? (
                <div style={{ textAlign:'center', padding:'16px 0', color:'var(--gray-300)', fontSize:13 }}>
                  No coordinator assigned.
                  <br/>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }}
                    onClick={() => { setForm({ coordinator_emp_id:'', department_id: String(dept.department_id) }); setFormError(''); setShowModal(true); }}>
                    ➕ Assign now
                  </button>
                </div>
              ) : (
                dept.coordinators.map(c => (
                  <div key={c.id} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'10px 12px', background:'var(--gray-50)',
                    borderRadius:'var(--radius)', marginBottom:8, border:'1px solid var(--gray-100)'
                  }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14 }}>{c.coordinator_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{c.emp_code}</div>
                    </div>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => handleRemove(c.id, c.coordinator_name, dept.department_name)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Assign Coordinator to Department</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="alert alert-danger">{formError}</div>}
              <div className="alert alert-info" style={{ marginBottom:16 }}>
                💡 Only users with the <strong>Coordinator</strong> role appear. A department can have multiple coordinators.
              </div>
              <div className="form-group">
                <label className="form-label">Coordinator <span className="required">*</span></label>
                <select className="form-select" value={form.coordinator_emp_id}
                  onChange={e => setForm(p => ({ ...p, coordinator_emp_id: e.target.value }))}>
                  <option value="">— Select coordinator —</option>
                  {coordinators.map(c => <option key={c.emp_id} value={c.emp_id}>{c.full_name} ({c.emp_code})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Department <span className="required">*</span></label>
                <select className="form-select" value={form.department_id}
                  onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}>
                  <option value="">— Select department —</option>
                  {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={saving}>
                {saving ? '⏳…' : '✅ Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
