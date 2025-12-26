import { useState } from 'react'
import { logger } from '../utils/logger'

/**
 * Хук для копирования текста в буфер обмена
 * 
 * @returns {object} { copy, isCopied, error }
 */
export const useCopyToClipboard = () => {
  const [isCopied, setIsCopied] = useState(false)
  const [error, setError] = useState(null)

  const copy = async (text) => {
    try {
      setError(null)
      setIsCopied(false)

      if (!navigator.clipboard) {
        throw new Error('Clipboard API не поддерживается в вашем браузере')
      }

      await navigator.clipboard.writeText(text)
      setIsCopied(true)

      // Сброс статуса через 2 секунды
      setTimeout(() => {
        setIsCopied(false)
      }, 2000)

      return true
    } catch (err) {
      setError(err.message)
      logger.error('Ошибка копирования в буфер обмена:', err)
      return false
    }
  }

  return { copy, isCopied, error }
}

export default useCopyToClipboard

