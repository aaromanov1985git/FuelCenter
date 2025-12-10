import React from 'react'
import './FormField.css'

/**
 * Компонент поля формы с валидацией и визуальной обратной связью
 * 
 * @param {string} label - Метка поля
 * @param {string} name - Имя поля
 * @param {string} type - Тип input
 * @param {string} value - Значение
 * @param {function} onChange - Обработчик изменения
 * @param {function} onBlur - Обработчик потери фокуса
 * @param {string} error - Сообщение об ошибке
 * @param {boolean} touched - Было ли поле затронуто (touched)
 * @param {boolean} required - Обязательное ли поле
 * @param {string} placeholder - Placeholder
 * @param {string} helpText - Подсказка под полем
 * @param {React.ReactNode} children - Дочерние элементы (для select, textarea и т.д.)
 * @param {object} ...props - Остальные props передаются в input
 */
const FormField = ({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  touched,
  required = false,
  placeholder,
  helpText,
  children,
  className = '',
  ...props
}) => {
  const hasError = touched && error
  const isValid = touched && !error && value

  return (
    <div className={`form-field ${className} ${hasError ? 'form-field-error' : ''} ${isValid ? 'form-field-valid' : ''}`}>
      {label && (
        <label htmlFor={name} className="form-field-label">
          {label}
          {required && <span className="required-mark"> *</span>}
        </label>
      )}
      
      <div className="form-field-input-wrapper">
        {children ? (
          React.cloneElement(children, {
            id: name,
            name,
            value: value || '',
            onChange,
            onBlur,
            className: `form-field-input ${hasError ? 'form-field-input-error' : ''} ${isValid ? 'form-field-input-valid' : ''} ${children.props.className || ''}`,
            'aria-invalid': hasError ? 'true' : 'false',
            'aria-describedby': hasError ? `${name}-error` : helpText ? `${name}-help` : undefined,
            ...props
          })
        ) : (
          <>
            <input
              type={type}
              id={name}
              name={name}
              value={value || ''}
              onChange={onChange}
              onBlur={onBlur}
              placeholder={placeholder}
              required={required}
              className={`form-field-input ${hasError ? 'form-field-input-error' : ''} ${isValid ? 'form-field-input-valid' : ''}`}
              aria-invalid={hasError ? 'true' : 'false'}
              aria-describedby={hasError ? `${name}-error` : helpText ? `${name}-help` : undefined}
              {...props}
            />
            {/* Иконки состояния */}
            {isValid && (
              <span className="form-field-icon form-field-icon-valid" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </span>
            )}
            {hasError && (
              <span className="form-field-icon form-field-icon-error" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </>
        )}
      </div>

      {/* Сообщение об ошибке */}
      {hasError && (
        <div id={`${name}-error`} className="form-field-error-message" role="alert">
          {error}
        </div>
      )}

      {/* Подсказка */}
      {helpText && !hasError && (
        <div id={`${name}-help`} className="form-field-help">
          {helpText}
        </div>
      )}
    </div>
  )
}

export default FormField

