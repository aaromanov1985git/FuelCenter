/**
 * Тесты для хука useSearchHistory
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSearchHistory } from '../useSearchHistory'

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('должен инициализироваться с пустой историей', () => {
    const { result } = renderHook(() => useSearchHistory())

    expect(result.current.history).toEqual([])
  })

  it('должен загружать историю из localStorage', async () => {
    localStorage.setItem('search-history', JSON.stringify(['query1', 'query2']))

    const { result } = renderHook(() => useSearchHistory())

    await waitFor(() => {
      expect(result.current.history).toEqual(['query1', 'query2'])
    })
  })

  it('должен добавлять запрос в историю', async () => {
    const { result } = renderHook(() => useSearchHistory())

    act(() => {
      result.current.addToHistory('test query')
    })

    await waitFor(() => {
      expect(result.current.history).toContain('test query')
      expect(result.current.history[0]).toBe('test query')
    })
  })

  it('должен добавлять новые запросы в начало', async () => {
    const { result } = renderHook(() => useSearchHistory())

    act(() => {
      result.current.addToHistory('query1')
      result.current.addToHistory('query2')
    })

    await waitFor(() => {
      expect(result.current.history[0]).toBe('query2')
      expect(result.current.history[1]).toBe('query1')
    })
  })

  it('должен ограничивать размер истории', async () => {
    const { result } = renderHook(() => useSearchHistory('test-history', 3))

    act(() => {
      result.current.addToHistory('query1')
      result.current.addToHistory('query2')
      result.current.addToHistory('query3')
      result.current.addToHistory('query4')
    })

    await waitFor(() => {
      expect(result.current.history.length).toBe(3)
      expect(result.current.history).not.toContain('query1')
    })
  })

  it('должен удалять дубликаты (регистронезависимо)', async () => {
    const { result } = renderHook(() => useSearchHistory())

    act(() => {
      result.current.addToHistory('Test Query')
      result.current.addToHistory('test query')
      result.current.addToHistory('TEST QUERY')
    })

    await waitFor(() => {
      expect(result.current.history.length).toBe(1)
      expect(result.current.history[0]).toBe('TEST QUERY')
    })
  })

  it('должен очищать историю', async () => {
    const { result } = renderHook(() => useSearchHistory())

    act(() => {
      result.current.addToHistory('query1')
      result.current.addToHistory('query2')
    })

    await waitFor(() => {
      expect(result.current.history.length).toBeGreaterThan(0)
    })

    act(() => {
      result.current.clearHistory()
    })

    await waitFor(() => {
      expect(result.current.history).toEqual([])
    })
  })

  it('должен удалять элемент из истории', async () => {
    const { result } = renderHook(() => useSearchHistory())

    act(() => {
      result.current.addToHistory('query1')
      result.current.addToHistory('query2')
    })

    await waitFor(() => {
      expect(result.current.history.length).toBe(2)
    })

    act(() => {
      result.current.removeFromHistory('query1')
    })

    await waitFor(() => {
      expect(result.current.history).not.toContain('query1')
      expect(result.current.history).toContain('query2')
    })
  })

  it('должен игнорировать пустые запросы', () => {
    const { result } = renderHook(() => useSearchHistory())

    act(() => {
      result.current.addToHistory('')
      result.current.addToHistory('   ')
      result.current.addToHistory(null)
      result.current.addToHistory(undefined)
    })

    expect(result.current.history.length).toBe(0)
  })

  it('должен использовать кастомный storageKey', async () => {
    const { result } = renderHook(() => useSearchHistory('custom-key'))

    act(() => {
      result.current.addToHistory('test')
    })

    await waitFor(() => {
      const saved = localStorage.getItem('custom-key')
      expect(saved).toBeTruthy()
      expect(JSON.parse(saved)).toContain('test')
    })
  })
})

