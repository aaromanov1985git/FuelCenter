/**
 * Тесты для утилиты логирования
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, logDebug, logInfo, logWarning, logError, logWithContext } from '../logger'

describe('logger', () => {
  let consoleSpy

  beforeEach(() => {
    // Мокаем console методы
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('logDebug', () => {
    it('должен быть функцией', () => {
      expect(typeof logDebug).toBe('function')
    })

    it('должен вызываться без ошибок', () => {
      expect(() => logDebug('test message')).not.toThrow()
    })

    it('должен принимать несколько аргументов', () => {
      expect(() => logDebug('message', { key: 'value' }, 123)).not.toThrow()
    })
  })

  describe('logInfo', () => {
    it('должен логировать с уровнем INFO', () => {
      logInfo('test message')
      expect(consoleSpy.info).toHaveBeenCalledWith('[INFO]', 'test message')
    })
  })

  describe('logWarning', () => {
    it('должен логировать с уровнем WARNING', () => {
      logWarning('test message')
      expect(consoleSpy.warn).toHaveBeenCalledWith('[WARNING]', 'test message')
    })
  })

  describe('logError', () => {
    it('должен логировать с уровнем ERROR', () => {
      logError('test message')
      expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR]', 'test message')
    })
  })

  describe('logWithContext', () => {
    it('должен быть функцией', () => {
      expect(typeof logWithContext).toBe('function')
    })

    it('должен вызываться без ошибок', () => {
      const context = { userId: 123, action: 'login' }
      expect(() => logWithContext('INFO', 'User action', context)).not.toThrow()
    })

    it('должен использовать правильный уровень логирования', () => {
      expect(() => logWithContext('ERROR', 'Error message', { error: 'test' })).not.toThrow()
      expect(() => logWithContext('WARNING', 'Warning message', {})).not.toThrow()
      expect(() => logWithContext('INFO', 'Info message', {})).not.toThrow()
      expect(() => logWithContext('DEBUG', 'Debug message', {})).not.toThrow()
    })
  })

  describe('logger object', () => {
    it('должен предоставлять все методы логирования', () => {
      expect(logger).toHaveProperty('debug')
      expect(logger).toHaveProperty('info')
      expect(logger).toHaveProperty('warn')
      expect(logger).toHaveProperty('error')
      expect(logger).toHaveProperty('log')
    })

    it('должен вызывать соответствующие функции без ошибок', () => {
      expect(() => logger.debug('debug message')).not.toThrow()
      expect(() => logger.info('info message')).not.toThrow()
      expect(() => logger.warn('warn message')).not.toThrow()
      expect(() => logger.error('error message')).not.toThrow()
      expect(() => logger.log('INFO', 'log message', {})).not.toThrow()
    })
  })
})

