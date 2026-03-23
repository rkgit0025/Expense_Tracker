import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../utils/helpers';

const NAV = [
  { to: '/',                   icon: '📊', label: 'Dashboard',          roles: ['admin','hr','accounts','employee','coordinator'] },
  { to: '/expenses',           icon: '📋', label: 'Expenses',           roles: ['admin','hr','accounts','employee','coordinator'] },
  { to: '/expenses/new',       icon: '➕', label: 'New Expense',        roles: ['admin','hr','accounts','employee','coordinator'] },

  { section: 'Administration' },
  { to: '/admin/employees',    icon: '👤', label: 'Employees',          roles: ['admin','hr'] },
  { to: '/admin/users',        icon: '🔐', label: 'User Accounts',      roles: ['admin'] },
  { to: '/admin/coordinators', icon: '🏢', label: 'Dept Coordinators',  roles: ['admin','hr'] },
  { to: '/admin/projects',     icon: '🏗️', label: 'Projects',           roles: ['admin','hr'] },
  { to: '/admin/rates',        icon: '💰', label: 'Allowance Rates',    roles: ['admin','hr'] },
  { to: '/admin/master-data',  icon: '🗂️', label: 'Master Data',        roles: ['admin','hr'] },
  { to: '/admin/audit-logs',  icon: '📜', label: 'Audit Logs',          roles: ['admin'] },
];

const ROLE_COLORS = {
  admin: '#ef4444', hr: '#8b5cf6', accounts: '#3b82f6',
  coordinator: '#f59e0b', employee: '#10b981'
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const visibleNav = NAV.filter(item => {
    if (item.section) return true;
    return item.roles.includes(user?.role);
  });

  const roleColor = ROLE_COLORS[user?.role] || '#94a3b8';

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-text">💼 ExpenseTrack</div>
          <div className="logo-sub">Enterprise Expense Manager</div>
        </div>

        <nav className="sidebar-nav">
          {visibleNav.map((item, i) => {
            if (item.section) return <div key={`s${i}`} className="nav-section-title">{item.section}</div>;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{getInitials(user?.full_name)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.full_name}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', padding:'1px 7px', borderRadius:10, background: roleColor + '33', color: roleColor }}>
                  {user?.role}
                </span>
              </div>
              {/* Profile link */}
              <NavLink to="/profile"
                style={({ isActive }) => ({
                  fontSize: 11, color: isActive ? 'var(--amber)' : 'rgba(255,255,255,.4)',
                  textDecoration: 'none', marginTop: 4, display: 'inline-block',
                  transition: 'color .15s',
                })}
                onClick={() => setSidebarOpen(false)}
              >
                👤 My Profile &amp; Password
              </NavLink>
            </div>
            <button onClick={handleLogout} title="Logout"
              style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', fontSize:18, cursor:'pointer', padding:'4px 6px', borderRadius:6, transition:'color .15s' }}
              onMouseEnter={e => e.target.style.color = '#ef4444'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,.4)'}>
              🚪
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <button onClick={() => setSidebarOpen(o => !o)} className="mobile-menu-btn"
            style={{ background:'none', border:'none', fontSize:22, cursor:'pointer' }}>☰</button>
          <div className="topbar-title">ExpenseTrack</div>
          <div className="topbar-actions">
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--navy)' }}>{user?.full_name}</div>
              <div style={{ fontSize:11, color:'var(--gray-400)' }}>
                {user?.designation_name}{user?.department_name ? ` · ${user.department_name}` : ''}
              </div>
            </div>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </div>

      <style>{`
        .mobile-menu-btn { display: none; }
        @media (max-width: 768px) { .mobile-menu-btn { display: flex !important; } }
      `}</style>
    </div>
  );
}
