import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import FileUploadProgress from './FileUploadProgress'
import { Button, Icon } from './ui'
import { formatLiters } from '../utils/format'
import './TransactionUpload.css'

const MAX_FILE_SIZE_MB = 50

// formatNumber из utils/format всегда даёт два знака после запятой — для счётчика
// транзакций это «85 178,00», поэтому целые считаем отдельно.
const formatCount = (value) => new Intl.NumberFormat('ru-RU').format(value || 0)

// Перетаскивание мимо файлов (выделенный текст, ссылка) не должно поднимать оверлей
const hasFiles = (e) => {
  const types = e.dataTransfer?.types
  return !!types && Array.from(types).includes('Files')
}

/**
 * Загрузка файла транзакций: кнопка в шапке страницы плюс приём перетаскивания
 * по всей странице. Раскрытой зоны «Перетащите файл сюда» больше нет — она вместе
 * с дашбордом из четырёх плиток отодвигала первую строку таблицы примерно на 250px,
 * а файл загружают раз в день, тогда как таблицу смотрят постоянно.
 */
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
}) => {
  const fileInputRef = useRef(null)
  // dragenter/dragleave всплывают от каждого элемента под курсором: без счётчика
  // вложенности оверлей мигал бы на каждой границе внутри страницы.
  const dragDepth = useRef(0)

  useEffect(() => {
    const handleEnter = (e) => {
      if (!hasFiles(e)) return
      dragDepth.current += 1
      onDrag(e)
    }
    const handleOver = (e) => {
      if (!hasFiles(e)) return
      // preventDefault внутри onDrag обязателен на каждом dragover: без него
      // браузер откроет файл сам и drop до нас не дойдёт.
      onDrag(e)
    }
    const handleLeave = (e) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) onDrag(e)
    }
    const handleDrop = (e) => {
      dragDepth.current = 0
      onDrop(e)
    }

    window.addEventListener('dragenter', handleEnter)
    window.addEventListener('dragover', handleOver)
    window.addEventListener('dragleave', handleLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleEnter)
      window.removeEventListener('dragover', handleOver)
      window.removeEventListener('dragleave', handleLeave)
      window.removeEventListener('drop', handleDrop)
      dragDepth.current = 0
    }
  }, [onDrag, onDrop])

  const activeProviderName = selectedProviderTab !== null && selectedProviderTab !== undefined
    ? (providers.find(p => p.id === selectedProviderTab)?.name || '—')
    : null

  const providerCount = stats?.provider_count || (selectedProviderTab ? 1 : providers.length)

  return (
    <>
      <div className="tx-toolbar">
        {/* id="file-upload-input" обязателен: useFileUpload сбрасывает значение
            поля через document.getElementById после отмены выбора файла. */}
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileInput}
          className="tx-file-input"
          disabled={loading}
          id="file-upload-input"
          ref={fileInputRef}
        />
        <Button
          variant="primary"
          icon={<Icon name="upload" size={16} />}
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title={`Excel .xlsx или .xls, не больше ${MAX_FILE_SIZE_MB} МБ`}
        >
          Загрузить файл
        </Button>

        {fileName ? (
          <span className="tx-file-status">
            <Icon name="file" size={16} />
            <span className="tx-file-status-name" title={fileName}>{fileName}</span>
            {fileMatchInfo?.provider_name && (
              <span className="tx-file-status-dim">
                {' · '}{fileMatchInfo.provider_name}
                {fileMatchInfo.template_name && ` (шаблон: ${fileMatchInfo.template_name})`}
                {fileMatchInfo.score > 0 && ` · совпадение ${fileMatchInfo.score}%`}
              </span>
            )}
          </span>
        ) : (
          <span className="tx-toolbar-hint">
            или перетащите файл в любое место страницы · xlsx, xls · до {MAX_FILE_SIZE_MB} МБ
          </span>
        )}

        <span className="tx-toolbar-spacer" />

        {activeProviderName && (
          <button
            type="button"
            className="tx-chip"
            onClick={() => onSelectedProviderTabChange(null)}
            title="Сбросить фильтр по поставщику"
          >
            <Icon name="filter" size={16} />
            <span className="tx-chip-text">{activeProviderName}</span>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Уровень «зона»: приглушённая подложка без бордера. Крупные плитки уместны,
          когда цифры и есть цель экрана; здесь цель — таблица. */}
      <div className="tx-summary">
        <div className="tx-summary-item">
          <span className="t-caption tx-summary-label">Всего транзакций</span>
          <span className="tx-summary-value">{formatCount(stats?.total_transactions)}</span>
        </div>
        <div className="tx-summary-item">
          <span className="t-caption tx-summary-label">Всего литров</span>
          <span className="tx-summary-value">
            {stats?.total_quantity ? formatLiters(stats.total_quantity) : '0.00 л'}
          </span>
        </div>
        <div className="tx-summary-item">
          <span className="t-caption tx-summary-label">Видов топлива</span>
          <span className="tx-summary-value">
            {stats?.products ? Object.keys(stats.products).length : 0}
          </span>
        </div>
        <div className="tx-summary-item">
          <span className="t-caption tx-summary-label">Поставщиков</span>
          <span className="tx-summary-value">{providerCount}</span>
        </div>
      </div>

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

      {/* Сообщение об успехе useFileUpload пишет в ту же переменную, что и ошибку,
          текстом «Файл успешно загружен» — со строчной буквы. Проверка на 'Успешно'
          с заглавной не срабатывала, и зелёное сообщение показывалось красным. */}
      {error && (
        <div className={/успешно/i.test(error) ? 'success' : 'error'}>
          {error}
        </div>
      )}

      {/* Зона приёма всплывает только пока файл тащат над окном. Портал в body —
          чтобы position: fixed не зависел от трансформаций родителей страницы. */}
      {dragActive && createPortal(
        <div className="tx-dropzone">
          <div className="tx-dropzone-card">
            <Icon name="upload" size={16} className="tx-dropzone-icon" />
            <span className="tx-dropzone-title">Отпустите файл для загрузки</span>
            <span className="tx-dropzone-hint">Excel .xlsx или .xls, до {MAX_FILE_SIZE_MB} МБ</span>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export default TransactionUpload
