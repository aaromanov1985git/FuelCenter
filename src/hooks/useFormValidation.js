import { useState, useCallback } from 'react'

/**
 * Хук для валидации форм в реальном времени
 * 
 * @param {object} initialValues - Начальные значения формы
 * @param {object} validationRules - Правила валидации
 * @returns {object} { values, errors, touched, handleChange, handleBlur, validate, isValid }
 * 
 * @example
 * const validationRules = {
 *   name: {
 *     required: true,
 *     minLength: 3,
 *     message: 'Название должно быть не менее 3 символов'
 *   },
 *   email: {
 *     required: true,
 *     pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
 *     message: 'Некорректный email'
 *   }
 * }
 * 
 * const { values, errors, touched, handleChange, handleBlur, isValid } = useFormValidation(
 *   { name: '', email: '' },
 *   validationRules
 * )
 */
export const useFormValidation = (initialValues = {}, validationRules = {}) => {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  // Валидация одного поля
  const validateField = useCallback((name, value) => {
    const rule = validationRules[name]
    if (!rule) return null

    // Проверка обязательного поля
    if (rule.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      return rule.message || `${name} является обязательным полем`
    }

    // Если поле пустое и не обязательное, не валидируем
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return null
    }

    // Проверка минимальной длины
    if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
      return rule.message || `Минимальная длина: ${rule.minLength} символов`
    }

    // Проверка максимальной длины
    if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
      return rule.message || `Максимальная длина: ${rule.maxLength} символов`
    }

    // Проверка паттерна (regex)
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      return rule.message || `Некорректный формат`
    }

    // Проверка через кастомную функцию
    if (rule.validate && typeof rule.validate === 'function') {
      const customError = rule.validate(value)
      if (customError) {
        return customError
      }
    }

    // Проверка числового диапазона
    if (rule.min !== undefined && Number(value) < rule.min) {
      return rule.message || `Значение должно быть не менее ${rule.min}`
    }

    if (rule.max !== undefined && Number(value) > rule.max) {
      return rule.message || `Значение должно быть не более ${rule.max}`
    }

    return null
  }, [validationRules])

  // Валидация всех полей
  const validate = useCallback(() => {
    const newErrors = {}
    
    Object.keys(validationRules).forEach(name => {
      const error = validateField(name, values[name])
      if (error) {
        newErrors[name] = error
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [values, validationRules, validateField])

  // Обработчик изменения поля
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target
    const newValue = type === 'checkbox' ? checked : value

    setValues(prev => ({
      ...prev,
      [name]: newValue
    }))

    // Валидация в реальном времени, если поле было touched
    if (touched[name]) {
      const error = validateField(name, newValue)
      setErrors(prev => ({
        ...prev,
        [name]: error || undefined
      }))
    }
  }, [touched, validateField])

  // Обработчик потери фокуса (blur)
  const handleBlur = useCallback((e) => {
    const { name, value } = e.target

    setTouched(prev => ({
      ...prev,
      [name]: true
    }))

    // Валидация при потере фокуса
    const error = validateField(name, value)
    setErrors(prev => ({
      ...prev,
      [name]: error || undefined
    }))
  }, [validateField])

  // Сброс формы
  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  // Проверка валидности формы
  const isValid = Object.keys(errors).length === 0 && 
                  Object.keys(values).every(key => {
                    const rule = validationRules[key]
                    if (!rule) return true
                    if (!rule.required) return true
                    const value = values[key]
                    return value !== undefined && value !== null && value !== ''
                  })

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validate,
    isValid,
    reset,
    setValues,
    setErrors,
    setTouched
  }
}

export default useFormValidation

