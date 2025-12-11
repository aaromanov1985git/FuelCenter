import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

const Toast = ({
  variant = 'info',
  title,
  message,
  duration = 5000,
  onClose,
  closable = true,
  icon,
  position = 'top-right',
  id
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Появление с анимацией
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Автозакрытие
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      if (onClose) onClose(id);
    }, 300); // Длительность анимации выхода
  };

  const defaultIcons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toastIcon = icon || defaultIcons[variant];

  return (
    <div
      className={`ui-toast ui-toast-${variant} ${isVisible && !isExiting ? 'ui-toast-visible' : ''} ${isExiting ? 'ui-toast-exiting' : ''}`}
      role="alert"
      aria-live="polite"
    >
      {toastIcon && <div className="ui-toast-icon">{toastIcon}</div>}
      <div className="ui-toast-content">
        {title && <div className="ui-toast-title">{title}</div>}
        {message && <div className="ui-toast-message">{message}</div>}
      </div>
      {closable && (
        <button className="ui-toast-close" onClick={handleClose} aria-label="Закрыть">
          ×
        </button>
      )}
      {duration > 0 && (
        <div className="ui-toast-progress" style={{ animationDuration: `${duration}ms` }} />
      )}
    </div>
  );
};

const ToastContainer = ({ toasts = [], position = 'top-right', onClose }) => {
  const positionClass = `ui-toast-container-${position}`;

  return createPortal(
    <div className={`ui-toast-container ${positionClass}`} aria-label="Уведомления">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>,
    document.body
  );
};

// Хук для управления toast-уведомлениями
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const showToast = ({
    variant = 'info',
    title,
    message,
    duration = 5000,
    closable = true,
    icon,
    position = 'top-right'
  }) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      variant,
      title,
      message,
      duration,
      closable,
      icon,
      position
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  };

  const closeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const success = (message, title = 'Успешно', options = {}) =>
    showToast({ variant: 'success', title, message, ...options });

  const error = (message, title = 'Ошибка', options = {}) =>
    showToast({ variant: 'error', title, message, duration: 7000, ...options });

  const warning = (message, title = 'Внимание', options = {}) =>
    showToast({ variant: 'warning', title, message, ...options });

  const info = (message, title, options = {}) =>
    showToast({ variant: 'info', title, message, ...options });

  return {
    toasts,
    showToast,
    closeToast,
    success,
    error,
    warning,
    info,
    ToastContainer: () => <ToastContainer toasts={toasts} onClose={closeToast} />
  };
};

Toast.Container = ToastContainer;

export default Toast;
