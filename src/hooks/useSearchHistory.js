import { useState, useEffect } from 'react'

/**
 * Хук для управления историей поисковых запросов
 * 
 * @param {string} storageKey - Ключ для хранения в localStorage (по умолчанию 'search-history')
 * @param {number} maxItems - Максимальное количество элементов в истории (по умолчанию 10)
 * 
 * @returns {object} {
 *   history - массив истории поисков,
 *   addToHistory - функция для добавления в историю,
 *   clearHistory - функция для очистки истории,
 *   removeFromHistory - функция для удаления элемента
 * }
 */
export const useSearchHistory = (storageKey = 'search-history', maxItems = 10) => {
  const [history, setHistory] = useState([])

  // Загрузка истории из localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Удаляем дубликаты при загрузке (регистронезависимое сравнение)
          const uniqueHistory = []
          const seen = new Set()
          
          for (const item of parsed) {
            if (item && typeof item === 'string') {
              const normalized = item.trim().toLowerCase()
              if (normalized && !seen.has(normalized)) {
                seen.add(normalized)
                uniqueHistory.push(item.trim())
              }
            }
          }
          
          setHistory(uniqueHistory)
          // Сохраняем очищенную историю обратно в localStorage
          if (uniqueHistory.length !== parsed.length) {
            localStorage.setItem(storageKey, JSON.stringify(uniqueHistory))
          }
        } else {
          setHistory([])
        }
      }
    } catch (error) {
      console.warn('Ошибка загрузки истории поиска:', error)
      setHistory([])
    }
  }, [storageKey])

  // Сохранение истории в localStorage
  const saveHistory = (newHistory) => {
    try {
      // Удаляем дубликаты перед сохранением (регистронезависимое сравнение)
      const uniqueHistory = []
      const seen = new Set()
      
      for (const item of newHistory) {
        if (item && typeof item === 'string') {
          const normalized = item.trim().toLowerCase()
          if (normalized && !seen.has(normalized)) {
            seen.add(normalized)
            uniqueHistory.push(item.trim())
          }
        }
      }
      
      localStorage.setItem(storageKey, JSON.stringify(uniqueHistory))
      setHistory(uniqueHistory)
    } catch (error) {
      console.warn('Ошибка сохранения истории поиска:', error)
    }
  }

  // Добавление запроса в историю
  const addToHistory = (query) => {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return
    }

    const trimmedQuery = query.trim()
    const normalizedQuery = trimmedQuery.toLowerCase()
    
    setHistory(prev => {
      // Сначала удаляем все дубликаты из текущей истории (регистронезависимое сравнение)
      const seen = new Set()
      const cleaned = []
      
      for (const item of prev) {
        if (item && typeof item === 'string') {
          const normalized = item.trim().toLowerCase()
          if (normalized && !seen.has(normalized)) {
            seen.add(normalized)
            cleaned.push(item.trim())
          }
        }
      }
      
      // Проверяем, не является ли добавляемый элемент уже первым в списке
      if (cleaned.length > 0 && cleaned[0].toLowerCase() === normalizedQuery) {
        // Если это тот же элемент, что уже первый в списке, не добавляем
        return cleaned
      }
      
      // Удаляем элемент, если он уже есть в истории (регистронезависимое сравнение)
      const filtered = cleaned.filter(item => 
        item && typeof item === 'string' && item.trim().toLowerCase() !== normalizedQuery
      )
      
      // Добавляем в начало
      const newHistory = [trimmedQuery, ...filtered]
      
      // Ограничиваем размер
      const limited = newHistory.slice(0, maxItems)
      
      saveHistory(limited)
      return limited
    })
  }

  // Очистка истории
  const clearHistory = () => {
    saveHistory([])
  }

  // Удаление элемента из истории
  const removeFromHistory = (query) => {
    setHistory(prev => {
      const filtered = prev.filter(item => item !== query)
      saveHistory(filtered)
      return filtered
    })
  }

  return {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory
  }
}

export default useSearchHistory

