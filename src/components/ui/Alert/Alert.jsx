import React from 'react';
import Icon from '../Icon';
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
  // Имя иконки из примитива Icon, а не глиф: значок наследует цвет текста варианта.
  const defaultIconNames = {
    success: 'check',
    error: 'close',
    warning: 'alert',
    info: 'info'
  };

  // icon может быть готовым узлом от вызывающего кода — тогда подстановка по варианту не нужна.
  const alertIcon = icon || (defaultIconNames[variant]
    ? <Icon name={defaultIconNames[variant]} size={16} />
    : null);

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
