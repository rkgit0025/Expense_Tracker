import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const GENERAL_VISIT_CODE = 'GENERAL';

export default function Section1_ProjectDetails({ data, onChange, readOnly }) {
  const [projects,   setProjects]   = useState([]);
  const [employees,  setEmployees]  = useState([]);

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {});
    api.get('/admin/employees').then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  const selected    = projects.find(p => p.project_id === parseInt(data.project_id));
  const isGeneral   = selected?.project_code === GENERAL_VISIT_CODE;

  // For general visit, site_location and coordinator_hod are user-editable
  const handleProjectChange = (project_id) => {
    const proj = projects.find(p => p.project_id === parseInt(project_id));
    onChange({
      project_id,
      site_location:          proj?.site_location          || '',
      project_coordinator_hod: proj?.project_coordinator_hod || '',
    });
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">1</div>
        <span className="card-title">Project Details</span>
      </div>

      <div className="grid-2">
        {/* Project selector */}
        <div className="form-group">
          <label className="form-label">Project <span className="required">*</span></label>
          {readOnly ? (
            <input
              className="form-control readonly-styled" readOnly
              value={selected ? `${selected.project_code} – ${selected.project_name}` : (data.project_id || '—')}
            />
          ) : (
            <select
              className="form-select"
              value={data.project_id || ''}
              onChange={e => handleProjectChange(e.target.value)}
              required
            >
              <option value="">— Select Project —</option>
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_code} – {p.project_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Project Code — always read-only */}
        <div className="form-group">
          <label className="form-label">Project Code</label>
          <input className="form-control readonly-styled" readOnly value={selected?.project_code || '—'} />
        </div>

        {/* Site Location — editable for General Visit */}
        <div className="form-group">
          <label className="form-label">
            Site Location
            {isGeneral && !readOnly && (
              <span style={{ fontWeight:400, fontSize:11, color:'var(--amber)', marginLeft:6 }}>
                (required for General Visit)
              </span>
            )}
          </label>
          {readOnly || !isGeneral ? (
            <input
              className="form-control readonly-styled" readOnly
              value={
                isGeneral
                  ? (data.site_location || '—')
                  : (selected?.site_location || '—')
              }
            />
          ) : (
            <input
              className="form-control"
              placeholder="Enter site / visit location"
              value={data.site_location || ''}
              onChange={e => onChange({ ...data, site_location: e.target.value })}
              required={isGeneral}
            />
          )}
        </div>

        {/* Project Coordinator / HOD — dropdown from employees for General, readonly otherwise */}
        <div className="form-group">
          <label className="form-label">
            Project Coordinator / HOD
            {isGeneral && !readOnly && (
              <span style={{ fontWeight:400, fontSize:11, color:'var(--amber)', marginLeft:6 }}>
                (select from employees)
              </span>
            )}
          </label>
          {readOnly || !isGeneral ? (
            <input
              className="form-control readonly-styled" readOnly
              value={
                isGeneral
                  ? (data.project_coordinator_hod || '—')
                  : (selected?.project_coordinator_hod || '—')
              }
            />
          ) : (
            <select
              className="form-select"
              value={data.project_coordinator_hod || ''}
              onChange={e => onChange({ ...data, project_coordinator_hod: e.target.value })}
            >
              <option value="">— Select employee —</option>
              {employees.map(e => (
                <option key={e.emp_id} value={e.full_name}>
                  {e.full_name} ({e.emp_code}){e.designation_name ? ` · ${e.designation_name}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* General Visit info banner */}
      {isGeneral && !readOnly && (
        <div style={{
          background: 'var(--warning-bg)', border: '1px solid var(--amber)',
          borderRadius: 'var(--radius)', padding: '10px 14px',
          fontSize: 13, color: '#92400e', marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ℹ️ <strong>General Visit</strong> selected — please fill in the site location and select the coordinator/HOD manually.
        </div>
      )}
    </div>
  );
}
