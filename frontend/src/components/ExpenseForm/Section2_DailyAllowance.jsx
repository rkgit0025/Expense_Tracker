import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { calcDays, formatINR } from '../../utils/helpers';

const today = new Date().toISOString().split('T')[0]; // No future dates allowed
const SCOPES = ['DA-Metro', 'DA-Non-Metro', 'Site-Allowance'];
const SCOPE_LABELS = { 'DA-Metro': 'DA – Metro', 'DA-Non-Metro': 'DA – Non-Metro', 'Site-Allowance': 'Site Allowance' };
// Tie-break order when two entries in different sections start on the exact
// same date — reflects the usual chronological shape of a business trip:
// travel out, then stay, then travel back.
const SECTION_PRIORITY = { journey: 0, stay: 1, returns: 2 };

function emptyRow() {
  return { from_date: '', to_date: '', from_location: '', to_location: '', scope: 'DA-Metro', no_of_days: 0, amount_per_day: 0, total_amount: 0 };
}

// Compact display for a 'YYYY-MM-DD' string, e.g. '2026-07-09' -> '9 Jul'
function formatShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Expand a from/to date range into an array of 'YYYY-MM-DD' calendar-day
// strings (inclusive). Pure UTC-timestamp arithmetic — matches how calcDays()
// already computes day counts, so the two never disagree.
function expandDays(fromDate, toDate) {
  if (!fromDate || !toDate) return [];
  const f = new Date(fromDate);
  const t = new Date(toDate);
  if (isNaN(f) || isNaN(t) || t < f) return [];
  const totalDays = Math.floor((t - f) / 86400000) + 1;
  const out = [];
  for (let i = 0; i < totalDays; i++) {
    out.push(new Date(f.getTime() + i * 86400000).toISOString().split('T')[0]);
  }
  return out;
}

// Recompute no_of_days / total_amount across ALL DA entries in the claim —
// Journey (A), Return (B), and Stay (C) combined — so a calendar day already
// billed by one entry is never billed again by another, regardless of which
// of the three sections it's in. Example: an onward journey ending 2-Jul and
// a return journey starting 2-Jul only bills 2-Jul once, not twice. Entries
// are resolved in chronological (from_date) order, not the order they were
// typed in or which section they happen to sit in.
function recalcGlobalOverlap(journeyRows, returnRows, stayRows) {
  const tagged = [
    ...journeyRows.map((r, i) => ({ r, section: 'journey', i })),
    ...stayRows.map((r, i)    => ({ r, section: 'stay',    i })),
    ...returnRows.map((r, i)  => ({ r, section: 'returns', i })),
  ];

  const claimed = new Set();
  const order = tagged
    .filter(x => x.r.from_date && x.r.to_date)
    .sort((a, b) =>
      a.r.from_date.localeCompare(b.r.from_date) ||
      SECTION_PRIORITY[a.section] - SECTION_PRIORITY[b.section]
    );

  const daysByKey = {};
  order.forEach(({ r, section, i }) => {
    const days = expandDays(r.from_date, r.to_date);
    const newDays = days.filter(d => !claimed.has(d));
    newDays.forEach(d => claimed.add(d));
    daysByKey[`${section}-${i}`] = newDays.length;
  });

  const apply = (rows, section) => rows.map((r, i) => {
    const no_of_days = daysByKey[`${section}-${i}`] || 0;
    return { ...r, no_of_days, total_amount: no_of_days * (r.amount_per_day || 0) };
  });

  return {
    journey: apply(journeyRows, 'journey'),
    returns: apply(returnRows,  'returns'),
    stay:    apply(stayRows,    'stay'),
  };
}

function AllowanceSubSection({
  title, letter, section, rows, onFieldChange, onAddRow, onDelRow,
  readOnly, rateMap, disabledNote, lockToDate, minDate, maxDate,
}) {
  return (
    <div style={{ marginBottom: '20px', opacity: disabledNote ? 0.6 : 1 }}>
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
        {disabledNote && (
          <span style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 600, marginLeft: 4 }}>
            🔒 {disabledNote}
          </span>
        )}
      </div>

      {!disabledNote && (minDate || maxDate) && (
        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '8px', paddingLeft: '2px' }}>
          {minDate && maxDate
            ? `📅 Dates must fall between the Travel and Return dates (${formatShort(minDate)} – ${formatShort(maxDate)}).`
            : minDate
              ? `📅 Dates must be on or after the Travel date (${formatShort(minDate)}).`
              : `📅 Dates must be on or before the Return date (${formatShort(maxDate)}).`}
        </div>
      )}

      {rows.map((row, idx) => {
        const naiveDays = calcDays(row.from_date, row.to_date);
        const overlapTrimmed = naiveDays > (row.no_of_days || 0);
        return (
        <div key={idx} className="multi-row-item" style={{ background: 'white', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius)', marginBottom: '8px' }}>
          <div className="multi-row-header">
            <span>Entry {idx + 1}</span>
            {!readOnly && rows.length > 1 && (
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => onDelRow(section, idx)} title="Remove">✕</button>
            )}
          </div>
          {/* Auto-responsive grid — wraps by available width, no fixed
              column count, so this stays usable on narrow/mobile screens. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Date</label>
              <input
                type="date" className="form-control"
                value={row.from_date} disabled={readOnly}
                max={maxDate && maxDate < today ? maxDate : today}
                min={minDate || undefined}
                onChange={e => onFieldChange(section, idx, 'from_date', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                To Date
                {lockToDate && !readOnly && (
                  <span style={{ fontSize: '10px', color: 'var(--gray-400)', marginLeft: '6px', fontWeight: 400 }}>(auto — single day)</span>
                )}
              </label>
              <input
                type="date" className={lockToDate ? 'form-control readonly-styled' : 'form-control'}
                value={row.to_date} disabled={readOnly || lockToDate}
                max={maxDate && maxDate < today ? maxDate : today}
                min={row.from_date || minDate || undefined}
                onChange={e => onFieldChange(section, idx, 'to_date', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Location</label>
              <input
                type="text" className="form-control" placeholder="e.g. Delhi"
                value={row.from_location || ''} disabled={readOnly}
                onChange={e => onFieldChange(section, idx, 'from_location', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Location</label>
              <input
                type="text" className="form-control" placeholder="e.g. Mumbai"
                value={row.to_location || ''} disabled={readOnly}
                onChange={e => onFieldChange(section, idx, 'to_location', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Scope</label>
              <select
                className="form-select"
                value={row.scope} disabled={readOnly}
                onChange={e => onFieldChange(section, idx, 'scope', e.target.value)}
              >
                {SCOPES.map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">No. of Days</label>
              <input className="form-control readonly-styled" readOnly value={row.no_of_days} />
              {overlapTrimmed && (
                <div style={{ fontSize: '10px', color: 'var(--amber)', marginTop: '3px' }}>
                  −{naiveDays - (row.no_of_days || 0)} day(s) already counted in another entry
                </div>
              )}
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
                  onChange={e => onFieldChange(section, idx, 'amount_per_day', e.target.value)}
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
        );
      })}

      {!readOnly && (
        <button className="add-row-btn" onClick={() => onAddRow(section)}>
          ＋ Add {title} Entry
        </button>
      )}
    </div>
  );
}

export default function Section2_DailyAllowance({
  journey, returns, stay, onJourney, onReturns, onStay, readOnly,
  isSingleDayTravel, onIsSingleDayTravelChange,
}) {
  const [rateMap, setRateMap] = useState({});

  useEffect(() => {
    api.get('/allowances/my-rates')
      .then(r => setRateMap(r.data.rateMap || {}))
      .catch(() => {});
  }, []);

  const sections = {
    journey: journey || [emptyRow()],
    returns: returns || [emptyRow()],
    stay:    stay    || [emptyRow()],
  };

  // Push a change through the global overlap resolver and write all three
  // arrays back up to the parent form, so any add/edit/remove anywhere stays
  // consistent with the rest of the claim.
  const commit = (next) => {
    const { journey: j2, returns: r2, stay: s2 } = recalcGlobalOverlap(next.journey, next.returns, next.stay);
    onJourney(j2); onReturns(r2); onStay(s2);
  };

  const handleFieldChange = (section, idx, field, value) => {
    const rows = sections[section].map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };

      // Single-Day Travel: To Date always mirrors From Date (Journey & Stay
      // only — Return is disabled entirely in that mode).
      if (isSingleDayTravel && section !== 'returns' && field === 'from_date') {
        updated.to_date = value;
      }

      // Auto-calculate rate from backend (skip if Site-Allowance and manually editing amount)
      if (field === 'scope' || field === 'from_date' || field === 'to_date') {
        const scope = field === 'scope' ? value : updated.scope;
        if (scope !== 'Site-Allowance') {
          updated.amount_per_day = rateMap[scope] || 0;
        } else if (field === 'scope') {
          updated.amount_per_day = rateMap['Site-Allowance'] || 0;
        }
      }
      if (field === 'amount_per_day') {
        updated.amount_per_day = parseFloat(value) || 0;
      }
      return updated;
    });
    commit({ ...sections, [section]: rows });
  };

  const handleAddRow = (section) => {
    commit({ ...sections, [section]: [...sections[section], emptyRow()] });
  };

  const handleDelRow = (section, idx) => {
    commit({ ...sections, [section]: sections[section].filter((_, i) => i !== idx) });
  };

  const handleSingleDayChange = (val) => {
    onIsSingleDayTravelChange && onIsSingleDayTravelChange(val);
    // Selecting single-day travel clears any Return Journey rows so DA is
    // never auto-calculated twice for a trip that starts and ends same day.
    // Routed through commit() so Journey/Stay correctly reclaim any days
    // that Return was previously counting.
    if (val) commit({ ...sections, returns: [emptyRow()] });
  };

  // Bounds for cross-section date validation: Return can't start before the
  // Travel leg ends, and Site Allowance (Stay) days must fall between the
  // Travel and Return dates (when a Return date exists).
  const journeyLatestDate = (sections.journey || [])
    .map(r => r.to_date).filter(Boolean).sort().pop() || null;
  const returnEarliestDate = (sections.returns || [])
    .map(r => r.from_date).filter(Boolean).sort()[0] || null;

  // Grand totals
  const allRows  = [...(journey || []), ...(returns || []), ...(stay || [])];
  const total    = allRows.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
  const totalEntries = allRows.length;

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

      {/* Single-Day Travel toggle */}
      <div style={{
        marginBottom: '20px', padding: '12px 16px',
        background: 'var(--gray-50)', borderRadius: 'var(--radius)',
        border: '1px solid var(--gray-100)',
      }}>
        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--navy)', marginBottom: '8px' }}>
          Is this a Single-Day Travel?
          <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--gray-400)', marginLeft: 8 }}>
            (No overnight stay )
          </span>
        </div>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: readOnly ? 'default' : 'pointer', fontSize: '13px' }}>
            <input
              type="radio" name="single_day_travel" checked={!!isSingleDayTravel}
              disabled={readOnly}
              onChange={() => handleSingleDayChange(true)}
            />
            Yes — Single Day
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: readOnly ? 'default' : 'pointer', fontSize: '13px' }}>
            <input
              type="radio" name="single_day_travel" checked={!isSingleDayTravel}
              disabled={readOnly}
              onChange={() => handleSingleDayChange(false)}
            />
            No — Multi-Day (Journey + Return)
          </label>
        </div>
        {isSingleDayTravel && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#92400e', fontWeight: 600 }}>
            ⚠️ Return Journey (B) is disabled to prevent DA from being calculated twice for a single day. To Date will auto-fill from From Date below.
          </div>
        )}
      </div>

      {totalEntries > 1 && (
        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '12px', paddingLeft: '2px' }}>
          💡 Travel Days, Return Journey, and Stay Days share one pool of calendar days — if any two entries below (in any
          of the three sections) cover the same date, that date is billed once, not once per entry.
        </div>
      )}

      <AllowanceSubSection
        title="DA for Travel Days" letter="A" section="journey"
        rows={sections.journey}
        onFieldChange={handleFieldChange} onAddRow={handleAddRow} onDelRow={handleDelRow}
        readOnly={readOnly}
        rateMap={rateMap}
        lockToDate={!!isSingleDayTravel}
      />

      <AllowanceSubSection
        title="Return Journey" letter="B" section="returns"
        rows={sections.returns}
        onFieldChange={handleFieldChange} onAddRow={handleAddRow} onDelRow={handleDelRow}
        readOnly={readOnly || !!isSingleDayTravel}
        rateMap={rateMap}
        disabledNote={isSingleDayTravel ? 'Not applicable for single-day travel' : null}
        minDate={journeyLatestDate}
      />

      <AllowanceSubSection
        title="DA for Stay Days / Site Allowance" letter="C" section="stay"
        rows={sections.stay}
        onFieldChange={handleFieldChange} onAddRow={handleAddRow} onDelRow={handleDelRow}
        readOnly={readOnly}
        rateMap={rateMap}
        lockToDate={!!isSingleDayTravel}
        minDate={journeyLatestDate}
        maxDate={returnEarliestDate}
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
