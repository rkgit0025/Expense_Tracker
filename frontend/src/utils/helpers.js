// Format currency in INR
export const formatINR = (amount) => {
  const n = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
};

// Format date for display  dd-MMM-yyyy
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Format date for <input type="date">  yyyy-MM-dd
export const toInputDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
};

// Calculate number of days between two dates (inclusive)
export const calcDays = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;
  const f = new Date(fromDate);
  const t = new Date(toDate);
  if (isNaN(f) || isNaN(t) || t < f) return 0;
  return Math.floor((t - f) / 86400000) + 1;
};

// Status display label
export const statusLabel = (status) => {
  const map = {
    draft:                  'Draft',
    pending:                'Pending',
    coordinator_approved:   'Coordinator Approved',
    coordinator_rejected:   'Coordinator Rejected',
    hr_approved:            'HR Approved',
    hr_rejected:            'HR Rejected',
    accounts_approved:      'Accounts Approved',
    accounts_rejected:      'Accounts Rejected',
  };
  return map[status] || status;
};

// Initials from name
export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
};

// Check if user can edit expense
export const canEdit = (status, role) => {
  if (role === 'admin') return true;
  return ['draft', 'coordinator_rejected', 'hr_rejected', 'accounts_rejected'].includes(status);
};

// Check if user can approve at current stage (admin explicitly excluded)
export const canApprove = (status, role) => {
  if (role === 'admin')       return false; // admin views only, cannot action
  if (role === 'coordinator' && status === 'pending')             return true;
  if (role === 'hr'          && status === 'coordinator_approved') return true;
  if (role === 'accounts'    && status === 'hr_approved')          return true;
  return false;
};

// Next stage description
export const nextStageLabel = (status) => {
  const map = {
    draft:                'Submit for Approval',
    pending:              'Awaiting Coordinator Review',
    coordinator_approved: 'Awaiting HR Review',
    hr_approved:          'Awaiting Accounts Review',
    accounts_approved:    'Final Approved ✓',
    coordinator_rejected: 'Rejected by Coordinator',
    hr_rejected:          'Rejected by HR',
    accounts_rejected:    'Rejected by Accounts',
  };
  return map[status] || status;
};
