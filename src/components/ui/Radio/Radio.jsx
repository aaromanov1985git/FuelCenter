import React from 'react';
import './Radio.css';

const Radio = ({
  checked = false,
  onChange,
  label,
  value,
  name,
  disabled = false,
  className = '',
  ...props
}) => {
  const handleChange = (e) => {
    if (!disabled) {
      onChange?.(value);
    }
  };

  const classes = [
    'radio-wrapper',
    disabled && 'radio-disabled',
    className
  ].filter(Boolean).join(' ');

  return (
    <label className={classes}>
      <input
        type="radio"
        className="radio-input"
        checked={checked}
        onChange={handleChange}
        value={value}
        name={name}
        disabled={disabled}
        {...props}
      />
      <span className="radio-custom">
        {checked && <span className="radio-dot" />}
      </span>
      {label && <span className="radio-label">{label}</span>}
    </label>
  );
};

const RadioGroup = ({ children, value, onChange, name, className = '' }) => {
  return (
    <div className={`radio-group ${className}`} role="radiogroup">
      {React.Children.map(children, (child) => {
        if (child.type === Radio) {
          return React.cloneElement(child, {
            checked: child.props.value === value,
            onChange: onChange,
            name: name || child.props.name
          });
        }
        return child;
      })}
    </div>
  );
};

Radio.Group = RadioGroup;

export default Radio;
