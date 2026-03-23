import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function ForceChangePasswordPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.new_password.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match.');
      return;
    }
    if (form.new_password === form.current_password) {
      setError('New password must be different from the temporary password.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password:     form.new_password,
      });

      // Update local user state to clear the flag
      const updatedUser = { ...user, must_change_password: false };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Password change failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-logo">
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔑</div>
          <h1>Set Your Password</h1>
          <p>You're using a temporary password. Please set a permanent one before continuing.</p>
        </div>

        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          ⚠️ This is required. You cannot use the system until you change your password.
        </div>

        {error && <div className="alert alert-danger">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Temporary / Current Password <span className="required">*</span></label>
            <input
              type="password"
              className="form-control"
              placeholder="Enter your temporary password"
              value={form.current_password}
              onChange={e => setForm(p => ({ ...p, current_password: e.target.value }))}
              required autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">New Password <span className="required">*</span></label>
            <input
              type="password"
              className="form-control"
              placeholder="At least 8 characters"
              value={form.new_password}
              onChange={e => setForm(p => ({ ...p, new_password: e.target.value }))}
              required minLength={8}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password <span className="required">*</span></label>
            <input
              type="password"
              className="form-control"
              placeholder="Repeat new password"
              value={form.confirm_password}
              onChange={e => setForm(p => ({ ...p, confirm_password: e.target.value }))}
              required minLength={8}
            />
          </div>

          {/* Password strength hints */}
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '16px' }}>
            <div style={{ marginBottom: '4px', fontWeight: 600 }}>Password must:</div>
            <div style={{ color: form.new_password.length >= 8 ? 'var(--success)' : 'var(--gray-300)' }}>
              {form.new_password.length >= 8 ? '✓' : '○'} Be at least 8 characters
            </div>
            <div style={{ color: form.new_password === form.confirm_password && form.confirm_password ? 'var(--success)' : 'var(--gray-300)' }}>
              {form.new_password === form.confirm_password && form.confirm_password ? '✓' : '○'} Passwords match
            </div>
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={saving} style={{ marginTop: '4px' }}>
            {saving ? '⏳ Changing...' : '🔐 Set New Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
