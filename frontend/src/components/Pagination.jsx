import React from 'react';

/**
 * Generic client-side pagination bar.
 * Purely presentational — the parent owns `page`/`pageSize` state and
 * slices its own array; this component just renders controls + summary.
 */
export default function Pagination({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100], itemLabel = 'items',
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  if (total === 0) return null;

  return (
    <div style={{
      padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderTop: '1px solid var(--gray-100)', flexWrap: 'wrap', gap: 10,
    }}>
      <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>Showing {from}–{to} of {total} {itemLabel}</span>
        {onPageSizeChange && (
          <select
            className="form-select"
            style={{ padding: '2px 8px', fontSize: 12, width: 'auto' }}
            value={pageSize}
            onChange={e => onPageSizeChange(parseInt(e.target.value))}
          >
            {pageSizeOptions.map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}>← Prev</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
            if (pg < 1 || pg > totalPages) return null;
            return (
              <button key={pg}
                className={`btn btn-sm ${pg === page ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onPageChange(pg)}>{pg}</button>
            );
          })}
          <button className="btn btn-ghost btn-sm" disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
