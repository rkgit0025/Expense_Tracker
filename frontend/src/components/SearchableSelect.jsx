import React, { useEffect, useRef, useState } from 'react';

/**
 * SearchableSelect
 * A dropdown with a built-in search box, styled to match the app's
 * existing `.form-select` control. Drop-in replacement for a native
 * <select> where the option list can get long (e.g. Project list).
 *
 * Props:
 *  - options: [{ value, label }]
 *  - value: currently selected value (string)
 *  - onChange(value): called with the new value when an option is picked
 *  - placeholder: text shown when nothing is selected
 *  - searchPlaceholder: placeholder for the inner search input
 *  - emptyOptionLabel: label for the pinned "clear selection" row
 *  - disabled
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '— Select —',
  searchPlaceholder = 'Type to search...',
  emptyOptionLabel = '— Select —',
  disabled = false,
}) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setHighlight(0);
      if (inputRef.current) inputRef.current.focus();
    }
  }, [open]);

  const pick = (val) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) pick(opt.value);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        className="form-select"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); }
        }}
        style={{
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          cursor:        disabled ? 'not-allowed' : 'pointer',
          background:    disabled ? 'var(--gray-50)' : 'var(--white)',
          color:         selected ? 'var(--gray-900)' : 'var(--gray-400)',
          userSelect:    'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{
          marginLeft: 8, fontSize: 10, color: 'var(--gray-300)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
        }}>▼</span>
      </div>

      {open && !disabled && (
        <div style={{
          position:      'absolute',
          top:           'calc(100% + 4px)',
          left:          0,
          right:         0,
          zIndex:        50,
          background:    'var(--white)',
          border:        '1.5px solid var(--navy-mid)',
          borderRadius:  'var(--radius)',
          boxShadow:     'var(--shadow-lg)',
          overflow:      'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--gray-100)' }}>
            <input
              ref={inputRef}
              type="text"
              className="form-control"
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={handleKeyDown}
              style={{ padding: '7px 10px', fontSize: 13 }}
            />
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto' }} role="listbox">
            <div
              onClick={() => pick('')}
              onMouseEnter={() => setHighlight(-1)}
              style={{
                padding:    '9px 14px',
                fontSize:   13,
                cursor:     'pointer',
                color:      'var(--gray-400)',
                fontStyle:  'italic',
                background: highlight === -1 ? 'var(--gray-50)' : 'transparent',
              }}
            >
              {emptyOptionLabel}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: '14px', fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>
                No matches found
              </div>
            )}

            {filtered.map((opt, i) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(opt.value)}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    padding:    '9px 14px',
                    fontSize:   13,
                    cursor:     'pointer',
                    background: i === highlight ? 'var(--gray-50)' : (isSelected ? '#eef2ff' : 'transparent'),
                    color:      isSelected ? 'var(--navy)' : 'var(--gray-900)',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {opt.label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
