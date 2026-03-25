import React from 'react';
import { formatINR } from '../../utils/helpers';

const today   = new Date().toISOString().split('T')[0]; // block future dates
const emptyRow = () => ({ expense_date: '', reason: '', location: '', amount: '' });

export default function Section6_MiscExpenses({ rows, onChange, readOnly }) {
  const update = (idx, field, val) => onChange(rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  const addRow = () => onChange([...rows, emptyRow()]);
  const delRow = (idx) => onChange(rows.filter((_, i) => i !== idx));
  const total  = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">6</div>
        <span className="card-title">Miscellaneous Expenses</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--navy)' }}>
          Total: {formatINR(total)}
        </span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 'var(--radius)',
        padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#7a5c00'
      }}>
        <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
        <span><strong>Note:</strong> Do not add part purchase for site on this section.</span>
      </div>

      {rows.map((row, idx) => (
        <div key={idx} className="multi-row-item" style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)', marginBottom: '8px' }}>
          <div className="multi-row-header">
            <span>Misc Entry {idx + 1}</span>
            {!readOnly && rows.length > 1 && (
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => delRow(idx)}>✕</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Date</label>
              <input type="date" className="form-control"
                value={row.expense_date} disabled={readOnly}
                max={today}
                onChange={e => update(idx, 'expense_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
              <label className="form-label">Reason / Description</label>
              <input type="text" className="form-control" placeholder="Describe the expense"
                value={row.reason} disabled={readOnly}
                onChange={e => update(idx, 'reason', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Location</label>
              <input type="text" className="form-control" placeholder="City / Location"
                value={row.location} disabled={readOnly}
                onChange={e => update(idx, 'location', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Amount (₹)</label>
              <input type="number" className="form-control" placeholder="0.00" min="0" step="0.01"
                value={row.amount} disabled={readOnly}
                onChange={e => update(idx, 'amount', e.target.value)} />
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <button className="add-row-btn" onClick={addRow}>＋ Add Miscellaneous Entry</button>
      )}
    </div>
  );
}
