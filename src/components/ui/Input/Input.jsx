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
  name,
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
        <label className="input-label" htmlFor={name}>
          {label}
          {required && <span className="input-required">*</span>}
        </label>
      )}

      <div className="input-container">
        {icon && iconPosition === 'left' && (
          <span className="input-icon input-icon-left">{icon}</span>
        )}

        <input
          id={name}
          name={name}
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
