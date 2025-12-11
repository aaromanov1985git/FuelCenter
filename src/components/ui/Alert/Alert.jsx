import React from 'react';
import './Alert.css';

const Alert = ({
  variant = 'info',
  title,
  children,
  onClose,
  closable = false,
  icon,
  className = '',
  ...props
}) => {
  const defaultIcons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const alertIcon = icon || defaultIcons[variant];

  return (
    <div className={`ui-alert ui-alert-${variant} ${className}`} role="alert" {...props}>
      {alertIcon && <div className="ui-alert-icon">{alertIcon}</div>}
      <div className="ui-alert-content">
        {title && <div className="ui-alert-title">{title}</div>}
        <div className="ui-alert-message">{children}</div>
      </div>
      {closable && (
        <button
          className="ui-alert-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Alert;
