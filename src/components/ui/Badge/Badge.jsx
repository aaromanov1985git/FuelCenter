import React from 'react';
import './Badge.css';

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
  // Глиф не подставляется автоматически: раньше бейдж сам дорисовывал «✓», «⚠», «○»
  // по варианту, и эти значки расползлись по интерфейсу помимо воли авторов.
  // Нужен значок — передайте icon явно, нужна точка состояния — dot.
  const displayIcon = icon;

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
