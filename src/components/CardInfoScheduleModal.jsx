import React, { useState, useEffect } from 'react'
import { Modal, Button, Input, Select, Checkbox, Alert } from './ui'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './CardInfoScheduleModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const SCHEDULE_PRESETS = [
  { value: 'hourly', label: 'Каждый час' },
  { value: 'daily', label: 'Один раз в сутки (в 2:00)' },
  { value: 'weekly', label: 'Один раз в неделю (понедельник в 2:00)' },
  { value: '0 */6 * * *', label: 'Каждые 6 часов' },
  { value: '0 2 * * *', label: 'Каждый день в 2:00' },
  { value: '0 0 * * 1', label: 'Каждый понедельник в полночь' },
  { value: 'custom', label: 'Свой формат (cron)' }
]

const CardInfoScheduleModal = ({
  isOpen,
  onClose,
  onSave,
  schedule,
  templates = []
}) => {
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    provider_template_id: null,
    schedule: 'daily',
    schedule_custom: '',
    auto_update: true,
    flags: 23,
    is_active: true,
    filter_options: {
      card_numbers: [],
      only_with_vehicle: false,
      only_blocked: false,
      only_active: false
    }
  })
  const [selectedSchedulePreset, setSelectedSchedulePreset] = useState('daily')
  const [cardNumbersText, setCardNumbersText] = useState('')
  const [localTemplates, setLocalTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
      if (schedule) {
        // Загружаем данные регламента
        setFormData({
          name: schedule.name || '',
          description: schedule.description || '',
          provider_template_id: schedule.provider_template_id || null,
          schedule: schedule.schedule || 'daily',
          schedule_custom: schedule.schedule || '',
          auto_update: schedule.auto_update !== undefined ? schedule.auto_update : true,
          flags: schedule.flags || 23,
          is_active: schedule.is_active !== undefined ? schedule.is_active : true,
          filter_options: schedule.filter_options || {
            card_numbers: [],
            only_with_vehicle: false,
            only_blocked: false,
            only_active: false
          }
        })
        
        // Определяем пресет расписания
        const scheduleStr = schedule.schedule || ''
        const preset = SCHEDULE_PRESETS.find(p => p.value === scheduleStr) || 'custom'
        setSelectedSchedulePreset(preset.value === 'custom' ? 'custom' : preset.value)
        
        // Парсим номера карт
        if (schedule.filter_options?.card_numbers) {
          setCardNumbersText(schedule.filter_options.card_numbers.join(', '))
        }
      } else {
        // Новый регламент
        setFormData({
          name: '',
          description: '',
          provider_template_id: null,
          schedule: 'daily',
          schedule_custom: '',
          auto_update: true,
          flags: 23,
          is_active: true,
          filter_options: {
            card_numbers: [],
            only_with_vehicle: false,
            only_blocked: false,
            only_active: false
          }
        })
        setSelectedSchedulePreset('daily')
        setCardNumbersText('')
      }
    }
  }, [isOpen, schedule])

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/templates`)
      if (response.ok) {
        const result = await response.json()
        // Фильтруем только шаблоны с типом "web" (без учета регистра) и активные
        const webTemplates = result.items.filter(t => {
          const connectionType = (t.connection_type || '').toLowerCase()
          return connectionType === 'web' && t.is_active !== false
        })
        setLocalTemplates(webTemplates)
        
        // Логируем для отладки
        if (webTemplates.length === 0) {
          logger.warn('Не найдено шаблонов с типом "web"', {
            total_templates: result.items.length,
            templates: result.items.map(t => ({
              id: t.id,
              name: t.name,
              connection_type: t.connection_type,
              is_active: t.is_active
            }))
          })
        }
      }
    } catch (err) {
      logger.error('Ошибка загрузки шаблонов', { error: err.message })
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showError('Укажите название регламента')
      return
    }

    if (!formData.provider_template_id) {
      showError('Выберите шаблон провайдера')
      return
    }

    // Определяем расписание
    const scheduleValue = selectedSchedulePreset === 'custom' 
      ? formData.schedule_custom 
      : selectedSchedulePreset

    if (!scheduleValue || !scheduleValue.trim()) {
      showError('Укажите расписание')
      return
    }

    // Парсим номера карт
    const cardNumbers = cardNumbersText
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    const payload = {
      name: formData.name,
      description: formData.description || null,
      provider_template_id: formData.provider_template_id,
      schedule: scheduleValue.trim(),
      filter_options: {
        card_numbers: cardNumbers,
        only_with_vehicle: formData.filter_options.only_with_vehicle || false,
        only_blocked: formData.filter_options.only_blocked || false,
        only_active: formData.filter_options.only_active || false
      },
      auto_update: formData.auto_update,
      flags: formData.flags,
      is_active: formData.is_active
    }

    setLoading(true)
    try {
      const url = schedule
        ? `${API_URL}/api/v1/card-info-schedules/${schedule.id}`
        : `${API_URL}/api/v1/card-info-schedules`

      const method = schedule ? 'PUT' : 'POST'

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      success(schedule ? 'Регламент обновлен' : 'Регламент создан')
      onSave()
    } catch (err) {
      showError('Ошибка сохранения: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Используем локальные шаблоны, если они загружены, иначе переданные через пропсы
  const availableTemplates = localTemplates.length > 0 ? localTemplates : templates
  
  // Получаем названия провайдеров для отображения
  const getProviderName = (template) => {
    if (template.provider?.name) return template.provider.name
    if (template.provider_id) {
      return `ID: ${template.provider_id}`
    }
    return 'N/A'
  }
  
  const templateOptions = availableTemplates.map(t => ({
    value: t.id,
    label: `${t.name}${t.provider?.name ? ` (${t.provider.name})` : ''}`
  }))

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={schedule ? 'Редактирование регламента' : 'Создание регламента'}
      size="lg"
    >
      <Modal.Body>
        <div className="card-info-schedule-form">
          <div className="form-section">
            <div className="form-group">
              <label>Название регламента *</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Например: Обновление карт каждые 6 часов"
                fullWidth
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Описание</label>
              <Input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Описание регламента"
                fullWidth
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Шаблон провайдера (Web API) *</label>
              {loadingTemplates ? (
                <div style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Загрузка шаблонов...</div>
              ) : templateOptions.length === 0 ? (
                <>
                  <Select
                    value={formData.provider_template_id}
                    onChange={(value) => setFormData({ ...formData, provider_template_id: value })}
                    options={[]}
                    placeholder="Нет доступных шаблонов"
                    fullWidth
                    disabled={true}
                  />
                  <Alert variant="warning" style={{ marginTop: '0.5rem' }}>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Нет доступных шаблонов провайдеров с типом подключения "web"</strong>
                    </div>
                    <div style={{ fontSize: '0.875rem' }}>
                      Для создания регламента необходимо сначала создать шаблон провайдера с типом подключения "web".
                      <br />
                      Перейдите в раздел <strong>Шаблоны провайдеров</strong> и создайте новый шаблон, выбрав тип подключения "web".
                    </div>
                  </Alert>
                </>
              ) : (
                <>
                  <Select
                    value={formData.provider_template_id}
                    onChange={(value) => setFormData({ ...formData, provider_template_id: value })}
                    options={templateOptions}
                    placeholder="Выберите шаблон провайдера"
                    fullWidth
                    disabled={loading}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                    Выберите шаблон провайдера с типом подключения "web"
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="form-section">
            <h3>Расписание</h3>
            
            <div className="form-group">
              <label>Предустановленное расписание</label>
              <Select
                value={selectedSchedulePreset}
                onChange={(value) => {
                  setSelectedSchedulePreset(value)
                  if (value !== 'custom') {
                    setFormData({ ...formData, schedule: value })
                  }
                }}
                options={SCHEDULE_PRESETS}
                fullWidth
                disabled={loading}
              />
            </div>

            {selectedSchedulePreset === 'custom' && (
              <div className="form-group">
                <label>Cron-выражение *</label>
                <Input
                  type="text"
                  value={formData.schedule_custom}
                  onChange={(e) => setFormData({ ...formData, schedule_custom: e.target.value })}
                  placeholder='Например: "0 2 * * *" (каждый день в 2:00)'
                  fullWidth
                  disabled={loading}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                  Формат: минута час день месяц день_недели. Примеры: "0 2 * * *" - каждый день в 2:00, "0 */6 * * *" - каждые 6 часов
                </span>
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>Фильтры карт</h3>
            
            <Alert variant="info" style={{ marginBottom: '1rem' }}>
              Провайдер определяется выбранным шаблоном провайдера. Дополнительные фильтры применяются к картам этого провайдера.
            </Alert>

            <div className="form-group">
              <label>Номера карт (через запятую, если пусто - все карты)</label>
              <Input
                type="text"
                value={cardNumbersText}
                onChange={(e) => setCardNumbersText(e.target.value)}
                placeholder="Например: 1100018800004794, 1100018800004795"
                fullWidth
                disabled={loading}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  <Checkbox
                    checked={formData.filter_options.only_with_vehicle}
                    onChange={(checked) => setFormData({
                      ...formData,
                      filter_options: { ...formData.filter_options, only_with_vehicle: checked }
                    })}
                    label="Только карты с ТС"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  <Checkbox
                    checked={formData.filter_options.only_blocked}
                    onChange={(checked) => setFormData({
                      ...formData,
                      filter_options: { ...formData.filter_options, only_blocked: checked }
                    })}
                    label="Только заблокированные"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  <Checkbox
                    checked={formData.filter_options.only_active}
                    onChange={(checked) => setFormData({
                      ...formData,
                      filter_options: { ...formData.filter_options, only_active: checked }
                    })}
                    label="Только активные"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Параметры</h3>
            
            <div className="form-group">
              <label>
                <Checkbox
                  checked={formData.auto_update}
                  onChange={(checked) => setFormData({ ...formData, auto_update: checked })}
                  label="Автоматически обновлять карты данными из API"
                />
              </label>
            </div>

            <div className="form-group">
              <label>
                <Checkbox
                  checked={formData.is_active}
                  onChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  label="Регламент активен"
                />
              </label>
            </div>

            <div className="form-group">
              <label>Флаги реквизитов (битовая маска)</label>
              <Input
                type="number"
                value={formData.flags}
                onChange={(e) => setFormData({ ...formData, flags: parseInt(e.target.value) || 23 })}
                min={1}
                max={63}
                fullWidth
                disabled={loading}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                23 = ФИО + телефон (1+2+4+16). 1=Имя, 2=Фамилия, 4=Отчество, 8=Дата рождения, 16=Телефон, 32=Пол
              </span>
            </div>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={loading}
        >
          Отмена
        </Button>
        <Button
          variant="success"
          onClick={handleSave}
          disabled={loading}
          loading={loading}
        >
          {schedule ? 'Сохранить' : 'Создать'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default CardInfoScheduleModal
