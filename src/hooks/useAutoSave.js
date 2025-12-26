import { useEffect, useRef } from 'react'
import { logger } from '../utils/logger'

/**
 * Хук для автосохранения значений формы в localStorage
 * 
 * @param {object} values - Значения формы
 * @param {string} key - Ключ для сохранения в localStorage
 * @param {number} delay - Задержка перед сохранением в миллисекундах (по умолчанию 500)
 * @param {boolean} enabled - Включить/выключить автосохранение (по умолчанию true)
 * 
 * @returns {object} { 
 *   clearAutoSave - функция для очистки сохраненных данных,
 *   hasAutoSavedData - boolean, есть ли сохраненные данные
 * }
 * 
 * @example
 * const { values, setValues } = useFormState(initialValues)
 * const { clearAutoSave, hasAutoSavedData } = useAutoSave(values, 'form-draft', 500)
 * 
 * // Загрузить сохраненные данные при монтировании
 * useEffect(() => {
 *   if (hasAutoSavedData) {
 *     const saved = localStorage.getItem('form-draft')
 *     if (saved) {
 *       setValues(JSON.parse(saved))
 *     }
 *   }
 * }, [])
 */
export const useAutoSave = (values, key, delay = 500, enabled = true) => {
  const timeoutRef = useRef(null)
  const previousValuesRef = useRef(JSON.stringify(values))

  useEffect(() => {
    if (!enabled || !key) return

    // Проверяем, изменились ли значения
    const currentValues = JSON.stringify(values)
    if (currentValues === previousValuesRef.current) {
      return // Значения не изменились, не сохраняем
    }

    // Очищаем предыдущий таймаут
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Устанавливаем новый таймаут для сохранения
    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, currentValues)
        previousValuesRef.current = currentValues
        console.debug('Автосохранение выполнено:', key)
      } catch (error) {
        logger.warn('Ошибка автосохранения:', error)
      }
    }, delay)

    // Очистка при размонтировании или изменении зависимостей
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [values, key, delay, enabled])

  // Функция для очистки сохраненных данных
  const clearAutoSave = () => {
    try {
      localStorage.removeItem(key)
      previousValuesRef.current = JSON.stringify(values)
      console.debug('Автосохранение очищено:', key)
    } catch (error) {
      logger.warn('Ошибка очистки автосохранения:', error)
    }
  }

  // Проверка наличия сохраненных данных
  const hasAutoSavedData = () => {
    try {
      return localStorage.getItem(key) !== null
    } catch {
      return false
    }
  }

  // Загрузка сохраненных данных
  const loadAutoSaved = () => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      logger.warn('Ошибка загрузки автосохранения:', error)
    }
    return null
  }

  return {
    clearAutoSave,
    hasAutoSavedData: hasAutoSavedData(),
    loadAutoSaved
  }
}

export default useAutoSave

