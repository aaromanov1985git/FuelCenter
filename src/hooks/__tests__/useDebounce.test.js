/**
 * Тесты для хука useDebounce
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDebounce } from '../useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('должен возвращать начальное значение сразу', () => {
    const { result } = renderHook(() => useDebounce('initial', 300))
    
    expect(result.current).toBe('initial')
  })

  it('должен обновлять значение после задержки', async () => {
    vi.useRealTimers() // Используем реальные таймеры для этого теста
    
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 100 } // Уменьшаем задержку для теста
      }
    )

    expect(result.current).toBe('initial')

    // Изменяем значение
    act(() => {
      rerender({ value: 'updated', delay: 100 })
    })

    // Значение не должно измениться сразу
    expect(result.current).toBe('initial')

    // Ждем обновления после задержки
    await waitFor(() => {
      expect(result.current).toBe('updated')
    }, { timeout: 200 })
    
    vi.useFakeTimers() // Возвращаемся к fake timers
  })

  it('должен использовать кастомную задержку', async () => {
    vi.useRealTimers() // Используем реальные таймеры
    
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 100 }
      }
    )

    act(() => {
      rerender({ value: 'updated', delay: 100 })
    })

    // Значение не должно измениться сразу
    expect(result.current).toBe('initial')

    // Ждем обновления после задержки
    await waitFor(() => {
      expect(result.current).toBe('updated')
    }, { timeout: 200 })
    
    vi.useFakeTimers() // Возвращаемся к fake timers
  })

  it('должен отменять предыдущий таймер при быстром изменении значения', async () => {
    vi.useRealTimers() // Используем реальные таймеры
    
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 100 }
      }
    )

    // Быстро меняем значение несколько раз
    act(() => {
      rerender({ value: 'value1', delay: 100 })
    })
    await new Promise(resolve => setTimeout(resolve, 50))

    act(() => {
      rerender({ value: 'value2', delay: 100 })
    })
    await new Promise(resolve => setTimeout(resolve, 50))

    act(() => {
      rerender({ value: 'value3', delay: 100 })
    })

    // Значение все еще должно быть начальным
    expect(result.current).toBe('initial')

    // Ждем обновления после задержки (должно быть value3, так как это последнее изменение)
    await waitFor(() => {
      expect(result.current).toBe('value3')
    }, { timeout: 200 })
    
    vi.useFakeTimers() // Возвращаемся к fake timers
  })

  it('должен очищать таймер при размонтировании', () => {
    const { result, unmount, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 300 }
      }
    )

    rerender({ value: 'updated', delay: 300 })
    
    // Размонтируем компонент
    unmount()

    // Продвигаем время - не должно быть ошибок
    vi.advanceTimersByTime(300)
    
    // Проверяем, что таймер был очищен
    expect(vi.getTimerCount()).toBe(0)
  })

  it('должен работать с числовыми значениями', async () => {
    vi.useRealTimers() // Используем реальные таймеры
    
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 0, delay: 100 }
      }
    )

    act(() => {
      rerender({ value: 100, delay: 100 })
    })

    // Ждем обновления после задержки
    await waitFor(() => {
      expect(result.current).toBe(100)
    }, { timeout: 200 })
    
    vi.useFakeTimers() // Возвращаемся к fake timers
  })

  it('должен работать с объектами', async () => {
    vi.useRealTimers() // Используем реальные таймеры
    
    const initialObj = { key: 'value1' }
    const updatedObj = { key: 'value2' }

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: initialObj, delay: 100 }
      }
    )

    act(() => {
      rerender({ value: updatedObj, delay: 100 })
    })

    // Ждем обновления после задержки
    await waitFor(() => {
      expect(result.current).toBe(updatedObj)
      expect(result.current.key).toBe('value2')
    }, { timeout: 200 })
    
    vi.useFakeTimers() // Возвращаемся к fake timers
  })
})

