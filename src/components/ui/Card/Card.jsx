import React from 'react';
import './Card.css';

const Card = ({
  children,
  variant = 'default',
  padding = 'md',
  hoverable = false,
  onClick,
  className = '',
  ...props
}) => {
  const classes = [
    'card',
    `card-${variant}`,
    `card-padding-${padding}`,
    hoverable && 'card-hoverable',
    onClick && 'card-clickable',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={onClick} {...props}>
      {children}
    </div>
  );
};

Card.Header = ({ children, className = '' }) => (
  <div className={`card-header ${className}`}>{children}</div>
);

Card.Title = ({ children, className = '' }) => (
  <h3 className={`card-title ${className}`}>{children}</h3>
);

Card.Body = ({ children, className = '' }) => (
  <div className={`card-body ${className}`}>{children}</div>
);

Card.Footer = ({ children, className = '' }) => (
  <div className={`card-footer ${className}`}>{children}</div>
);

Card.Actions = ({ children, className = '' }) => (
  <div className={`card-actions ${className}`}>{children}</div>
);

export default Card;
