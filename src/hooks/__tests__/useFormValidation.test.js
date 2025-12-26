/**
 * Тесты для хука useFormValidation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFormValidation } from '../useFormValidation'

describe('useFormValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен инициализироваться с начальными значениями', () => {
    const initialValues = { username: '', email: '' }
    const { result } = renderHook(() => useFormValidation(initialValues, {}))

    expect(result.current.values).toEqual(initialValues)
    expect(result.current.errors).toEqual({})
    expect(result.current.touched).toEqual({})
  })

  it('должен обновлять значения при handleChange', () => {
    const { result } = renderHook(() => useFormValidation({ name: '' }, {}))

    act(() => {
      result.current.handleChange({
        target: { name: 'name', value: 'John' }
      })
    })

    expect(result.current.values.name).toBe('John')
  })

  it('должен валидировать обязательные поля', () => {
    const validationRules = {
      username: {
        required: true,
        message: 'Username is required'
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ username: '' }, validationRules)
    )

    act(() => {
      result.current.handleBlur({
        target: { name: 'username', value: '' }
      })
    })

    expect(result.current.errors.username).toBe('Username is required')
    expect(result.current.touched.username).toBe(true)
  })

  it('должен валидировать минимальную длину', () => {
    const validationRules = {
      username: {
        minLength: 3,
        message: 'Min length is 3'
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ username: '' }, validationRules)
    )

    act(() => {
      result.current.handleBlur({
        target: { name: 'username', value: 'ab' }
      })
    })

    expect(result.current.errors.username).toBe('Min length is 3')
  })

  it('должен валидировать максимальную длину', () => {
    const validationRules = {
      username: {
        maxLength: 5,
        message: 'Max length is 5'
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ username: '' }, validationRules)
    )

    act(() => {
      result.current.handleBlur({
        target: { name: 'username', value: 'toolong' }
      })
    })

    expect(result.current.errors.username).toBe('Max length is 5')
  })

  it('должен валидировать паттерн', () => {
    const validationRules = {
      email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Invalid email'
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ email: '' }, validationRules)
    )

    act(() => {
      result.current.handleBlur({
        target: { name: 'email', value: 'invalid-email' }
      })
    })

    expect(result.current.errors.email).toBe('Invalid email')
  })

  it('должен валидировать через кастомную функцию', () => {
    const validationRules = {
      password: {
        validate: (value) => {
          if (value.length < 8) {
            return 'Password must be at least 8 characters'
          }
          return null
        }
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ password: '' }, validationRules)
    )

    act(() => {
      result.current.handleBlur({
        target: { name: 'password', value: 'short' }
      })
    })

    expect(result.current.errors.password).toBe('Password must be at least 8 characters')
  })

  it('должен валидировать числовой диапазон', () => {
    const validationRules = {
      age: {
        min: 18,
        max: 100,
        message: 'Age must be between 18 and 100'
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ age: '' }, validationRules)
    )

    act(() => {
      result.current.handleBlur({
        target: { name: 'age', value: '15' }
      })
    })

    expect(result.current.errors.age).toBe('Age must be between 18 and 100')
  })

  it('должен возвращать isValid правильно', () => {
    const validationRules = {
      username: {
        required: true
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ username: '' }, validationRules)
    )

    expect(result.current.isValid).toBe(false)

    act(() => {
      result.current.handleChange({
        target: { name: 'username', value: 'test' }
      })
    })

    expect(result.current.isValid).toBe(true)
  })

  it('должен сбрасывать форму через reset', () => {
    const initialValues = { username: '', email: '' }
    const { result } = renderHook(() => 
      useFormValidation(initialValues, {})
    )

    act(() => {
      result.current.handleChange({
        target: { name: 'username', value: 'test' }
      })
      result.current.handleBlur({
        target: { name: 'username', value: 'test' }
      })
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.values).toEqual(initialValues)
    expect(result.current.errors).toEqual({})
    expect(result.current.touched).toEqual({})
  })

  it('должен валидировать все поля через validate', () => {
    const validationRules = {
      username: {
        required: true,
        message: 'Username is required'
      },
      email: {
        required: true,
        message: 'Email is required'
      }
    }

    const { result } = renderHook(() => 
      useFormValidation({ username: '', email: '' }, validationRules)
    )

    const isValid = act(() => {
      return result.current.validate()
    })

    expect(isValid).toBe(false)
    expect(result.current.errors.username).toBe('Username is required')
    expect(result.current.errors.email).toBe('Email is required')
  })

  it('должен обрабатывать checkbox', () => {
    const { result } = renderHook(() => 
      useFormValidation({ agree: false }, {})
    )

    act(() => {
      result.current.handleChange({
        target: { name: 'agree', type: 'checkbox', checked: true }
      })
    })

    expect(result.current.values.agree).toBe(true)
  })
})

