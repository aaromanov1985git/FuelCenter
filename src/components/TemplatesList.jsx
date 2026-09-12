import React, { useState, useEffect } from 'react'
import TemplateEditor from './TemplateEditor'
import ConfirmModal from './ConfirmModal'
import LoadFirebirdModal from './LoadFirebirdModal'
import LoadApiModal from './LoadApiModal'
import { Button, Badge, Table, Alert, Skeleton, useToast } from './ui'
import TemplateRowActions from './TemplateRowActions'
import EmptyState from './EmptyState'
import { formatSchedule } from '../utils/templateModel'
import { logger } from '../utils/logger'
import { authFetch } from '../utils/api'
import './TemplatesList.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// Шаблон в модели данных существует только внутри провайдера
// (ProviderTemplate.provider_id NOT NULL), сводного вида «все шаблоны» нет,
// поэтому «провайдер не выбран» — не рабочее состояние, а дырка в инициализации:
// при загрузке правая колонка была 896x200 при рабочей области 1160x880,
// то есть 77.2% ширины несли одну строку текста (заполнение блока 3.7%),
// а максимальный сплошной пустой прямоугольник первого экрана составлял
// 1080x660 = 69.8% рабочей области. Провайдер выбирается сразу: сохранённый,
// если он ещё активен, иначе первый в списке.
const PROVIDER_KEY = 'templates.providerId'

const readStoredProviderId = () => {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY)
    const id = raw === null ? NaN : Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

const storeProviderId = (id) => {
  try {
    localStorage.setItem(PROVIDER_KEY, String(id))
  } catch {
    // Приватный режим или заблокированное хранилище — выбор просто не переживёт
    // перезагрузку, работу страницы это не ломает.
  }
}

const TemplatesList = () => {
  const { error: showError, success } = useToast()
  const [providers, setProviders] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  // Отличает «список ещё не пришёл» от «активных провайдеров нет»: без этого
  // на первом кадре мелькало бы пустое состояние «Провайдеров нет».
  const [providersLoaded, setProvidersLoaded] = useState(false)
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
        const active = result.items.filter(p => p.is_active)
        setProviders(active)
        setSelectedProviderId((prev) => {
          if (prev && active.some(p => p.id === prev)) return prev
          const saved = readStoredProviderId()
          if (saved && active.some(p => p.id === saved)) return saved
          return active.length > 0 ? active[0].id : null
        })
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    } finally {
      setProvidersLoaded(true)
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
  // Источник данных определяет и набор секций редактора, и то, какая загрузка
  // доступна, — но до сих пор нигде не показывался. Зато показывались header_row
  // и data_start_row, осмысленные только для файловых шаблонов: на API-шаблоне
  // они давали «0» и «1».
  const SOURCE_LABELS = {
    file: 'Excel',
    firebird: 'Firebird',
    api: 'API',
    web: 'Веб-сервис'
  }

  const formatLastLoad = (value) => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const columns = [
    {
      key: 'name',
      header: 'Название',
      sortable: true,
      render: (val, row) => {
        // Имя и служебная подпись в ОДНУ строку: --table-row-height в проекте
        // 36px, а двустрочная ячейка держала медиану строки 57px — на 13px выше
        // верхней границы A4 (32-44) и на 58% выше проектной высоты.
        // Восемь строк давали 168px лишней высоты, полсотни — 1050px.
        const meta = `id ${row.id}${row.description && row.description !== '—' ? ` · ${row.description}` : ''}`
        return (
          <div className="template-name-cell">
            <span className="template-name" title={val}>{val}</span>
            <span className="template-name-meta" title={meta}>{meta}</span>
          </div>
        )
      }
    },
    {
      key: 'connection_type',
      header: 'Источник',
      width: '130px',
      render: (val) => (
        <Badge size="sm" variant="neutral">
          {SOURCE_LABELS[val] || val || 'Excel'}
        </Badge>
      )
    },
    {
      key: 'is_active',
      header: 'Статус',
      width: '130px',
      render: (val) => (
        <Badge size="sm" variant={val ? 'success' : 'neutral'} dot>
          {val ? 'Активен' : 'Неактивен'}
        </Badge>
      )
    },
    {
      key: 'auto_load',
      header: 'Автозагрузка',
      width: '190px',
      render: (_, row) => {
        if (row.auto_load_enabled && row.auto_load_schedule) {
          return (
            <span className="template-schedule">{formatSchedule(row.auto_load_schedule)}</span>
          )
        }
        return <span className="template-muted">Выключена</span>
      }
    },
    {
      key: 'last_auto_load_date',
      header: 'Последняя загрузка',
      width: '160px',
      render: (val) => {
        const formatted = formatLastLoad(val)
        return formatted
          ? <span className="template-last-load">{formatted}</span>
          : <span className="template-muted">—</span>
      }
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      align: 'right',
      render: (_, row) => (
        <TemplateRowActions
          template={row}
          onEdit={handleEditTemplate}
          onDelete={handleDeleteTemplate}
          onLoad={(t) => {
            const payload = { isOpen: true, templateId: t.id, templateName: t.name }
            if (t.connection_type === 'firebird') {
              setLoadFirebirdModal(payload)
            } else {
              setLoadApiModal(payload)
            }
          }}
        />
      )
    }
  ]

  // Provider.code — отдельное обязательное уникальное поле, ничем не выводимое
  // из name, поэтому оператор часто вписывает в оба одну строку: на текущих
  // данных дубль в 8 пунктах из 8. Строка кода добавляла к пункту 18px
  // (52px вместо 34px) — 144px, то есть 31.7% высоты рельса, на дубль.
  const railCode = (provider) => {
    const code = (provider.code || '').trim()
    if (!code) return null
    const name = (provider.name || '').trim()
    if (code.localeCompare(name, 'ru', { sensitivity: 'accent' }) === 0) return null
    return code
  }

  const selectProvider = (id) => {
    setSelectedProviderId(id)
    storeProviderId(id)
    setShowTemplateEditor(false)
    setEditingTemplate(null)
  }

  const tableData = templates.map((t) => ({
    ...t,
    description: t.description || '—'
  }))

  return (
    <div className="templates-list">
      {/* Заголовок вынесен из Card.Header: тот раскладывает детей в ряд
          space-between, поэтому заголовок зажимался в min-content и ломался
          на две строки при свободном месте справа. */}
      <header className="templates-page-header">
        <h1 className="templates-page-title">Шаблоны</h1>
        <p className="templates-subtitle">
          Правила разбора выгрузок поставщиков в формат ЮПМ Газпром
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Операция завершена с предупреждениями">
          {error}
        </Alert>
      )}

      <div className="templates-layout">
        <aside className="providers-rail" aria-label="Провайдеры">
          <div className="providers-rail-title">Провайдеры</div>
          {providers.map((provider) => {
            const code = railCode(provider)
            return (
              <button
                key={provider.id}
                type="button"
                className={`provider-rail-item${selectedProviderId === provider.id ? ' is-selected' : ''}`}
                aria-pressed={selectedProviderId === provider.id}
                onClick={() => selectProvider(provider.id)}
              >
                <span className="provider-rail-name">{provider.name}</span>
                {code && <span className="provider-rail-code">{code}</span>}
              </button>
            )
          })}
        </aside>

        <section className="templates-main">
          {/* Заглушка «Выберите провайдера» стала недостижимой: провайдер
              выбирается при загрузке. Остаётся единственный настоящий случай —
              активных провайдеров нет, и тогда шаблону не к чему привязаться.
              Проп называется message: description компонент EmptyState
              не объявляет, и React молча выбрасывал подпись — в DOM оставался
              один узел h3 245x27 внутри блока 896x200. */}
          {!providersLoaded && <Skeleton variant="rectangular" height={320} />}

          {providersLoaded && !selectedProviderId && (
            <EmptyState
              title="Активных провайдеров нет"
              message="Шаблон описывает разбор выгрузки конкретного поставщика и без провайдера существовать не может. Добавьте провайдера в разделе «Провайдеры» — шаблоны появятся здесь."
            />
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

          {/* Card убран: у .ui-table-wrapper уже есть своя поверхность
              (фон --surface, радиус, тень), поэтому карточка вокруг неё была
              поверхностью в поверхности — 2 находки C2 на срез, 8 на четыре
              среза страницы. Остаётся шапка зоны и сама таблица. */}
          {!showTemplateEditor && selectedProviderId && (
            <>
              <div className="templates-main-header">
                <h2 className="templates-main-title">Шаблоны · {total}</h2>
                <Button variant="primary" onClick={handleAddTemplate}>
                  Создать шаблон
                </Button>
              </div>

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
                <EmptyState
                  title="Шаблонов пока нет"
                  message="Шаблон описывает, как разобрать выгрузку этого поставщика."
                  action={
                    <Button variant="primary" onClick={handleAddTemplate}>
                      Создать шаблон
                    </Button>
                  }
                />
              )}

              {total > limit && (
                <Table.Pagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(total / limit)}
                  total={total}
                  pageSize={limit}
                  onPageChange={(page) => setCurrentPage(page)}
                />
              )}
            </>
          )}
        </section>
      </div>

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
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              // Формируем структурированное сообщение с предупреждениями
              const mainMessage = `Успешно загружено: ${result.transactions_created} транзакций${result.transactions_skipped > 0 ? ` (пропущено дубликатов: ${result.transactions_skipped})` : ''}`
              
              // Парсим предупреждения для лучшего форматирования
              const duplicateWarnings = result.validation_warnings.filter(w => w.includes('дубль') || w.includes('похожая запись'))
              const otherWarnings = result.validation_warnings.filter(w => !w.includes('дубль') && !w.includes('похожая запись'))
              
              let formattedMessage = `${mainMessage}.\n\n`
              
              if (duplicateWarnings.length > 0) {
                formattedMessage += `Предупреждения валидации (возможные дубли АЗС):\n`
                duplicateWarnings.forEach((warning) => {
                  // Извлекаем название АЗС и схожесть из предупреждения
                  // Формат: "Возможный дубль АЗС: найдена похожая запись 'AZS103910' (схожесть: 88.89%). Проверьте вручную."
                  const match = warning.match(/найдена похожая запись '([^']+)'.*?схожесть:\s*([\d.]+)%/)
                  if (match) {
                    const [, azsName, similarity] = match
                    const similarityNum = parseFloat(similarity)
                    formattedMessage += `  • Найдена похожая запись '${azsName}' (схожесть: ${similarityNum.toFixed(2)}%). Проверьте вручную.\n`
                  } else {
                    // Если не удалось распарсить, показываем как есть
                    formattedMessage += `  • ${warning}\n`
                  }
                })
              }
              
              if (otherWarnings.length > 0) {
                formattedMessage += `\nДругие предупреждения:\n`
                otherWarnings.forEach(warning => {
                  formattedMessage += `  • ${warning}\n`
                })
              }
              
              setError(formattedMessage.trim())
            } else {
              let message = `Успешно загружено ${result.transactions_created} транзакций из Firebird`
              if (result.transactions_skipped > 0) {
                message += `. Пропущено дубликатов: ${result.transactions_skipped}`
              }
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
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              // Формируем структурированное сообщение с предупреждениями
              const mainMessage = `Успешно загружено: ${result.transactions_created} транзакций через API${result.transactions_skipped > 0 ? ` (пропущено дубликатов: ${result.transactions_skipped})` : ''}`
              
              // Парсим предупреждения для лучшего форматирования
              const duplicateWarnings = result.validation_warnings.filter(w => w.includes('дубль') || w.includes('похожая запись'))
              const otherWarnings = result.validation_warnings.filter(w => !w.includes('дубль') && !w.includes('похожая запись'))
              
              let formattedMessage = `${mainMessage}.\n\n`
              
              if (duplicateWarnings.length > 0) {
                formattedMessage += `Предупреждения валидации (возможные дубли АЗС):\n`
                duplicateWarnings.forEach((warning) => {
                  // Извлекаем название АЗС и схожесть из предупреждения
                  // Формат: "Возможный дубль АЗС: найдена похожая запись 'AZS103910' (схожесть: 88.89%). Проверьте вручную."
                  const match = warning.match(/найдена похожая запись '([^']+)'.*?схожесть:\s*([\d.]+)%/)
                  if (match) {
                    const [, azsName, similarity] = match
                    const similarityNum = parseFloat(similarity)
                    formattedMessage += `  • Найдена похожая запись '${azsName}' (схожесть: ${similarityNum.toFixed(2)}%). Проверьте вручную.\n`
                  } else {
                    // Если не удалось распарсить, показываем как есть
                    formattedMessage += `  • ${warning}\n`
                  }
                })
              }
              
              if (otherWarnings.length > 0) {
                formattedMessage += `\nДругие предупреждения:\n`
                otherWarnings.forEach(warning => {
                  formattedMessage += `  • ${warning}\n`
                })
              }
              
              setError(formattedMessage.trim())
            } else {
              let message = `Успешно загружено ${result.transactions_created} транзакций через API`
              if (result.transactions_skipped > 0) {
                message += `. Пропущено дубликатов: ${result.transactions_skipped}`
              }
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
        variant="primary"
      />
    </div>
  )
}

export default TemplatesList
