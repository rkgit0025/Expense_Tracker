import React, { useEffect, useState, useRef } from 'react';
import api from '../../api/axios';
import { formatDate } from '../../utils/helpers';
import { useToast, useDialog } from '../../context/UIContext';

const emptyForm = {
  first_name:'', middle_name:'', last_name:'',
  email:'', mobile_number:'', birth_of_date:'', gender:'',
  emp_code:'', designation_id:'', department_id:'', location_id:'',
  date_of_joining:'', category:'Staff',
  first_reporting_manager_emp_code:'', second_reporting_manager_emp_code:'',
};

const getFullName = (f) => [f.first_name, f.middle_name, f.last_name].filter(Boolean).join(' ');
const getUsername = (f) => (f.email || '').toLowerCase().trim();

export default function AdminEmployees() {
  const { success, error } = useToast();
  const { confirm }        = useDialog();

  const [employees,    setEmployees]    = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations,    setLocations]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [form,         setForm]         = useState(emptyForm);
  const [formError,    setFormError]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [deptFilter,   setDeptFilter]   = useState('');
  const [showBulk,     setShowBulk]     = useState(false);
  const [bulkResult,   setBulkResult]   = useState(null);
  const [bulkLoading,  setBulkLoading]  = useState(false);
  const bulkRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [e, d, des, loc] = await Promise.all([
        api.get('/admin/employees'),
        api.get('/admin/departments'),
        api.get('/admin/designations'),
        api.get('/admin/locations'),
      ]);
      setEmployees(e.data); setDepartments(d.data); setDesignations(des.data); setLocations(loc.data);
    } catch { error('Failed to load.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sf = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const openCreate = () => { setForm(emptyForm); setEditing(null); setFormError(''); setShowModal(true); };

  const openEdit = (emp) => {
    setForm({
      first_name:       emp.first_name      || '',
      middle_name:      emp.middle_name     || '',
      last_name:        emp.last_name       || '',
      email:            emp.email           || '',
      mobile_number:    emp.mobile_number   || '',
      birth_of_date:    emp.birth_of_date   ? emp.birth_of_date.split('T')[0]   : '',
      gender:           emp.gender          || '',
      emp_code:         emp.emp_code        || '',
      designation_id:   emp.designation_id  || '',
      department_id:    emp.department_id   || '',
      location_id:      emp.location_id     || '',
      date_of_joining:  emp.date_of_joining ? emp.date_of_joining.split('T')[0] : '',
      category:         emp.category        || 'Staff',
      first_reporting_manager_emp_code:  emp.first_reporting_manager_emp_code  || '',
      second_reporting_manager_emp_code: emp.second_reporting_manager_emp_code || '',
    });
    setEditing(emp.emp_id); setFormError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.emp_code || !form.first_name || !form.email || !form.mobile_number || !form.gender || !form.birth_of_date) {
      setFormError('Employee code, first name, email, mobile, gender and birth date are required.'); return;
    }
    setFormError(''); setSaving(true);
    try {
      if (editing) { await api.put(`/admin/employees/${editing}`, form); success('Employee updated.'); }
      else         { await api.post('/admin/employees', form);            success('Employee created. Go to 🔐 User Accounts to grant login access.'); }
      setShowModal(false); load();
    } catch (err) { setFormError(err.response?.data?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name, hasUser) => {
    const ok = await confirm({
      title: 'Delete Employee',
      message: `Delete "${name}"?`,
      details: hasUser ? 'This will also remove their login access.' : 'This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try { await api.delete(`/admin/employees/${id}`); success(`"${name}" deleted.`); load(); }
    catch (err) { error(err.response?.data?.message || 'Delete failed.'); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/admin/employees/bulk-template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'employee_bulk_template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { error('Template download failed.'); }
  };

  const handleBulkUpload = async (file) => {
    if (!file) return;
    setBulkLoading(true); setBulkResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/admin/employees/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBulkResult(data);
      if (data.created > 0) success(`${data.created} employee${data.created > 1 ? 's' : ''} created successfully.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Upload failed.'); }
    finally { setBulkLoading(false); if (bulkRef.current) bulkRef.current.value = ''; }
  };

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return (!q || e.full_name?.toLowerCase().includes(q) || e.emp_code?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q))
      && (!deptFilter || String(e.department_id) === deptFilter);
  });

  const fullName = getFullName(form);
  const username = getUsername(form);

  // HR dept employees for 2nd manager
  const hrEmployees = employees.filter(e =>
    departments.find(d => d.department_id === e.department_id && d.department_name?.toLowerCase().includes('hr'))
  );

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>👤 Employees</h2>
          <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:4 }}>Employee records. Login access is managed in <strong>🔐 User Accounts</strong>.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => { setShowBulk(true); setBulkResult(null); }}>📊 Bulk Upload</button>
          <button className="btn btn-amber" onClick={openCreate}>➕ Add Employee</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding:12, marginBottom:12 }}>
        <div className="grid-2">
          <input className="form-control" placeholder="🔍 Search name, code, email…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding:0 }}>
        {loading ? <div className="loading-wrap"><div className="spinner"/></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Code</th><th>Dept / Designation</th><th>Location</th><th>Contact</th><th>Login</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.emp_id}>
                    <td>
                      <div style={{ fontWeight:600 }}>{e.full_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.gender} · {e.category}</div>
                    </td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color:'var(--navy)' }}>{e.emp_code}</td>
                    <td>
                      <div>{e.department_name || '—'}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.designation_name || '—'}</div>
                    </td>
                    <td style={{ fontSize:12 }}>{e.location_name || '—'}</td>
                    <td>
                      <div style={{ fontSize:12 }}>{e.email}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.mobile_number}</div>
                    </td>
                    <td>
                      {e.user_id
                        ? <span className="badge badge-accounts_approved" style={{ textTransform:'capitalize' }}>✓ {e.user_role}</span>
                        : <span className="badge badge-draft">No access</span>}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => openEdit(e)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e.emp_id, e.full_name, !!e.user_id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--gray-300)' }}>No employees found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding:'10px 16px', fontSize:12, color:'var(--gray-400)', borderTop:'1px solid var(--gray-100)' }}>
          Showing {filtered.length} of {employees.length} employees
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:720 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? '✏️ Edit Employee' : '➕ Add New Employee'}</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight:'75vh', overflowY:'auto' }}>
              {formError && <div className="alert alert-danger">⚠️ {formError}</div>}
              {!editing && <div className="alert alert-info" style={{ marginBottom:16 }}>💡 Creates employee record only. Use <strong>User Accounts</strong> to grant login access.</div>}

              {/* Personal */}
              <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--navy)', marginBottom:14 }}>👤 Personal Details</div>
                <div className="grid-3" style={{ gap:12, marginBottom:12 }}>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">First Name <span className="required">*</span></label>
                    <input className="form-control" placeholder="First name" value={form.first_name} onChange={sf('first_name')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Middle Name</label>
                    <input className="form-control" placeholder="Optional" value={form.middle_name} onChange={sf('middle_name')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Last Name</label>
                    <input className="form-control" placeholder="Last name" value={form.last_name} onChange={sf('last_name')} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label className="form-label">Full Name <span style={{ fontWeight:400, color:'var(--gray-400)', fontSize:11, textTransform:'none' }}>(auto-generated)</span></label>
                  <input className="form-control readonly-styled" readOnly value={fullName || '—'} />
                </div>
                <div className="grid-2" style={{ gap:12 }}>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Email <span className="required">*</span></label>
                    <input type="email" className="form-control" placeholder="work@company.com" value={form.email} onChange={sf('email')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Username <span style={{ fontWeight:400, color:'var(--gray-400)', fontSize:11, textTransform:'none' }}>(always matches email)</span></label>
                    <input className="form-control readonly-styled" readOnly value={username || '—'} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Mobile Number <span className="required">*</span></label>
                    <input className="form-control" placeholder="10-digit number" value={form.mobile_number} onChange={sf('mobile_number')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Birth Date <span className="required">*</span></label>
                    <input type="date" className="form-control" value={form.birth_of_date} onChange={sf('birth_of_date')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Gender <span className="required">*</span></label>
                    <select className="form-select" value={form.gender} onChange={sf('gender')}>
                      <option value="">— Select —</option>
                      <option>Male</option><option>Female</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Organization */}
              <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--navy)', marginBottom:14 }}>🏢 Organization Details</div>
                <div className="grid-2" style={{ gap:12 }}>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Employee Code <span className="required">*</span></label>
                    <input className="form-control" placeholder="EMP-001" value={form.emp_code} onChange={sf('emp_code')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Designation <span className="required">*</span></label>
                    <select className="form-select" value={form.designation_id} onChange={sf('designation_id')}>
                      <option value="">— Select —</option>
                      {designations.map(d => <option key={d.designation_id} value={d.designation_id}>{d.designation_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Department <span className="required">*</span></label>
                    <select className="form-select" value={form.department_id} onChange={sf('department_id')}>
                      <option value="">— Select —</option>
                      {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Location <span className="required">*</span></label>
                    <select className="form-select" value={form.location_id} onChange={sf('location_id')}>
                      <option value="">— Select —</option>
                      {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.location_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Date of Joining <span className="required">*</span></label>
                    <input type="date" className="form-control" value={form.date_of_joining} onChange={sf('date_of_joining')} />
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Category <span className="required">*</span></label>
                    <select className="form-select" value={form.category} onChange={sf('category')}>
                      <option value="Staff">Staff</option>
                      <option value="Worker">Worker</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Reporting */}
              <div style={{ background:'var(--gray-50)', borderRadius:'var(--radius)', padding:'14px 16px' }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--navy)', marginBottom:14 }}>📊 Reporting Structure</div>
                <div className="grid-2" style={{ gap:12 }}>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">First Reporting Manager <span className="required">*</span></label>
                    <select className="form-select" value={form.first_reporting_manager_emp_code} onChange={sf('first_reporting_manager_emp_code')}>
                      <option value="">— Select manager —</option>
                      {employees.filter(e => e.emp_id !== editing).map(e => (
                        <option key={e.emp_id} value={e.emp_code}>{e.full_name} ({e.emp_code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Second Reporting Manager <span style={{ fontWeight:400, fontSize:11, color:'var(--gray-400)', textTransform:'none' }}>(HR Dept)</span></label>
                    <select className="form-select" value={form.second_reporting_manager_emp_code} onChange={sf('second_reporting_manager_emp_code')}>
                      <option value="">— Select —</option>
                      {/* HR employees first */}
                      {[...employees.filter(e => e.department_name?.toLowerCase().includes('hr') && e.emp_id !== editing),
                         ...employees.filter(e => !e.department_name?.toLowerCase().includes('hr') && e.emp_id !== editing)]
                        .map(e => (
                          <option key={e.emp_id} value={e.emp_code}>
                            {e.full_name} ({e.emp_code}){e.department_name?.toLowerCase().includes('hr') ? ' 🏷️ HR' : ''}
                          </option>
                        ))}
                    </select>
                    <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:4 }}>HR dept employees listed first with 🏷️ HR</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Saving…' : (editing ? '💾 Update' : '✅ Create Employee')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulk && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <span className="modal-title">📊 Bulk Upload Employees</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowBulk(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom:16 }}>
                <ol style={{ margin:'4px 0 0 16px', fontSize:13, lineHeight:1.8 }}>
                  <li>Download the Excel template below</li>
                  <li>Fill in employee data (one per row)</li>
                  <li>Designation, Department &amp; Location must match existing names exactly</li>
                  <li>Upload the completed file</li>
                </ol>
              </div>
              <button className="btn btn-primary" style={{ marginBottom:16 }} onClick={handleDownloadTemplate}>
                ⬇️ Download Excel Template
              </button>
              <div className="form-group">
                <label className="form-label">Upload File (.xlsx, .xls, .csv)</label>
                <input type="file" accept=".xlsx,.xls,.csv" ref={bulkRef} className="form-control"
                  onChange={e => handleBulkUpload(e.target.files[0])} disabled={bulkLoading} />
              </div>
              {bulkLoading && <div className="loading-wrap" style={{ padding:20 }}><div className="spinner"/><div style={{ textAlign:'center', marginTop:8, fontSize:13, color:'var(--gray-400)' }}>Processing…</div></div>}
              {bulkResult && (
                <div>
                  <div className={`alert ${bulkResult.errors?.length ? 'alert-warning' : 'alert-success'}`}>{bulkResult.message}</div>
                  {bulkResult.errors?.length > 0 && (
                    <div style={{ maxHeight:160, overflowY:'auto', background:'var(--gray-50)', borderRadius:'var(--radius)', padding:12, fontSize:12 }}>
                      {bulkResult.errors.map((e, i) => <div key={i} style={{ color:'var(--danger)', marginBottom:4 }}>⚠️ {e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBulk(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
