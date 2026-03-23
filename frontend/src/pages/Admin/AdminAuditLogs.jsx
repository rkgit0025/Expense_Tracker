import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import { formatDate } from '../../utils/helpers';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  // Auth
  { value: 'login',               label: '🔑 Login' },
  { value: 'login_failed',        label: '🚫 Login Failed' },
  { value: 'password_changed',    label: '🔒 Password Changed (self)' },
  // Expenses
  { value: 'expense_created',     label: '📋 Expense Created' },
  { value: 'expense_updated',     label: '✏️ Expense Updated' },
  { value: 'expense_submitted',   label: '📤 Expense Submitted' },
  { value: 'expense_approved',    label: '✅ Expense Approved' },
  { value: 'expense_rejected',    label: '❌ Expense Rejected' },
  // Employees
  { value: 'employee_created',    label: '👤 Employee Created' },
  { value: 'employee_updated',    label: '✏️ Employee Updated' },
  { value: 'employee_deleted',    label: '🗑️ Employee Deleted' },
  // Users
  { value: 'user_created',        label: '🔐 User Account Created' },
  { value: 'user_role_changed',   label: '🔄 Role Changed' },
  { value: 'user_activated',      label: '✅ User Activated' },
  { value: 'user_deactivated',    label: '🚫 User Deactivated' },
  { value: 'user_deleted',        label: '🗑️ Login Access Removed' },
  { value: 'password_reset',      label: '🔑 Password Reset (by admin)' },
  { value: 'invite_email_sent',   label: '✉️ Invite Email Sent' },
  { value: 'invite_resent',       label: '✉️ Invite Resent' },
  // Projects
  { value: 'project_created',     label: '🏗️ Project Created' },
  { value: 'project_updated',     label: '✏️ Project Updated' },
  { value: 'project_deleted',     label: '🗑️ Project Deleted' },
  // Coordinator / Master Data
  { value: 'coordinator_assigned',label: '🏢 Coordinator Assigned' },
  { value: 'coordinator_removed', label: '🏢 Coordinator Removed' },
  { value: 'department_deleted',  label: '🗑️ Department Deleted' },
  { value: 'designation_deleted', label: '🗑️ Designation Deleted' },
  { value: 'location_deleted',    label: '🗑️ Location Deleted' },
];

const ENTITY_OPTIONS = [
  { value: '',           label: 'All Types' },
  { value: 'employee',   label: '👤 Employee' },
  { value: 'expense',    label: '📋 Expense' },
  { value: 'user',       label: '🔐 User' },
  { value: 'project',    label: '🏗️ Project' },
  { value: 'department', label: '🏢 Department' },
  { value: 'designation',label: '🎖️ Designation' },
  { value: 'location',   label: '📍 Location' },
];

const ACTION_COLORS = {
  login:                { bg:'#d1fae5', color:'#065f46' },
  login_failed:         { bg:'#fee2e2', color:'#991b1b' },
  password_changed:     { bg:'#dbeafe', color:'#1e40af' },
  expense_created:      { bg:'#f1f5f9', color:'#475569' },
  expense_updated:      { bg:'#dbeafe', color:'#1e40af' },
  expense_submitted:    { bg:'#fef3c7', color:'#92400e' },
  expense_approved:     { bg:'#d1fae5', color:'#065f46' },
  expense_rejected:     { bg:'#fee2e2', color:'#991b1b' },
  employee_created:     { bg:'#d1fae5', color:'#065f46' },
  employee_updated:     { bg:'#dbeafe', color:'#1e40af' },
  employee_deleted:     { bg:'#fee2e2', color:'#991b1b' },
  user_created:         { bg:'#e0e7ff', color:'#3730a3' },
  user_role_changed:    { bg:'#fce7f3', color:'#9d174d' },
  user_activated:       { bg:'#d1fae5', color:'#065f46' },
  user_deactivated:     { bg:'#fee2e2', color:'#991b1b' },
  user_deleted:         { bg:'#fee2e2', color:'#991b1b' },
  password_reset:       { bg:'#fce7f3', color:'#9d174d' },
  invite_email_sent:    { bg:'#dbeafe', color:'#1e40af' },
  invite_resent:        { bg:'#dbeafe', color:'#1e40af' },
  project_created:      { bg:'#d1fae5', color:'#065f46' },
  project_updated:      { bg:'#dbeafe', color:'#1e40af' },
  project_deleted:      { bg:'#fee2e2', color:'#991b1b' },
  coordinator_assigned: { bg:'#fef3c7', color:'#92400e' },
  coordinator_removed:  { bg:'#fee2e2', color:'#991b1b' },
  department_deleted:   { bg:'#fee2e2', color:'#991b1b' },
  designation_deleted:  { bg:'#fee2e2', color:'#991b1b' },
  location_deleted:     { bg:'#fee2e2', color:'#991b1b' },
};

const ACTION_ICON = {
  login:                '🔑',
  login_failed:         '🚫',
  password_changed:     '🔒',
  expense_created:      '📋',
  expense_updated:      '✏️',
  expense_submitted:    '📤',
  expense_approved:     '✅',
  expense_rejected:     '❌',
  employee_created:     '👤',
  employee_updated:     '✏️',
  employee_deleted:     '🗑️',
  user_created:         '🔐',
  user_role_changed:    '🔄',
  user_activated:       '✅',
  user_deactivated:     '🚫',
  user_deleted:         '🗑️',
  password_reset:       '🔑',
  invite_email_sent:    '✉️',
  invite_resent:        '✉️',
  project_created:      '🏗️',
  project_updated:      '✏️',
  project_deleted:      '🗑️',
  coordinator_assigned: '🏢',
  coordinator_removed:  '🏢',
  department_deleted:   '🗑️',
  designation_deleted:  '🗑️',
  location_deleted:     '🗑️',
};

const ROLE_COLORS = {
  admin: '#ef4444', hr: '#8b5cf6', accounts: '#3b82f6',
  coordinator: '#f59e0b', employee: '#10b981',
};

export default function AdminAuditLogs() {
  const [logs,     setLogs]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const LIMIT = 25;

  const [filters, setFilters] = useState({
    action:      '',
    entity_type: '',
    search:      '',
  });

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: LIMIT });
      if (filters.action)      params.set('action',      filters.action);
      if (filters.entity_type) params.set('entity_type', filters.entity_type);
      if (filters.search)      params.set('search',      filters.search);

      const { data } = await api.get(`/admin/audit-logs?${params}`);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(pg);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.ceil(total / LIMIT);

  const sf = (field) => (e) => setFilters(p => ({ ...p, [field]: e.target.value }));

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ limit: 10000 });
      if (filters.action)      params.set('action',      filters.action);
      if (filters.entity_type) params.set('entity_type', filters.entity_type);
      if (filters.search)      params.set('search',      filters.search);

      const resp = await fetch(`/api/admin/audit-logs/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `audit_log_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>📜 Audit Logs</h2>
          <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:4 }}>
            Full history of all actions taken in the system. {total > 0 && <span><strong>{total}</strong> total entries.</span>}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={handleExport}>📊 Export CSV</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding:12, marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:10 }}>
          <select className="form-select" value={filters.action} onChange={sf('action')}>
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="form-select" value={filters.entity_type} onChange={sf('entity_type')}>
            {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input className="form-control"
            placeholder="🔍 Search by actor name, entity, or description…"
            value={filters.search}
            onChange={sf('search')}
          />
        </div>
      </div>

      {/* Log table */}
      <div className="card" style={{ padding:0 }}>
        {loading ? (
          <div className="loading-wrap"><div className="spinner"/></div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📜</div>
            <p>No audit log entries found.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width:150 }}>Date & Time</th>
                  <th style={{ width:150 }}>Actor</th>
                  <th style={{ width:160 }}>Action</th>
                  <th style={{ width:100 }}>Entity</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const colors = ACTION_COLORS[log.action] || { bg:'#f1f5f9', color:'#475569' };
                  const roleColor = ROLE_COLORS[log.actor_role] || '#94a3b8';
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize:11, color:'var(--gray-400)', whiteSpace:'nowrap' }}>
                        {new Date(log.action_time).toLocaleString('en-IN', {
                          day:'2-digit', month:'short', year:'numeric',
                          hour:'2-digit', minute:'2-digit', hour12:true,
                        })}
                      </td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{log.actor_name || '—'}</div>
                        {log.actor_role && (
                          <span style={{
                            fontSize:10, fontWeight:700, textTransform:'uppercase',
                            padding:'1px 7px', borderRadius:10,
                            background: roleColor+'22', color: roleColor,
                          }}>
                            {log.actor_role}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          display:'inline-flex', alignItems:'center', gap:5,
                          padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600,
                          background: colors.bg, color: colors.color,
                        }}>
                          <span>{ACTION_ICON[log.action] || '⚙️'}</span>
                          {log.action.replace(/_/g,' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--gray-500)', textTransform:'capitalize' }}>
                          {log.entity_type}
                        </div>
                        {log.entity_id && (
                          <div style={{ fontSize:11, color:'var(--gray-300)', fontFamily:'var(--mono)' }}>
                            #{log.entity_id}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize:13, color:'var(--gray-700)' }}>
                          {log.description || log.entity_label || '—'}
                        </div>
                        {log.ip_address && (
                          <div style={{ fontSize:10, color:'var(--gray-300)', marginTop:2, fontFamily:'var(--mono)' }}>
                            IP: {log.ip_address}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--gray-100)' }}>
            <div style={{ fontSize:12, color:'var(--gray-400)' }}>
              Page {page} of {totalPages} — {total} entries
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1}
                onClick={() => load(page - 1)}>← Prev</button>
              {/* Show nearby pages */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, page - 2) + i;
                if (pg > totalPages) return null;
                return (
                  <button key={pg}
                    className={`btn btn-sm ${pg === page ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => load(pg)}>{pg}</button>
                );
              })}
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages}
                onClick={() => load(page + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
