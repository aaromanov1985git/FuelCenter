import { useState, useCallback, useMemo, useEffect } from 'react'

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
  const validateField = useCallback((name, value, allValues = null) => {
    const rule = validationRules[name]
    if (!rule) return null
    // Используем переданные allValues или текущие values
    const valuesForValidation = allValues || values

    // Проверка обязательного поля
    if (rule.required) {
      if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        return rule.message || `${name} является обязательным полем`
      }
    }

    // Если поле пустое и не обязательное, не валидируем (кроме случаев когда есть validate функция)
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      // Если есть validate функция, она может вернуть null для пустого необязательного поля
      if (rule.validate && typeof rule.validate === 'function') {
        const customError = rule.validate(value)
        return customError || null
      }
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
      // Передаем все значения формы для валидации зависимых полей (например, confirmPassword)
      const customError = rule.validate(value, valuesForValidation)
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
  }, [validationRules, values])

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
    
    // Дополнительная проверка обязательных полей
    const hasRequiredErrors = Object.keys(validationRules).some(name => {
      const rule = validationRules[name]
      if (rule && rule.required) {
        const value = values[name]
        const isEmpty = value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')
        return isEmpty && !newErrors[name] // Если поле пустое и нет ошибки валидации, добавляем ошибку
      }
      return false
    })
    
    if (hasRequiredErrors) {
      Object.keys(validationRules).forEach(name => {
        const rule = validationRules[name]
        if (rule && rule.required && !newErrors[name]) {
          const value = values[name]
          const isEmpty = value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')
          if (isEmpty) {
            newErrors[name] = rule.message || `${name} является обязательным полем`
          }
        }
      })
      setErrors(newErrors)
    }
    
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

  // Автоматическая валидация обязательных полей при изменении значений
  useEffect(() => {
    // Валидируем только обязательные поля, которые были touched или имеют значения
    const newErrors = {}
    let hasChanges = false
    
    Object.keys(validationRules).forEach(name => {
      const rule = validationRules[name]
      if (rule && rule.required) {
        const value = values[name]
        const isEmpty = value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')
        
        if (isEmpty) {
          const errorMsg = rule.message || `${name} является обязательным полем`
          newErrors[name] = errorMsg
          // Проверяем, изменилась ли ошибка
          if (errors[name] !== errorMsg) {
            hasChanges = true
          }
        } else {
          // Если поле заполнено, проверяем валидацию
          const error = validateField(name, value)
          const errorValue = error || undefined
          newErrors[name] = errorValue
          // Проверяем, изменилась ли ошибка
          if (errors[name] !== errorValue) {
            hasChanges = true
          }
        }
      } else if (touched[name] && values[name]) {
        // Валидируем необязательные поля только если они touched и заполнены
        const error = validateField(name, values[name])
        const errorValue = error || undefined
        newErrors[name] = errorValue
        // Проверяем, изменилась ли ошибка
        if (errors[name] !== errorValue) {
          hasChanges = true
        }
      } else if (errors[name]) {
        // Сохраняем существующие ошибки для необязательных полей, если они есть
        newErrors[name] = errors[name]
      }
    })
    
    if (hasChanges) {
      setErrors(newErrors)
    }
  }, [values, touched, validationRules, validateField]) // eslint-disable-line react-hooks/exhaustive-deps

  // Проверка валидности формы
  const isValid = useMemo(() => {
    // Проверяем наличие ошибок (только реальные ошибки, не undefined)
    const hasErrors = Object.keys(errors).some(key => errors[key] !== undefined && errors[key] !== null && errors[key] !== '')
    if (hasErrors) {
      return false
    }
    
    // Проверяем обязательные поля
    for (const key in validationRules) {
      const rule = validationRules[key]
      if (rule && rule.required) {
        const value = values[key]
        const isEmpty = value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')
        if (isEmpty) {
          return false
        }
      }
    }
    
    return true
  }, [errors, values, validationRules])

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

