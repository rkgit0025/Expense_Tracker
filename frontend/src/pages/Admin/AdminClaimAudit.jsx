import React, { useState } from 'react';
import api from '../../api/axios';
import { useToast, useDialog } from '../../context/UIContext';
import { formatINR, statusLabel } from '../../utils/helpers';

export default function AdminClaimAudit() {
  const { success, error } = useToast();
  const { confirm } = useDialog();
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing]     = useState(false);
  const [result, setResult]     = useState(null); // { total_checked, mismatches_found, mismatches }
  const [fixedIds, setFixedIds] = useState(new Set());

  const runCheck = async () => {
    setChecking(true);
    setResult(null);
    setFixedIds(new Set());
    try {
      const { data } = await api.get('/admin/claim-amount-check');
      setResult(data);
      if (data.mismatches_found === 0) success('All good — every claim amount matches its line items.');
    } catch (err) {
      error(err.response?.data?.message || 'Check failed.');
    } finally {
      setChecking(false);
    }
  };

  const fixOne = async (expenseId) => {
    const ok = await confirm({
      title:        `Fix Expense #${expenseId}?`,
      message:      'This will update the stored claim amount to match its actual line items.',
      confirmLabel: 'Fix It',
      cancelLabel:  'Cancel',
      variant:      'primary',
    });
    if (!ok) return;
    await applyFix([expenseId]);
  };

  const fixAll = async () => {
    if (!result?.mismatches?.length) return;
    const ok = await confirm({
      title:        `Fix All ${result.mismatches.length} Expense(s)?`,
      message:      'This will update the stored claim amount for every expense listed below to match its actual line items. This cannot be undone automatically — consider taking a database backup first.',
      confirmLabel: `Fix All ${result.mismatches.length}`,
      cancelLabel:  'Cancel',
      variant:      'primary',
    });
    if (!ok) return;
    await applyFix(result.mismatches.map(m => m.expense_id));
  };

  const applyFix = async (ids) => {
    setFixing(true);
    try {
      const { data } = await api.post('/admin/claim-amount-check/fix', { expense_ids: ids });
      setFixedIds(prev => new Set([...prev, ...data.fixed.map(f => f.expense_id)]));
      success(`Fixed ${data.fixed_count} expense${data.fixed_count === 1 ? '' : 's'}.`);
    } catch (err) {
      error(err.response?.data?.message || 'Fix failed.');
    } finally {
      setFixing(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>🧮 Claim Amount Check</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
          Finds expenses whose stored total doesn't match what their Daily Allowance, Travel, Food,
          Hotel, and Miscellaneous entries actually add up to, and lets you correct them.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span style={{ fontSize: 20 }}>🔍</span>
          <span className="card-title">Run a Check</span>
        </div>

        <p style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 16 }}>
          This is read-only until you explicitly choose to fix something — running a check never
          changes any data by itself.
        </p>

        <button className="btn btn-amber" onClick={runCheck} disabled={checking}>
          {checking ? '⏳ Checking every expense…' : '🔍 Run Check'}
        </button>

        {result && (
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--gray-500)' }}>
            Checked {result.total_checked} expense{result.total_checked === 1 ? '' : 's'} —{' '}
            {result.mismatches_found === 0
              ? <strong style={{ color: 'var(--success)' }}>no discrepancies found.</strong>
              : <strong style={{ color: 'var(--amber)' }}>{result.mismatches_found} discrepanc{result.mismatches_found === 1 ? 'y' : 'ies'} found.</strong>}
          </div>
        )}
      </div>

      {result?.mismatches?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span className="card-title">Discrepancies Found</span>
            <button
              className="btn btn-amber btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={fixAll}
              disabled={fixing || fixedIds.size === result.mismatches.length}
            >
              {fixing ? '⏳ Fixing…' : `Fix All ${result.mismatches.length}`}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Employee</th><th>Status</th>
                  <th style={{ textAlign: 'right' }}>Stored</th>
                  <th style={{ textAlign: 'right' }}>Correct</th>
                  <th style={{ textAlign: 'right' }}>Difference</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {result.mismatches.map(m => {
                  const done = fixedIds.has(m.expense_id);
                  return (
                    <tr key={m.expense_id} style={{ opacity: done ? 0.5 : 1 }}>
                      <td>#{m.expense_id}</td>
                      <td>{m.employee_name} <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>({m.emp_code})</span></td>
                      <td>{statusLabel(m.status)}</td>
                      <td style={{ textAlign: 'right' }}>{formatINR(m.stored_amount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatINR(m.correct_amount)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--amber)' }}>
                        {m.difference > 0 ? '+' : ''}{formatINR(m.difference)}
                      </td>
                      <td>
                        {done ? (
                          <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>✓ Fixed</span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => fixOne(m.expense_id)} disabled={fixing}>
                            Fix
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
