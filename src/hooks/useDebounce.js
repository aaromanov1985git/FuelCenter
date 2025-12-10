import { useState, useEffect } from 'react'

/**
 * Хук для debounce значения
 * 
 * @param {any} value - Значение для debounce
 * @param {number} delay - Задержка в миллисекундах (по умолчанию 300ms)
 * @returns {any} - Debounced значение
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    // Устанавливаем таймер для обновления значения
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Очищаем таймер при изменении value или delay
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
