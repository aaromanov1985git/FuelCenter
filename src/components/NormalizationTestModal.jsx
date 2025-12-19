import React, { useState } from 'react'
import { Modal, Button, Input, Alert, Skeleton } from './ui'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './NormalizationTestModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

/**
 * Модальное окно для тестирования нормализации
 */
const NormalizationTestModal = ({
  isOpen,
  onClose
}) => {
  const [testValue, setTestValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const handleTest = async () => {
    if (!testValue.trim()) {
      setError('Введите тестовое значение')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards/normalize-owner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          owner_name: testValue
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка нормализации')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message || 'Ошибка тестирования нормализации')
      logger.error('Ошибка тестирования нормализации', { error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTestValue('')
    setError(null)
    setResult(null)
    onClose()
  }

  const formatValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return '-'
    }
    return String(value)
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Тест нормализации"
      size="md"
    >
      <Modal.Body>
        <div className="normalization-test-form">
          <div className="form-group">
            <label>Тестовое значение</label>
            <Input
              type="text"
              value={testValue}
              onChange={(e) => setTestValue(e.target.value)}
              placeholder="Введите значение для нормализации"
              fullWidth
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleTest()
                }
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
              Нажмите Enter для быстрого тестирования
            </span>
          </div>

          {error && (
            <Alert variant="error" style={{ marginTop: '1rem' }}>
              {error}
            </Alert>
          )}

          {loading && (
            <div style={{ marginTop: '1rem' }}>
              <Skeleton rows={4} columns={2} />
            </div>
          )}

          {!loading && result && (
            <div className="normalization-test-results">
              <h3>Результат нормализации</h3>
              
              <div className="normalization-result-section">
                <div className="normalization-result-item">
                  <label>Исходное значение</label>
                  <div className="normalization-result-value original">
                    {testValue}
                  </div>
                </div>
                
                <div className="normalization-result-item">
                  <label>Нормализованное значение</label>
                  <div className="normalization-result-value normalized">
                    {formatValue(result.normalized)}
                  </div>
                </div>
              </div>

              <div className="normalization-result-section">
                <h4>Детализация</h4>
                <div className="normalization-result-grid">
                  <div className="normalization-result-item">
                    <label>Госномер</label>
                    <div className="normalization-result-value">
                      {formatValue(result.license_plate)}
                    </div>
                  </div>
                  
                  <div className="normalization-result-item">
                    <label>Гаражный номер</label>
                    <div className="normalization-result-value">
                      {formatValue(result.garage_number)}
                    </div>
                  </div>
                  
                  <div className="normalization-result-item full-width">
                    <label>Название компании / ФИО</label>
                    <div className="normalization-result-value">
                      {formatValue(result.company_name)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={handleClose}
          disabled={loading}
        >
          Закрыть
        </Button>
        <Button
          variant="primary"
          onClick={handleTest}
          disabled={loading || !testValue.trim()}
          loading={loading}
        >
          Тестировать
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default NormalizationTestModal
