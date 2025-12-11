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
