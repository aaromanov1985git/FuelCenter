import React from 'react'
import Input from './ui/Input/Input'
import './FormField.css'

/**
 * Компонент поля формы с валидацией и визуальной обратной связью
 * Использует стандартный Input из ui библиотеки
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
 * @param {object} ...props - Остальные props передаются в Input
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
  // Показываем ошибку только если поле было затронуто (touched)
  const displayError = touched && error ? error : undefined
  const displayHelperText = !displayError && helpText ? helpText : undefined

  // Если передан children (например, для select), используем старую логику
  if (children) {
    const hasError = touched && error
    const isValid = touched && !error && value

    // Проверяем, является ли children React элементом
    const isReactElement = React.isValidElement(children)
    const childrenClassName = isReactElement && children.props ? (children.props.className || '') : ''

    return (
      <div className={`form-field ${className} ${hasError ? 'form-field-error' : ''} ${isValid ? 'form-field-valid' : ''}`}>
        {label && (
          <label htmlFor={name} className="form-field-label">
            {label}
            {required && <span className="required-mark"> *</span>}
          </label>
        )}
        
        <div className="form-field-input-wrapper">
          {isReactElement ? (
            React.cloneElement(children, {
              id: name,
              name,
              value: value || '',
              onChange,
              onBlur,
              className: `form-field-input ${hasError ? 'form-field-input-error' : ''} ${isValid ? 'form-field-input-valid' : ''} ${childrenClassName}`,
              'aria-invalid': hasError ? 'true' : 'false',
              'aria-describedby': hasError ? `${name}-error` : helpText ? `${name}-help` : undefined,
              ...props
            })
          ) : (
            children
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

  // Используем стандартный Input из ui библиотеки
  return (
    <div className={`form-field ${className}`}>
      <Input
        type={type}
        name={name}
        label={label}
        value={value || ''}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        error={displayError}
        helperText={displayHelperText}
        fullWidth
        className={className}
        {...props}
      />
    </div>
  )
}

export default FormField

