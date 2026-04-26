/**
 * Тесты для хука useScrollLock
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollLock, __resetScrollLockForTests } from '../useScrollLock'

describe('useScrollLock', () => {
  beforeEach(() => {
    __resetScrollLockForTests()
  })

  afterEach(() => {
    __resetScrollLockForTests()
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

  it('должен корректно работать при вложенных locks (counter pattern)', () => {
    // Открываем первый модал — body становится hidden
    const a = renderHook(() => useScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')

    // Открываем второй модал поверх первого — body всё ещё hidden,
    // счётчик внутренний инкрементируется
    const b = renderHook(() => useScrollLock(true))
    expect(document.body.style.overflow).toBe('hidden')

    // Закрываем первый модал — body всё ещё должен быть hidden,
    // потому что второй ещё открыт. Это главный фикс — раньше
    // первый закрывал бы общий лок и страница "освобождалась" при
    // открытом втором модале, а потом второй закрывал бы вообще
    // в неправильное состояние.
    a.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    // Закрываем второй — body освобождён
    b.unmount()
    expect(document.body.style.overflow).toBe('')
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

