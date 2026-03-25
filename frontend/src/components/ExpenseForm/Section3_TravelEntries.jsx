import React from 'react';
import { formatINR, calcDays } from '../../utils/helpers';

const MODES = ['Bike', 'Auto', 'Taxi', 'Bus', 'Train', 'Flight', 'Own Vehicle', 'Other'];

const today = new Date().toISOString().split('T')[0]; // block future dates

const emptyRow = () => ({
  from_date: '', to_date: '', from_location: '', to_location: '', mode_of_travel: 'Taxi', amount: '', no_of_days: 0, total_amount: 0
});

export default function Section3_TravelEntries({ rows, onChange, readOnly }) {
  const update = (idx, field, val) => {
    onChange(rows.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: val };
      // Recalculate days when dates change
      if (field === 'from_date' || field === 'to_date') {
        updated.no_of_days = calcDays(
          field === 'from_date' ? val : r.from_date,
          field === 'to_date'   ? val : r.to_date
        );
      }
      // Recalculate total_amount = days * amount_per_day
      const days   = updated.no_of_days  || 0;
      const amount = parseFloat(field === 'amount' ? val : updated.amount) || 0;
      updated.total_amount = days > 0 ? days * amount : amount;
      return updated;
    }));
  };
  const addRow = () => onChange([...rows, emptyRow()]);
  const delRow = (idx) => onChange(rows.filter((_, i) => i !== idx));
  const total  = rows.reduce((s, r) => s + (parseFloat(r.total_amount ?? r.amount) || 0), 0);

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">3</div>
        <span className="card-title">Travel Entries</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--navy)' }}>
          Total: {formatINR(total)}
        </span>
      </div>

      {rows.map((row, idx) => (
        <div key={idx} className="multi-row-item" style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)', marginBottom: '8px' }}>
          <div className="multi-row-header">
            <span>Travel Entry {idx + 1}</span>
            {!readOnly && rows.length > 1 && (
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => delRow(idx)}>✕</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Date</label>
              <input type="date" className="form-control" value={row.from_date} disabled={readOnly} max={today}
                onChange={e => update(idx, 'from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Date</label>
              <input type="date" className="form-control" value={row.to_date} disabled={readOnly}
                min={row.from_date} max={today} onChange={e => update(idx, 'to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Location</label>
              <input type="text" className="form-control" placeholder="e.g. Mumbai" value={row.from_location} disabled={readOnly}
                onChange={e => update(idx, 'from_location', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Location</label>
              <input type="text" className="form-control" placeholder="e.g. Pune" value={row.to_location} disabled={readOnly}
                onChange={e => update(idx, 'to_location', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mode of Travel</label>
              <select className="form-select" value={row.mode_of_travel} disabled={readOnly}
                onChange={e => update(idx, 'mode_of_travel', e.target.value)}>
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Amount / Day (₹)</label>
              <input type="number" className="form-control" placeholder="0.00" min="0" step="0.01"
                value={row.amount} disabled={readOnly}
                onChange={e => update(idx, 'amount', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">No. of Days</label>
              <input className="form-control readonly-styled" readOnly
                value={row.no_of_days > 0 ? row.no_of_days : (row.from_date ? 1 : 0)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Total Amount (₹)</label>
              <input className="form-control readonly-styled" readOnly
                value={formatINR(row.total_amount ?? row.amount)}
                style={{ fontWeight: 700, color: 'var(--navy)' }} />
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <button className="add-row-btn" onClick={addRow}>＋ Add Travel Entry</button>
      )}

      {rows.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: '12px', fontWeight: 600, color: 'var(--navy)' }}>
          Travel Total: <span className="amount-text">{formatINR(total)}</span>
        </div>
      )}
    </div>
  );
}
