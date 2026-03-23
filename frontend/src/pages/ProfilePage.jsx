import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { useToast } from '../context/UIContext';
import { formatDate, getInitials } from '../utils/helpers';

const ROLE_COLORS = {
  admin: '#ef4444', hr: '#8b5cf6', accounts: '#3b82f6',
  coordinator: '#f59e0b', employee: '#10b981'
};

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid var(--gray-100)',
      padding: '10px 0', gap: 12, alignItems: 'center',
    }}>
      <span style={{
        width: 160, flexShrink: 0, fontSize: 11, fontWeight: 600,
        color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>{label}</span>
      <span style={{ fontWeight: 500, color: 'var(--gray-700)', fontSize: 14 }}>
        {value || <span style={{ color: 'var(--gray-300)' }}>—</span>}
      </span>
    </div>
  );
}

// Inline SVG eye icons — professional, no emoji
function EyeOpen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordInput({ value, onChange, placeholder, name }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        className="form-control"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        name={name}
        autoComplete={name === 'current' ? 'current-password' : 'new-password'}
        style={{ paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 40,
          background: 'none', border: 'none', cursor: 'pointer',
          color: show ? 'var(--navy)' : 'var(--gray-300)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color .15s', borderRadius: '0 var(--radius) var(--radius) 0',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--navy)'}
        onMouseLeave={e => e.currentTarget.style.color = show ? 'var(--navy)' : 'var(--gray-300)'}
        tabIndex={-1}
        title={show ? 'Hide' : 'Show'}
      >
        {show ? <EyeOff /> : <EyeOpen />}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const { success, error } = useToast();

  const roleColor = ROLE_COLORS[user?.role] || '#94a3b8';

  const [pwForm,   setPwForm]   = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError,  setPwError]  = useState('');

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');

    if (!pwForm.current_password)   { setPwError('Current password is required.'); return; }
    if (pwForm.new_password.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
    if (pwForm.new_password !== pwForm.confirm_password) { setPwError('New passwords do not match.'); return; }
    if (pwForm.current_password === pwForm.new_password) { setPwError('New password must differ from the current one.'); return; }

    setPwSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: pwForm.current_password,
        new_password:     pwForm.new_password,
      });
      success('Password changed successfully.');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setPwError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  const strengthLevel = (pw) => {
    if (!pw) return null;
    let score = 0;
    if (pw.length >= 8)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const strength = strengthLevel(pwForm.new_password);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength || 0];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'][strength || 0];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>👤 My Profile</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
          Your account details and security settings.
        </p>
      </div>

      <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>

        {/* ── Left: Profile Info ─────────────────────────────────────── */}
        <div>
          <div className="card">
            {/* Avatar header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 20,
              padding: '20px 0 24px', borderBottom: '1px solid var(--gray-100)', marginBottom: 16,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: `${roleColor}22`,
                border: `3px solid ${roleColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 800, color: roleColor, flexShrink: 0,
              }}>
                {getInitials(user?.full_name)}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>
                  {user?.full_name}
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    padding: '3px 10px', borderRadius: 20,
                    background: `${roleColor}22`, color: roleColor,
                  }}>
                    {user?.role}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                    {user?.emp_code}
                  </span>
                </div>
              </div>
            </div>

            <div className="card-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span className="card-title">Personal Information</span>
            </div>
            <InfoRow label="Full Name"       value={user?.full_name} />
            <InfoRow label="Email"           value={user?.email} />
            <InfoRow label="Username"        value={user?.username} />
            <InfoRow label="Mobile"          value={user?.mobile_number} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span className="card-title">Organisation</span>
            </div>
            <InfoRow label="Employee Code"   value={user?.emp_code} />
            <InfoRow label="Designation"     value={user?.designation_name} />
            <InfoRow label="Department"      value={user?.department_name} />
          </div>
        </div>

        {/* ── Right: Change Password ─────────────────────────────────── */}
        <div className="card">
          <div className="card-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <span className="card-title">Change Password</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 20, marginTop: 4 }}>
            Use a strong password with uppercase letters, numbers, and symbols.
          </p>

          {pwError && <div className="alert alert-danger" style={{ marginBottom: 16 }}>⚠️ {pwError}</div>}

          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label className="form-label">Current Password <span className="required">*</span></label>
              <PasswordInput
                name="current"
                placeholder="Enter your current password"
                value={pwForm.current_password}
                onChange={e => { setPwForm(p => ({ ...p, current_password: e.target.value })); setPwError(''); }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password <span className="required">*</span></label>
              <PasswordInput
                name="new"
                placeholder="Min. 6 characters"
                value={pwForm.new_password}
                onChange={e => { setPwForm(p => ({ ...p, new_password: e.target.value })); setPwError(''); }}
              />
              {/* Password strength meter */}
              {pwForm.new_password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{
                        height: 4, flex: 1, borderRadius: 2,
                        background: i <= (strength || 0) ? strengthColor : 'var(--gray-100)',
                        transition: 'background .2s',
                      }}/>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>
                    {strengthLabel}
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password <span className="required">*</span></label>
              <PasswordInput
                name="confirm"
                placeholder="Repeat new password"
                value={pwForm.confirm_password}
                onChange={e => { setPwForm(p => ({ ...p, confirm_password: e.target.value })); setPwError(''); }}
              />
              {pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                  ✗ Passwords do not match
                </div>
              )}
              {pwForm.confirm_password && pwForm.new_password === pwForm.confirm_password && (
                <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>
                  ✓ Passwords match
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={pwSaving || !pwForm.current_password || !pwForm.new_password || !pwForm.confirm_password}
              style={{ width: '100%', marginTop: 8 }}
            >
              {pwSaving ? '⏳ Updating…' : '🔒 Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
