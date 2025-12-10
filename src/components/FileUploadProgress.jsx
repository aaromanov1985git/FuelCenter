/**
 * Компонент для отображения прогресса загрузки файла
 */
import React from 'react'
import './FileUploadProgress.css'

const FileUploadProgress = ({ progress, fileName, status, uploadedBytes, totalBytes, processedItems, totalItems }) => {
  if (!progress && status !== 'uploading' && status !== 'processing') {
    return null
  }

  const formatBytes = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="file-upload-progress">
      <div className="progress-header">
        <div className="progress-header-main">
          <span className="progress-filename" title={fileName}>{fileName}</span>
          <span className="progress-status">
            {status === 'uploading' ? 'Загрузка...' : status === 'processing' ? 'Обработка...' : ''}
          </span>
        </div>
        {progress !== undefined && (
          <span className="progress-percentage">{Math.round(progress)}%</span>
        )}
      </div>
      
      {progress !== undefined && (
        <div className="progress-bar-container">
          <div 
            className="progress-bar" 
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="progress-text">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Детальная информация о прогрессе */}
      <div className="progress-details">
        {status === 'uploading' && uploadedBytes && totalBytes && (
          <div className="progress-detail">
            <span className="progress-detail-label">Загружено:</span>
            <span className="progress-detail-value">
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>
        )}
        {status === 'processing' && processedItems !== undefined && totalItems !== undefined && (
          <div className="progress-detail">
            <span className="progress-detail-label">Обработано:</span>
            <span className="progress-detail-value">
              {processedItems} / {totalItems} записей
            </span>
          </div>
        )}
      </div>

      {status === 'processing' && (
        <div className="processing-indicator">
          <div className="spinner-small"></div>
          <span>Обработка файла на сервере...</span>
        </div>
      )}
    </div>
  )
}

export default FileUploadProgress
