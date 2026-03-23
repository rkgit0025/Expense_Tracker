import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatINR, formatDate, statusLabel } from '../utils/helpers';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

export default function Dashboard() {
  const { user }              = useAuth();
  const [stats, setStats]     = useState(null);
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [expRes] = await Promise.all([api.get('/expenses')]);
        setRecent(expRes.data.slice(0, 8));

        if (['admin', 'hr'].includes(user.role)) {
          const sRes = await api.get('/admin/stats');
          setStats(sRes.data);
        } else {
          // Build stats from own expenses
          const own = expRes.data;
          setStats({
            total_expenses:  own.length,
            pending:         own.filter(e => e.status === 'pending').length,
            approved:        own.filter(e => e.status === 'accounts_approved').length,
            total_claim:     own.filter(e => e.status === 'accounts_approved').reduce((s, e) => s + parseFloat(e.claim_amount || 0), 0),
            total_employees: null,
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user.role]);

  if (loading) return <div className="loading-wrap"><div className="spinner" /></div>;

  const statCards = [
    { icon: '📋', label: 'Total Expenses', value: stats?.total_expenses ?? 0, color: '#dbeafe', iconColor: 'var(--info)' },
    { icon: '⏳', label: 'Pending Review', value: stats?.pending ?? 0,        color: '#fef3c7', iconColor: 'var(--warning)' },
    { icon: '✅', label: 'Approved',       value: stats?.approved ?? 0,       color: '#d1fae5', iconColor: 'var(--success)' },
    { icon: '💰', label: 'Total Approved', value: formatINR(stats?.total_claim ?? 0), color: '#e0e7ff', iconColor: '#6366f1', wide: true },
  ];
  if (stats?.total_employees != null)
    statCards.push({ icon: '👥', label: 'Employees', value: stats.total_employees, color: '#fce7f3', iconColor: '#ec4899' });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--navy)' }}>
            Welcome back, {user.first_name}! 👋
          </h2>
          <p style={{ color: 'var(--gray-400)', fontSize: '13px', marginTop: '4px' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link to="/expenses/new" className="btn btn-amber">
          ➕ New Expense
        </Link>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {statCards.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-icon" style={{ background: s.color }}>
              <span role="img">{s.icon}</span>
            </div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent expenses */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontSize: '18px' }}>📋</span>
          <span className="card-title">Recent Expenses</span>
          <Link to="/expenses" style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--navy)', fontWeight: 500 }}>
            View All →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📭</div>
            <p>No expenses yet. <Link to="/expenses/new">Create your first expense</Link></p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Employee</th>
                  <th>Project</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.expense_id}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>#{e.expense_id}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.employee_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{e.emp_code}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.project_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{e.project_code}</div>
                    </td>
                    <td><span className="amount-text">{formatINR(e.claim_amount)}</span></td>
                    <td><StatusBadge status={e.status} /></td>
                    <td style={{ color: 'var(--gray-400)', fontSize: '12px' }}>{formatDate(e.created_at)}</td>
                    <td>
                      <Link to={`/expenses/${e.expense_id}`} className="btn btn-ghost btn-sm">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
