import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast, useDialog } from '../context/UIContext';
import { formatINR, formatDate, statusLabel } from '../utils/helpers';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

function canActionStatus(status, role) {
  if (role === 'coordinator') return status === 'pending';
  if (role === 'hr')          return status === 'coordinator_approved';
  if (role === 'accounts')    return status === 'hr_approved';
  return false;
}

const ALL_STATUSES = [
  'draft','pending','coordinator_approved','coordinator_rejected',
  'hr_approved','hr_rejected','accounts_approved','accounts_rejected'
];

export default function ExpenseListPage() {
  const { user } = useAuth();
  const role = user?.role;
  const { error: toastError } = useToast();
  const { confirm } = useDialog();

  const showAllTab = ['coordinator','hr','accounts','admin'].includes(role);

  const [activeTab,    setActiveTab]    = useState('mine');
  const [myExp,        setMyExp]        = useState([]);
  const [allExp,       setAllExp]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loadError,    setLoadError]    = useState('');  // renamed to avoid conflict

  const load = async () => {
    setLoading(true); setLoadError('');
    try {
      const { data } = await api.get('/expenses');
      setMyExp(data.filter(e => e.emp_id === user.emp_id));
      setAllExp(data.filter(e => e.emp_id !== user.emp_id));
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load expenses.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    const ok = await confirm({
      title:        'Delete Draft Expense',
      message:      'Delete this draft expense?',
      details:      'This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel:  'Cancel',
      variant:      'danger',
    });
    if (!ok) return;
    try { await api.delete(`/expenses/${id}`); load(); }
    catch (err) { toastError(err.response?.data?.message || 'Delete failed.'); }
  };

  const applyFilter = (list) => {
    let out = list;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(e =>
        e.employee_name?.toLowerCase().includes(q) ||
        e.project_name?.toLowerCase().includes(q)  ||
        e.project_code?.toLowerCase().includes(q)  ||
        String(e.expense_id).includes(q)
      );
    }
    if (statusFilter) out = out.filter(e => e.status === statusFilter);
    return out;
  };

  const displayList = applyFilter(activeTab === 'mine' ? myExp : allExp);

  const allTabHint = {
    coordinator: 'Expenses from your department awaiting your review.',
    hr:          'Coordinator-approved expenses awaiting your review.',
    accounts:    'HR-approved expenses awaiting your final approval.',
    admin:       'All expenses (view only — admin cannot approve or reject).',
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>📋 Expenses</h2>
        <div style={{ display:'flex', gap:8 }}>
          {['coordinator','hr','accounts','admin'].includes(role) && (
            <button
              className="btn btn-ghost"
              title="Export all visible expenses to CSV"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const resp  = await fetch('/api/expenses/export/csv', {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (!resp.ok) { toastError('Export failed. Please try again.'); return; }
                  const blob = await resp.blob();
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href     = url;
                  a.download = `expenses_export_${Date.now()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch { toastError('Export failed.'); }
              }}
            >
              📊 Export CSV
            </button>
          )}
          <Link to="/expenses/new" className="btn btn-amber">➕ New Expense</Link>
        </div>
      </div>

      {loadError && <div className="alert alert-danger">⚠️ {loadError}</div>}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid var(--gray-100)' }}>
        {['mine', ...(showAllTab ? ['all'] : [])].map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setSearch(''); setStatusFilter(''); }}
            style={{
              padding:'10px 20px', border:'none', cursor:'pointer', background:'transparent',
              fontFamily:'var(--font)', fontSize:14,
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--navy)' : 'var(--gray-400)',
              borderBottom: activeTab === tab ? '3px solid var(--navy)' : '3px solid transparent',
              marginBottom:-2, transition:'all .15s',
            }}>
            {tab === 'mine' ? 'My Expenses' : 'All Expenses'}
            <span style={{
              marginLeft:8, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
              background: activeTab === tab ? 'var(--navy)' : 'var(--gray-100)',
              color: activeTab === tab ? 'white' : 'var(--gray-400)',
            }}>
              {tab === 'mine' ? myExp.length : allExp.length}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'all' && (
        <div className="alert alert-info" style={{ marginBottom:16 }}>ℹ️ {allTabHint[role] || ''}</div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding:12, marginBottom:12 }}>
        <div className="grid-2">
          <input className="form-control"
            placeholder={activeTab==='mine' ? '🔍 Search by project, ID…' : '🔍 Search by employee, project…'}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0 }}>
        {loading ? (
          <div className="loading-wrap"><div className="spinner"/></div>
        ) : displayList.length === 0 ? (
          <div className="empty-state">
            <div className="icon">{activeTab==='mine' ? '📭' : '📋'}</div>
            <p>{activeTab==='mine'
              ? <><Link to="/expenses/new">Create your first expense →</Link></>
              : 'No expenses to review right now.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  {activeTab==='all' && <th>Employee</th>}
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map(e => (
                  <tr key={e.expense_id}>
                    <td><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--gray-400)' }}>#{e.expense_id}</span></td>
                    {activeTab==='all' && (
                      <td>
                        <div style={{ fontWeight:600 }}>{e.employee_name}</div>
                        <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.emp_code} · {e.department_name||'—'}</div>
                      </td>
                    )}
                    <td>
                      <div style={{ fontWeight:500 }}>{e.project_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.project_code}</div>
                    </td>
                    <td><span className="amount-text">{formatINR(e.claim_amount)}</span></td>
                    <td>
                      <StatusBadge status={e.status}/>
                      {e.status.includes('rejected') && activeTab==='mine' && (
                        <div style={{ fontSize:11, color:'var(--danger)', marginTop:3 }}>↩ Needs resubmission</div>
                      )}
                    </td>
                    <td style={{ color:'var(--gray-400)', fontSize:12 }}>{formatDate(e.submitted_at||e.created_at)}</td>
                    <td>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <Link to={`/expenses/${e.expense_id}`} className="btn btn-ghost btn-sm">View</Link>
                        {activeTab==='mine' && ['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(e.status) && (
                          <Link to={`/expenses/${e.expense_id}/edit`} className="btn btn-primary btn-sm">Edit</Link>
                        )}
                        {activeTab==='mine' && e.status==='draft' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e.expense_id)}>Delete</button>
                        )}
                        {activeTab==='all' && canActionStatus(e.status, role) && (
                          <Link to={`/expenses/${e.expense_id}`} className="btn btn-amber btn-sm">Review</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding:'10px 16px', fontSize:12, color:'var(--gray-400)', borderTop:'1px solid var(--gray-100)', display:'flex', justifyContent:'space-between' }}>
          <span>Showing {displayList.length} expense{displayList.length!==1?'s':''}</span>
          {activeTab==='all' && role==='coordinator' && <span>💡 Only your assigned department's expenses</span>}
        </div>
      </div>
    </div>
  );
}
