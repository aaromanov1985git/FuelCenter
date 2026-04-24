import React, { useState, useEffect } from 'react'
import { Modal, Button, Alert, Skeleton, Select } from './ui'
import { logger } from '../utils/logger'
import './FilePreviewModal.css'
import './FormField.css'

/**
 * Модальное окно предпросмотра файла перед загрузкой
 * 
 * @param {boolean} isOpen - Открыто ли модальное окно
 * @param {File} file - Файл для предпросмотра
 * @param {function} onConfirm - Обработчик подтверждения загрузки (принимает { providerId, templateId })
 * @param {function} onCancel - Обработчик отмены
 * @param {function} onCheckTemplate - Функция для проверки шаблона (возвращает Promise с результатом)
 * @param {boolean} loading - Состояние загрузки
 */
const FilePreviewModal = ({ isOpen, file, onConfirm, onCancel, onCheckTemplate, loading = false }) => {
  const [previewContent, setPreviewContent] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [fileInfo, setFileInfo] = useState(null)
  const [templateCheckLoading, setTemplateCheckLoading] = useState(false)
  const [templateInfo, setTemplateInfo] = useState(null)
  const [requiresTemplateSelection, setRequiresTemplateSelection] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [availableTemplates, setAvailableTemplates] = useState([])
  const [providersMap, setProvidersMap] = useState([])
  const [filteredTemplates, setFilteredTemplates] = useState([])
  const [hasCheckedTemplate, setHasCheckedTemplate] = useState(false)

  // Проверка шаблона при открытии модального окна (только один раз)
  useEffect(() => {
    if (!isOpen || !file || !onCheckTemplate || hasCheckedTemplate) {
      return
    }

    let isMounted = true

    const checkTemplate = async () => {
      setTemplateCheckLoading(true)
      setTemplateInfo(null)
      setRequiresTemplateSelection(false)
      setSelectedProviderId('')
      setSelectedTemplateId('')
      setAvailableTemplates([])
      
      try {
        const result = await onCheckTemplate(file)
        
        if (!isMounted) return
        
        if (result && result.matchData) {
          const matchData = result.matchData
          
          if (result.requiresSelection && matchData.require_template_selection) {
            // Требуется выбор шаблона
            setRequiresTemplateSelection(true)
            setAvailableTemplates(matchData.available_templates || [])
            
            // Группируем шаблоны по провайдерам
            const map = new Map()
            ;(matchData.available_templates || []).forEach(template => {
              if (!map.has(template.provider_id)) {
                map.set(template.provider_id, {
                  provider_id: template.provider_id,
                  provider_name: template.provider_name,
                  provider_code: template.provider_code,
                  templates: []
                })
              }
              map.get(template.provider_id).templates.push(template)
            })
            setProvidersMap(Array.from(map.values()))
            
            // Если есть определенный провайдер, выбираем его
            if (matchData.provider_id) {
              setSelectedProviderId(matchData.provider_id.toString())
            } else if (map.size > 0) {
              setSelectedProviderId(map.values().next().value.provider_id.toString())
            }
            
            // Если есть определенный шаблон, выбираем его
            if (matchData.template_id) {
              setSelectedTemplateId(matchData.template_id.toString())
            }
          } else {
            // Шаблон определен автоматически или есть провайдер по умолчанию
            if (matchData.provider_id || matchData.match_info?.provider_name) {
              setTemplateInfo({
                provider_id: matchData.provider_id,
                template_id: matchData.template_id,
                provider_name: matchData.match_info?.provider_name,
                template_name: matchData.match_info?.template_name,
                score: matchData.match_info?.score || 0,
                is_match: matchData.is_match
              })
            }
          }
        }
      } catch (err) {
        if (!isMounted) return
        logger.error('Ошибка проверки шаблона:', err)
        setPreviewError('Ошибка проверки шаблона файла')
      } finally {
        if (isMounted) {
          setTemplateCheckLoading(false)
          setHasCheckedTemplate(true)
        }
      }
    }

    checkTemplate()

    return () => {
      isMounted = false
    }
  }, [isOpen, file, hasCheckedTemplate]) // Убрали onCheckTemplate из зависимостей

  // Обновляем список шаблонов при выборе провайдера
  useEffect(() => {
    if (selectedProviderId && providersMap.length > 0) {
      const provider = providersMap.find(p => p.provider_id.toString() === selectedProviderId)
      if (provider) {
        setFilteredTemplates(provider.templates)
        // Если выбранный шаблон не принадлежит выбранному провайдеру, сбрасываем выбор шаблона
        if (selectedTemplateId) {
          const template = provider.templates.find(t => t.template_id.toString() === selectedTemplateId)
          if (!template) {
            setSelectedTemplateId('')
          }
        }
      } else {
        setFilteredTemplates([])
        setSelectedTemplateId('')
      }
    } else {
      setFilteredTemplates([])
      setSelectedTemplateId('')
    }
  }, [selectedProviderId, providersMap, selectedTemplateId])

  // Сброс состояния при закрытии модального окна
  useEffect(() => {
    if (!isOpen) {
      setPreviewContent(null)
      setPreviewError(null)
      setFileInfo(null)
      setTemplateInfo(null)
      setRequiresTemplateSelection(false)
      setHasCheckedTemplate(false)
      setTemplateCheckLoading(false)
      setSelectedProviderId('')
      setSelectedTemplateId('')
      setAvailableTemplates([])
      setProvidersMap([])
      setFilteredTemplates([])
      return
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !file) {
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

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Предпросмотр файла"
      size="lg"
    >
      <Modal.Body>
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
            <Alert variant="error" className="alert-with-margin">
              {previewError}
            </Alert>
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

          {/* Информация об автоопределении шаблона */}
          {templateCheckLoading && (
            <div className="file-preview-template-check">
              <Skeleton rows={1} columns={1} />
              <span>Определение шаблона...</span>
            </div>
          )}

          {!templateCheckLoading && templateInfo && (
            <div className="file-preview-template-info">
              <Alert variant={templateInfo.is_match ? "success" : "info"}>
                <div>
                  <strong>Определен провайдер:</strong> {templateInfo.provider_name || 'Не определен'}
                  {templateInfo.template_name && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong>Шаблон:</strong> {templateInfo.template_name}
                    </div>
                  )}
                  {templateInfo.score > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      Совпадение: {templateInfo.score} баллов
                    </div>
                  )}
                </div>
              </Alert>
            </div>
          )}

          {/* Выбор шаблона, если автоопределение не удалось */}
          {!templateCheckLoading && requiresTemplateSelection && (
            <div className="file-preview-template-selection">
              <Alert variant="warning" style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>Не удалось автоматически определить шаблон</strong>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                    Пожалуйста, выберите провайдер и шаблон вручную
                  </div>
                </div>
              </Alert>

              <div className="form-field" style={{ marginBottom: '1rem' }}>
                <label className="form-field-label">
                  Провайдер
                  <span className="required-mark"> *</span>
                </label>
                <Select
                  value={selectedProviderId || ''}
                  onChange={(value) => setSelectedProviderId(value || '')}
                  disabled={loading}
                  placeholder="Выберите провайдера"
                  options={[
                    { value: '', label: '-- Выберите провайдера --' },
                    ...providersMap.map(provider => ({
                      value: provider.provider_id.toString(),
                      label: provider.provider_name
                    }))
                  ]}
                />
              </div>

              <div className="form-field">
                <label className="form-field-label">
                  Шаблон
                  <span className="required-mark"> *</span>
                </label>
                <Select
                  value={selectedTemplateId || ''}
                  onChange={(value) => setSelectedTemplateId(value || '')}
                  disabled={loading || !selectedProviderId}
                  placeholder={selectedProviderId ? "Выберите шаблон" : "Сначала выберите провайдера"}
                  options={[
                    { value: '', label: '-- Выберите шаблон --' },
                    ...filteredTemplates.map(template => ({
                      value: template.template_id.toString(),
                      label: template.template_name
                    }))
                  ]}
                />
                {selectedProviderId && filteredTemplates.length === 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-2)' }}>
                    У выбранного провайдера нет активных шаблонов
                  </div>
                )}
              </div>
            </div>
          )}

          {!previewContent && !previewError && !templateCheckLoading && (
            <div className="file-preview-loading">
              <Skeleton rows={1} columns={1} />
              <span>Загрузка предпросмотра...</span>
            </div>
          )}
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Отмена
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (requiresTemplateSelection) {
              if (!selectedProviderId || !selectedTemplateId) {
                return
              }
              onConfirm({
                provider_id: parseInt(selectedProviderId),
                template_id: parseInt(selectedTemplateId)
              })
            } else {
              onConfirm(templateInfo ? {
                provider_id: templateInfo.provider_id,
                template_id: templateInfo.template_id
              } : null)
            }
          }}
          disabled={loading || templateCheckLoading || (requiresTemplateSelection && (!selectedProviderId || !selectedTemplateId))}
          loading={loading || templateCheckLoading}
        >
          Загрузить файл
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default FilePreviewModal

