/**
 * Тесты для хука useScrollLock
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollLock } from '../useScrollLock'

describe('useScrollLock', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
  })

  it('должен блокировать скролл при isLocked = true', () => {
    renderHook(() => useScrollLock(true))

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('должен разблокировать скролл при isLocked = false', () => {
    const { rerender } = renderHook(({ isLocked }) => useScrollLock(isLocked), {
      initialProps: { isLocked: true }
    })

    expect(document.body.style.overflow).toBe('hidden')

    rerender({ isLocked: false })

    expect(document.body.style.overflow).toBe('')
  })

  it('должен восстанавливать оригинальные стили при размонтировании', () => {
    document.body.style.overflow = 'auto'
    document.body.style.paddingRight = '10px'

    const { unmount } = renderHook(() => useScrollLock(true))

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('auto')
    expect(document.body.style.paddingRight).toBe('10px')
  })

  it('должен добавлять paddingRight для компенсации scrollbar', () => {
    // Мокаем ширину scrollbar
    const originalInnerWidth = window.innerWidth
    const originalClientWidth = document.documentElement.clientWidth
    
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1000
    })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      writable: true,
      configurable: true,
      value: 985
    })

    renderHook(() => useScrollLock(true))

    const scrollbarWidth = 1000 - 985
    expect(document.body.style.paddingRight).toBe(`${scrollbarWidth}px`)

    // Восстанавливаем
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth
    })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      writable: true,
      configurable: true,
      value: originalClientWidth
    })
  })
})

