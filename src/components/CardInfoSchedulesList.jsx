import React, { useState, useEffect } from 'react'
import { Card, Button, Table, Badge, Skeleton, Alert, Modal, Input, Select, Checkbox } from './ui'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import CardInfoScheduleModal from './CardInfoScheduleModal'
import './CardInfoSchedulesList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const CardInfoSchedulesList = () => {
  const { success, error: showError } = useToast()
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [providers, setProviders] = useState([])
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    loadSchedules()
    loadProviders()
  }, [])

  useEffect(() => {
    if (providers.length > 0) {
      loadTemplates()
    }
  }, [providers])

  const loadSchedules = async () => {
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/card-info-schedules`)
      if (response.ok) {
        const result = await response.json()
        setSchedules(result.items)
      }
    } catch (err) {
      logger.error('Ошибка загрузки регламентов', { error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items)
      }
    } catch (err) {
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }

  const loadTemplates = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/templates`)
      if (response.ok) {
        const result = await response.json()
        // Фильтруем только шаблоны с типом "web" (без учета регистра) и активные
        const webTemplates = result.items.filter(t => {
          const connectionType = (t.connection_type || '').toLowerCase()
          return connectionType === 'web' && t.is_active !== false
        })
        setTemplates(webTemplates)
        
        // Логируем для отладки
        if (webTemplates.length === 0 && result.items.length > 0) {
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
    }
  }

  const formatSchedule = (schedule) => {
    if (!schedule || !schedule.trim()) return '-'
    
    const scheduleStr = schedule.trim().toLowerCase()
    
    // Простые форматы
    if (scheduleStr === 'daily' || scheduleStr === 'day') {
      return 'Один раз в сутки (в 2:00)'
    }
    if (scheduleStr === 'hourly' || scheduleStr === 'hour') {
      return 'Один раз в час'
    }
    if (scheduleStr === 'weekly' || scheduleStr === 'week') {
      return 'Один раз в неделю (понедельник в 2:00)'
    }
    
    // Cron-формат
    const cronParts = scheduleStr.split(/\s+/)
    if (cronParts.length === 5) {
      const [minute, hour, day, month, dayOfWeek] = cronParts
      
      if (minute === '0' && (hour === '*' || hour === '*/1') && day === '*' && month === '*' && dayOfWeek === '*') {
        return 'Один раз в час'
      }
      
      if (minute !== '*' && hour !== '*' && day === '*' && month === '*' && dayOfWeek === '*') {
        const h = parseInt(hour)
        const m = parseInt(minute)
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
        return `Один раз в сутки (в ${timeStr})`
      }
      
      if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && dayOfWeek === '*') {
        const interval = hour.substring(2)
        return `Каждые ${interval} часа`
      }
    }
    
    return schedule
  }

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule)
    setShowAddModal(true)
  }

  const handleAdd = () => {
    setEditingSchedule(null)
    setShowAddModal(true)
  }

  const handleDelete = async (schedule) => {
    if (!confirm(`Удалить регламент "${schedule.name}"?`)) {
      return
    }

    try {
      const response = await authFetch(`${API_URL}/api/v1/card-info-schedules/${schedule.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        success('Регламент успешно удален')
        loadSchedules()
      } else {
        const errorData = await response.json()
        showError(errorData.detail || 'Ошибка удаления регламента')
      }
    } catch (err) {
      showError('Ошибка удаления регламента: ' + err.message)
    }
  }

  const handleRun = async (schedule) => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/card-info-schedules/${schedule.id}/run`, {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        success(`Регламент выполнен. Обработано карт: ${result.result.cards_processed}, обновлено: ${result.result.cards_updated}`)
        loadSchedules()
      } else {
        const errorData = await response.json()
        showError(errorData.detail || 'Ошибка выполнения регламента')
      }
    } catch (err) {
      showError('Ошибка выполнения регламента: ' + err.message)
    }
  }

  const handleSave = () => {
    setShowAddModal(false)
    setEditingSchedule(null)
    loadSchedules()
  }

  const columns = [
    { key: 'id', header: 'ID', width: '80px', align: 'center' },
    { key: 'name', header: 'Название', width: '200px' },
    { key: 'template', header: 'Шаблон провайдера', width: '200px' },
    { key: 'schedule', header: 'Расписание', width: '200px' },
    { key: 'status', header: 'Статус', width: '120px', align: 'center' },
    { key: 'last_run', header: 'Последний запуск', width: '180px' },
    { key: 'result', header: 'Результат', width: '150px' },
    { key: 'actions', header: 'Действия', width: '200px', align: 'center' }
  ]

  const getTemplateName = (templateId) => {
    const template = templates.find(t => t.id === templateId)
    return template ? template.name : `ID: ${templateId}`
  }

  const getLastRunInfo = (schedule) => {
    if (!schedule.last_run_date) {
      return '-'
    }
    const date = new Date(schedule.last_run_date)
    return date.toLocaleString('ru-RU')
  }

  const getResultInfo = (schedule) => {
    if (!schedule.last_run_result) {
      return '-'
    }
    const result = schedule.last_run_result
    if (result.status === 'success') {
      return `✓ ${result.cards_updated}/${result.cards_processed}`
    } else if (result.status === 'partial') {
      return `⚠ ${result.cards_updated}/${result.cards_processed}`
    } else {
      return `✗ ${result.cards_failed} ошибок`
    }
  }

  const tableData = schedules.map(schedule => ({
    id: schedule.id,
    name: schedule.name,
    template: getTemplateName(schedule.provider_template_id),
    schedule: formatSchedule(schedule.schedule),
    status: (
      <Badge variant={schedule.is_active ? 'success' : 'secondary'}>
        {schedule.is_active ? 'Активен' : 'Неактивен'}
      </Badge>
    ),
    last_run: getLastRunInfo(schedule),
    result: getResultInfo(schedule),
    actions: (
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleRun(schedule)}
        >
          Запустить
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleEdit(schedule)}
        >
          Редактировать
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => handleDelete(schedule)}
        >
          Удалить
        </Button>
      </div>
    )
  }))

  if (loading && schedules.length === 0) {
    return (
      <Card>
        <Card.Body>
          <Skeleton rows={10} columns={8} />
        </Card.Body>
      </Card>
    )
  }

  return (
    <div className="card-info-schedules-list">
      <Card>
        <Card.Header>
          <Card.Title>Регламенты получения информации по картам</Card.Title>
          <Button variant="success" onClick={handleAdd}>
            + Создать регламент
          </Button>
        </Card.Header>

        <Card.Body>
          {schedules.length === 0 ? (
            <Alert variant="info">
              Регламенты не найдены. Создайте первый регламент для автоматического получения информации по картам.
            </Alert>
          ) : (
            <Table
              columns={columns}
              data={tableData}
              keyField="id"
            />
          )}
        </Card.Body>
      </Card>

      {showAddModal && (
        <CardInfoScheduleModal
          isOpen={showAddModal}
          onClose={() => {
            setShowAddModal(false)
            setEditingSchedule(null)
          }}
          onSave={handleSave}
          schedule={editingSchedule}
          templates={templates}
        />
      )}
    </div>
  )
}

export default CardInfoSchedulesList
