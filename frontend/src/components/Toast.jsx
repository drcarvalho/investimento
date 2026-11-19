import React from 'react';
import { CheckCircleIcon, InfoIcon, XIcon } from './Icons';

export function showToast(message, type = 'success') {
  window.dispatchEvent(
    new CustomEvent('app-toast', { detail: { id: Date.now() + Math.random(), message, type } })
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = React.useState([]);
  const timersRef = React.useRef(new Map());

  const dismiss = React.useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  React.useEffect(() => {
    const timers = timersRef.current;
    const onToast = (e) => {
      const item = e.detail;
      setToasts((prev) => [...prev.slice(-3), item]);
      const timer = setTimeout(() => {
        timers.delete(item.id);
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 3200);
      timers.set(item.id, timer);
    };
    window.addEventListener('app-toast', onToast);
    return () => {
      window.removeEventListener('app-toast', onToast);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item toast-${t.type}`}>
          <span style={{ display: 'flex', flexShrink: 0 }}>
            {t.type === 'error' ? <XIcon size={15} /> : t.type === 'info' ? <InfoIcon size={15} /> : <CheckCircleIcon size={15} />}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.7, cursor: 'pointer', display: 'flex', padding: 0 }}
            aria-label="Fechar notificação"
          >
            <XIcon size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

