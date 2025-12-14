import React, { useState, useEffect } from 'react'
import { Button, Input, Select, Alert } from './ui'
import FormField from './FormField'
import './ClearProviderModal.css'

const ClearProviderModal = ({
  isOpen,
  onClose,
  onConfirm,
  providers = [],
  loading = false
}) => {
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [usePeriod, setUsePeriod] = useState(false)
  const [error, setError] = useState('')

  // Сброс формы при открытии/закрытии
  useEffect(() => {
    if (!isOpen) {
      setSelectedProviderId('')
      setDateFrom('')
      setDateTo('')
      setUsePeriod(false)
      setError('')
    }
  }, [isOpen])

  // Валидация формы
  const validate = () => {
    if (!selectedProviderId) {
      setError('Выберите провайдера')
      return false
    }

    if (usePeriod) {
      if (!dateFrom && !dateTo) {
        setError('Укажите хотя бы одну дату периода')
        return false
      }

      if (dateFrom && dateTo && dateFrom > dateTo) {
        setError('Начальная дата не может быть больше конечной')
        return false
      }
    }

    setError('')
    return true
  }

  const handleConfirm = () => {
    if (!validate()) {
      return
    }

    const params = {
      provider_id: parseInt(selectedProviderId),
      date_from: usePeriod && dateFrom ? dateFrom : null,
      date_to: usePeriod && dateTo ? dateTo : null
    }

    onConfirm(params)
  }

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

  if (!isOpen) return null

  const selectedProvider = selectedProviderId ? providers.find(p => p.id === parseInt(selectedProviderId)) : null

  return (
    <div
      className="clear-provider-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-provider-modal-title"
    >
      <div className="clear-provider-modal-content">
        <div className="clear-provider-modal-header">
          <h3 id="clear-provider-modal-title" className="clear-provider-modal-title">
            Очистка транзакций по провайдеру
          </h3>
          <button
            className="clear-provider-modal-close"
            onClick={onClose}
            aria-label="Закрыть"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="clear-provider-modal-body">
          {error && (
            <Alert variant="error" style={{ marginBottom: '1rem' }}>
              {error}
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
                ...providers.map(provider => ({
                  value: provider.id.toString(),
                  label: provider.name
                }))
              ]}
            />
          </div>

          <div className="form-field">
            <label className="form-field-label">Период очистки</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                id="use-period"
                checked={usePeriod}
                onChange={(e) => setUsePeriod(e.target.checked)}
                disabled={loading}
              />
              <label htmlFor="use-period" style={{ cursor: 'pointer' }}>
                Указать период (если не указан, будут удалены все транзакции провайдера)
              </label>
            </div>

            {usePeriod && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FormField 
                  label="Дата начала (включительно)"
                  name="date_from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <FormField 
                  label="Дата окончания (включительно)"
                  name="date_to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            )}
          </div>

          {selectedProvider && (
            <Alert variant="info" style={{ marginTop: '1rem' }}>
              <strong>Внимание:</strong> Будет выполнена очистка транзакций провайдера "{selectedProvider.name}"
              {usePeriod ? (
                <>
                  {' '}за период {dateFrom ? `с ${dateFrom}` : ''} {dateTo ? `по ${dateTo}` : ''}
                </>
              ) : (
                ' за все время'
              )}
              . Это действие нельзя отменить.
            </Alert>
          )}
        </div>

        <div className="clear-provider-modal-footer">
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
            variant="error"
            onClick={handleConfirm}
            disabled={loading || !selectedProviderId}
          >
            {loading ? 'Очистка...' : 'Очистить'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ClearProviderModal
