import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useToast, useDialog } from '../context/UIContext';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { toInputDate } from '../utils/helpers';
import Section1_ProjectDetails  from '../components/ExpenseForm/Section1_ProjectDetails';
import Section2_DailyAllowance  from '../components/ExpenseForm/Section2_DailyAllowance';
import Section3_TravelEntries   from '../components/ExpenseForm/Section3_TravelEntries';
import Section4_FoodExpenses    from '../components/ExpenseForm/Section4_FoodExpenses';
import Section5_HotelExpenses   from '../components/ExpenseForm/Section5_HotelExpenses';
import Section6_MiscExpenses    from '../components/ExpenseForm/Section6_MiscExpenses';
import Section7_Receipts        from '../components/ExpenseForm/Section7_Receipts';
import TotalSummary             from '../components/ExpenseForm/TotalSummary';

// Server-loaded dates come back as full ISO datetime strings (e.g.
// "2026-07-02T00:00:00.000Z"), but <input type="date"> only accepts a bare
// "yyyy-MM-dd" value — anything else is silently rejected and the field just
// renders blank. Normalize every date field the moment it arrives from the
// API, before it ever reaches a form field.
const normDates = (rows, fields) => (rows || []).map(r => {
  const out = { ...r };
  fields.forEach(f => { if (out[f]) out[f] = toInputDate(out[f]); });
  return out;
});

const emptyDA    = () => ({ from_date: '', to_date: '', from_location: '', to_location: '', scope: 'DA-Metro', no_of_days: 0, amount_per_day: 0, total_amount: 0 });
const emptyTravel= () => ({ from_date: '', to_date: '', from_location: '', to_location: '', mode_of_travel: 'Taxi', amount: '', no_of_days: 0, total_amount: 0 });
const emptyFood  = () => ({ from_date: '', to_date: '', sharing: 1, location: '', amount: '', remarks: '', sharing_with: [] });
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
  const location      = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user }      = useAuth();
  // ── use toast instead of local success/error state ──
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const { confirm: confirmDialog } = useDialog();
  const isEdit = Boolean(id);

  // If we came here via the list/view page's "← Back" round trip, it handed
  // us the tab/filters/page it had open so our own "← Back" can return there
  // exactly instead of resetting to a blank list.
  const backListState = location.state?.listState;

  // The wizard step lives in the URL (?step=N) rather than pure local state,
  // so it survives a page refresh AND the route change that happens the
  // first time a brand-new draft is saved (see handleSaveDraft) — both of
  // which previously reset an in-progress edit straight back to step 1.
  const stepFromUrl = parseInt(searchParams.get('step'), 10);
  const initialStep = Number.isInteger(stepFromUrl) && stepFromUrl >= 0 && stepFromUrl < STEPS.length ? stepFromUrl : 0;

  const [step,       setStepRaw]    = useState(initialStep);
  const goToStep = (i) => {
    setStepRaw(i);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('step', String(i));
      return next;
    }, { replace: true });
  };

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
  const [isSingleDayTravel, setIsSingleDayTravel] = useState(false);
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
      setIsSingleDayTravel(!!form.is_single_day_travel);
      setJourney(j?.length ? normDates(j, ['from_date','to_date']) : [emptyDA()]);
      setReturns(r?.length ? normDates(r, ['from_date','to_date']) : [emptyDA()]);
      setStay   (s?.length ? normDates(s, ['from_date','to_date']) : [emptyDA()]);
      setTravel (t?.length ? normDates(t, ['from_date','to_date']) : [emptyTravel()]);
      setFood   (f?.length ? normDates(f, ['from_date','to_date']) : [emptyFood()]);
      setHotel  (h?.length ? normDates(h, ['from_date','to_date']) : [emptyHotel()]);
      setMisc   (m?.length ? normDates(m, ['expense_date'])        : [emptyMisc()]);
      setReceipts(rec || []);
    }).catch(err => setFormError(err.response?.data?.message || 'Failed to load expense.'));
  }, [id, isEdit]);

  const buildPayload = () => ({
    project_id: projectId,
    site_location_override:          siteLocation || undefined,
    project_coordinator_hod_override: coordHod    || undefined,
    is_single_day_travel: isSingleDayTravel,
    journey:  journey.filter(r => r.from_date),
    returns:  returns.filter(r => r.from_date),
    stay:     stay.filter(r => r.from_date),
    // A row only needs a date + an amount to represent a real claim — the
    // location/reason fields are descriptive, not marked required anywhere
    // in the UI, and were previously used to gate inclusion here too. That
    // meant a fully-filled-in row (real date, real amount) with just that
    // one text field left blank was silently dropped from what got saved,
    // while the pre-submit "is this ₹0?" check below never required that
    // field — so submission sailed through with the entry missing and the
    // claim total wrongly at ₹0. Gating on amount instead keeps every real
    // entry and matches what that check already treats as "real data".
    travel:   travel.filter(r => r.from_date && (r.total_amount || r.amount)),
    food:     food.filter(r => r.from_date && r.amount),
    hotel:    hotel.filter(r => r.from_date && r.amount),
    misc:     misc.filter(r => r.expense_date && r.amount),
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
        navigate(`/expenses/${data.expense_id}/edit?step=${step}`, { replace: true });
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

    // ── Zero-amount validation ────────────────────────────────────────────────
    // Block submission if the total claim amount is ₹0 (same calculation as
    // TotalSummary). Shown via the in-app alert banner + toast, never window.alert.
    const sumDA   = [...journey, ...returns, ...stay].reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
    const sumTrv  = travel.reduce((s, r) => s + (parseFloat(r.total_amount ?? r.amount) || 0), 0);
    const sumFd   = food.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const sumHt   = hotel.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const sumMisc = misc.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const totalClaimAmount = sumDA + sumTrv + sumFd + sumHt + sumMisc;

    if (totalClaimAmount <= 0) {
      const msg = 'Total claim amount is ₹0. Please add at least one expense entry with a valid amount before submitting.';
      setFormError(msg);
      toastError(msg);
      goToStep(7); // jump to Summary so the user can see the ₹0 breakdown
      return;
    }
    // ───────────────────────────────────────────────────────────────────────────

    // ── Shared-With validation ──────────────────────────────────────────────
    // Sharing > 1 means the claimant plus (Sharing - 1) other people — every
    // one of those extra slots must be identified (a real employee, or
    // "Other" with both a category and a name) before this can be submitted.
    const incompleteFoodEntries = [];
    food.forEach((r, idx) => {
      const needed = Math.max(0, (parseInt(r.sharing, 10) || 1) - 1);
      if (needed === 0) return;
      const sw = r.sharing_with || [];
      const isIncomplete = Array.from({ length: needed }, (_, i) => sw[i]).some(p =>
        !p || !(
          (p.mode === 'employee' && p.emp_id) ||
          (p.mode === 'other' && p.category && (p.name || '').trim())
        )
      );
      if (isIncomplete) incompleteFoodEntries.push(idx + 1);
    });
    if (incompleteFoodEntries.length > 0) {
      const msg = `Food Entry ${incompleteFoodEntries.join(', ')}: Sharing is more than 1, so everyone it's shared with must be specified before submitting.`;
      setFormError(msg);
      toastError(msg);
      goToStep(3); // jump to Food section
      return;
    }
    // ───────────────────────────────────────────────────────────────────────────

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
      goToStep(6); // jump to receipts section
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

  const readOnly = !['draft','coordinator_rejected','hr_rejected','accounts_rejected','admin_rejected'].includes(status)
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
      isSingleDayTravel={isSingleDayTravel} onIsSingleDayTravelChange={setIsSingleDayTravel}
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
          <button className="btn btn-ghost" onClick={() => navigate('/expenses', backListState ? { state: { listState: backListState } } : undefined)}>← Back</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? '⏳ Saving...' : 'Save Draft'}
            </button>
          )}
          {expenseId && ['draft','coordinator_rejected','hr_rejected','accounts_rejected','admin_rejected'].includes(status) && (
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
              onClick={() => goToStep(i)}
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
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => goToStep(step - 1)}>
          ← Previous
        </button>
        <div style={{ display:'flex', gap:10 }}>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? '⏳...' : 'Save'}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-amber" onClick={() => goToStep(step + 1)}>Next →</button>
          ) : (
            expenseId && ['draft','coordinator_rejected','hr_rejected','accounts_rejected','admin_rejected'].includes(status) && (
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
