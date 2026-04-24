import React, { Suspense, lazy } from 'react'
import { createPortal } from 'react-dom'
import ConfirmModal from './ConfirmModal'
import ClearProviderModal from './ClearProviderModal'
import TemplateSelectModal from './TemplateSelectModal'
import FilePreviewModal from './FilePreviewModal'
import ContextMenu from './ContextMenu'
import { useCopyToClipboard } from '../hooks/useCopyToClipboard'

const Register = lazy(() => import('./Register'))
const RefuelsUpload = lazy(() => import('./RefuelsUpload'))
const LocationsUpload = lazy(() => import('./LocationsUpload'))

const LazyFallback = () => (
  <div className="loading"><div className="spinner"></div>Загрузка...</div>
)

const AppModals = ({
  clearDb,
  clearProvider,
  templateSelect,
  columnSettings,
  keyboardHint,
  filePreview,
  contextMenu,
  register,
  refuelsUpload,
  locationsUpload,
  toastSuccess,
}) => {
  const { copy } = useCopyToClipboard()

  return (
    <>
      <ConfirmModal
        isOpen={clearDb.open}
        title="Подтверждение очистки базы данных"
        message="Вы уверены, что хотите очистить базу данных? Это действие удалит все транзакции и не может быть отменено."
        onConfirm={clearDb.onConfirm}
        onCancel={clearDb.onCancel}
        confirmText="Очистить БД"
        cancelText="Отмена"
        variant="danger"
      />

      <ClearProviderModal
        isOpen={clearProvider.open}
        onClose={clearProvider.onClose}
        onConfirm={clearProvider.onConfirm}
        providers={clearProvider.providers}
        loading={clearProvider.loading}
      />

      <TemplateSelectModal
        isOpen={templateSelect.open}
        onClose={templateSelect.onClose}
        onConfirm={templateSelect.onConfirm}
        availableTemplates={templateSelect.data?.availableTemplates || []}
        detectedProviderId={templateSelect.data?.detectedProviderId}
        detectedTemplateId={templateSelect.data?.detectedTemplateId}
        matchInfo={templateSelect.data?.matchInfo}
        loading={templateSelect.loading}
      />

      {columnSettings.open && createPortal(
        <div className="column-settings-modal" onClick={columnSettings.onClose}>
          <div className="column-settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="column-settings-header">
              <h3 className="column-settings-title">Настройка колонок</h3>
              <button
                className="column-settings-close"
                onClick={columnSettings.onClose}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="column-settings-list">
              <div className="column-settings-grid">
                {columnSettings.allHeaders.map((header) => {
                  const isVisible = columnSettings.visibleColumns[header] !== false
                  return (
                    <label key={header} className="column-settings-item">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => columnSettings.onToggle(header)}
                      />
                      <span>{header}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="column-settings-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={columnSettings.onReset}
              >
                Сбросить
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={columnSettings.onClose}
              >
                Готово
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {keyboardHint && (
        <div className="keyboard-hint">
          <div className="keyboard-hint-title">Горячие клавиши</div>
          <div className="keyboard-hint-item">
            <span>Переключить меню</span>
            <kbd className="keyboard-hint-key">Ctrl+B</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Поиск</span>
            <kbd className="keyboard-hint-key">Ctrl+K</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Сохранить</span>
            <kbd className="keyboard-hint-key">Ctrl+S</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Новый элемент</span>
            <kbd className="keyboard-hint-key">Ctrl+N</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Фильтр</span>
            <kbd className="keyboard-hint-key">Ctrl+F</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Экспорт</span>
            <kbd className="keyboard-hint-key">Ctrl+E</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Закрыть</span>
            <kbd className="keyboard-hint-key">Esc</kbd>
          </div>
        </div>
      )}

      <FilePreviewModal
        isOpen={!!filePreview.file}
        file={filePreview.file}
        onConfirm={filePreview.onConfirm}
        onCancel={filePreview.onCancel}
        onCheckTemplate={filePreview.onCheckTemplate}
        loading={filePreview.loading}
      />

      {contextMenu.state.isOpen && contextMenu.state.rowIndex !== null && (
        <ContextMenu
          isOpen={contextMenu.state.isOpen}
          x={contextMenu.state.x}
          y={contextMenu.state.y}
          onClose={contextMenu.onClose}
          items={[
            {
              label: 'Копировать строку',
              icon: '📋',
              onClick: async () => {
                const row = contextMenu.data[contextMenu.state.rowIndex]
                const rowData = contextMenu.displayHeaders.map(h => `${h}: ${row[h] || ''}`).join('\n')
                const copied = await copy(rowData)
                if (copied) {
                  toastSuccess('Строка скопирована')
                }
              }
            },
            {
              label: 'Копировать все данные',
              icon: '📄',
              onClick: async () => {
                const csvHeaders = contextMenu.displayHeaders.join(',')
                const csvRows = contextMenu.data.map(r =>
                  contextMenu.displayHeaders.map(h => {
                    const value = r[h] || ''
                    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                      return `"${String(value).replace(/"/g, '""')}"`
                    }
                    return value
                  }).join(',')
                ).join('\n')
                const csvContent = csvHeaders + '\n' + csvRows
                const copied = await copy(csvContent)
                if (copied) {
                  toastSuccess('Все данные скопированы')
                }
              }
            },
            { divider: true },
            {
              label: 'Экспорт в Excel',
              icon: '📥',
              onClick: contextMenu.onExport
            },
            {
              label: 'Обновить данные',
              icon: '🔄',
              onClick: contextMenu.onRefresh
            }
          ]}
        />
      )}

      {register.open && (
        <div className="modal-overlay" onClick={register.onClose}>
          <div className="modal-content auth-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={register.onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
            <Suspense fallback={<LazyFallback />}>
              <Register
                onSuccess={register.onSuccess}
                onCancel={register.onClose}
              />
            </Suspense>
          </div>
        </div>
      )}

      {refuelsUpload.open && (
        <Suspense fallback={<LazyFallback />}>
          <RefuelsUpload
            isOpen={refuelsUpload.open}
            onClose={refuelsUpload.onClose}
          />
        </Suspense>
      )}

      {locationsUpload.open && (
        <Suspense fallback={<LazyFallback />}>
          <LocationsUpload
            isOpen={locationsUpload.open}
            onClose={locationsUpload.onClose}
          />
        </Suspense>
      )}
    </>
  )
}

export default AppModals
