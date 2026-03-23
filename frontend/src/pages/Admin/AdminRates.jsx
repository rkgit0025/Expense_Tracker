import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { formatINR } from '../../utils/helpers';
import { useToast, useDialog } from '../../context/UIContext';

const SCOPES = ['DA-Metro', 'DA-Non-Metro', 'Site-Allowance'];
const SCOPE_LABELS = { 'DA-Metro': 'DA – Metro', 'DA-Non-Metro': 'DA – Non-Metro', 'Site-Allowance': 'Site Allowance' };

export default function AdminRates() {
  const { success, error } = useToast();
  const { confirm }        = useDialog();

  const [rates,        setRates]   = useState([]);
  const [designations, setDesig]   = useState([]);
  const [loading,      setLoading] = useState(true);
  const [showModal,    setShowModal]= useState(false);
  const [form,         setForm]    = useState({ designation_id: '', scope: 'DA-Metro', amount: '' });
  const [formError,    setFormErr] = useState('');
  const [saving,       setSaving]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, d] = await Promise.all([api.get('/allowances'), api.get('/admin/designations')]);
      setRates(r.data); setDesig(d.data);
    } catch { error('Failed to load rates.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.designation_id || !form.scope || !form.amount) { setFormErr('All fields are required.'); return; }
    setFormErr(''); setSaving(true);
    try {
      await api.post('/allowances', form);
      success('Allowance rate saved.');
      setShowModal(false); load();
    } catch (err) { setFormErr(err.response?.data?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, label) => {
    const ok = await confirm({
      title: 'Delete Rate',
      message: `Delete the "${label}" allowance rate?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try { await api.delete(`/allowances/${id}`); success('Rate deleted.'); load(); }
    catch (err) { error(err.response?.data?.message || 'Delete failed.'); }
  };

  // Group by designation
  const grouped = designations.map(d => ({
    ...d, rates: rates.filter(r => r.designation_id === d.designation_id)
  })).filter(d => d.rates.length > 0);

  const noRate = designations.filter(d => !rates.some(r => r.designation_id === d.designation_id));

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>💰 Allowance Rates</h2>
          <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:4 }}>Per-day DA rates by designation and scope.</p>
        </div>
        <button className="btn btn-amber" onClick={() => { setForm({ designation_id:'', scope:'DA-Metro', amount:'' }); setFormErr(''); setShowModal(true); }}>
          ➕ Add / Update Rate
        </button>
      </div>

      <div className="alert alert-info">
        💡 Rates auto-populate in the DA section of expense forms based on the employee's designation.
      </div>

      {noRate.length > 0 && (
        <div className="alert alert-warning">
          ⚠️ <strong>{noRate.length} designation{noRate.length > 1 ? 's' : ''} without rates:</strong>{' '}
          {noRate.map(d => d.designation_name).join(', ')}
        </div>
      )}

      {loading ? <div className="loading-wrap"><div className="spinner"/></div> : (
        grouped.map(d => (
          <div className="card" key={d.designation_id} style={{ marginBottom:16 }}>
            <div className="card-header">
              <span style={{ fontSize:18 }}>🎖️</span>
              <span className="card-title">{d.designation_name}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Scope</th><th style={{ textAlign:'right' }}>Rate / Day</th><th style={{ textAlign:'right' }}>Actions</th></tr></thead>
                <tbody>
                  {d.rates.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight:500 }}>{SCOPE_LABELS[r.scope] || r.scope}</td>
                      <td style={{ textAlign:'right' }}><span className="amount-text">{formatINR(r.amount)}</span></td>
                      <td style={{ textAlign:'right' }}>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(r.id, `${d.designation_name} / ${SCOPE_LABELS[r.scope]}`)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add / Update Allowance Rate</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {formError && <div className="alert alert-danger">{formError}</div>}
              <p style={{ fontSize:13, color:'var(--gray-400)', marginBottom:16 }}>
                If a rate already exists for this designation + scope, it will be updated.
              </p>
              <div className="form-group">
                <label className="form-label">Designation <span className="required">*</span></label>
                <select className="form-select" value={form.designation_id}
                  onChange={e => setForm(p => ({ ...p, designation_id: e.target.value }))}>
                  <option value="">— Select —</option>
                  {designations.map(d => <option key={d.designation_id} value={d.designation_id}>{d.designation_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Scope <span className="required">*</span></label>
                <select className="form-select" value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}>
                  {SCOPES.map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Amount per Day (₹) <span className="required">*</span></label>
                <input type="number" className="form-control" placeholder="e.g. 500" min="0" step="0.01"
                  value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Saving…' : 'Save Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
