import React, { useState, useEffect } from 'react'
import './FilePreviewModal.css'

/**
 * Модальное окно предпросмотра файла перед загрузкой
 * 
 * @param {boolean} isOpen - Открыто ли модальное окно
 * @param {File} file - Файл для предпросмотра
 * @param {function} onConfirm - Обработчик подтверждения загрузки
 * @param {function} onCancel - Обработчик отмены
 * @param {boolean} loading - Состояние загрузки
 */
const FilePreviewModal = ({ isOpen, file, onConfirm, onCancel, loading = false }) => {
  const [previewContent, setPreviewContent] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [fileInfo, setFileInfo] = useState(null)

  useEffect(() => {
    if (!isOpen || !file) {
      setPreviewContent(null)
      setPreviewError(null)
      setFileInfo(null)
      return
    }

    // Информация о файле
    const info = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toLocaleString('ru-RU')
    }
    setFileInfo(info)

    // Предпросмотр в зависимости от типа файла
    const reader = new FileReader()

    if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')) {
      // Для Excel файлов показываем информацию
      setPreviewContent({
        type: 'excel',
        message: 'Excel файл готов к загрузке'
      })
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      // Для CSV файлов показываем первые строки
      reader.onload = (e) => {
        try {
          const text = e.target.result
          const lines = text.split('\n').slice(0, 10) // Первые 10 строк
          setPreviewContent({
            type: 'csv',
            lines: lines,
            totalLines: text.split('\n').length
          })
        } catch (error) {
          setPreviewError('Ошибка чтения CSV файла')
        }
      }
      reader.readAsText(file, 'UTF-8')
    } else if (file.type.startsWith('text/')) {
      // Для текстовых файлов показываем содержимое
      reader.onload = (e) => {
        try {
          const text = e.target.result
          const lines = text.split('\n').slice(0, 20) // Первые 20 строк
          setPreviewContent({
            type: 'text',
            lines: lines,
            totalLines: text.split('\n').length
          })
        } catch (error) {
          setPreviewError('Ошибка чтения текстового файла')
        }
      }
      reader.readAsText(file, 'UTF-8')
    } else {
      setPreviewContent({
        type: 'unknown',
        message: 'Предпросмотр недоступен для этого типа файла'
      })
    }

    return () => {
      reader.abort()
    }
  }, [isOpen, file])

  if (!isOpen) return null

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content file-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Предпросмотр файла</h3>
          <button 
            className="modal-close" 
            onClick={onCancel}
            disabled={loading}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="modal-body file-preview-body">
          {fileInfo && (
            <div className="file-preview-info">
              <div className="file-preview-info-item">
                <span className="file-preview-label">Имя файла:</span>
                <span className="file-preview-value">{fileInfo.name}</span>
              </div>
              <div className="file-preview-info-item">
                <span className="file-preview-label">Размер:</span>
                <span className="file-preview-value">{formatFileSize(fileInfo.size)}</span>
              </div>
              <div className="file-preview-info-item">
                <span className="file-preview-label">Тип:</span>
                <span className="file-preview-value">{fileInfo.type || 'Не определен'}</span>
              </div>
              <div className="file-preview-info-item">
                <span className="file-preview-label">Дата изменения:</span>
                <span className="file-preview-value">{fileInfo.lastModified}</span>
              </div>
            </div>
          )}

          {previewError && (
            <div className="file-preview-error">
              <span className="file-preview-error-icon">⚠️</span>
              <span>{previewError}</span>
            </div>
          )}

          {previewContent && previewContent.type === 'csv' && (
            <div className="file-preview-content">
              <h4>Предпросмотр (первые {Math.min(10, previewContent.totalLines)} строк из {previewContent.totalLines}):</h4>
              <div className="file-preview-csv">
                <table className="file-preview-table">
                  <tbody>
                    {previewContent.lines.map((line, idx) => {
                      const cells = line.split(',').slice(0, 10) // Первые 10 колонок
                      return (
                        <tr key={idx}>
                          {cells.map((cell, cellIdx) => (
                            <td key={cellIdx}>{cell.trim() || '—'}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {previewContent && previewContent.type === 'text' && (
            <div className="file-preview-content">
              <h4>Предпросмотр (первые {Math.min(20, previewContent.totalLines)} строк из {previewContent.totalLines}):</h4>
              <pre className="file-preview-text">
                {previewContent.lines.join('\n')}
              </pre>
            </div>
          )}

          {previewContent && (previewContent.type === 'excel' || previewContent.type === 'unknown') && (
            <div className="file-preview-content">
              <div className="file-preview-message">
                {previewContent.type === 'excel' ? (
                  <>
                    <span className="file-preview-icon">📊</span>
                    <span>{previewContent.message}</span>
                  </>
                ) : (
                  <>
                    <span className="file-preview-icon">📄</span>
                    <span>{previewContent.message}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {!previewContent && !previewError && (
            <div className="file-preview-loading">
              <div className="spinner-small"></div>
              <span>Загрузка предпросмотра...</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-small"></span>
                Загрузка...
              </>
            ) : (
              'Загрузить файл'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilePreviewModal

