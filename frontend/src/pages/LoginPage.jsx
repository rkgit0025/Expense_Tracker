import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Professional SVG eye icons — no emoji
function EyeOpen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function LoginPage() {
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  // Preload the logo only when the login page is actually displayed
  // (avoids the "preloaded but not used" warning on other pages)
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel  = 'preload';
    link.as   = 'image';
    link.href = '/logo.png';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Logo — use eager loading to avoid slow first paint */}
        <div className="login-logo">
          <img
            src="/logo.png"
            alt="SED Logo"
            loading="eager"
            fetchpriority="high"
            style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 12 }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Expense Tracker</h1>
          <p style={{ color: 'var(--gray-400)', fontSize: 13, margin: 0 }}>
            Spray Engineering Devices
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Username */}
          <div className="form-group">
            <label className="form-label">
              Username <span className="required">*</span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Enter your username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          {/* Password with professional SVG eye toggle */}
          <div className="form-group">
            <label className="form-label">
              Password <span className="required">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                required
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position:       'absolute',
                  right:          0,
                  top:            0,
                  bottom:         0,
                  width:          42,
                  background:     'none',
                  border:         'none',
                  cursor:         'pointer',
                  color:          showPassword ? 'var(--navy)' : 'var(--gray-300)',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  borderRadius:   '0 var(--radius) var(--radius) 0',
                  transition:     'color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--navy)'}
                onMouseLeave={e => e.currentTarget.style.color = showPassword ? 'var(--navy)' : 'var(--gray-300)'}
              >
                {showPassword ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? '⏳ Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--gray-300)' }}>
          For assistance, contact your system administrator
        </div>
      </div>
    </div>
  );
}
