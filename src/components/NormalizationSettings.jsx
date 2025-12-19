import React, { useState, useEffect } from 'react'
import { Card, Button, Input, Select, Checkbox, Alert, Skeleton } from './ui'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import NormalizationTestModal from './NormalizationTestModal'
import './NormalizationSettings.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const DICTIONARY_TYPES = [
  { value: 'fuel_card_owner', label: 'Владелец топливной карты' },
  { value: 'vehicle', label: 'Транспортное средство' },
  { value: 'gas_station', label: 'Автозаправочная станция' },
  { value: 'fuel_type', label: 'Вид топлива' }
]

// Типы справочников, для которых доступен поиск госномера и гаражного номера
const TYPES_WITH_LICENSE_PLATE_SEARCH = ['fuel_card_owner', 'vehicle']

const CASE_OPTIONS = [
  { value: 'preserve', label: 'Сохранить как есть' },
  { value: 'upper', label: 'ВЕРХНИЙ РЕГИСТР' },
  { value: 'lower', label: 'нижний регистр' },
  { value: 'title', label: 'Заглавные Буквы' }
]

const NormalizationSettings = () => {
  const { success, error: showError } = useToast()
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedType, setSelectedType] = useState('fuel_card_owner')
  const [currentSettings, setCurrentSettings] = useState(null)
  const [formData, setFormData] = useState({
    case: 'preserve',
    remove_special_chars: false,
    remove_extra_spaces: true,
    trim: true,
    priority_license_plate: true,
    priority_garage_number: true,
    min_garage_number_length: 2,
    max_garage_number_length: 10,
    remove_chars: []
  })
  const [removeCharsText, setRemoveCharsText] = useState('')
  const [showTestModal, setShowTestModal] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (selectedType) {
      loadSetting(selectedType)
    }
  }, [selectedType])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/normalization-settings`)
      if (response.ok) {
        const result = await response.json()
        setSettings(result.items)
      }
    } catch (err) {
      logger.error('Ошибка загрузки настроек нормализации', { error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const loadSetting = async (dictionaryType) => {
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/normalization-settings/${dictionaryType}`)
      if (response.ok) {
        const data = await response.json()
        setCurrentSettings(data)
        setFormData(data.options)
        setRemoveCharsText(data.options.remove_chars?.join(', ') || '')
      } else if (response.status === 404) {
        // Настройки не найдены, используем значения по умолчанию
        setCurrentSettings(null)
        setFormData({
          case: 'preserve',
          remove_special_chars: false,
          remove_extra_spaces: true,
          trim: true,
          priority_license_plate: true,
          priority_garage_number: true,
          min_garage_number_length: 2,
          max_garage_number_length: 10,
          remove_chars: []
        })
        setRemoveCharsText('')
      }
    } catch (err) {
      logger.error('Ошибка загрузки настройки нормализации', { error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Парсим список символов для удаления
      const removeChars = removeCharsText
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      const options = {
        ...formData,
        remove_chars: removeChars
      }

      const url = currentSettings
        ? `${API_URL}/api/v1/normalization-settings/${selectedType}`
        : `${API_URL}/api/v1/normalization-settings`

      const method = currentSettings ? 'PUT' : 'POST'

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dictionary_type: selectedType,
          options
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      success('Настройки нормализации успешно сохранены')
      await loadSetting(selectedType)
      await loadSettings()
    } catch (err) {
      showError('Ошибка сохранения: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = () => {
    setShowTestModal(true)
  }

  if (loading && !currentSettings) {
    return (
      <Card>
        <Card.Body>
          <Skeleton rows={10} columns={2} />
        </Card.Body>
      </Card>
    )
  }

  return (
    <div className="normalization-settings">
      <Card>
        <Card.Header>
          <Card.Title>Настройки нормализации справочников</Card.Title>
        </Card.Header>

        <Card.Body>
          <div className="form-section">
            <div className="form-group">
              <label>Тип справочника</label>
              <Select
                value={selectedType}
                onChange={setSelectedType}
                options={DICTIONARY_TYPES}
                fullWidth
              />
            </div>
          </div>

          {currentSettings && (
            <Alert variant="info" style={{ marginBottom: '1rem' }}>
              Настройки для выбранного типа справочника найдены. Вы можете их изменить.
            </Alert>
          )}

          {!currentSettings && (
            <Alert variant="warning" style={{ marginBottom: '1rem' }}>
              Настройки для выбранного типа справочника не найдены. Будет создана новая запись.
            </Alert>
          )}

          <div className="form-section">
            <h3>Основные опции</h3>
            
            <div className="form-group">
              <label>Регистр</label>
              <Select
                value={formData.case}
                onChange={(value) => setFormData({ ...formData, case: value })}
                options={CASE_OPTIONS}
                fullWidth
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Как приводить регистр текста
              </span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  <Checkbox
                    checked={formData.remove_extra_spaces}
                    onChange={(checked) => setFormData({ ...formData, remove_extra_spaces: checked })}
                    label="Удалять лишние пробелы"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  <Checkbox
                    checked={formData.trim}
                    onChange={(checked) => setFormData({ ...formData, trim: checked })}
                    label="Обрезать пробелы в начале/конце"
                  />
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>
                <Checkbox
                  checked={formData.remove_special_chars}
                  onChange={(checked) => setFormData({ ...formData, remove_special_chars: checked })}
                  label="Удалять спецсимволы (кроме букв, цифр и пробелов)"
                />
              </label>
            </div>

            <div className="form-group">
              <label>Символы для удаления (через запятую)</label>
              <Input
                type="text"
                value={removeCharsText}
                onChange={(e) => setRemoveCharsText(e.target.value)}
                placeholder="Например: -, _, ."
                fullWidth
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Укажите символы, которые нужно удалять из текста
              </span>
            </div>
          </div>

          {TYPES_WITH_LICENSE_PLATE_SEARCH.includes(selectedType) && (
            <>
              <div className="form-section">
                <h3>Приоритеты нормализации</h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>
                      <Checkbox
                        checked={formData.priority_license_plate}
                        onChange={(checked) => setFormData({ ...formData, priority_license_plate: checked })}
                        label="Приоритет госномера"
                      />
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                      Искать госномер в первую очередь
                    </span>
                  </div>
                  <div className="form-group">
                    <label>
                      <Checkbox
                        checked={formData.priority_garage_number}
                        onChange={(checked) => setFormData({ ...formData, priority_garage_number: checked })}
                        label="Приоритет гаражного номера"
                      />
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                      Искать гаражный номер (только цифры)
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Параметры гаражного номера</h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Минимальная длина</label>
                    <Input
                      type="number"
                      value={formData.min_garage_number_length}
                      onChange={(e) => setFormData({ ...formData, min_garage_number_length: parseInt(e.target.value) || 2 })}
                      min={1}
                      max={20}
                      fullWidth
                    />
                  </div>
                  <div className="form-group">
                    <label>Максимальная длина</label>
                    <Input
                      type="number"
                      value={formData.max_garage_number_length}
                      onChange={(e) => setFormData({ ...formData, max_garage_number_length: parseInt(e.target.value) || 10 })}
                      min={1}
                      max={50}
                      fullWidth
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {!TYPES_WITH_LICENSE_PLATE_SEARCH.includes(selectedType) && (
            <Alert variant="info" style={{ marginTop: '1rem' }}>
              Для данного типа справочника поиск госномера и гаражного номера недоступен.
              Доступны только базовые опции нормализации (регистр, удаление символов, пробелы).
            </Alert>
          )}

          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={saving}
            >
              Тест нормализации
            </Button>
            <Button
              variant="success"
              onClick={handleSave}
              disabled={saving}
              loading={saving}
            >
              Сохранить настройки
            </Button>
          </div>
        </Card.Body>
      </Card>

      <NormalizationTestModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
      />
    </div>
  )
}

export default NormalizationSettings
