import React from 'react';
import { CheckCircleIcon, InfoIcon, XIcon } from './Icons';

export function showToast(message, type = 'success') {
  window.dispatchEvent(
    new CustomEvent('app-toast', { detail: { id: Date.now() + Math.random(), message, type } })
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    const onToast = (e) => {
      const item = e.detail;
      setToasts((prev) => [...prev.slice(-3), item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 3200);
    };
    window.addEventListener('app-toast', onToast);
    return () => window.removeEventListener('app-toast', onToast);
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
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
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

