/**
 * Тесты для хука useFocusTrap
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useFocusTrap } from '../useFocusTrap'

describe('useFocusTrap', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('должен возвращать ref', () => {
    const { result } = renderHook(() => useFocusTrap(false))

    expect(result.current).toHaveProperty('current')
  })

  it('должен фокусировать первый элемент при активации', () => {
    const button1 = document.createElement('button')
    const button2 = document.createElement('button')
    container.appendChild(button1)
    container.appendChild(button2)

    const { result, rerender } = renderHook(({ isActive }) => useFocusTrap(isActive), {
      initialProps: { isActive: false }
    })

    result.current.current = container

    rerender({ isActive: true })

    expect(document.activeElement).toBe(button1)
  })

  it('должен переключать фокус с последнего на первый элемент при Tab', () => {
    const button1 = document.createElement('button')
    const button2 = document.createElement('button')
    container.appendChild(button1)
    container.appendChild(button2)

    const { result, rerender } = renderHook(({ isActive }) => useFocusTrap(isActive), {
      initialProps: { isActive: true }
    })

    result.current.current = container
    button2.focus()

    fireEvent.keyDown(container, { key: 'Tab' })

    expect(document.activeElement).toBe(button1)
  })

  it('должен переключать фокус с первого на последний элемент при Shift+Tab', () => {
    const button1 = document.createElement('button')
    const button2 = document.createElement('button')
    container.appendChild(button1)
    container.appendChild(button2)

    const { result, rerender } = renderHook(({ isActive }) => useFocusTrap(isActive), {
      initialProps: { isActive: true }
    })

    result.current.current = container
    button1.focus()

    fireEvent.keyDown(container, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(button2)
  })

  it('не должен обрабатывать другие клавиши', () => {
    const button1 = document.createElement('button')
    container.appendChild(button1)

    const { result, rerender } = renderHook(({ isActive }) => useFocusTrap(isActive), {
      initialProps: { isActive: true }
    })

    result.current.current = container
    button1.focus()

    const initialFocus = document.activeElement

    fireEvent.keyDown(container, { key: 'Enter' })

    expect(document.activeElement).toBe(initialFocus)
  })

  it('не должен работать, если isActive = false', () => {
    const button1 = document.createElement('button')
    container.appendChild(button1)

    const { result } = renderHook(() => useFocusTrap(false))

    result.current.current = container

    expect(document.activeElement).not.toBe(button1)
  })

  it('должен удалять обработчик при размонтировании', () => {
    const button1 = document.createElement('button')
    container.appendChild(button1)

    const { result, unmount } = renderHook(() => useFocusTrap(true))

    result.current.current = container

    const removeEventListenerSpy = vi.spyOn(container, 'removeEventListener')

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalled()
  })
})

