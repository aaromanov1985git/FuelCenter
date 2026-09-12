import React from 'react';
import './Button.css';
import { useRipple } from '../../../hooks/useRipple';

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

  // Кнопка без подписи — иконочная: квадрат 36×36 (md) без боковых отступов.
  const hasLabel = !(children === undefined || children === null || children === false || children === '');
  const iconOnly = Boolean(icon) && !hasLabel;

  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    iconOnly && 'btn-icon-only',
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
      {!loading && hasLabel && <span className="btn-text">{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className="btn-icon btn-icon-right">{icon}</span>
      )}
    </button>
  );
};

export default Button;
