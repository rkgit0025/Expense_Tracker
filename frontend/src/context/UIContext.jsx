import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
// Toast: { id, type ('success'|'error'|'warning'|'info'), message, duration }
// Dialog: { title, message, confirmLabel, cancelLabel, variant ('danger'|'warning'|'primary'), onConfirm }

const ToastContext  = createContext(null);
const DialogContext = createContext(null);

export function useToast()  { return useContext(ToastContext); }
export function useDialog() { return useContext(DialogContext); }

// ── Provider ──────────────────────────────────────────────────────────────────
export function UIProvider({ children }) {
  const [toasts,  setToasts]  = useState([]);
  const [dialog,  setDialog]  = useState(null);
  const resolveRef = useRef(null);
  let toastId = useRef(0);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId.current;
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), duration);
  }, []);

  const success = useCallback((msg) => toast(msg, 'success'), [toast]);
  const error   = useCallback((msg) => toast(msg, 'error',   5000), [toast]);
  const warning = useCallback((msg) => toast(msg, 'warning'), [toast]);
  const info    = useCallback((msg) => toast(msg, 'info'), [toast]);

  const dismiss = (id) => setToasts(p => p.filter(t => t.id !== id));

  // ── Dialog (confirm/alert) ─────────────────────────────────────────────────
  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({
        title:        options.title        || 'Confirm',
        message:      options.message      || 'Are you sure?',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel:  options.cancelLabel  || 'Cancel',
        variant:      options.variant      || 'primary',
        details:      options.details      || null,
      });
    });
  }, []);

  const handleDialogResult = (result) => {
    setDialog(null);
    if (resolveRef.current) { resolveRef.current(result); resolveRef.current = null; }
  };

  const TOAST_STYLES = {
    success: { bg: '#d1fae5', border: '#6ee7b7', color: '#065f46', icon: '✅' },
    error:   { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', icon: '❌' },
    warning: { bg: '#fef3c7', border: '#fcd34d', color: '#92400e', icon: '⚠️' },
    info:    { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af', icon: 'ℹ️' },
  };

  const VARIANT_BTN = {
    danger:  { bg: '#ef4444', hover: '#dc2626' },
    warning: { bg: '#f59e0b', hover: '#d97706' },
    primary: { bg: '#0f2744', hover: '#1a3a5c' },
  };

  return (
    <ToastContext.Provider  value={{ toast, success, error, warning, info }}>
      <DialogContext.Provider value={{ confirm }}>
        {children}

        {/* ── Toast container ──────────────────────────────────── */}
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10,
          maxWidth: 380, width: 'calc(100vw - 48px)',
          pointerEvents: 'none',
        }}>
          {toasts.map(t => {
            const s = TOAST_STYLES[t.type] || TOAST_STYLES.info;
            return (
              <div key={t.id} style={{
                background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                animation: 'slideInToast .25s ease',
                pointerEvents: 'all',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: s.color, lineHeight: 1.5 }}>
                  {t.message}
                </span>
                <button onClick={() => dismiss(t.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: s.color, fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
                  opacity: 0.6,
                }}>✕</button>
              </div>
            );
          })}
        </div>

        {/* ── Confirm Dialog ───────────────────────────────────── */}
        {dialog && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,39,68,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9998, padding: 16,
            backdropFilter: 'blur(2px)',
          }}
            onClick={(e) => { if (e.target === e.currentTarget) handleDialogResult(false); }}
          >
            <div style={{
              background: 'white', borderRadius: 14,
              width: '100%', maxWidth: 420,
              boxShadow: '0 20px 60px rgba(0,0,0,.2)',
              overflow: 'hidden',
              animation: 'dialogPop .2s ease',
            }}>
              {/* Header */}
              <div style={{
                padding: '20px 24px 0',
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: dialog.variant === 'danger' ? '#fee2e2' : dialog.variant === 'warning' ? '#fef3c7' : '#dbeafe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  {dialog.variant === 'danger' ? '🗑️' : dialog.variant === 'warning' ? '⚠️' : '❓'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#0f2744', marginBottom: 6 }}>
                    {dialog.title}
                  </div>
                  <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
                    {dialog.message}
                  </div>
                  {dialog.details && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px',
                      background: '#f8fafc', borderRadius: 6, fontSize: 12, color: '#64748b'
                    }}>
                      {dialog.details}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '20px 24px',
                display: 'flex', justifyContent: 'flex-end', gap: 10,
              }}>
                <button
                  onClick={() => handleDialogResult(false)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                    background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    color: '#64748b', fontFamily: 'var(--font)',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.target.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { e.target.style.background = 'white'; }}
                >
                  {dialog.cancelLabel}
                </button>
                <button
                  onClick={() => handleDialogResult(true)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: VARIANT_BTN[dialog.variant]?.bg || '#0f2744',
                    color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    fontFamily: 'var(--font)', transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.target.style.background = VARIANT_BTN[dialog.variant]?.hover || '#1a3a5c'; }}
                  onMouseLeave={e => { e.target.style.background = VARIANT_BTN[dialog.variant]?.bg || '#0f2744'; }}
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideInToast {
            from { opacity: 0; transform: translateX(40px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes dialogPop {
            from { opacity: 0; transform: scale(.95); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </DialogContext.Provider>
    </ToastContext.Provider>
  );
}
