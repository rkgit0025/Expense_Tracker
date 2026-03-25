import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { calcDays, formatINR } from '../../utils/helpers';

const today = new Date().toISOString().split('T')[0]; // No future dates allowed
const SCOPES = ['DA-Metro', 'DA-Non-Metro', 'Site-Allowance'];
const SCOPE_LABELS = { 'DA-Metro': 'DA – Metro', 'DA-Non-Metro': 'DA – Non-Metro', 'Site-Allowance': 'Site Allowance' };

function emptyRow() {
  return { from_date: '', to_date: '', scope: 'DA-Metro', no_of_days: 0, amount_per_day: 0, total_amount: 0 };
}

function AllowanceSubSection({ title, letter, rows, onChange, readOnly, rateMap }) {
  const update = (idx, field, value) => {
    const next = rows.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // Auto-calculate days
      if (field === 'from_date' || field === 'to_date') {
        updated.no_of_days = calcDays(
          field === 'from_date' ? value : r.from_date,
          field === 'to_date'   ? value : r.to_date
        );
      }
      // Auto-calculate rate from backend (skip if Site-Allowance and manually editing amount)
      if (field === 'scope' || field === 'from_date' || field === 'to_date') {
        const scope = field === 'scope' ? value : updated.scope;
        if (scope !== 'Site-Allowance') {
          updated.amount_per_day = rateMap[scope] || 0;
        } else if (field === 'scope') {
          // When switching TO Site-Allowance, pre-fill with the rate but allow override
          updated.amount_per_day = rateMap['Site-Allowance'] || 0;
        }
      }
      if (field === 'amount_per_day') {
        updated.amount_per_day = parseFloat(value) || 0;
      }
      updated.total_amount = (updated.no_of_days || 0) * (updated.amount_per_day || 0);
      return updated;
    });
    onChange(next);
  };

  const addRow  = () => onChange([...rows, emptyRow()]);
  const delRow  = (idx) => onChange(rows.filter((_, i) => i !== idx));

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '10px', padding: '8px 12px',
        background: 'var(--gray-50)', borderRadius: 'var(--radius)',
        borderLeft: '3px solid var(--navy)'
      }}>
        <span style={{
          width: '22px', height: '22px', background: 'var(--navy)', color: 'white',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, flexShrink: 0
        }}>{letter}</span>
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--navy)' }}>{title}</span>
      </div>

      {rows.map((row, idx) => (
        <div key={idx} className="multi-row-item" style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)', marginBottom: '8px' }}>
          <div className="multi-row-header">
            <span>Entry {idx + 1}</span>
            {!readOnly && rows.length > 1 && (
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => delRow(idx)} title="Remove">✕</button>
            )}
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Date</label>
              <input
                type="date" className="form-control"
                value={row.from_date} disabled={readOnly} max={today}
                onChange={e => update(idx, 'from_date', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Date</label>
              <input
                type="date" className="form-control"
                value={row.to_date} disabled={readOnly} max={today}
                min={row.from_date}
                onChange={e => update(idx, 'to_date', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Scope</label>
              <select
                className="form-select"
                value={row.scope} disabled={readOnly}
                onChange={e => update(idx, 'scope', e.target.value)}
              >
                {SCOPES.map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">No. of Days</label>
              <input className="form-control readonly-styled" readOnly value={row.no_of_days} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                Rate / Day (₹)
                {row.scope === 'Site-Allowance' && !readOnly && (
                  <span style={{ fontSize: '10px', color: 'var(--amber)', marginLeft: '6px', fontWeight: 600 }}>✎ Editable</span>
                )}
              </label>
              {row.scope === 'Site-Allowance' && !readOnly ? (
                <input
                  type="number" className="form-control" min="0" step="0.01"
                  value={row.amount_per_day || 0}
                  onChange={e => update(idx, 'amount_per_day', e.target.value)}
                  style={{ borderColor: 'var(--amber)', background: '#fffbf0' }}
                />
              ) : (
                <input className="form-control readonly-styled" readOnly value={row.amount_per_day || 0} />
              )}
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Total Amount (₹)</label>
              <input className="form-control readonly-styled" readOnly
                value={formatINR(row.total_amount)}
                style={{ fontWeight: 700, color: 'var(--navy)' }}
              />
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <button className="add-row-btn" onClick={addRow}>
          ＋ Add {title} Entry
        </button>
      )}
    </div>
  );
}

export default function Section2_DailyAllowance({ journey, returns, stay, onJourney, onReturns, onStay, readOnly }) {
  const [rateMap, setRateMap] = useState({});

  useEffect(() => {
    api.get('/allowances/my-rates')
      .then(r => setRateMap(r.data.rateMap || {}))
      .catch(() => {});
  }, []);

  // Grand totals
  const allRows  = [...(journey || []), ...(returns || []), ...(stay || [])];
  const total    = allRows.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);

  // Totals per scope
  const scopeTotals = {};
  SCOPES.forEach(s => {
    const scopeRows = allRows.filter(r => r.scope === s);
    const days      = scopeRows.reduce((a, r) => a + (parseInt(r.no_of_days) || 0), 0);
    const amount    = scopeRows.reduce((a, r) => a + (parseFloat(r.total_amount) || 0), 0);
    // For Site-Allowance: derive effective rate from actual row data (supports manual override)
    const effectiveRate = s === 'Site-Allowance'
      ? (days > 0 ? amount / days : (scopeRows[0]?.amount_per_day || rateMap[s] || 0))
      : rateMap[s] || 0;
    scopeTotals[s] = { days, amount, rate: effectiveRate };
  });

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">2</div>
        <span className="card-title">Daily Allowance (DA)</span>
      </div>

      <AllowanceSubSection
        title="Travel Journey" letter="A"
        rows={journey || [emptyRow()]}
        onChange={onJourney}
        readOnly={readOnly}
        rateMap={rateMap}
      />

      <AllowanceSubSection
        title="Return Journey" letter="B"
        rows={returns || [emptyRow()]}
        onChange={onReturns}
        readOnly={readOnly}
        rateMap={rateMap}
      />

      <AllowanceSubSection
        title="Stay Details" letter="C"
        rows={stay || [emptyRow()]}
        onChange={onStay}
        readOnly={readOnly}
        rateMap={rateMap}
      />

      {/* D: Allowance Scope Total */}
      <div style={{ marginTop: '20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '10px', padding: '8px 12px',
          background: 'var(--navy)', borderRadius: 'var(--radius)',
        }}>
          <span style={{
            width: '22px', height: '22px', background: 'var(--amber)', color: 'var(--navy-dark)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, flexShrink: 0
          }}>D</span>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'white' }}>Allowance Scope Total (Auto-Calculated)</span>
        </div>
        <div className="summary-table">
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Scope</th>
                  <th style={{ textAlign: 'right' }}>Total Days</th>
                  <th style={{ textAlign: 'right' }}>Rate / Day (₹)</th>
                  <th style={{ textAlign: 'right' }}>Total Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {SCOPES.map(s => (
                  <tr key={s}>
                    <td style={{ color: 'rgba(255,255,255,.9)' }}>{SCOPE_LABELS[s]}</td>
                    <td style={{ textAlign: 'right', color: 'rgba(255,255,255,.9)' }}>{scopeTotals[s].days}</td>
                    <td style={{ textAlign: 'right', color: 'rgba(255,255,255,.9)' }}>{formatINR(scopeTotals[s].rate)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'rgba(255,255,255,.9)' }}>
                      {formatINR(scopeTotals[s].amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700 }}>Grand Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {allRows.reduce((s, r) => s + (parseInt(r.no_of_days) || 0), 0)}
                  </td>
                  <td></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{formatINR(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
