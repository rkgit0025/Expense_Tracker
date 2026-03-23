import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatINR, formatDate, statusLabel } from '../utils/helpers';

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

// Simple inline bar chart — no external library needed
function BarChart({ data, labelKey, valueKey, colorFn, formatValue }) {
  if (!data || !data.length) return <div style={{ textAlign:'center', padding:24, color:'var(--gray-300)', fontSize:13 }}>No data yet</div>;
  const max = Math.max(...data.map(d => parseFloat(d[valueKey]) || 0));
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {data.map((d, i) => {
        const val = parseFloat(d[valueKey]) || 0;
        const pct = max > 0 ? (val / max) * 100 : 0;
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:110, flexShrink:0, fontSize:11, fontWeight:600, color:'var(--gray-500)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={d[labelKey]}>
              {d[labelKey] || '—'}
            </div>
            <div style={{ flex:1, height:18, background:'var(--gray-100)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background: colorFn ? colorFn(i) : 'var(--navy)', borderRadius:4, transition:'width .4s ease', minWidth: val > 0 ? 4 : 0 }}/>
            </div>
            <div style={{ width:90, textAlign:'right', fontSize:11, fontWeight:700, color:'var(--navy)', flexShrink:0 }}>
              {formatValue ? formatValue(val) : val}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Mini sparkline for trend
function TrendLine({ data, valueKey }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => parseFloat(d[valueKey]) || 0);
  const max = Math.max(...vals) || 1;
  const W = 200, H = 48;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * H}`).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  return (
    <svg width={W} height={H} style={{ overflow:'visible' }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="var(--navy)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#trendFill)"/>
      <polyline points={pts} fill="none" stroke="var(--navy)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

const PASTEL = ['#dbeafe','#fce7f3','#d1fae5','#fef3c7','#e0e7ff','#ffedd5','#f3f4f6','#dcfce7'];
const VIVID  = ['#3b82f6','#ec4899','#10b981','#f59e0b','#6366f1','#f97316','#8b5cf6','#14b8a6'];

const STATUS_COLOR = {
  pending:              '#f59e0b',
  coordinator_approved: '#3b82f6',
  hr_approved:          '#6366f1',
  accounts_approved:    '#10b981',
  coordinator_rejected: '#ef4444',
  hr_rejected:          '#ef4444',
  accounts_rejected:    '#ef4444',
  draft:                '#94a3b8',
};

const ACTION_ICON = {
  employee_created:  '👤',
  employee_updated:  '✏️',
  employee_deleted:  '🗑️',
  expense_submitted: '📤',
  expense_approved:  '✅',
  expense_rejected:  '❌',
  user_created:      '🔐',
  user_reset:        '🔑',
  project_created:   '🏗️',
  project_deleted:   '🗑️',
};

export default function Dashboard() {
  const { user }              = useAuth();
  const isAdmin               = user?.role === 'admin';
  const isAdminOrHR           = ['admin','hr'].includes(user?.role);

  const [stats,   setStats]   = useState(null);
  const [recent,  setRecent]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [expRes] = await Promise.all([api.get('/expenses')]);
        setRecent(expRes.data.slice(0, 8));

        if (isAdminOrHR) {
          const sRes = await api.get('/admin/stats');
          setStats(sRes.data);
        } else {
          const own = expRes.data;
          setStats({
            total_expenses:  own.length,
            pending:         own.filter(e => e.status === 'pending').length,
            approved:        own.filter(e => e.status === 'accounts_approved').length,
            total_claim:     own.filter(e => e.status === 'accounts_approved').reduce((s, e) => s + parseFloat(e.claim_amount || 0), 0),
          });
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [user?.role]);

  if (loading) return <div className="loading-wrap"><div className="spinner"/></div>;

  const topStatCards = [
    { icon:'📋', label:'Total Expenses',    value: stats?.total_expenses ?? 0,    bg:'#dbeafe', ic:'#3b82f6' },
    { icon:'⏳', label:'Pending Review',    value: stats?.pending ?? 0,           bg:'#fef3c7', ic:'#f59e0b' },
    { icon:'✅', label:'Fully Approved',    value: stats?.approved ?? 0,          bg:'#d1fae5', ic:'#10b981' },
    { icon:'💰', label:'Total Approved ₹', value: formatINR(stats?.total_claim ?? 0), bg:'#e0e7ff', ic:'#6366f1' },
    ...(isAdminOrHR ? [
      { icon:'👥', label:'Employees',       value: stats?.total_employees ?? 0,   bg:'#fce7f3', ic:'#ec4899' },
      { icon:'🔐', label:'Active Users',    value: stats?.total_users ?? 0,       bg:'#ffedd5', ic:'#f97316' },
    ] : []),
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, color:'var(--navy)' }}>
            Welcome back, {user?.first_name}! 👋
          </h2>
          <p style={{ color:'var(--gray-400)', fontSize:13, marginTop:4 }}>
            {new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isAdmin && <Link to="/admin/audit-logs" className="btn btn-ghost">📜 Audit Logs</Link>}
          <Link to="/expenses/new" className="btn btn-amber">➕ New Expense</Link>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="stat-grid" style={{ marginBottom:24 }}>
        {topStatCards.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg }}>
              <span role="img">{s.icon}</span>
            </div>
            <div>
              <div className="stat-value" style={{ color: s.ic }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Admin analytics ─────────────────────────────────────────────── */}
      {isAdminOrHR && stats && (
        <>
          {/* Row 1: Status breakdown + Monthly trend */}
          <div className="grid-2" style={{ gap:20, marginBottom:20 }}>

            {/* Status breakdown */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontSize:18 }}>🥧</span>
                <span className="card-title">Expenses by Status</span>
              </div>
              {stats.byStatus?.length ? (
                <>
                  <BarChart
                    data={stats.byStatus}
                    labelKey="status"
                    valueKey="count"
                    colorFn={(i) => STATUS_COLOR[stats.byStatus[i]?.status] || '#94a3b8'}
                    formatValue={v => `${v} expense${v !== 1 ? 's' : ''}`}
                  />
                  <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--gray-100)', display:'flex', flexWrap:'wrap', gap:8 }}>
                    {stats.byStatus.map((s, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background: STATUS_COLOR[s.status] || '#94a3b8', flexShrink:0 }}/>
                        <span style={{ color:'var(--gray-500)', textTransform:'capitalize' }}>{statusLabel(s.status)}</span>
                        <span style={{ fontWeight:700, color:'var(--navy)' }}>({s.count})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div style={{ textAlign:'center', padding:24, color:'var(--gray-300)', fontSize:13 }}>No data yet</div>}
            </div>

            {/* Monthly trend */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontSize:18 }}>📈</span>
                <span className="card-title">Monthly Submissions (12 mo)</span>
              </div>
              {stats.monthlyTrend?.length ? (
                <>
                  <div style={{ marginBottom:12 }}>
                    <TrendLine data={stats.monthlyTrend} valueKey="count"/>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {stats.monthlyTrend.slice(-6).map((m, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                        <span style={{ color:'var(--gray-400)', fontWeight:500 }}>{m.month}</span>
                        <span style={{ fontWeight:700, color:'var(--navy)' }}>{m.count} submitted</span>
                        <span style={{ color:'var(--gray-400)' }}>{formatINR(m.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div style={{ textAlign:'center', padding:24, color:'var(--gray-300)', fontSize:13 }}>No submission data yet</div>}
            </div>
          </div>

          {/* Row 2: Top claimants + Department breakdown */}
          <div className="grid-2" style={{ gap:20, marginBottom:20 }}>

            {/* Top claimants */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontSize:18 }}>🏆</span>
                <span className="card-title">Top 5 Claimants</span>
              </div>
              {stats.topClaimants?.length ? (
                <div className="table-wrap" style={{ marginTop:0 }}>
                  <table>
                    <thead><tr><th>#</th><th>Employee</th><th>Claims</th><th style={{ textAlign:'right' }}>Total</th></tr></thead>
                    <tbody>
                      {stats.topClaimants.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:24, height:24, borderRadius:'50%', background: i < 3 ? PASTEL[i] : 'var(--gray-100)', fontSize:12, fontWeight:700, color: i < 3 ? VIVID[i] : 'var(--gray-400)' }}>
                              {i + 1}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight:600, fontSize:13 }}>{c.full_name}</div>
                            <div style={{ fontSize:11, color:'var(--gray-400)' }}>{c.emp_code} · {c.department_name || '—'}</div>
                          </td>
                          <td style={{ fontWeight:600 }}>{c.submissions}</td>
                          <td style={{ textAlign:'right' }}><span className="amount-text">{formatINR(c.total_claimed)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{ textAlign:'center', padding:24, color:'var(--gray-300)', fontSize:13 }}>No claims yet</div>}
            </div>

            {/* Department breakdown */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontSize:18 }}>🏢</span>
                <span className="card-title">Expenses by Department</span>
              </div>
              <BarChart
                data={stats.byDepartment || []}
                labelKey="department_name"
                valueKey="total"
                colorFn={(i) => VIVID[i % VIVID.length]}
                formatValue={v => formatINR(v)}
              />
            </div>
          </div>

          {/* Row 3: Recent activity from audit log */}
          {isAdmin && stats.recentActivity?.length > 0 && (
            <div className="card" style={{ marginBottom:20 }}>
              <div className="card-header">
                <span style={{ fontSize:18 }}>📜</span>
                <span className="card-title">Recent System Activity</span>
                <Link to="/admin/audit-logs" style={{ marginLeft:'auto', fontSize:13, color:'var(--navy)', fontWeight:500 }}>
                  View All →
                </Link>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {stats.recentActivity.slice(0, 8).map((a, i) => (
                  <div key={i} style={{
                    display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0',
                    borderBottom: i < 7 ? '1px solid var(--gray-100)' : 'none',
                  }}>
                    <div style={{
                      width:34, height:34, borderRadius:'50%', flexShrink:0,
                      background: 'var(--gray-50)', border:'1px solid var(--gray-100)',
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
                    }}>
                      {ACTION_ICON[a.action] || '⚙️'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'var(--gray-700)' }}>
                        <span style={{ fontWeight:700, color:'var(--navy)' }}>{a.actor_name || 'System'}</span>
                        {' '}
                        <span style={{ background:`${PASTEL[0]}`, color:VIVID[0], fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:4, textTransform:'uppercase', verticalAlign:'middle' }}>
                          {a.actor_role}
                        </span>
                        {' — '}
                        {a.description || a.action.replace(/_/g,' ')}
                      </div>
                      <div style={{ fontSize:11, color:'var(--gray-400)', marginTop:2 }}>
                        {formatDate(a.action_time)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recent expenses (all roles) */}
      <div className="card">
        <div className="card-header">
          <span style={{ fontSize:18 }}>📋</span>
          <span className="card-title">Recent Expenses</span>
          <Link to="/expenses" style={{ marginLeft:'auto', fontSize:13, color:'var(--navy)', fontWeight:500 }}>
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
                    <td><span style={{ fontFamily:'var(--mono)', fontSize:12 }}>#{e.expense_id}</span></td>
                    <td>
                      <div style={{ fontWeight:500 }}>{e.employee_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.emp_code}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight:500 }}>{e.project_name}</div>
                      <div style={{ fontSize:11, color:'var(--gray-400)' }}>{e.project_code}</div>
                    </td>
                    <td><span className="amount-text">{formatINR(e.claim_amount)}</span></td>
                    <td><StatusBadge status={e.status}/></td>
                    <td style={{ color:'var(--gray-400)', fontSize:12 }}>{formatDate(e.created_at)}</td>
                    <td><Link to={`/expenses/${e.expense_id}`} className="btn btn-ghost btn-sm">View</Link></td>
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
