/**
 * Утилита для структурированного логирования на frontend
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
}

const currentLogLevel = import.meta.env.VITE_LOG_LEVEL || (import.meta.env.MODE === 'development' ? 'DEBUG' : 'INFO')

/**
 * Логирование с уровнем DEBUG
 */
export const logDebug = (...args) => {
  if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.DEBUG) {
    console.debug('[DEBUG]', ...args)
  }
}

/**
 * Логирование с уровнем INFO
 */
export const logInfo = (...args) => {
  if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.INFO) {
    console.info('[INFO]', ...args)
  }
}

/**
 * Логирование с уровнем WARNING
 */
export const logWarning = (...args) => {
  if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.WARNING) {
    console.warn('[WARNING]', ...args)
  }
}

/**
 * Логирование с уровнем ERROR
 */
export const logError = (...args) => {
  if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.ERROR) {
    console.error('[ERROR]', ...args)
  }
}

/**
 * Структурированное логирование с контекстом
 */
export const logWithContext = (level, message, context = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  }
  
  switch (level) {
    case 'DEBUG':
      logDebug(logEntry)
      break
    case 'INFO':
      logInfo(logEntry)
      break
    case 'WARNING':
      logWarning(logEntry)
      break
    case 'ERROR':
      logError(logEntry)
      break
    default:
      logInfo(logEntry)
  }
}

// Экспортируем объект logger для удобства
export const logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarning,
  error: logError,
  log: logWithContext
}
