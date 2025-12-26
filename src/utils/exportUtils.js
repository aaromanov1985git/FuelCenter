/**
 * Утилиты для экспорта данных в различные форматы
 */
import { logger } from './logger'

/**
 * Экспорт данных в CSV формат
 * @param {Array} data - Массив объектов данных
 * @param {Array} headers - Массив заголовков колонок
 * @param {string} filename - Имя файла (без расширения)
 */
export const exportToCSV = (data, headers, filename = 'export') => {
  // Создаем заголовки CSV
  const csvHeaders = headers.join(',')
  
  // Создаем строки данных
  const csvRows = data.map(row => 
    headers.map(header => {
      const value = row[header] || ''
      const stringValue = String(value)
      
      // Экранируем кавычки и оборачиваем в кавычки, если содержит запятую, перенос строки или кавычку
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    }).join(',')
  ).join('\n')
  
  const csvContent = csvHeaders + '\n' + csvRows
  
  // Создаем blob и скачиваем
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Экспорт данных в JSON формат
 * @param {Array} data - Массив объектов данных
 * @param {string} filename - Имя файла (без расширения)
 */
export const exportToJSON = (data, filename = 'export') => {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Экспорт данных в TXT формат (простой текст)
 * @param {Array} data - Массив объектов данных
 * @param {Array} headers - Массив заголовков колонок
 * @param {string} filename - Имя файла (без расширения)
 */
export const exportToTXT = (data, headers, filename = 'export') => {
  // Создаем текст с разделителями
  const lines = []
  lines.push(headers.join('\t'))
  lines.push('-'.repeat(80))
  
  data.forEach(row => {
    const rowData = headers.map(header => String(row[header] || '')).join('\t')
    lines.push(rowData)
  })
  
  const textContent = lines.join('\n')
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Экспорт данных в PDF формат (простой вариант с использованием window.print)
 * @param {Array} data - Массив объектов данных
 * @param {Array} headers - Массив заголовков колонок
 * @param {string} title - Заголовок документа
 */
export const exportToPDF = (data, headers, title = 'Экспорт данных') => {
  // Создаем HTML таблицу для печати
  const printWindow = window.open('', '_blank')
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        h1 {
          text-align: center;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        @media print {
          body {
            padding: 10px;
          }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p>Дата экспорта: ${new Date().toLocaleString('ru-RU')}</p>
      <p>Всего записей: ${data.length}</p>
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map(row => 
            `<tr>${headers.map(h => `<td>${String(row[h] || '')}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `
  
  printWindow.document.write(html)
  printWindow.document.close()
  
  // Ждем загрузки и открываем диалог печати
  setTimeout(() => {
    printWindow.print()
    // Закрываем окно после печати (опционально, с задержкой)
    setTimeout(() => {
      printWindow.close()
    }, 500)
  }, 250)
}

/**
 * Копирование данных в буфер обмена
 * @param {Array} data - Массив объектов данных
 * @param {Array} headers - Массив заголовков колонок
 * @param {string} format - Формат ('csv' | 'json' | 'tsv')
 * @returns {Promise<boolean>}
 */
export const copyToClipboard = async (data, headers, format = 'csv') => {
  let text = ''
  
  if (format === 'csv') {
    const csvHeaders = headers.join(',')
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header] || ''
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
    ).join('\n')
    text = csvHeaders + '\n' + csvRows
  } else if (format === 'json') {
    text = JSON.stringify(data, null, 2)
  } else if (format === 'tsv') {
    const tsvHeaders = headers.join('\t')
    const tsvRows = data.map(row => 
      headers.map(header => String(row[header] || '')).join('\t')
    ).join('\n')
    text = tsvHeaders + '\n' + tsvRows
  }
  
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    logger.error('Ошибка копирования в буфер обмена:', err)
    return false
  }
}

