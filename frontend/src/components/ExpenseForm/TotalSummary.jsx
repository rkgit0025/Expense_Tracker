import React from 'react';
import { formatINR } from '../../utils/helpers';

export default function TotalSummary({ journey, returns, stay, travel, food, hotel, misc }) {
  const sumDA  = [...(journey || []), ...(returns || []), ...(stay || [])].reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
  const sumTrv = (travel || []).reduce((s, r) => s + (parseFloat(r.total_amount ?? r.amount) || 0), 0);
  const sumFd  = (food   || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const sumHt  = (hotel  || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const sumMisc= (misc   || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const total  = sumDA + sumTrv + sumFd + sumHt + sumMisc;

  const items = [
    { label: 'Daily Allowance', value: sumDA,   color: '#818cf8' },
    { label: 'Travel',          value: sumTrv,  color: '#34d399' },
    { label: 'Food',            value: sumFd,   color: '#fb923c' },
    { label: 'Hotel',           value: sumHt,   color: '#60a5fa' },
    { label: 'Miscellaneous',   value: sumMisc, color: '#f472b6' },
  ];

  return (
    <div className="card" style={{ background: 'var(--navy-dark)', border: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div className="section-number" style={{ background: 'var(--amber)', color: 'var(--navy-dark)' }}>∑</div>
        <span style={{ fontWeight: 700, fontSize: '16px', color: 'white' }}>Total Claim Summary</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {items.map(it => (
          <div key={it.label} style={{
            background: 'rgba(255,255,255,.05)',
            borderRadius: 'var(--radius)',
            padding: '12px',
            borderTop: `3px solid ${it.color}`
          }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.5)', marginBottom: '4px' }}>{it.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '15px', color: 'white' }}>
              {formatINR(it.value)}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--amber)', borderRadius: 'var(--radius)',
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--navy-dark)' }}>Total Claim Amount</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '22px', color: 'var(--navy-dark)' }}>
          {formatINR(total)}
        </span>
      </div>
    </div>
  );
}
