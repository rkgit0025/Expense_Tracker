import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { formatINR } from '../../utils/helpers';
import SearchableSelect from '../SearchableSelect';

const today   = new Date().toISOString().split('T')[0]; // block future dates
const CATEGORIES = ['Client', 'Vendor', 'Guest', 'Other'];

const emptyPerson = () => ({ mode: '', emp_id: '', category: '', name: '' });
const emptyRow = () => ({ from_date: '', to_date: '', sharing: 1, location: '', amount: '', remarks: '', sharing_with: [] });

export default function Section4_FoodExpenses({ rows, onChange, readOnly }) {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    // Same lightweight, all-roles-allowed lookup used elsewhere for
    // employee pickers (id, code, name) — no need for the full admin list.
    api.get('/admin/employees/list').then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  const update = (idx, field, val) => onChange(rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  const addRow = () => onChange([...rows, emptyRow()]);
  const delRow = (idx) => onChange(rows.filter((_, i) => i !== idx));
  const total  = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  // Changing the sharing count resizes sharing_with to (sharing - 1) slots —
  // one per person besides the claimant — keeping existing entries where
  // they still fit and trimming/padding as needed.
  const updateSharing = (idx, newSharing) => {
    onChange(rows.map((r, i) => {
      if (i !== idx) return r;
      const needed  = Math.max(0, newSharing - 1);
      const current = r.sharing_with || [];
      const resized = Array.from({ length: needed }, (_, k) => current[k] || emptyPerson());
      return { ...r, sharing: newSharing, sharing_with: resized };
    }));
  };

  // Picking a person from the dropdown: either a specific employee (value is
  // their emp_id) or 'other' (an external client/vendor/guest).
  const updatePersonSelect = (rowIdx, personIdx, value) => {
    onChange(rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const sharingWith = [...(r.sharing_with || [])];
      const existing = sharingWith[personIdx] || emptyPerson();
      sharingWith[personIdx] = value === 'other'
        ? { mode: 'other', emp_id: '', category: existing.category || 'Client', name: existing.name || '' }
        : { mode: 'employee', emp_id: parseInt(value, 10), category: '', name: '' };
      return { ...r, sharing_with: sharingWith };
    }));
  };

  const updatePersonField = (rowIdx, personIdx, field, value) => {
    onChange(rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const sharingWith = [...(r.sharing_with || [])];
      sharingWith[personIdx] = { ...(sharingWith[personIdx] || emptyPerson()), [field]: value };
      return { ...r, sharing_with: sharingWith };
    }));
  };

  const employeeOptions = employees.map(e => ({
    value: String(e.emp_id),
    key: e.emp_id,
    label: `${e.full_name} (${e.emp_code})${e.designation_name ? ` · ${e.designation_name}` : ''}`,
  }));

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">4</div>
        <span className="card-title">Food Expenses</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--navy)' }}>
          Total: {formatINR(total)}
        </span>
      </div>

      {rows.map((row, idx) => {
        const extraPeopleNeeded = Math.max(0, (row.sharing || 1) - 1);
        return (
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
                onChange={e => updateSharing(idx, parseInt(e.target.value, 10))}>
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
            <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
              <label className="form-label">Remarks</label>
              <input type="text" className="form-control" placeholder="Any notes about this meal (optional)"
                value={row.remarks || ''} disabled={readOnly}
                onChange={e => update(idx, 'remarks', e.target.value)} />
            </div>
          </div>

          {extraPeopleNeeded > 0 && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--gray-200)' }}>
              <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                Shared With <span className="required">*</span> ({extraPeopleNeeded} {extraPeopleNeeded === 1 ? 'person' : 'people'}, besides yourself)
              </label>
              {Array.from({ length: extraPeopleNeeded }).map((_, pIdx) => {
                const person = (row.sharing_with && row.sharing_with[pIdx]) || emptyPerson();
                const selectValue = person.mode === 'employee' ? String(person.emp_id || '')
                                   : person.mode === 'other' ? 'other' : '';
                const nameFilled = (person.name || '').trim().length > 0;
                const isIncomplete = !((person.mode === 'employee' && person.emp_id) || (person.mode === 'other' && nameFilled));
                return (
                  <div key={pIdx} className={`shared-with-person${person.mode === 'other' ? '' : ' employee-only'}`}>
                    <SearchableSelect
                      options={[
                        ...employeeOptions,
                        { value: 'other', key: 'other', label: '— Other (Client / Vendor / Guest) —' },
                      ]}
                      value={selectValue}
                      onChange={val => updatePersonSelect(idx, pIdx, val)}
                      placeholder={`— Person ${pIdx + 2} —`}
                      searchPlaceholder="Search by name or code…"
                      emptyOptionLabel={`— Person ${pIdx + 2} —`}
                      disabled={readOnly}
                      invalid={!readOnly && isIncomplete}
                    />
                    {person.mode === 'other' && (
                      <>
                        <select className="form-select" value={person.category || 'Client'} disabled={readOnly}
                          onChange={e => updatePersonField(idx, pIdx, 'category', e.target.value)}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="text" className="form-control" placeholder="Name (e.g. Bindal Sugar)"
                          value={person.name || ''} disabled={readOnly}
                          style={!readOnly && !nameFilled ? { borderColor: 'var(--amber)' } : undefined}
                          onChange={e => updatePersonField(idx, pIdx, 'name', e.target.value)} />
                      </>
                    )}
                  </div>
                );
              })}
              {!readOnly && extraPeopleNeeded > 0 && (
                (row.sharing_with || []).length < extraPeopleNeeded ||
                Array.from({ length: extraPeopleNeeded }).some((_, i) => {
                  const p = (row.sharing_with && row.sharing_with[i]) || emptyPerson();
                  return !((p.mode === 'employee' && p.emp_id) || (p.mode === 'other' && (p.name || '').trim()));
                })
              ) && (
                <div style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 500, marginTop: '2px' }}>
                  ⚠ Every person Sharing counts must be identified before this can be submitted.
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}

      {!readOnly && (
        <button className="add-row-btn" onClick={addRow}>＋ Add Food Entry</button>
      )}
    </div>
  );
}
