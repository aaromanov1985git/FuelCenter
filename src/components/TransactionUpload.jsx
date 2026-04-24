import React from 'react'
import FileUploadProgress from './FileUploadProgress'

const MAX_FILE_SIZE_MB = 50

const TransactionUpload = ({
  dragActive,
  loading,
  fileName,
  fileMatchInfo,
  uploadStatus,
  uploadProgress,
  uploadedBytes,
  totalBytes,
  processedItems,
  totalItems,
  error,
  stats,
  providers,
  selectedProviderTab,
  onSelectedProviderTabChange,
  onDrag,
  onDrop,
  onFileInput,
  formatLiters,
}) => (
  <>
    <div
      className={`upload-section ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
    >
      <div className="drag-drop-area">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileInput}
          className="file-input"
          disabled={loading}
          id="file-upload-input"
        />
        <label htmlFor="file-upload-input" className="drag-drop-label">
          <svg xmlns="http://www.w3.org/2000/svg" className="icon-large" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          <div className="drag-drop-text">
            <span className="drag-drop-title">Перетащите файл сюда</span>
            <span className="drag-drop-subtitle">или нажмите для выбора файла</span>
            <span className="drag-drop-hint">Максимальный размер файла: {MAX_FILE_SIZE_MB}MB</span>
          </div>
        </label>
      </div>

      {fileName && (
        <div className="file-info">
          <span className="file-name">Загружен: {fileName}</span>
          {fileMatchInfo && fileMatchInfo.provider_name && (
            <div className="match-info">
              <span className="match-label">Определен провайдер:</span>
              <span className="match-value">{fileMatchInfo.provider_name}</span>
              {fileMatchInfo.template_name && (
                <span className="match-template">(шаблон: {fileMatchInfo.template_name})</span>
              )}
            </div>
          )}
        </div>
      )}

      {(uploadStatus || uploadProgress > 0) && (
        <FileUploadProgress
          progress={uploadStatus === 'uploading' ? uploadProgress : (uploadStatus === 'processing' ? 100 : undefined)}
          fileName={fileName}
          status={uploadStatus}
          uploadedBytes={uploadedBytes}
          totalBytes={totalBytes}
          processedItems={processedItems}
          totalItems={totalItems}
        />
      )}

      {loading && !uploadStatus && (
        <div className="loading">
          <div className="spinner"></div>
          Обработка...
        </div>
      )}

      {error && (
        <div className={error.includes('Успешно') ? 'success' : 'error'}>
          {error}
        </div>
      )}
    </div>

    <div className="upload-dashboard">
      <h3 className="upload-dashboard-title">Дашборд загрузки</h3>
      <div className="upload-dashboard-grid">
        <div className="upload-dashboard-card stat-primary">
          <div className="upload-dashboard-label">Всего транзакций</div>
          <div className="upload-dashboard-value">{stats?.total_transactions || 0}</div>
        </div>
        <div className="upload-dashboard-card stat-success">
          <div className="upload-dashboard-label">Всего литров</div>
          <div className="upload-dashboard-value">
            {stats?.total_quantity ? formatLiters(stats.total_quantity) : '0.00 л'}
          </div>
        </div>
        <div className="upload-dashboard-card stat-secondary">
          <div className="upload-dashboard-label">Видов топлива</div>
          <div className="upload-dashboard-value">
            {stats?.products ? Object.keys(stats.products).length : 0}
          </div>
        </div>
        <div className="upload-dashboard-card stat-secondary">
          <div className="upload-dashboard-label">Провайдеров</div>
          <div className="upload-dashboard-value">
            {stats?.provider_count || (selectedProviderTab ? 1 : providers.length)}
          </div>
          {selectedProviderTab !== null && (
            <div className="upload-dashboard-subvalue">
              <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                Фильтр: {providers.find(p => p.id === selectedProviderTab)?.name || '—'}
              </span>
              <button
                onClick={() => onSelectedProviderTabChange(null)}
                style={{
                  marginLeft: '8px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  background: 'var(--red-soft)',
                  color: 'var(--red)',
                  border: '1px solid var(--red)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title="Сбросить фильтр"
              >
                ✕ Сбросить
              </button>
            </div>
          )}
        </div>
        {fileMatchInfo && fileMatchInfo.provider_name && (
          <div className="upload-dashboard-card upload-dashboard-card-highlight">
            <div className="upload-dashboard-label">Последний провайдер</div>
            <div className="upload-dashboard-value-small">{fileMatchInfo.provider_name}</div>
            {fileMatchInfo.template_name && (
              <div className="upload-dashboard-subvalue">Шаблон: {fileMatchInfo.template_name}</div>
            )}
            {fileMatchInfo.score && fileMatchInfo.score > 0 && (
              <div className="upload-dashboard-subvalue">Совпадение: {fileMatchInfo.score}%</div>
            )}
          </div>
        )}
        {fileName && (
          <div className="upload-dashboard-card">
            <div className="upload-dashboard-label">Последний файл</div>
            <div className="upload-dashboard-value-small">{fileName}</div>
          </div>
        )}
      </div>
    </div>
  </>
)

export default TransactionUpload
