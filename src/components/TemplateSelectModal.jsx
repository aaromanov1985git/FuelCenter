import React, { useState, useEffect } from 'react'
import { Button, Select, Alert } from './ui'
import './TemplateSelectModal.css'

const TemplateSelectModal = ({
  isOpen,
  onClose,
  onConfirm,
  availableTemplates = [],
  detectedProviderId = null,
  detectedTemplateId = null,
  matchInfo = null,
  loading = false
}) => {
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [filteredTemplates, setFilteredTemplates] = useState([])

  // Группируем шаблоны по провайдерам
  const providersMap = React.useMemo(() => {
    const map = new Map()
    availableTemplates.forEach(template => {
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
    return Array.from(map.values())
  }, [availableTemplates])

  // Инициализация при открытии
  useEffect(() => {
    if (isOpen) {
      // Если есть определенный провайдер, выбираем его
      if (detectedProviderId) {
        setSelectedProviderId(detectedProviderId.toString())
        // Если есть определенный шаблон, выбираем его
        if (detectedTemplateId) {
          setSelectedTemplateId(detectedTemplateId.toString())
        }
      } else if (providersMap.length > 0) {
        // Иначе выбираем первого провайдера
        setSelectedProviderId(providersMap[0].provider_id.toString())
      }
    } else {
      // Сброс при закрытии
      setSelectedProviderId('')
      setSelectedTemplateId('')
    }
  }, [isOpen, detectedProviderId, detectedTemplateId, providersMap])

  // Обновляем список шаблонов при выборе провайдера
  useEffect(() => {
    if (selectedProviderId) {
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

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleConfirm = () => {
    if (!selectedProviderId || !selectedTemplateId) {
      return
    }

    onConfirm({
      provider_id: parseInt(selectedProviderId),
      template_id: parseInt(selectedTemplateId)
    })
  }

  if (!isOpen) return null

  const selectedProvider = providersMap.find(p => p.provider_id.toString() === selectedProviderId)
  const selectedTemplate = filteredTemplates.find(t => t.template_id.toString() === selectedTemplateId)

  return (
    <div
      className="template-select-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-select-modal-title"
    >
      <div className="template-select-modal-content">
        <div className="template-select-modal-header">
          <h3 id="template-select-modal-title" className="template-select-modal-title">
            Выбор шаблона
          </h3>
          <button
            className="template-select-modal-close"
            onClick={onClose}
            aria-label="Закрыть"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="template-select-modal-body">
          {matchInfo && (
            <Alert variant="info" style={{ marginBottom: '1rem' }}>
              <div>
                <strong>Автоопределение не удалось</strong>
                {matchInfo.score !== undefined && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    Оценка совпадения: {matchInfo.score} баллов
                    {matchInfo.matched_fields && matchInfo.matched_fields.length > 0 && (
                      <div style={{ marginTop: '0.25rem' }}>
                        Найдены поля: {matchInfo.matched_fields.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Alert>
          )}

          <div className="form-field">
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
            {selectedProvider && filteredTemplates.length === 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                У выбранного провайдера нет активных шаблонов
              </div>
            )}
          </div>

          {selectedProvider && selectedTemplate && (
            <Alert variant="info" style={{ marginTop: '1rem' }}>
              <div>
                <strong>Выбрано:</strong>
                <div style={{ marginTop: '0.5rem' }}>
                  Провайдер: {selectedProvider.provider_name}
                </div>
                <div>
                  Шаблон: {selectedTemplate.template_name}
                </div>
              </div>
            </Alert>
          )}
        </div>

        <div className="template-select-modal-footer">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            disabled={loading || !selectedProviderId || !selectedTemplateId}
          >
            {loading ? 'Загрузка...' : 'Продолжить'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TemplateSelectModal
