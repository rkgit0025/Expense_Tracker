import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast, useDialog } from '../context/UIContext';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Section1_ProjectDetails  from '../components/ExpenseForm/Section1_ProjectDetails';
import Section2_DailyAllowance  from '../components/ExpenseForm/Section2_DailyAllowance';
import Section3_TravelEntries   from '../components/ExpenseForm/Section3_TravelEntries';
import Section4_FoodExpenses    from '../components/ExpenseForm/Section4_FoodExpenses';
import Section5_HotelExpenses   from '../components/ExpenseForm/Section5_HotelExpenses';
import Section6_MiscExpenses    from '../components/ExpenseForm/Section6_MiscExpenses';
import Section7_Receipts        from '../components/ExpenseForm/Section7_Receipts';
import TotalSummary             from '../components/ExpenseForm/TotalSummary';

const emptyDA    = () => ({ from_date: '', to_date: '', scope: 'DA-Metro', no_of_days: 0, amount_per_day: 0, total_amount: 0 });
const emptyTravel= () => ({ from_date: '', to_date: '', from_location: '', to_location: '', mode_of_travel: 'Taxi', amount: '', no_of_days: 0, total_amount: 0 });
const emptyFood  = () => ({ from_date: '', to_date: '', sharing: 1, location: '', amount: '' });
const emptyHotel = () => ({ from_date: '', to_date: '', sharing: 1, location: '', amount: '' });
const emptyMisc  = () => ({ expense_date: '', reason: '', location: '', amount: '' });

const STEPS = [
  { label: 'Project' }, { label: 'Allowance' }, { label: 'Travel' },
  { label: 'Food' }, { label: 'Hotel' }, { label: 'Misc' },
  { label: 'Receipts' }, { label: 'Summary' },
];

export default function ExpenseFormPage() {
  const { id }        = useParams();
  const navigate      = useNavigate();
  const { user }      = useAuth();
  // ── use toast instead of local success/error state ──
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const { confirm: confirmDialog } = useDialog();
  const isEdit = Boolean(id);

  const [step,       setStep]       = useState(0);
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');   // inline form error only
  const [expenseId,  setExpenseId]  = useState(id ? parseInt(id) : null);
  const [status,     setStatus]     = useState('draft');

  // Form data
  const [projectId,    setProjectId]    = useState('');
  const [siteLocation, setSiteLocation] = useState('');
  const [coordHod,     setCoordHod]     = useState('');
  const [journey,   setJourney]   = useState([emptyDA()]);
  const [returns,   setReturns]   = useState([emptyDA()]);
  const [stay,      setStay]      = useState([emptyDA()]);
  const [travel,    setTravel]    = useState([emptyTravel()]);
  const [food,      setFood]      = useState([emptyFood()]);
  const [hotel,     setHotel]     = useState([emptyHotel()]);
  const [misc,      setMisc]      = useState([emptyMisc()]);
  const [receipts,  setReceipts]  = useState([]);

  // Load existing expense when editing
  useEffect(() => {
    if (!isEdit) return;
    api.get(`/expenses/${id}`).then(({ data }) => {
      const { form, journey: j, returns: r, stay: s, travel: t, food: f, hotel: h, misc: m, receipts: rec } = data;
      setProjectId(String(form.project_id || ''));
      setSiteLocation(form.site_location_override || '');
      setCoordHod(form.project_coordinator_hod_override || '');
      setStatus(form.status);
      setJourney(j?.length ? j : [emptyDA()]);
      setReturns(r?.length ? r : [emptyDA()]);
      setStay   (s?.length ? s : [emptyDA()]);
      setTravel (t?.length ? t : [emptyTravel()]);
      setFood   (f?.length ? f : [emptyFood()]);
      setHotel  (h?.length ? h : [emptyHotel()]);
      setMisc   (m?.length ? m : [emptyMisc()]);
      setReceipts(rec || []);
    }).catch(err => setFormError(err.response?.data?.message || 'Failed to load expense.'));
  }, [id, isEdit]);

  const buildPayload = () => ({
    project_id: projectId,
    site_location_override:          siteLocation || undefined,
    project_coordinator_hod_override: coordHod    || undefined,
    journey:  journey.filter(r => r.from_date),
    returns:  returns.filter(r => r.from_date),
    stay:     stay.filter(r => r.from_date),
    travel:   travel.filter(r => r.from_date && r.from_location),
    food:     food.filter(r => r.from_date && r.location),
    hotel:    hotel.filter(r => r.from_date && r.location),
    misc:     misc.filter(r => r.expense_date && r.reason),
  });

  const handleSaveDraft = async () => {
    if (!projectId) { setFormError('Please select a project.'); return; }
    setFormError(''); setSaving(true);
    try {
      if (expenseId) {
        await api.put(`/expenses/${expenseId}`, buildPayload());
        toastSuccess('Expense saved successfully.');
      } else {
        const { data } = await api.post('/expenses', buildPayload());
        setExpenseId(data.expense_id);
        navigate(`/expenses/${data.expense_id}/edit`, { replace: true });
        toastSuccess('Draft created. You can now upload receipts in Section 7.');
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!expenseId) { setFormError('Please save the expense first.'); return; }

    // ── Receipt validation ──────────────────────────────────────────────────
    // If a section has data, at least one receipt must be uploaded for it.
    const receiptsByCategory = (cat) => receipts.filter(r => r.category === cat);

    const hasTravelData = travel.some(r => r.from_location || r.from_date);
    const hasHotelData  = hotel.some(r => r.location || r.from_date);
    const hasFoodData   = food.some(r => r.location || r.from_date);
    const hasMiscData   = misc.some(r => r.reason || r.expense_date);

    const missingReceipts = [];
    if (hasTravelData  && receiptsByCategory('Travel').length       === 0) missingReceipts.push('Travel');
    if (hasHotelData   && receiptsByCategory('Hotel').length        === 0) missingReceipts.push('Hotel');
    if (hasFoodData    && receiptsByCategory('Food').length         === 0) missingReceipts.push('Food');
    if (hasMiscData    && receiptsByCategory('Miscellaneous').length === 0) missingReceipts.push('Miscellaneous');

    if (missingReceipts.length > 0) {
      setFormError(
        `Please upload receipts for: ${missingReceipts.join(', ')}. ` +
        'Go to Section 7 (Receipts) to attach the required files before submitting.'
      );
      setStep(6); // jump to receipts section
      return;
    }
    // ───────────────────────────────────────────────────────────────────────

    const ok = await confirmDialog({
      title:        'Submit Expense for Approval',
      message:      'Are you sure you want to submit this expense?',
      details:      'Once submitted, you will not be able to edit it unless it is rejected.',
      confirmLabel: 'Submit for Approval',
      cancelLabel:  'Not yet',
      variant:      'primary',
    });
    if (!ok) return;
    setSubmitting(true); setFormError('');
    try {
      await api.post(`/expenses/${expenseId}/submit`);
      toastSuccess('Expense submitted for approval!');
      navigate('/expenses');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshReceipts = async () => {
    if (!expenseId) return;
    try {
      const { data } = await api.get(`/expenses/${expenseId}`);
      setReceipts(data.receipts || []);
    } catch { /* silent */ }
  };

  const readOnly = !['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(status)
                   && user.role !== 'admin';

  const sectionComponents = [
    <Section1_ProjectDetails key={0}
      data={{ project_id: projectId, site_location: siteLocation, project_coordinator_hod: coordHod }}
      onChange={({ project_id, site_location, project_coordinator_hod }) => {
        if (project_id !== undefined) setProjectId(project_id);
        if (site_location !== undefined) setSiteLocation(site_location);
        if (project_coordinator_hod !== undefined) setCoordHod(project_coordinator_hod);
      }}
      readOnly={readOnly}
    />,
    <Section2_DailyAllowance key={1}
      journey={journey} returns={returns} stay={stay}
      onJourney={setJourney} onReturns={setReturns} onStay={setStay}
      readOnly={readOnly}
    />,
    <Section3_TravelEntries key={2} rows={travel} onChange={setTravel} readOnly={readOnly} />,
    <Section4_FoodExpenses  key={3} rows={food}   onChange={setFood}   readOnly={readOnly} />,
    <Section5_HotelExpenses key={4} rows={hotel}  onChange={setHotel}  readOnly={readOnly} />,
    <Section6_MiscExpenses  key={5} rows={misc}   onChange={setMisc}   readOnly={readOnly} />,
    <Section7_Receipts key={6}
      expenseId={expenseId}
      receipts={receipts}
      onRefresh={refreshReceipts}
      readOnly={readOnly}
      sectionData={{ travel, food, hotel, misc }}
    />,
    <TotalSummary key={7}
      journey={journey} returns={returns} stay={stay}
      travel={travel} food={food} hotel={hotel} misc={misc}
    />,
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700, color:'var(--navy)' }}>
            {isEdit ? `Edit Expense #${id}` : 'New Expense Claim'}
          </h2>
          {status && status !== 'draft' && (
            <span className={`badge badge-${status}`} style={{ marginTop:4 }}>
              {status.replace(/_/g,' ')}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/expenses')}>← Back</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? '⏳ Saving...' : 'Save Draft'}
            </button>
          )}
          {expenseId && ['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(status) && (
            <button className="btn btn-amber" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '⏳ Submitting...' : 'Submit for Approval'}
            </button>
          )}
        </div>
      </div>

      {/* Inline form error only (toast handles success) */}
      {formError && <div className="alert alert-danger">⚠️ {formError}</div>}

      {/* Stepper */}
      <div className="stepper" style={{ marginBottom:24 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className={`step-connector ${i <= step ? 'done' : ''}`} />}
            <div
              className={`step ${i === step ? 'active' : i < step ? 'completed' : ''}`}
              onClick={() => setStep(i)}
              style={{ cursor:'pointer' }}
            >
              <div className="step-circle">{i < step ? '✓' : i + 1}</div>
              <span className="step-label">{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Current section */}
      {sectionComponents[step]}

      {/* Navigation */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, flexWrap:'wrap', gap:10 }}>
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>
          ← Previous
        </button>
        <div style={{ display:'flex', gap:10 }}>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? '⏳...' : 'Save'}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-amber" onClick={() => setStep(s => s + 1)}>Next →</button>
          ) : (
            expenseId && ['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(status) && (
              <button className="btn btn-success" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '⏳ Submitting...' : 'Submit for Approval'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
