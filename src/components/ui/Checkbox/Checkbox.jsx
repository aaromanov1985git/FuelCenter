import React from 'react';
import './Checkbox.css';

const Checkbox = ({
  checked = false,
  onChange,
  label,
  disabled = false,
  indeterminate = false,
  className = '',
  name,
  ...props
}) => {
  const handleChange = (e) => {
    if (!disabled) {
      onChange?.(e.target.checked);
    }
  };

  const classes = [
    'checkbox-wrapper',
    disabled && 'checkbox-disabled',
    className
  ].filter(Boolean).join(' ');

  return (
    <label className={classes}>
      <input
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        name={name}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        {...props}
      />
      <span className="checkbox-custom">
        {indeterminate ? (
          <span className="checkbox-indeterminate">−</span>
        ) : checked ? (
          <span className="checkbox-check">✓</span>
        ) : null}
      </span>
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
};

export default Checkbox;
