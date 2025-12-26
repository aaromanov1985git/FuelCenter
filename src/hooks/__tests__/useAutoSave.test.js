/**
 * Тесты для хука useAutoSave
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAutoSave } from '../useAutoSave'

describe('useAutoSave', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('должен возвращать функции и состояние', () => {
    const { result } = renderHook(() => useAutoSave({}, 'test-key'))

    expect(result.current).toHaveProperty('clearAutoSave')
    expect(result.current).toHaveProperty('hasAutoSavedData')
    expect(result.current).toHaveProperty('loadAutoSaved')
    expect(typeof result.current.clearAutoSave).toBe('function')
    expect(typeof result.current.loadAutoSaved).toBe('function')
  })

  it('должен сохранять значения в localStorage с задержкой', async () => {
    const values = { name: 'test', email: 'test@example.com' }
    const { result, rerender } = renderHook(
      ({ values }) => useAutoSave(values, 'test-key', 500),
      { initialProps: { values } }
    )

    act(() => {
      rerender({ values: { ...values, name: 'updated' } })
    })

    // Значения еще не должны быть сохранены
    expect(localStorage.getItem('test-key')).toBeNull()

    // Продвигаем время на 500ms
    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      const saved = localStorage.getItem('test-key')
      expect(saved).toBeTruthy()
      const parsed = JSON.parse(saved)
      expect(parsed.name).toBe('updated')
    })
  })

  it('должен очищать сохраненные данные', async () => {
    const values = { name: 'test' }
    const { result } = renderHook(() => useAutoSave(values, 'test-key', 100))

    act(() => {
      vi.advanceTimersByTime(100)
    })

    await waitFor(() => {
      expect(localStorage.getItem('test-key')).toBeTruthy()
    })

    act(() => {
      result.current.clearAutoSave()
    })

    expect(localStorage.getItem('test-key')).toBeNull()
  })

  it('должен загружать сохраненные данные', async () => {
    const savedValues = { name: 'saved', email: 'saved@example.com' }
    localStorage.setItem('test-key', JSON.stringify(savedValues))

    const { result } = renderHook(() => useAutoSave({}, 'test-key'))

    const loaded = result.current.loadAutoSaved()
    expect(loaded).toEqual(savedValues)
  })

  it('должен проверять наличие сохраненных данных', async () => {
    const { result } = renderHook(() => useAutoSave({}, 'test-key'))

    expect(result.current.hasAutoSavedData).toBe(false)

    localStorage.setItem('test-key', JSON.stringify({ test: 'data' }))

    const { result: result2 } = renderHook(() => useAutoSave({}, 'test-key'))
    expect(result2.current.hasAutoSavedData).toBe(true)
  })

  it('должен отменять сохранение при быстром изменении значений', async () => {
    const { result, rerender } = renderHook(
      ({ values }) => useAutoSave(values, 'test-key', 500),
      { initialProps: { values: { name: 'test1' } } }
    )

    act(() => {
      rerender({ values: { name: 'test2' } })
      vi.advanceTimersByTime(200)
      rerender({ values: { name: 'test3' } })
      vi.advanceTimersByTime(200)
      rerender({ values: { name: 'test4' } })
    })

    // Продвигаем время на 500ms с последнего изменения
    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('test-key') || '{}')
      expect(saved.name).toBe('test4')
    })
  })

  it('не должен сохранять, если enabled = false', async () => {
    const { rerender } = renderHook(
      ({ values, enabled }) => useAutoSave(values, 'test-key', 100, enabled),
      { initialProps: { values: { name: 'test' }, enabled: false } }
    )

    act(() => {
      rerender({ values: { name: 'updated' }, enabled: false })
      vi.advanceTimersByTime(100)
    })

    expect(localStorage.getItem('test-key')).toBeNull()
  })

  it('не должен сохранять, если значения не изменились', async () => {
    const values = { name: 'test' }
    const { rerender } = renderHook(
      ({ values }) => useAutoSave(values, 'test-key', 100),
      { initialProps: { values } }
    )

    act(() => {
      vi.advanceTimersByTime(100)
    })

    await waitFor(() => {
      expect(localStorage.getItem('test-key')).toBeTruthy()
    })

    const savedCount = localStorage.getItem('test-key')
    
    act(() => {
      rerender({ values: { ...values } }) // Тот же объект
      vi.advanceTimersByTime(100)
    })

    // Значение не должно измениться
    expect(localStorage.getItem('test-key')).toBe(savedCount)
  })
})

