import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { statusLabel } from '../utils/helpers';

// Small pill + rich hover/focus tooltip used anywhere an expense row needs to
// flag "this employee has an overlapping date on another expense" (DA/Site
// Allowance, Travel, Food, Hotel, or Misc — whichever category triggered it).
// `conflicts` is the `dateConflicts` array the backend
// attaches per row: [{ expense_id, status }, ...]. Renders nothing if empty,
// so call sites can drop it in unconditionally.
export default function DateConflictBadge({ conflicts }) {
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState({ top: 0, left: 0 });
  const anchorRef         = useRef(null);

  if (!conflicts || conflicts.length === 0) return null;

  const place = () => {
    const rect = anchorRef.current.getBoundingClientRect();
    // Portal to <body> + position:fixed so the tooltip escapes the table's
    // overflow-x:auto wrapper instead of being clipped by it.
    setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 260) });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <span
      ref={anchorRef}
      className="da-conflict-badge"
      tabIndex={0}
      onMouseEnter={place}
      onMouseLeave={hide}
      onFocus={place}
      onBlur={hide}
    >
      <span aria-hidden="true">⚠</span> Duplicate Date

      {open && createPortal(
        <div className="da-conflict-tooltip" style={{ top: pos.top, left: pos.left }}>
          <div className="da-conflict-tooltip-title">Same date also claimed in:</div>
          <ul>
            {conflicts.map(c => (
              <li key={c.expense_id}>
                <Link to={`/expenses/${c.expense_id}`}>Expense #{c.expense_id}</Link>
                <span className={`badge badge-${c.status}`}>{statusLabel(c.status)}</span>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </span>
  );
}
