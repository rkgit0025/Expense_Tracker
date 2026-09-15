import React, { useState, useRef, useEffect } from 'react';
import api from '../../api/axios';
import { formatINR, calcDays } from '../../utils/helpers';

const MODES = ['Bike', 'Auto', 'Taxi', 'Bus', 'Train', 'Flight', 'Metro', 'Cab', 'Own Bike', 'Own Car', 'Own Vehicle', 'Other'];
const VEHICLE_MODES = ['Own Bike', 'Own Car']; // mutually exclusive with each other; km × rate replaces Amount for these

const today = new Date().toISOString().split('T')[0]; // block future dates

const emptyRow = () => ({
  from_date: '', to_date: '', from_location: '', to_location: '', mode_of_travel: 'Taxi', amount: '', no_of_days: 0, total_amount: 0, remarks: '', is_per_day: true,
  no_of_km: '', rate_per_km: 0,
});

// Splits a stored "Cab + Train" style string back into an array of modes.
const parseModes = (val) => (val ? val.split('+').map(s => s.trim()).filter(Boolean) : []);

// If any of the selected modes is Own Bike/Own Car, returns which one —
// there's at most one, since the picker below won't let both be checked
// together (they're two ways of describing the same "own vehicle" leg).
const getVehicleMode = (val) => parseModes(val).find(m => VEHICLE_MODES.includes(m)) || null;

// Dropdown that shows a checkbox list so more than one mode can be picked.
// Selected modes are joined back into a single "Cab + Train" style string,
// so the value stored on the row (mode_of_travel) stays a plain string and
// nothing else in the app (backend, PDF export, view page) needs to change.
function ModeOfTravelSelect({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = parseModes(value);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleMode = (mode) => {
    let next;
    if (selected.includes(mode)) {
      next = selected.filter(m => m !== mode);
    } else if (VEHICLE_MODES.includes(mode)) {
      // Own Bike / Own Car fully replace whatever else was selected — the
      // km × rate calculation is specifically for an own-vehicle leg, so
      // mixing it with any other mode on the same entry doesn't apply.
      next = [mode];
    } else {
      // Picking any regular mode while a vehicle mode is active drops the
      // vehicle mode, same direction as above — the two are mutually
      // exclusive with everything, not just with each other.
      next = [...selected.filter(m => !VEHICLE_MODES.includes(m)), mode];
    }
    onChange(next.join(' + '));
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="form-select"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? 'var(--gray-50, #f5f5f5)' : 'white' }}
      >
        {selected.length > 0 ? selected.join(' + ') : 'Select mode(s)'}
      </button>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, minWidth: '100%',
            background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: '6px 0', maxHeight: '220px', overflowY: 'auto'
          }}
        >
          {MODES.map(m => (
            <label
              key={m}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '14px', fontWeight: 400 }}
            >
              <input
                type="checkbox"
                checked={selected.includes(m)}
                onChange={() => toggleMode(m)}
              />
              {m}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Section3_TravelEntries({ rows, onChange, readOnly }) {
  const [vehicleRates, setVehicleRates] = useState({ 'Own Bike': 0, 'Own Car': 0 });

  useEffect(() => {
    api.get('/allowances/vehicle-rates').then(r => setVehicleRates(r.data)).catch(() => {});
  }, []);

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

      const oldVehicleMode = getVehicleMode(r.mode_of_travel);
      const newVehicleMode = getVehicleMode(updated.mode_of_travel);

      // Just switched TO a vehicle mode, or between Own Bike ↔ Own Car —
      // refresh the suggested rate from the admin-configured flat rate.
      // Still fully editable afterward, same as Spl-Approval's rate in the
      // Daily Allowance section.
      if (field === 'mode_of_travel' && newVehicleMode && newVehicleMode !== oldVehicleMode) {
        updated.rate_per_km = vehicleRates[newVehicleMode] || 0;
      }

      if (newVehicleMode) {
        // Own Bike / Own Car: amount is fully driven by km × rate — the
        // regular Amount field and "Calculate per day" toggle don't apply.
        const km   = parseFloat(field === 'no_of_km'    ? val : updated.no_of_km)    || 0;
        const rate = parseFloat(field === 'rate_per_km' ? val : updated.rate_per_km) || 0;
        updated.total_amount = km * rate;
        updated.amount = updated.total_amount;
      } else {
        // Recalculate total_amount. When "Calculate per day" is checked
        // (the default — matches all prior behaviour), total = days × amount.
        // When unchecked, the amount typed is already the flat/total amount
        // for the entry, so it's used as-is regardless of how many days.
        const days     = updated.no_of_days || 0;
        const amount   = parseFloat(field === 'amount' ? val : updated.amount) || 0;
        const isPerDay = updated.is_per_day !== false;
        updated.total_amount = (isPerDay && days > 0) ? days * amount : amount;
      }
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

      {rows.map((row, idx) => {
        const vehicleMode = getVehicleMode(row.mode_of_travel);
        return (
        <div key={idx} className="multi-row-item" style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)', marginBottom: '8px' }}>
          <div className="multi-row-header">
            <span>Travel Entry {idx + 1}</span>
            {!readOnly && rows.length > 1 && (
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => delRow(idx)}>✕</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Date <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
              <input type="date" className="form-control" value={row.from_date} disabled={readOnly}
                max={row.to_date && row.to_date < today ? row.to_date : today}
                required onChange={e => update(idx, 'from_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Date <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
              <input type="date" className="form-control" value={row.to_date} disabled={readOnly}
                min={row.from_date} max={today} required onChange={e => update(idx, 'to_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Location <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
              <input type="text" className="form-control" placeholder="e.g. Mumbai" value={row.from_location} disabled={readOnly}
                required onChange={e => update(idx, 'from_location', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Location <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
              <input type="text" className="form-control" placeholder="e.g. Pune" value={row.to_location} disabled={readOnly}
                required onChange={e => update(idx, 'to_location', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mode of Travel</label>
              <ModeOfTravelSelect
                value={row.mode_of_travel}
                disabled={readOnly}
                onChange={val => update(idx, 'mode_of_travel', val)}
              />
            </div>

            {vehicleMode ? (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Number of Kilometers <span style={{ color: 'var(--danger, #dc2626)' }}>*</span></label>
                  <input type="number" className="form-control" placeholder="0" min="0" step="0.1"
                    value={row.no_of_km} disabled={readOnly}
                    onChange={e => update(idx, 'no_of_km', e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">
                    Rate / Kilometer (₹)
                    {!readOnly && <span style={{ fontSize: '10px', color: 'var(--amber)', marginLeft: '6px', fontWeight: 600 }}>✎ Editable</span>}
                  </label>
                  <input type="number" className="form-control" min="0" step="0.01"
                    value={row.rate_per_km} disabled={readOnly}
                    onChange={e => update(idx, 'rate_per_km', e.target.value)}
                    style={{ borderColor: 'var(--amber)', background: '#fffbf0' }} />
                </div>
              </>
            ) : (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{row.is_per_day === false ? 'Amount (₹)' : 'Amount / Day (₹)'}</label>
                <input type="number" className="form-control" placeholder="0.00" min="0" step="0.01"
                  value={row.amount} disabled={readOnly}
                  onChange={e => update(idx, 'amount', e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', fontWeight: 400, color: 'var(--gray-500, #6b7280)', cursor: readOnly ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={row.is_per_day !== false}
                    disabled={readOnly}
                    onChange={e => update(idx, 'is_per_day', e.target.checked)}
                  />
                  Calculate per day (days × amount)
                </label>
              </div>
            )}

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
            <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
              <label className="form-label">Remarks</label>
              <input type="text" className="form-control" placeholder="Any notes about this travel (optional)"
                value={row.remarks || ''} disabled={readOnly}
                onChange={e => update(idx, 'remarks', e.target.value)} />
            </div>
          </div>
        </div>
        );
      })}

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
