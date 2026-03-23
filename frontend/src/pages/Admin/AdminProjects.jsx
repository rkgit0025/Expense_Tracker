import React, { useEffect, useState, useRef } from 'react';
import api from '../../api/axios';
import { useToast, useDialog } from '../../context/UIContext';

const emptyForm = { project_code: '', project_name: '', site_location: '', project_coordinator_hod: '' };

export default function AdminProjects() {
  const { success, error, info } = useToast();
  const { confirm }              = useDialog();

  const [projects,   setProjects]   = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState(emptyForm);
  const [formError,  setFormError]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  // Bulk upload
  const [showBulk,   setShowBulk]   = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkLoading,setBulkLoading]= useState(false);
  const bulkRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: e }] = await Promise.all([
        api.get('/projects'),
        api.get('/admin/employees'),
      ]);
      setProjects(p); setEmployees(e);
    }
    catch { error('Failed to load projects.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(emptyForm); setEditing(null); setFormError(''); setShowModal(true); };
  const openEdit   = (p)  => {
    setForm({ project_code: p.project_code, project_name: p.project_name,
              site_location: p.site_location || '', project_coordinator_hod: p.project_coordinator_hod || '' });
    setEditing(p.project_id); setFormError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.project_code || !form.project_name) { setFormError('Project code and name are required.'); return; }
    setFormError(''); setSaving(true);
    try {
      if (editing) { await api.put(`/projects/${editing}`, form); success('Project updated.'); }
      else         { await api.post('/projects', form);            success('Project created.'); }
      setShowModal(false); load();
    } catch (err) { setFormError(err.response?.data?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    const ok = await confirm({
      title: 'Delete Project',
      message: `Delete project "${name}"?`,
      details: 'All expense forms linked to this project will also be deleted.',
      confirmLabel: 'Delete Project',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try { await api.delete(`/projects/${id}`); success(`Project "${name}" deleted.`); load(); }
    catch (err) { error(err.response?.data?.message || 'Delete failed.'); }
  };

  // Bulk upload
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/projects/bulk-template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'project_bulk_template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { error('Template download failed.'); }
  };

  const handleBulkUpload = async (file) => {
    if (!file) return;
    setBulkLoading(true); setBulkResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/projects/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBulkResult(data);
      success(data.message);
      load();
    } catch (err) { error(err.response?.data?.message || 'Upload failed.'); }
    finally { setBulkLoading(false); }
  };

  const sf = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));
  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    return !q || p.project_name?.toLowerCase().includes(q) || p.project_code?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>🏗️ Projects</h2>
          <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:4 }}>Manage projects linked to expense claims.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" onClick={() => { setShowBulk(true); setBulkResult(null); }}>📊 Bulk Upload</button>
          <button className="btn btn-amber" onClick={openCreate}>➕ Add Project</button>
        </div>
      </div>

      <div className="card" style={{ padding:12, marginBottom:12 }}>
        <input className="form-control" placeholder="🔍 Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ padding:0 }}>
        {loading ? <div className="loading-wrap"><div className="spinner"/></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Project Name</th><th>Site Location</th><th>Coordinator / HOD</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.project_id}>
                    <td><span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color:'var(--navy)' }}>{p.project_code}</span></td>
                    <td style={{ fontWeight:500 }}>{p.project_name}</td>
                    <td>{p.site_location || '—'}</td>
                    <td>{p.project_coordinator_hod || '—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.project_id, p.project_name)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} style={{ textAlign:'center', padding:40, color:'var(--gray-300)' }}>No projects found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit/Add Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Project' : 'Add New Project'}</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="alert alert-danger">⚠️ {formError}</div>}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Project Code <span className="required">*</span></label>
                  <input className="form-control" placeholder="PRJ-001" value={form.project_code} onChange={sf('project_code')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Project Name <span className="required">*</span></label>
                  <input className="form-control" placeholder="Project name" value={form.project_name} onChange={sf('project_name')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Site Location</label>
                  <input className="form-control" placeholder="City / Site" value={form.site_location} onChange={sf('site_location')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Project Coordinator / HOD</label>
                  <select className="form-select" value={form.project_coordinator_hod} onChange={sf('project_coordinator_hod')}>
                    <option value="">— Select from employees —</option>
                    {employees.map(e => (
                      <option key={e.emp_id} value={e.full_name}>
                        {e.full_name} ({e.emp_code}){e.designation_name ? ` · ${e.designation_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Saving…' : (editing ? '💾 Update' : '✅ Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulk && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <span className="modal-title">📊 Bulk Upload Projects</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowBulk(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom:16 }}>
                <ol style={{ margin:'4px 0 0 16px', fontSize:13, lineHeight:1.8 }}>
                  <li>Download the Excel template</li>
                  <li>Fill in project data (one per row)</li>
                  <li>Upload the completed file</li>
                </ol>
              </div>
              <button className="btn btn-primary" style={{ marginBottom:16 }} onClick={handleDownloadTemplate}>⬇️ Download Template</button>
              <div className="form-group">
                <label className="form-label">Upload File (.xlsx, .csv)</label>
                <input type="file" accept=".xlsx,.xls,.csv" ref={bulkRef} className="form-control"
                  onChange={e => handleBulkUpload(e.target.files[0])} disabled={bulkLoading} />
              </div>
              {bulkLoading && <div className="loading-wrap" style={{ padding:16 }}><div className="spinner"/></div>}
              {bulkResult && (
                <div>
                  <div className={`alert ${bulkResult.errors?.length ? 'alert-warning' : 'alert-success'}`}>{bulkResult.message}</div>
                  {bulkResult.errors?.map((e, i) => <div key={i} style={{ fontSize:12, color:'var(--danger)', marginTop:4 }}>⚠️ {e}</div>)}
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
