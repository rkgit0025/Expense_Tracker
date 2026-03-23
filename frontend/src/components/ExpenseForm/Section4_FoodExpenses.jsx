import React from 'react';
import { formatINR } from '../../utils/helpers';

const today   = new Date().toISOString().split('T')[0]; // block future dates
const emptyRow = () => ({ from_date: '', to_date: '', sharing: 1, location: '', amount: '' });

export default function Section4_FoodExpenses({ rows, onChange, readOnly }) {
  const update = (idx, field, val) => onChange(rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  const addRow = () => onChange([...rows, emptyRow()]);
  const delRow = (idx) => onChange(rows.filter((_, i) => i !== idx));
  const total  = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">4</div>
        <span className="card-title">Food Expenses</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--navy)' }}>
          Total: {formatINR(total)}
        </span>
      </div>

      {rows.map((row, idx) => (
        <div key={idx} className="multi-row-item" style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)', marginBottom: '8px' }}>
          <div className="multi-row-header">
            <span>Food Entry {idx + 1}</span>
            {!readOnly && rows.length > 1 && (
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => delRow(idx)}>✕</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Date</label>
              <input type="date" className="form-control"
                value={row.from_date} disabled={readOnly}
                max={today}
                onChange={e => update(idx, 'from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Date</label>
              <input type="date" className="form-control"
                value={row.to_date} disabled={readOnly}
                min={row.from_date} max={today}
                onChange={e => update(idx, 'to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Sharing</label>
              <select className="form-select" value={row.sharing} disabled={readOnly}
                onChange={e => update(idx, 'sharing', parseInt(e.target.value))}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Person{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Location</label>
              <input type="text" className="form-control" placeholder="Restaurant / City"
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
        <button className="add-row-btn" onClick={addRow}>＋ Add Food Entry</button>
      )}
    </div>
  );
}
