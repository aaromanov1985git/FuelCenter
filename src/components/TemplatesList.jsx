import React, { useState, useEffect } from 'react'
import TemplateEditor from './TemplateEditor'
import ConfirmModal from './ConfirmModal'
import LoadFirebirdModal from './LoadFirebirdModal'
import LoadApiModal from './LoadApiModal'
import { Button, Card, Badge, Table, Alert, Skeleton, useToast } from './ui'
import { logger } from '../utils/logger'
import { authFetch } from '../utils/api'
import './TemplatesList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const TemplatesList = () => {
  const { error: showError, success } = useToast()
  const [providers, setProviders] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, templateId: null })
  const [loadFirebirdModal, setLoadFirebirdModal] = useState({ isOpen: false, templateId: null, templateName: '' })
  const [firebirdDateFrom, setFirebirdDateFrom] = useState('')
  const [firebirdDateTo, setFirebirdDateTo] = useState('')
  const [loadingFirebird, setLoadingFirebird] = useState(false)
  const [loadApiModal, setLoadApiModal] = useState({ isOpen: false, templateId: null, templateName: '' })
  const [apiDateFrom, setApiDateFrom] = useState('')
  const [apiDateTo, setApiDateTo] = useState('')
  const [apiCardNumbers, setApiCardNumbers] = useState('')
  const [loadingApi, setLoadingApi] = useState(false)
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' })
  
  // Пагинация для шаблонов
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице

  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items.filter(p => p.is_active))
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }

  const loadTemplates = async (providerId) => {
    if (!providerId) {
      setTemplates([])
      setTotal(0)
      return
    }
    
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      const response = await authFetch(`${API_URL}/api/v1/providers/${providerId}/templates?${params}`)
      if (response.ok) {
        const result = await response.json()
        setTemplates(result.items)
        setTotal(result.total)
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка загрузки шаблонов: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Сбрасываем на первую страницу при смене провайдера
  }, [selectedProviderId])

  useEffect(() => {
    if (selectedProviderId) {
      loadTemplates(selectedProviderId)
    } else {
      setTemplates([])
      setTotal(0)
    }
  }, [selectedProviderId, currentPage])
  
  // Проверяем, нужно ли перейти на предыдущую страницу после удаления
  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const handleAddTemplate = () => {
    if (!selectedProviderId) {
      setError('Выберите провайдера')
      return
    }
    setEditingTemplate(null)
    setShowTemplateEditor(true)
    setError('')
  }

  const handleEditTemplate = (template) => {
    setEditingTemplate(template)
    setShowTemplateEditor(true)
    setError('')
  }

  const handleDeleteTemplate = (templateId) => {
    setDeleteConfirm({ isOpen: true, templateId })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.templateId) return

    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/templates/${deleteConfirm.templateId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления')
      }

      await loadTemplates(selectedProviderId)
      setError('')
      setDeleteConfirm({ isOpen: false, templateId: null })
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка удаления: ' + err.message)
      setDeleteConfirm({ isOpen: false, templateId: null })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (templateData) => {
    try {
      setLoading(true)
      setError('')

      let response
      if (editingTemplate) {
        // Обновление существующего шаблона
        response = await authFetch(`${API_URL}/api/v1/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateData)
        })
      } else {
        // Создание нового шаблона
        // Убеждаемся, что все обязательные поля присутствуют
        const requestData = {
          ...templateData,
          provider_id: selectedProviderId,
          // Убеждаемся, что field_mapping не пустой объект (минимум должен быть пустым объектом, но не null)
          field_mapping: templateData.field_mapping || {}
        }
        
        logger.debug('Создание шаблона', { 
          providerId: selectedProviderId, 
          name: requestData.name,
          hasFieldMapping: !!requestData.field_mapping,
          fieldMappingKeys: Object.keys(requestData.field_mapping || {}).length
        })
        
        response = await authFetch(`${API_URL}/api/v1/providers/${selectedProviderId}/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        })
      }

      if (!response.ok) {
        let errorMessage = 'Ошибка сохранения'
        try {
          const errorData = await response.json()
          // Обрабатываем ошибки валидации Pydantic
          if (errorData.detail) {
            if (Array.isArray(errorData.detail)) {
              // Если это массив ошибок валидации
              const validationErrors = errorData.detail
                .map(err => {
                  const field = err.loc && err.loc.length > 0 ? err.loc[err.loc.length - 1] : 'поле'
                  return `${field}: ${err.msg}`
                })
                .join('; ')
              errorMessage = `Ошибка валидации: ${validationErrors}`
            } else if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail
            } else {
              errorMessage = JSON.stringify(errorData.detail)
            }
          } else if (errorData.message) {
            errorMessage = errorData.message
          }
        } catch (parseError) {
          // Если не удалось распарсить JSON, используем текст ответа
          const text = await response.text().catch(() => 'Ошибка сохранения')
          errorMessage = text || 'Ошибка сохранения'
        }
        throw new Error(errorMessage)
      }

      // Читаем ответ от сервера (даже если не используем, это важно для валидации)
      try {
        const result = await response.json()
        logger.debug('Шаблон сохранен', { templateId: result.id, name: result.name })
      } catch (parseError) {
        // Если ответ пустой или не JSON, это нормально для некоторых эндпоинтов
        logger.debug('Ответ сервера не содержит JSON', { error: parseError.message })
      }

      setShowTemplateEditor(false)
      setEditingTemplate(null)
      await loadTemplates(selectedProviderId)
      setError('')
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка сохранения: ' + err.message)
      showError('Ошибка сохранения: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setShowTemplateEditor(false)
    setEditingTemplate(null)
    setError('')
  }

  // Функция для преобразования расписания в читаемый формат
  const formatSchedule = (schedule) => {
    if (!schedule || !schedule.trim()) return null
    
    const scheduleStr = schedule.trim().toLowerCase()
    
    // Простые форматы
    if (scheduleStr === 'daily' || scheduleStr === 'day') {
      return 'один раз в сутки'
    }
    if (scheduleStr === 'hourly' || scheduleStr === 'hour') {
      return 'один раз в час'
    }
    if (scheduleStr === 'weekly' || scheduleStr === 'week') {
      return 'один раз в неделю'
    }
    
    // Формат "every N hours/minutes"
    if (scheduleStr.startsWith('every ')) {
      const parts = scheduleStr.split(/\s+/)
      if (parts.length >= 3) {
        const interval = parts[1]
        const unit = parts[2]
        if (unit.includes('hour') || unit.includes('час')) {
          if (interval === '1') {
            return 'один раз в час'
          }
          return `каждые ${interval} часа`
        }
        if (unit.includes('minute') || unit.includes('мин')) {
          if (interval === '1') {
            return 'каждую минуту'
          }
          return `каждые ${interval} минуты`
        }
      }
    }
    
    // Cron-формат (минута час день месяц день_недели)
    const cronParts = scheduleStr.split(/\s+/)
    if (cronParts.length === 5) {
      const [minute, hour, day, month, dayOfWeek] = cronParts
      
      // Каждый час: "0 * * * *" или "0 */1 * * *"
      if (minute === '0' && (hour === '*' || hour === '*/1') && day === '*' && month === '*' && dayOfWeek === '*') {
        return 'один раз в час'
      }
      
      // Каждый день в определенное время: "0 2 * * *"
      if (minute !== '*' && hour !== '*' && day === '*' && month === '*' && dayOfWeek === '*') {
        const h = parseInt(hour)
        const m = parseInt(minute)
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
        return `один раз в сутки (${timeStr})`
      }
      
      // Каждые N часов: "0 */6 * * *"
      if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && dayOfWeek === '*') {
        const interval = hour.substring(2)
        if (interval === '1') {
          return 'один раз в час'
        }
        return `каждые ${interval} часа`
      }
      
      // Возвращаем исходное расписание, если не удалось распознать
      return schedule
    }
    
    return schedule
  }

  const columns = [
    { key: 'id', header: 'ID', width: '80px', align: 'center' },
    { key: 'name', header: 'Название', sortable: true },
    { key: 'description', header: 'Описание', sortable: false },
    { key: 'header_row', header: 'Строка заголовков', width: '150px', align: 'center' },
    { key: 'data_start_row', header: 'Строка начала данных', width: '180px', align: 'center' },
    {
      key: 'is_active',
      header: 'Статус',
      width: '140px',
      render: (val) => (
        <Badge size="sm" variant={val ? 'success' : 'neutral'}>
          {val ? 'Активен' : 'Неактивен'}
        </Badge>
      )
    },
    {
      key: 'auto_load',
      header: 'Автозагрузка',
      width: '200px',
      render: (_, row) => {
        if (row.auto_load_enabled && row.auto_load_schedule) {
          const scheduleText = formatSchedule(row.auto_load_schedule)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Badge size="sm" variant="info" style={{ alignSelf: 'flex-start' }}>
                Включена
              </Badge>
              <span style={{ fontSize: '12px', color: '#666' }}>
                {scheduleText}
              </span>
            </div>
          )
        }
        return <span style={{ color: '#999' }}>—</span>
      }
    },
    {
      key: 'actions',
      header: 'Действия',
      width: '260px',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {row.connection_type === 'firebird' && (
            <Button
              size="sm"
              variant="success"
              onClick={() => setLoadFirebirdModal({
                isOpen: true,
                templateId: row.id,
                templateName: row.name
              })}
            >
              Загрузить (Firebird)
            </Button>
          )}
          {row.connection_type === 'api' && (
            <Button
              size="sm"
              variant="success"
              onClick={() => setLoadApiModal({
                isOpen: true,
                templateId: row.id,
                templateName: row.name
              })}
            >
              Загрузить (API)
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => handleEditTemplate(row)}>
            Редактировать
          </Button>
          <Button size="sm" variant="error" onClick={() => handleDeleteTemplate(row.id)}>
            Удалить
          </Button>
        </div>
      )
    }
  ]

  const tableData = templates.map((t) => ({
    ...t,
    description: t.description || '—'
  }))

  return (
    <div className="templates-list">
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <Card.Title>Конструктор шаблонов</Card.Title>
          <p className="templates-subtitle">
            Настройте шаблоны для преобразования файлов Excel в формат ЮПМ Газпром. Выберите провайдера и создайте или отредактируйте шаблон.
          </p>
        </Card.Header>

        <Card.Body>
          {error && (
            <Alert variant="error" title="Ошибка">
              {error}
            </Alert>
          )}

          <div className="providers-list-form">
            {providers.length > 0 ? (
              providers.map(provider => (
                <Button
                  key={provider.id}
                  variant={selectedProviderId === provider.id ? 'primary' : 'secondary'}
                  onClick={() => {
                    setSelectedProviderId(provider.id)
                    setShowTemplateEditor(false)
                    setEditingTemplate(null)
                  }}
                  style={{ minWidth: 140 }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>{provider.name}</span>
                    {provider.code && (
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{provider.code}</span>
                    )}
                  </div>
                </Button>
              ))
            ) : (
              <Alert variant="info">Провайдеры не найдены. Добавьте провайдеров в разделе "Провайдеры".</Alert>
            )}
          </div>

          {selectedProviderId && (
            <div style={{ marginTop: 16, marginBottom: 16, display: 'flex', justifyContent: 'flex-start' }}>
              <Button variant="success" onClick={handleAddTemplate}>
                Создать шаблон
              </Button>
            </div>
          )}

          {showTemplateEditor && selectedProviderId && (
            <div className="template-editor-section">
              <TemplateEditor
                providerId={selectedProviderId}
                template={editingTemplate}
                onSave={handleSaveTemplate}
                onCancel={handleCancel}
              />
            </div>
          )}

          {!showTemplateEditor && selectedProviderId && (
            <div className="templates-table-section">
              {loading && templates.length === 0 ? (
                <Skeleton variant="rectangular" height={200} />
              ) : templates.length > 0 ? (
                <Table
                  columns={columns}
                  data={tableData}
                  striped
                  hoverable
                  stickyHeader
                  compact
                  defaultSortColumn="name"
                />
              ) : (
                <Alert variant="info">
                  Шаблоны не найдены для выбранного провайдера. Создайте первый шаблон.
                </Alert>
              )}
            </div>
          )}

          {!selectedProviderId && (
            <Alert variant="info">Выберите провайдера для просмотра и редактирования шаблонов.</Alert>
          )}

          {selectedProviderId && total > limit && (
            <Table.Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(total / limit)}
              total={total}
              pageSize={limit}
              onPageChange={(page) => setCurrentPage(page)}
            />
          )}
        </Card.Body>
      </Card>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Подтверждение удаления"
        message="Вы уверены, что хотите удалить этот шаблон? Это действие нельзя отменить."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, templateId: null })}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      {/* Модальное окно для загрузки из Firebird */}
      <LoadFirebirdModal
        isOpen={loadFirebirdModal.isOpen}
        templateName={loadFirebirdModal.templateName}
        dateFrom={firebirdDateFrom}
        dateTo={firebirdDateTo}
        onDateFromChange={setFirebirdDateFrom}
        onDateToChange={setFirebirdDateTo}
        onConfirm={async () => {
          setLoadingFirebird(true)
          setError('')
          try {
            const params = new URLSearchParams()
            params.append('template_id', loadFirebirdModal.templateId.toString())
            if (firebirdDateFrom) {
              params.append('date_from', firebirdDateFrom + ' 00:00:00')
            }
            if (firebirdDateTo) {
              params.append('date_to', firebirdDateTo + ' 23:59:59')
            }
            
            const response = await authFetch(`${API_URL}/api/v1/transactions/load-from-firebird?${params}`, {
              method: 'POST'
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.detail || 'Ошибка загрузки данных из Firebird')
            }
            
            const result = await response.json()
            
            // Закрываем модальное окно и очищаем даты
            setLoadFirebirdModal({ isOpen: false, templateId: null, templateName: '' })
            setFirebirdDateFrom('')
            setFirebirdDateTo('')
            
            // Показываем результат
            let message = `Успешно загружено ${result.transactions_created} транзакций из Firebird`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              const warningsText = result.validation_warnings.join('\n')
              message += `\n\n⚠️ Предупреждения валидации:\n${warningsText}`
              setError(message)
            } else {
              // Показываем красивое модальное окно вместо alert()
              setSuccessModal({ isOpen: true, message })
              setError('')
            }
            
            // Не перезагружаем транзакции автоматически, чтобы не переключать вкладку
            // Пользователь может сам перейти на вкладку "Транзакции" для просмотра загруженных данных
            } catch (err) {
              let errorMessage = err.message || 'Неизвестная ошибка'
              
              // Улучшаем сообщение об ошибке аутентификации
              if (errorMessage.includes('Not authenticated') || 
                  errorMessage.includes('аутентификации') || 
                  errorMessage.includes('SQLCODE: -902') ||
                  errorMessage.includes('authentication')) {
                errorMessage = (
                  'Ошибка аутентификации при подключении к Firebird.\n\n' +
                  'Проверьте настройки подключения:\n' +
                  '1. Убедитесь, что указаны правильные имя пользователя и пароль\n' +
                  '2. Проверьте, что пользователь существует в базе данных Firebird\n' +
                  '3. Убедитесь, что пользователь имеет права доступа к базе данных\n' +
                  '4. Для Firebird 3.0+ может потребоваться указать роль (ROLE)\n\n' +
                  'Откройте шаблон и проверьте настройки подключения в разделе "Настройки подключения к Firebird".'
                )
              }
              
              setError(errorMessage)
              logger.error('Ошибка загрузки из Firebird', { error: err.message, fullError: err })
            } finally {
              setLoadingFirebird(false)
            }
        }}
        onCancel={() => {
          setLoadFirebirdModal({ isOpen: false, templateId: null, templateName: '' })
          setFirebirdDateFrom('')
          setFirebirdDateTo('')
        }}
        loading={loadingFirebird}
      />

      {/* Модальное окно для загрузки через API */}
      <LoadApiModal
        isOpen={loadApiModal.isOpen}
        templateName={loadApiModal.templateName}
        dateFrom={apiDateFrom}
        dateTo={apiDateTo}
        cardNumbers={apiCardNumbers}
        onDateFromChange={setApiDateFrom}
        onDateToChange={setApiDateTo}
        onCardNumbersChange={setApiCardNumbers}
        onConfirm={async () => {
          setLoadingApi(true)
          setError('')
          try {
            const params = new URLSearchParams()
            params.append('template_id', loadApiModal.templateId.toString())
            params.append('date_from', apiDateFrom)
            params.append('date_to', apiDateTo)
            if (apiCardNumbers && apiCardNumbers.trim()) {
              // Преобразуем многострочный текст в список через запятую
              const cards = apiCardNumbers
                .split(/[,\n]/)
                .map(card => card.trim())
                .filter(card => card)
              if (cards.length > 0) {
                params.append('card_numbers', cards.join(','))
              }
            }
            
            const response = await authFetch(`${API_URL}/api/v1/transactions/load-from-api?${params}`, {
              method: 'POST'
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.detail || 'Ошибка загрузки данных через API')
            }
            
            const result = await response.json()
            
            // Закрываем модальное окно и очищаем данные
            setLoadApiModal({ isOpen: false, templateId: null, templateName: '' })
            setApiDateFrom('')
            setApiDateTo('')
            setApiCardNumbers('')
            
            // Показываем результат
            let message = `Успешно загружено ${result.transactions_created} транзакций через API`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              const warningsText = result.validation_warnings.join('\n')
              message += `\n\n⚠️ Предупреждения валидации:\n${warningsText}`
              setError(message)
            } else {
              // Показываем красивое модальное окно вместо alert()
              setSuccessModal({ isOpen: true, message })
              setError('')
            }
            
            // Не перезагружаем транзакции автоматически, чтобы не переключать вкладку
            // Пользователь может сам перейти на вкладку "Транзакции" для просмотра загруженных данных
          } catch (err) {
            setError('Ошибка загрузки через API: ' + err.message)
            logger.error('Ошибка загрузки через API', { error: err.message })
          } finally {
            setLoadingApi(false)
          }
        }}
        onCancel={() => {
          setLoadApiModal({ isOpen: false, templateId: null, templateName: '' })
          setApiDateFrom('')
          setApiDateTo('')
          setApiCardNumbers('')
        }}
        loading={loadingApi}
      />

      {/* Модальное окно успешной загрузки */}
      <ConfirmModal
        isOpen={successModal.isOpen}
        title="Загрузка завершена"
        message={successModal.message}
        onConfirm={() => setSuccessModal({ isOpen: false, message: '' })}
        onCancel={() => setSuccessModal({ isOpen: false, message: '' })}
        confirmText="OK"
        cancelText={null}
        variant="success"
      />
    </div>
  )
}

export default TemplatesList
