import { useState, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, duration) => addToast(msg, 'success', duration),
    error: (msg, duration) => addToast(msg, 'error', duration),
    warning: (msg, duration) => addToast(msg, 'warning', duration),
    info: (msg, duration) => addToast(msg, 'info', duration),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const colors = {
    success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46' },
    error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
    warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
    info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  };

  const color = colors[toast.type] || colors.info;

  return (
    <div
      style={{
        ...styles.toast,
        background: color.bg,
        borderLeft: `4px solid ${color.border}`,
        color: color.text,
        animation: isExiting ? 'slideOut 0.3s ease forwards' : 'slideIn 0.3s ease forwards',
      }}
    >
      <span style={styles.icon}>{icons[toast.type]}</span>
      <span style={styles.message}>{toast.message}</span>
      <button
        onClick={handleClose}
        style={styles.closeBtn}
        aria-label="Zavrieť"
      >
        ×
      </button>
    </div>
  );
};

const styles = {
  container: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '400px',
    width: 'calc(100vw - 40px)',
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  icon: {
    fontSize: '16px',
    flexShrink: 0,
    marginTop: '1px',
  },
  message: {
    flex: 1,
    wordBreak: 'break-word',
    whiteSpace: 'pre-line',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    opacity: 0.6,
    padding: '0 4px',
    marginLeft: '8px',
    lineHeight: 1,
    color: 'inherit',
  },
};

// Add keyframe animations
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes slideOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(100%); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default ToastProvider;
