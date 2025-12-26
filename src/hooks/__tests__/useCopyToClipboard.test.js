/**
 * Тесты для хука useCopyToClipboard
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCopyToClipboard } from '../useCopyToClipboard'

describe('useCopyToClipboard', () => {
  let clipboardWriteTextSpy

  beforeEach(() => {
    // Мокаем navigator.clipboard
    clipboardWriteTextSpy = vi.fn().mockResolvedValue(undefined)
    global.navigator.clipboard = {
      writeText: clipboardWriteTextSpy
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('должен возвращать функции и состояние', () => {
    const { result } = renderHook(() => useCopyToClipboard())

    expect(result.current).toHaveProperty('copy')
    expect(result.current).toHaveProperty('isCopied')
    expect(result.current).toHaveProperty('error')
    expect(typeof result.current.copy).toBe('function')
    expect(result.current.isCopied).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('должен копировать текст в буфер обмена', async () => {
    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      await result.current.copy('test text')
    })

    expect(clipboardWriteTextSpy).toHaveBeenCalledWith('test text')
    expect(result.current.isCopied).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('должен сбрасывать isCopied через 2 секунды', async () => {
    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      await result.current.copy('test text')
    })

    expect(result.current.isCopied).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.isCopied).toBe(false)
  })

  it('должен обрабатывать ошибки при копировании', async () => {
    const error = new Error('Clipboard error')
    clipboardWriteTextSpy.mockRejectedValueOnce(error)

    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      const success = await result.current.copy('test text')
      expect(success).toBe(false)
    })

    expect(result.current.error).toBe('Clipboard error')
    expect(result.current.isCopied).toBe(false)
  })

  it('должен обрабатывать отсутствие Clipboard API', async () => {
    delete global.navigator.clipboard

    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      const success = await result.current.copy('test text')
      expect(success).toBe(false)
    })

    expect(result.current.error).toBe('Clipboard API не поддерживается в вашем браузере')
    expect(result.current.isCopied).toBe(false)
  })

  it('должен очищать предыдущую ошибку при новом копировании', async () => {
    const error = new Error('First error')
    clipboardWriteTextSpy.mockRejectedValueOnce(error)

    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      await result.current.copy('test text')
    })

    expect(result.current.error).toBe('First error')

    clipboardWriteTextSpy.mockResolvedValueOnce(undefined)

    await act(async () => {
      await result.current.copy('new text')
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isCopied).toBe(true)
  })
})

