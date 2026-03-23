import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/UIContext';
import { formatINR, formatDate, statusLabel, canApprove, nextStageLabel } from '../utils/helpers';
import Section7_Receipts from '../components/ExpenseForm/Section7_Receipts';
import TotalSummary from '../components/ExpenseForm/TotalSummary';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-100)', padding: '8px 0', gap: '12px' }}>
      <span style={{ width: '180px', flexShrink: 0, fontSize: '12px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{value || '—'}</span>
    </div>
  );
}

export default function ExpenseViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [acting, setActing]   = useState(false);
  const [error, setError]     = useState('');

  const load = async () => {
    try {
      const { data: d } = await api.get(`/expenses/${id}`);
      setData(d);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expense.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleAction = async (action) => {
    if (!comment.trim()) {
      setError(`A comment / reason is required to ${action} this expense.`);
      return;
    }
    setActing(true); setError('');
    try {
      await api.post(`/expenses/${id}/${action}`, { comment });
      await load();
      setComment('');
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>;
  if (!data)   return <div className="alert alert-danger">{error || 'Expense not found.'}</div>;

  const { form, journey, returns, stay, travel, food, hotel, misc, receipts, history } = data;

  // canAct: correct role for status AND not your own expense (you can never approve your own)
  const isOwnExpense = form.emp_id === user.emp_id;
  const canAct = canApprove(form.status, user.role) && !isOwnExpense;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy)' }}>
            Expense #{id}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <StatusBadge status={form.status} />
            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>→ {nextStageLabel(form.status)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/expenses')}>← Back</button>
          {['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(form.status) &&
           (form.emp_id === user.emp_id || user.role === 'admin') && (
            <Link to={`/expenses/${id}/edit`} className="btn btn-primary">✏️ Edit</Link>
          )}
          {/* PDF download — uses fetch with auth token */}
          <button
            className="btn btn-ghost"
            onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                const resp  = await fetch(`/api/expenses/${id}/pdf`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (!resp.ok) { toastError('PDF generation failed.'); return; }
                const blob = await resp.blob();
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url; a.download = `expense_${id}.pdf`; a.click();
                URL.revokeObjectURL(url);
              } catch { toastError('PDF download failed.'); }
            }}
          >
            📄 Download PDF
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* Approval action bar — only shown to non-owners with the correct role */}
      {canAct && (
        <div className="card" style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--amber)' }}>
          <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: '4px', fontSize: '15px' }}>
            ⚡ Action Required
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '14px' }}>
            {user.role === 'coordinator' && 'As coordinator, verify all expense details are correct before approving.'}
            {user.role === 'hr'          && 'Review this coordinator-approved expense before forwarding to Accounts.'}
            {user.role === 'accounts'    && 'Final review. Approving marks this expense as fully settled.'}
          </div>
          <div className="form-group">
            <label className="form-label">
              Your Review Comment <span className="required">*</span>
              <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '11px', color: 'var(--gray-400)', marginLeft: 6 }}>
                (required for both approve and reject)
              </span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Enter your review comment or reason for rejection..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              style={{ borderColor: comment.trim() ? 'var(--gray-200)' : 'var(--amber)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-success" disabled={acting || !comment.trim()} onClick={() => handleAction('approve')}>
              {acting ? '⏳ Processing...' : '✅ Approve Expense'}
            </button>
            <button className="btn btn-danger" disabled={acting || !comment.trim()} onClick={() => handleAction('reject')}>
              {acting ? '⏳ Processing...' : '❌ Reject & Return to Employee'}
            </button>
          </div>
          {!comment.trim() && (
            <div style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '10px', fontWeight: 500 }}>
              ⚠️ Enter a comment above to enable the action buttons.
            </div>
          )}
        </div>
      )}

      {/* Status messages for the expense owner */}
      {isOwnExpense && form.status === 'pending' && (
        <div className="alert alert-info">⏳ Your expense is <strong>awaiting coordinator approval</strong>.</div>
      )}
      {isOwnExpense && form.status === 'coordinator_approved' && (
        <div className="alert alert-info">⏳ Coordinator approved. Now <strong>awaiting HR review</strong>.</div>
      )}
      {isOwnExpense && form.status === 'hr_approved' && (
        <div className="alert alert-info">⏳ HR approved. Now <strong>awaiting Accounts final approval</strong>.</div>
      )}
      {isOwnExpense && form.status === 'accounts_approved' && (
        <div className="alert alert-success">🎉 Your expense has been <strong>fully approved!</strong></div>
      )}
      {isOwnExpense && form.status.includes('rejected') && (
        <div className="alert alert-danger">
          ❌ Your expense was <strong>rejected</strong>. Please review the comments below, then edit and resubmit.
        </div>
      )}
      {user.role === 'admin' && (
        <div className="alert alert-warning">
          ℹ️ You are viewing as <strong>Admin</strong>. Admins can view all expenses but cannot approve or reject.
        </div>
      )}

      {/* Project + Employee info */}
      <div className="card">
        <div className="card-header">
          <div className="section-number">1</div>
          <span className="card-title">Project &amp; Employee Details</span>
        </div>
        <div className="grid-2">
          <div>
            <InfoRow label="Employee"       value={form.employee_name} />
            <InfoRow label="Employee Code"  value={form.emp_code} />
            <InfoRow label="Designation"    value={form.designation_name} />
            <InfoRow label="Department"     value={form.department_name} />
          </div>
          <div>
            <InfoRow label="Project Code"   value={form.project_code} />
            <InfoRow label="Project Name"   value={form.project_name} />
            <InfoRow label="Site Location"  value={form.site_location} />
            <InfoRow label="Coordinator/HOD" value={form.project_coordinator_hod} />
          </div>
        </div>
      </div>

      {/* DA tables */}
      {([['Travel Journey', journey], ['Return Journey', returns], ['Stay Details', stay]]).map(([title, rows]) =>
        rows?.length > 0 && (
          <div className="card" key={title}>
            <div className="card-header">
              <div className="section-number">2</div>
              <span className="card-title">{title}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>From</th><th>To</th><th>Scope</th><th>Days</th><th>Rate/Day</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{formatDate(r.from_date)}</td>
                      <td>{formatDate(r.to_date)}</td>
                      <td>{r.scope}</td>
                      <td>{r.no_of_days}</td>
                      <td>{formatINR(r.amount_per_day)}</td>
                      <td style={{ textAlign: 'right' }} className="amount-text">{formatINR(r.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Travel entries */}
      {travel?.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="section-number">3</div><span className="card-title">Travel Entries</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>To</th><th>From Location</th><th>To Location</th><th>Mode</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {travel.map((r, i) => (
                  <tr key={i}>
                    <td>{formatDate(r.from_date)}</td><td>{formatDate(r.to_date)}</td>
                    <td>{r.from_location}</td><td>{r.to_location}</td><td>{r.mode_of_travel}</td>
                    <td style={{ textAlign: 'right' }} className="amount-text">{formatINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Food */}
      {food?.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="section-number">4</div><span className="card-title">Food Expenses</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>To</th><th>Sharing</th><th>Location</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>{food.map((r,i) => <tr key={i}><td>{formatDate(r.from_date)}</td><td>{formatDate(r.to_date)}</td><td>{r.sharing}</td><td>{r.location}</td><td style={{textAlign:'right'}} className="amount-text">{formatINR(r.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hotel */}
      {hotel?.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="section-number">5</div><span className="card-title">Hotel Expenses</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Check-in</th><th>Check-out</th><th>Sharing</th><th>Location</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>{hotel.map((r,i) => <tr key={i}><td>{formatDate(r.from_date)}</td><td>{formatDate(r.to_date)}</td><td>{r.sharing}</td><td>{r.location}</td><td style={{textAlign:'right'}} className="amount-text">{formatINR(r.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Misc */}
      {misc?.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="section-number">6</div><span className="card-title">Miscellaneous Expenses</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Reason</th><th>Location</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>{misc.map((r,i) => <tr key={i}><td>{formatDate(r.expense_date)}</td><td>{r.reason}</td><td>{r.location}</td><td style={{textAlign:'right'}} className="amount-text">{formatINR(r.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Total */}
      <TotalSummary journey={journey} returns={returns} stay={stay}
        travel={travel} food={food} hotel={hotel} misc={misc} />

      {/* Receipts */}
      <Section7_Receipts expenseId={parseInt(id)} receipts={receipts} onRefresh={load} readOnly={true}
        sectionData={{ travel, food, hotel, misc }} />

      {/* Approval trail */}
      {(form.coordinator_comment || form.hr_comment || form.accounts_comment) && (
        <div className="card">
          <div className="card-header"><span style={{ fontSize: '18px' }}>💬</span><span className="card-title">Review Comments</span></div>
          {form.coordinator_comment && <InfoRow label="Coordinator" value={form.coordinator_comment} />}
          {form.hr_comment          && <InfoRow label="HR"          value={form.hr_comment} />}
          {form.accounts_comment    && <InfoRow label="Accounts"    value={form.accounts_comment} />}
        </div>
      )}

      {/* History */}
      {history?.length > 0 && (
        <div className="card">
          <div className="card-header"><span style={{ fontSize: '18px' }}>🕐</span><span className="card-title">Approval History</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Action</th><th>By</th><th>From</th><th>To</th><th>Comment</th><th>Date</th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.history_id}>
                    <td><span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{h.action}</span></td>
                    <td>{h.action_by_name}</td>
                    <td><StatusBadge status={h.previous_status} /></td>
                    <td><StatusBadge status={h.new_status} /></td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.comment || '—'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{formatDate(h.action_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
