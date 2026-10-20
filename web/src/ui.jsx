import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { STATUS } from './status.js';

export const shortDate = (d) => (d ? String(d).slice(5, 10) : '');

export function StatusPill({ status, inferred }) {
  const s = STATUS[status] || STATUS.unknown;
  return (
    <span className={`pill tone-${s.tone}${inferred ? ' inferred' : ''}`} title={inferred ? '旧文件没有 frontmatter，状态是推断的' : undefined}>
      {s.label}
    </span>
  );
}

export function Progress({ done, total, wide }) {
  if (!total) return <span className="progress-empty">无子任务</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <span
      className={`progress${wide ? ' wide' : ''}${done === total ? ' complete' : ''}`}
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`子任务完成 ${done}/${total}`}
    >
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="progress-num">{done}/{total}</span>
    </span>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <span>{error?.message || '出错了'}</span>
      {onRetry && <button type="button" className="btn small" onClick={onRetry}>重试</button>}
    </div>
  );
}

export const Loading = ({ text = '读取中…' }) => <div className="loading" aria-busy="true">{text}</div>;

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input, button, textarea, select')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'error') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((x) => [...x.slice(-3), { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === 'error' ? 5200 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => <div key={i.id} className={`toast ${i.tone}`}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
