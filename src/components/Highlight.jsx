import React from 'react'
import './Highlight.css'

/**
 * Компонент для подсветки текста в результатах поиска
 * 
 * @param {string} text - Текст для подсветки
 * @param {string|array} searchTerm - Поисковый запрос или массив запросов
 * @param {boolean} caseSensitive - Учитывать ли регистр (по умолчанию false)
 * @param {string} className - Дополнительные CSS классы
 */
const Highlight = ({
  text,
  searchTerm,
  caseSensitive = false,
  className = ''
}) => {
  if (!text || !searchTerm) {
    return <span className={className}>{text}</span>
  }

  // Нормализуем searchTerm
  const searchTerms = Array.isArray(searchTerm) 
    ? searchTerm.filter(term => term && term.trim()) 
    : [searchTerm].filter(term => term && term.trim())

  if (searchTerms.length === 0) {
    return <span className={className}>{text}</span>
  }

  const textStr = String(text)
  const flags = caseSensitive ? 'g' : 'gi'
  
  // Создаем регулярное выражение из всех поисковых терминов
  const searchPattern = searchTerms
    .map(term => {
      // Экранируем специальные символы regex
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return escaped
    })
    .join('|')

  if (!searchPattern) {
    return <span className={className}>{textStr}</span>
  }

  try {
    const regex = new RegExp(`(${searchPattern})`, flags)
    const parts = textStr.split(regex)

    return (
      <span className={className}>
        {parts.map((part, index) => {
          // Проверяем, является ли часть совпадением
          const isMatch = searchTerms.some(term => {
            const termRegex = new RegExp(
              term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              flags
            )
            return termRegex.test(part)
          })

          if (isMatch && part) {
            return (
              <mark key={index} className="highlight-mark">
                {part}
              </mark>
            )
          }
          return <span key={index}>{part}</span>
        })}
      </span>
    )
  } catch (error) {
    // Если ошибка в регулярном выражении, просто возвращаем текст
    console.warn('Ошибка в Highlight:', error)
    return <span className={className}>{textStr}</span>
  }
}

export default Highlight

