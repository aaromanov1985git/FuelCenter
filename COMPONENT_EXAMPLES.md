# Примеры реализации UI компонентов

## 📋 Оглавление
- [Button Component](#button-component)
- [Input Component](#input-component)
- [Select Component](#select-component)
- [Card Component](#card-component)
- [Badge Component](#badge-component)
- [Modal Component](#modal-component)
- [Table Component](#table-component)
- [Form Component](#form-component)

---

## Button Component

### Button.jsx
```jsx
import React from 'react';
import './Button.css';
import { useRipple } from '../../hooks/useRipple';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}) => {
  const rippleRef = useRipple();

  const handleClick = (e) => {
    if (disabled || loading) return;
    onClick?.(e);
  };

  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    fullWidth && 'btn-full-width',
    loading && 'btn-loading',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={rippleRef}
      type={type}
      className={classes}
      onClick={handleClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="btn-spinner" />}
      {!loading && icon && iconPosition === 'left' && (
        <span className="btn-icon btn-icon-left">{icon}</span>
      )}
      <span className="btn-text">{children}</span>
      {!loading && icon && iconPosition === 'right' && (
        <span className="btn-icon btn-icon-right">{icon}</span>
      )}
    </button>
  );
};

export default Button;
```

### Button.css
```css
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-small);
  border: none;
  border-radius: var(--radius-small);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-in-out);
  overflow: hidden;
  white-space: nowrap;
  font-family: inherit;
}

/* Sizes */
.btn-sm {
  height: 32px;
  padding: 0 12px;
  font-size: var(--font-size-sm);
}

.btn-md {
  height: 40px;
  padding: 0 20px;
  font-size: var(--font-size-base);
}

.btn-lg {
  height: 48px;
  padding: 0 24px;
  font-size: var(--font-size-lg);
}

/* Variants */
.btn-primary {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
}

.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.btn-success {
  background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-dark) 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.btn-error {
  background: linear-gradient(135deg, var(--color-error) 0%, var(--color-error-dark) 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.btn-ghost {
  background: transparent;
  color: var(--color-primary);
  border: none;
}

.btn-ghost:hover:not(:disabled) {
  background: var(--color-primary-light);
}

/* States */
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-full-width {
  width: 100%;
}

.btn-loading {
  pointer-events: none;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Ripple effect */
.btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.btn:active::after {
  width: 300px;
  height: 300px;
}

/* Icon */
.btn-icon {
  display: inline-flex;
  align-items: center;
  font-size: 1.2em;
}
```

### useRipple.js Hook
```js
import { useRef, useEffect } from 'react';

export const useRipple = () => {
  const rippleRef = useRef(null);

  useEffect(() => {
    const element = rippleRef.current;
    if (!element) return;

    const createRipple = (e) => {
      const ripple = document.createElement('span');
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.classList.add('ripple');

      element.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    };

    element.addEventListener('click', createRipple);
    return () => element.removeEventListener('click', createRipple);
  }, []);

  return rippleRef;
};
```

---

## Input Component

### Input.jsx
```jsx
import React, { useState } from 'react';
import './Input.css';

const Input = ({
  type = 'text',
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  helperText,
  disabled = false,
  required = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const inputType = type === 'password' && showPassword ? 'text' : type;

  const wrapperClasses = [
    'input-wrapper',
    isFocused && 'input-focused',
    error && 'input-error',
    disabled && 'input-disabled',
    fullWidth && 'input-full-width',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label className="input-label">
          {label}
          {required && <span className="input-required">*</span>}
        </label>
      )}

      <div className="input-container">
        {icon && iconPosition === 'left' && (
          <span className="input-icon input-icon-left">{icon}</span>
        )}

        <input
          type={inputType}
          className="input-field"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          required={required}
          {...props}
        />

        {type === 'password' && (
          <button
            type="button"
            className="input-icon input-icon-right input-password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        )}

        {icon && iconPosition === 'right' && type !== 'password' && (
          <span className="input-icon input-icon-right">{icon}</span>
        )}
      </div>

      {(error || helperText) && (
        <div className={`input-helper ${error ? 'input-helper-error' : ''}`}>
          {error || helperText}
        </div>
      )}
    </div>
  );
};

export default Input;
```

### Input.css
```css
.input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-tiny);
  width: 300px;
}

.input-full-width {
  width: 100%;
}

.input-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.input-required {
  color: var(--color-error);
  margin-left: 2px;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.input-field {
  width: 100%;
  height: 40px;
  padding: 0 var(--padding-small);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-small);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  background: var(--color-bg-card);
  transition: all var(--duration-normal) var(--ease-in-out);
}

.input-field:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.input-field::placeholder {
  color: var(--color-text-tertiary);
}

/* With icons */
.input-container:has(.input-icon-left) .input-field {
  padding-left: 40px;
}

.input-container:has(.input-icon-right) .input-field {
  padding-right: 40px;
}

.input-icon {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: var(--color-text-secondary);
}

.input-icon-left {
  left: 0;
}

.input-icon-right {
  right: 0;
}

.input-password-toggle {
  background: none;
  border: none;
  cursor: pointer;
  transition: transform var(--duration-fast);
}

.input-password-toggle:hover {
  transform: scale(1.1);
}

/* States */
.input-error .input-field {
  border-color: var(--color-error);
}

.input-error .input-field:focus {
  box-shadow: 0 0 0 3px var(--color-error-light);
}

.input-disabled .input-field {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--color-bg-secondary);
}

/* Helper text */
.input-helper {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.input-helper-error {
  color: var(--color-error-dark);
}
```

---

## Badge Component

### Badge.jsx
```jsx
import React from 'react';
import './Badge.css';

const VARIANT_ICONS = {
  success: '✓',
  warning: '⚠',
  error: '✗',
  info: 'ℹ',
  neutral: '○'
};

const Badge = ({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  dot = false,
  pulse = false,
  className = '',
  ...props
}) => {
  const defaultIcon = VARIANT_ICONS[variant];
  const displayIcon = icon !== undefined ? icon : defaultIcon;

  const classes = [
    'badge',
    `badge-${variant}`,
    `badge-${size}`,
    pulse && 'badge-pulse',
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      {dot && <span className="badge-dot" />}
      {displayIcon && !dot && (
        <span className="badge-icon">{displayIcon}</span>
      )}
      <span className="badge-text">{children}</span>
    </span>
  );
};

export default Badge;
```

### Badge.css
```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-tiny);
  padding: var(--spacing-tiny) var(--padding-small);
  border-radius: var(--radius-badge);
  font-weight: var(--font-weight-bold);
  border: 1px solid transparent;
  white-space: nowrap;
}

/* Sizes */
.badge-sm {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
}

.badge-md {
  font-size: var(--font-size-sm);
  padding: var(--spacing-tiny) var(--padding-small);
}

.badge-lg {
  font-size: var(--font-size-base);
  padding: var(--spacing-small) var(--padding-element);
}

/* Variants */
.badge-success {
  background: var(--color-success-light);
  color: var(--color-success-dark);
  border-color: var(--color-success);
}

.badge-warning {
  background: var(--color-warning-light);
  color: var(--color-warning-dark);
  border-color: var(--color-warning);
}

.badge-error {
  background: var(--color-error-light);
  color: var(--color-error-dark);
  border-color: var(--color-error);
}

.badge-info {
  background: var(--color-info-light);
  color: var(--color-info-dark);
  border-color: var(--color-info);
}

.badge-neutral {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

/* Dot indicator */
.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

/* Pulse animation */
.badge-pulse {
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}

/* Icon */
.badge-icon {
  font-size: 1.2em;
  line-height: 1;
}
```

---

## Modal Component

### Modal.jsx
```jsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showCloseButton = true,
  className = ''
}) => {
  const modalRef = useFocusTrap(isOpen);
  useScrollLock(isOpen);

  useEffect(() => {
    if (!closeOnEsc) return;

    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, closeOnEsc]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalClasses = [
    'modal',
    `modal-${size}`,
    className
  ].filter(Boolean).join(' ');

  return createPortal(
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div ref={modalRef} className={modalClasses} role="dialog" aria-modal="true">
        {title && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
            {showCloseButton && (
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

Modal.Body = ({ children, className = '' }) => (
  <div className={`modal-body ${className}`}>{children}</div>
);

Modal.Footer = ({ children, className = '' }) => (
  <div className={`modal-footer ${className}`}>{children}</div>
);

export default Modal;
```

### useFocusTrap.js Hook
```js
import { useRef, useEffect } from 'react';

export const useFocusTrap = (isActive) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    const element = ref.current;
    if (!element) return;

    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    element.addEventListener('keydown', handleTab);
    firstElement?.focus();

    return () => element.removeEventListener('keydown', handleTab);
  }, [isActive]);

  return ref;
};
```

### useScrollLock.js Hook
```js
import { useEffect } from 'react';

export const useScrollLock = (isLocked) => {
  useEffect(() => {
    if (!isLocked) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isLocked]);
};
```

---

## Примеры использования компонентов

### Dashboard с новыми компонентами
```jsx
import { Card, Button, Badge, Input } from '../components/ui';

const Dashboard = () => {
  return (
    <div className="dashboard">
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Статистика ГСМ</Card.Title>
          <Card.Actions>
            <Button
              variant="primary"
              icon={<RefreshIcon />}
              onClick={handleRefresh}
            >
              Обновить
            </Button>
          </Card.Actions>
        </Card.Header>

        <Card.Body>
          <div className="stats-grid">
            <div className="stat-item">
              <Badge variant="success" pulse>
                Активных: 245
              </Badge>
            </div>
            <div className="stat-item">
              <Badge variant="warning">
                На проверке: 12
              </Badge>
            </div>
            <div className="stat-item">
              <Badge variant="error">
                Ошибок: 3
              </Badge>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};
```

### Форма редактирования с новыми компонентами
```jsx
import { Form, Input, Select, Button, Modal } from '../components/ui';

const VehicleEditForm = ({ vehicle, onSave, onCancel }) => {
  return (
    <Modal
      isOpen={true}
      title="Редактирование ТС"
      size="lg"
      onClose={onCancel}
    >
      <Form
        initialValues={vehicle}
        onSubmit={onSave}
        validationSchema={vehicleSchema}
      >
        {({ values, errors, handleChange, handleSubmit, isSubmitting }) => (
          <>
            <Modal.Body>
              <Input
                label="Гос. номер"
                name="plate_number"
                value={values.plate_number}
                onChange={handleChange}
                error={errors.plate_number}
                required
                fullWidth
              />

              <Select
                label="Поставщик"
                name="provider"
                options={providerOptions}
                value={values.provider}
                onChange={handleChange}
                error={errors.provider}
                searchable
                fullWidth
              />
            </Modal.Body>

            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={onCancel}
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={isSubmitting}
              >
                Сохранить
              </Button>
            </Modal.Footer>
          </>
        )}
      </Form>
    </Modal>
  );
};
```

---

**Автор:** Claude AI
**Дата:** 2025-01-28
