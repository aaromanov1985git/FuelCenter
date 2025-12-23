import React, { useState, useEffect } from 'react'
import IconButton from './IconButton'
import { authFetch } from '../utils/api'
import './TemplateEditor.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const TemplateEditor = ({ providerId, template, onSave, onCancel }) => {
  // Парсим field_mapping если это строка JSON
  const parseFieldMapping = (mapping) => {
    if (!mapping) return {}
    if (typeof mapping === 'string') {
      try {
        return JSON.parse(mapping)
      } catch {
        return {}
      }
    }
    return mapping
  }

  const handleTestConnection = async () => {
    if (!connectionSettings.database || !connectionSettings.database.trim()) {
      setError('Укажите путь к базе данных')
      return
    }

    setTestingConnection(true)
    setConnectionTestResult(null)

    try {
      // Всегда используем настройки из формы, чтобы тестировать актуальные значения
      // (включая изменения, которые пользователь еще не сохранил)
      const response = await authFetch(`${API_URL}/api/v1/templates/test-firebird-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(connectionSettings)
      })

      const result = await response.json()
      setConnectionTestResult(result)
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setConnectionTestResult({ success: false, message: 'Ошибка тестирования: ' + err.message })
    } finally {
      setTestingConnection(false)
    }
  }

  // Парсинг fuel_type_mapping (маппинг видов топлива)
  const parseFuelMapping = (mapping) => {
    if (!mapping) return null
    if (typeof mapping === 'string') {
      try {
        return JSON.parse(mapping)
      } catch {
        return null
      }
    }
    return mapping
  }

  // Функция для преобразования расписания в читаемый формат
  const formatSchedule = (schedule) => {
    if (!schedule || !schedule.trim()) return null
    
    const scheduleStr = schedule.trim().toLowerCase()
    
    // Простые форматы
    if (scheduleStr === 'daily' || scheduleStr === 'day') {
      return 'один раз в сутки (в 2:00)'
    }
    if (scheduleStr === 'hourly' || scheduleStr === 'hour') {
      return 'один раз в час'
    }
    if (scheduleStr === 'weekly' || scheduleStr === 'week') {
      return 'один раз в неделю (понедельник в 2:00)'
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
          return `каждые ${interval} ${interval === '1' ? 'час' : 'часа'}`
        }
        if (unit.includes('minute') || unit.includes('мин')) {
          if (interval === '1') {
            return 'каждую минуту'
          }
          return `каждые ${interval} ${interval === '1' ? 'минуту' : 'минуты'}`
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
        return `один раз в сутки (в ${timeStr})`
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

  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    connection_type: template?.connection_type || 'file',
    connection_settings: template?.connection_settings || null,
    header_row: template?.header_row ?? 0,
    data_start_row: template?.data_start_row ?? 1,
    source_table: template?.source_table || '',
    source_query: template?.source_query || '',
    export_start_row: template?.export_start_row ?? 0,
    export_header_row: template?.export_header_row ?? 0,
    is_active: template?.is_active ?? true,
    field_mapping: parseFieldMapping(template?.field_mapping),
    fuel_type_mapping: parseFuelMapping(template?.fuel_type_mapping),
    auto_load_enabled: template?.auto_load_enabled ?? false,
    auto_load_schedule: template?.auto_load_schedule || '',
    auto_load_date_from_offset: template?.auto_load_date_from_offset ?? -7,
    auto_load_date_to_offset: template?.auto_load_date_to_offset ?? -1
  })
  const [fuelMappingText, setFuelMappingText] = useState(
    template?.fuel_type_mapping
      ? (() => {
          try {
            const parsed = parseFuelMapping(template.fuel_type_mapping)
            return parsed ? JSON.stringify(parsed, null, 2) : ''
          } catch {
            return ''
          }
        })()
      : ''
  )
  
  // Парсим connection_settings если это строка JSON
  const parseConnectionSettings = (settings, connectionType) => {
    if (!settings) {
      if (connectionType === 'api') {
        // Определяем тип провайдера из существующих настроек или используем PetrolPlus по умолчанию
        const parsed = typeof settings === 'string' ? (() => { try { return JSON.parse(settings) } catch { return {} } })() : (settings || {})
        if (parsed.provider_type === 'rncard') {
          return { provider_type: 'rncard', base_url: 'https://lkapi.rn-card.ru', login: '', password: '', contract: '', currency: 'RUB', use_md5_hash: true }
        }
        if (parsed.provider_type === 'gpn' || parsed.provider_type === 'gazprom-neft' || parsed.provider_type === 'gazpromneft') {
          return { provider_type: 'gpn', base_url: 'https://api-demo.opti-24.ru', api_key: '', login: '', password: '', currency: 'RUB' }
        }
        return { provider_type: 'petrolplus', base_url: 'https://online.petrolplus.ru/api', api_token: '', currency: 'RUB' }
      }
      if (connectionType === 'web') {
        return { base_url: '', username: '', password: '', currency: 'RUB', certificate: '', pos_code: '', key: '', signature: '', salt: '', cod_azs: 1000001 }
      }
      return { host: 'localhost', database: '', user: 'SYSDBA', password: '', port: 3050, charset: 'UTF8' }
    }
    if (typeof settings === 'string') {
      try {
        return JSON.parse(settings)
      } catch {
        if (connectionType === 'api') {
          // Определяем тип провайдера из существующих настроек или используем PetrolPlus по умолчанию
          const parsed = typeof settings === 'string' ? (() => { try { return JSON.parse(settings) } catch { return {} } })() : (settings || {})
          if (parsed.provider_type === 'rncard') {
            return { provider_type: 'rncard', base_url: 'https://lkapi.rn-card.ru', login: '', password: '', contract: '', currency: 'RUB', use_md5_hash: true }
          }
          if (parsed.provider_type === 'gpn' || parsed.provider_type === 'gazprom-neft' || parsed.provider_type === 'gazpromneft') {
            return { provider_type: 'gpn', base_url: 'https://api-demo.opti-24.ru', api_key: '', login: '', password: '', currency: 'RUB' }
          }
          return { provider_type: 'petrolplus', base_url: 'https://online.petrolplus.ru/api', api_token: '', currency: 'RUB' }
        }
        if (connectionType === 'web') {
          return { base_url: '', username: '', password: '', currency: 'RUB', certificate: '', pos_code: '', key: '', signature: '', salt: '', cod_azs: 1000001 }
        }
        return { host: 'localhost', database: '', user: 'SYSDBA', password: '', port: 3050, charset: 'UTF8' }
      }
    }
    return settings
  }
  
  const [connectionSettings, setConnectionSettings] = useState(
    parseConnectionSettings(template?.connection_settings, template?.connection_type || formData.connection_type)
  )
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionTestResult, setConnectionTestResult] = useState(null)
  const [loadingTables, setLoadingTables] = useState(false)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [availableTables, setAvailableTables] = useState([])
  const [selectedTableColumns, setSelectedTableColumns] = useState([])
  const [selectedTable, setSelectedTable] = useState(template?.source_table || '')
  const [fileColumns, setFileColumns] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [autoMappedFields, setAutoMappedFields] = useState({}) // Отслеживаем автоматически сопоставленные поля
  const [apiFields, setApiFields] = useState([]) // Поля из API ответа
  const [loadingApiFields, setLoadingApiFields] = useState(false) // Загрузка полей из API

  // При загрузке существующего шаблона, если есть field_mapping, пытаемся восстановить колонки
  useEffect(() => {
    if (template && template.field_mapping && Object.keys(parseFieldMapping(template.field_mapping)).length > 0) {
      // Если есть маппинг, но нет колонок, создаем список из значений маппинга
      const mapping = parseFieldMapping(template.field_mapping)
      const columnsFromMapping = Object.values(mapping).filter(Boolean)
      if (columnsFromMapping.length > 0 && fileColumns.length === 0) {
        setFileColumns(columnsFromMapping)
        setAutoMappedFields(mapping)
      }
    }
  }, [template])

  // Стандартные поля системы
  const systemFields = [
    { key: 'user', label: 'Пользователь / ТС', required: false },
    { key: 'card', label: 'Номер карты', required: false },
    { key: 'kazs', label: 'КАЗС / АЗС', required: false },
    { key: 'date', label: 'Дата и время', required: true },
    { key: 'quantity', label: 'Количество', required: true },
    { key: 'fuel', label: 'Вид топлива', required: true },
    { key: 'organization', label: 'Организация', required: false }
  ]

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setAnalyzing(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await authFetch(`${API_URL}/api/v1/templates/analyze`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка анализа файла')
      }

      const analysis = await response.json()
      setFileColumns(analysis.columns || [])
      setSelectedFileName(file.name)
      
      // Всегда применяем автоматический маппинг при анализе нового файла
      const autoMapping = analysis.field_mapping || {}
      setAutoMappedFields(autoMapping) // Сохраняем информацию о автоматически сопоставленных полях
      
      // Объединяем автоматический маппинг с существующим (автоматический имеет приоритет)
      setFormData(prev => {
        const mergedMapping = {
          ...prev.field_mapping,
          ...autoMapping // Автоматический маппинг перезаписывает существующий
        }
        
        return {
          ...prev,
          field_mapping: mergedMapping,
          header_row: analysis.header_row !== undefined ? analysis.header_row : prev.header_row,
          data_start_row: analysis.data_start_row !== undefined ? analysis.data_start_row : prev.data_start_row
        }
      })
    } catch (err) {
      setError('Ошибка анализа файла: ' + err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleFieldMapping = (systemField, fileColumn) => {
    setFormData(prev => ({
      ...prev,
      field_mapping: {
        ...prev.field_mapping,
        [systemField]: fileColumn || ''
      }
    }))
  }

  const loadTablesFromFirebird = async () => {
    // Проверяем, что настройки подключения заполнены
    if (!connectionSettings.database) {
      setError('Укажите путь к базе данных Firebird')
      return
    }

    setLoadingTables(true)
    setError('')
    
    try {
      // Если шаблон уже сохранен, используем endpoint для тестирования
      if (template?.id) {
        const response = await authFetch(`${API_URL}/api/v1/templates/${template.id}/test-firebird-connection`, {
          method: 'POST'
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Ошибка подключения к Firebird')
        }
        
        const result = await response.json()
        
        if (result.success && result.tables) {
          setAvailableTables(result.tables)
          setConnectionTestResult(result)
          
          // Если выбрана таблица, загружаем её колонки
          if (formData.source_table || selectedTable) {
            await loadTableColumns(formData.source_table || selectedTable)
          }
        } else {
          setError(result.message || 'Не удалось получить список таблиц')
          setConnectionTestResult(result)
        }
        } else {
          // Для нового шаблона тестируем подключение напрямую
          const response = await fetch(`${API_URL}/api/v1/templates/test-firebird-connection`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(connectionSettings)
          })
          
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Ошибка подключения к Firebird')
          }
          
          const result = await response.json()
          
          if (result.success && result.tables) {
            setAvailableTables(result.tables)
            setConnectionTestResult(result)
            
            // Если выбрана таблица, загружаем её колонки
            if (formData.source_table || selectedTable) {
              await loadTableColumns(formData.source_table || selectedTable)
            }
          } else {
            setError(result.message || 'Не удалось получить список таблиц')
            setConnectionTestResult(result)
          }
        }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка загрузки таблиц: ' + err.message)
      setConnectionTestResult({ success: false, message: err.message })
    } finally {
      setLoadingTables(false)
    }
  }

  const loadTableColumns = async (tableName) => {
    if (!tableName) {
      setSelectedTableColumns([])
      return
    }

    setLoadingColumns(true)
    setError('')
    console.log('Загрузка колонок для таблицы:', tableName, 'template?.id:', template?.id)

    try {
      // Если шаблон сохранен, используем endpoint с template_id
      if (template?.id) {
        const params = new URLSearchParams({ table_name: tableName })
        const url = `${API_URL}/api/v1/templates/${template.id}/firebird-table-columns?${params}`
        console.log('Запрос колонок (с шаблоном):', url)
        
        const response = await authFetch(url)
        
        if (!response.ok) {
          const errorData = await response.json()
          console.error('Ошибка ответа:', errorData)
          throw new Error(errorData.detail || 'Ошибка загрузки колонок')
        }
        
        const result = await response.json()
        console.log('Колонки загружены (с шаблоном):', result)
        setSelectedTableColumns(result.columns || [])
      } else {
        // Для нового шаблона используем прямой endpoint с настройками подключения
        const url = `${API_URL}/api/v1/templates/firebird-table-columns`
        const requestBody = {
          connection_settings: connectionSettings,
          table_name: tableName
        }
        console.log('Запрос колонок (без шаблона):', url, requestBody)
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          console.error('Ошибка ответа:', errorData)
          throw new Error(errorData.detail || 'Ошибка загрузки колонок')
        }
        
        const result = await response.json()
        console.log('Колонки загружены (без шаблона):', result)
        setSelectedTableColumns(result.columns || [])
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      console.error('Ошибка загрузки колонок:', err)
      setError('Ошибка загрузки колонок таблицы: ' + err.message)
      setSelectedTableColumns([])
    } finally {
      setLoadingColumns(false)
    }
  }

  const loadQueryColumns = async (query) => {
    if (!query || !query.trim()) {
      setSelectedTableColumns([])
      return
    }

    setLoadingColumns(true)
    setError('')
    console.log('Загрузка колонок из SQL запроса')

    try {
      const url = `${API_URL}/api/v1/templates/firebird-query-columns`
      const requestBody = {
        connection_settings: connectionSettings,
        query: query.trim()
      }
      console.log('Запрос колонок из SQL запроса:', url, requestBody)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('Ошибка ответа:', errorData)
        throw new Error(errorData.detail || 'Ошибка загрузки колонок из SQL запроса')
      }
      
      const result = await response.json()
      console.log('Колонки из SQL запроса загружены:', result)
      setSelectedTableColumns(result.columns || [])
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      console.error('Ошибка загрузки колонок из SQL запроса:', err)
      setError('Ошибка загрузки колонок из SQL запроса: ' + err.message)
      setSelectedTableColumns([])
    } finally {
      setLoadingColumns(false)
    }
  }

  const handleSave = () => {
    // Валидируем маппинг видов топлива (опционально)
    let fuelMappingParsed = null
    if (fuelMappingText && fuelMappingText.trim()) {
      try {
        fuelMappingParsed = JSON.parse(fuelMappingText)
        if (typeof fuelMappingParsed !== 'object' || Array.isArray(fuelMappingParsed)) {
          setError('Маппинг видов топлива должен быть объектом вида {"Дизельное топливо": "ДТ", "Бензин": "АИ-92"}')
          return
        }
      } catch (err) {
        setError('Неверный JSON в маппинге видов топлива: ' + err.message)
        return
      }
    }

    // Проверяем обязательные поля
    if (formData.connection_type === 'firebird') {
      // Для Firebird проверяем, что указан либо таблица, либо SQL запрос
      if (!formData.source_query && !formData.source_table) {
        setError('Укажите имя таблицы или SQL запрос для получения данных из Firebird')
        return
      }
    }
    
    if (formData.connection_type === 'api') {
      // Для API проверяем настройки подключения
      if (connectionSettings.provider_type === 'petrolplus' && !connectionSettings.api_token) {
        setError('Укажите токен авторизации')
        return
      }
      if (connectionSettings.provider_type === 'rncard' && (!connectionSettings.login || !connectionSettings.password || !connectionSettings.contract)) {
        setError('Укажите логин, пароль и код договора')
        return
      }
      if (!connectionSettings.base_url) {
        setError('Укажите базовый URL API')
        return
      }
    }

    if (formData.connection_type === 'web') {
      // Для веб-сервиса проверяем настройки подключения
      // Для XML API требуется только сертификат
      const hasCertificate = connectionSettings.certificate || connectionSettings.xml_api_certificate
      if (!connectionSettings.base_url) {
        setError('Укажите базовый URL для веб-сервиса')
        return
      }
      if (!hasCertificate) {
        setError('Для XML API требуется указать сертификат (Certificate)')
        return
      }
    }
    
    const missingFields = systemFields
      .filter(f => f.required && !formData.field_mapping[f.key])
      .map(f => f.label)
    
    if (missingFields.length > 0) {
      setError(`Не заполнены обязательные поля: ${missingFields.join(', ')}`)
      return
    }

    if (!formData.name.trim()) {
      setError('Укажите название шаблона')
      return
    }

    // Подготавливаем данные для сохранения
    // Убеждаемся, что field_mapping - это объект, а не null/undefined
    const fieldMapping = formData.field_mapping || {}
    
    const saveData = {
      name: formData.name,
      description: formData.description || null,
      connection_type: formData.connection_type || 'file',
      field_mapping: fieldMapping,
      header_row: formData.header_row ?? 0,
      data_start_row: formData.data_start_row ?? 1,
      source_table: formData.source_table || null,
      source_query: formData.source_query || null,
      fuel_type_mapping: fuelMappingParsed || null,
      is_active: formData.is_active ?? true,
      auto_load_enabled: formData.auto_load_enabled ?? false,
      auto_load_schedule: formData.auto_load_schedule || null,
      auto_load_date_from_offset: formData.auto_load_date_from_offset ?? -7,
      auto_load_date_to_offset: formData.auto_load_date_to_offset ?? -1
    }
    
    // Добавляем настройки подключения для Firebird, API или Web
    if (formData.connection_type === 'firebird' || formData.connection_type === 'api' || formData.connection_type === 'web') {
      saveData.connection_settings = connectionSettings
    } else {
      saveData.connection_settings = null
      // Очищаем поля Firebird для других типов подключения
      saveData.source_table = null
      saveData.source_query = null
      // Очищаем настройки автозагрузки для типа file
      saveData.auto_load_enabled = false
      saveData.auto_load_schedule = null
    }
    
    onSave(saveData)
  }

  return (
    <div className="template-editor">
      <div className="template-editor-header">
        <h3>{template ? 'Редактирование шаблона' : 'Новый шаблон'}</h3>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="template-form">
        {/* ШАГ 1: Выбор файла для анализа (только для типа file) */}
        {formData.connection_type === 'file' && (
          <div className="form-section file-upload-section">
          <h4 className="section-title">
            <span className="step-number">1</span>
            Выбор файла для анализа
          </h4>
          <p className="section-description">
            Загрузите пример файла Excel для автоматического определения структуры и сопоставления полей.
            Система автоматически проанализирует файл и предложит сопоставление полей.
          </p>
          <div className="form-group file-upload-group">
            <label className="file-upload-label">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={analyzing}
                className="file-input-hidden"
                id="template-file-input"
              />
              <span className="file-upload-button">
                {analyzing ? (
                  <>
                    <span className="spinner-small"></span>
                    Анализ файла...
                  </>
                ) : selectedFileName ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    {selectedFileName}
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Выберите файл Excel
                  </>
                )}
              </span>
            </label>
            {fileColumns.length > 0 && (
              <div className="analysis-result">
                <div className="success-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Файл проанализирован: найдено {fileColumns.length} колонок
                </div>
                {Object.keys(autoMappedFields).length > 0 && (
                  <div className="auto-mapping-info">
                    Автоматически сопоставлено полей: {Object.keys(autoMappedFields).length} из {systemFields.length}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ШАГ 1: Тип подключения */}
        <div className="form-section">
          <h4 className="section-title">
            <span className="step-number">2</span>
            Тип подключения
          </h4>
          <p className="section-description">
            Выберите источник данных для шаблона: загрузка из файла Excel, подключение к базе данных Firebird, загрузка через API провайдера или подключение к веб-сервису с авторизацией.
          </p>
          <div className="form-group">
            <label>
              Тип подключения: <span className="required-mark">*</span>
              <select
                value={formData.connection_type}
                onChange={(e) => {
                  const newConnectionType = e.target.value
                  setFormData({ ...formData, connection_type: newConnectionType })
                  setConnectionTestResult(null)
                  // Обновляем настройки подключения в зависимости от типа
                  if (newConnectionType === 'api') {
                    setConnectionSettings({ provider_type: 'petrolplus', base_url: 'https://online.petrolplus.ru/api', api_token: '', currency: 'RUB' })
                  } else if (newConnectionType === 'firebird') {
                    setConnectionSettings({ host: 'localhost', database: '', user: 'SYSDBA', password: '', port: 3050, charset: 'UTF8' })
                  } else if (newConnectionType === 'web') {
                    setConnectionSettings({ 
                      base_url: '', 
                      username: '', 
                      password: '', 
                      currency: 'RUB',
                      certificate: '',
                      pos_code: '',
                      key: '',
                      signature: '',
                      salt: '',
                      cod_azs: 1000001
                    })
                  }
                }}
                className="input-full-width"
              >
                <option value="file">Загрузка из файла Excel</option>
                <option value="firebird">Firebird Database (FDB)</option>
                <option value="api">Загрузка API</option>
                <option value="web">Веб-сервис (Web Service)</option>
              </select>
            </label>
          </div>
        </div>

        {/* ШАГ 2: Настройки подключения к API */}
        {formData.connection_type === 'api' && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">2</span>
              Настройки подключения к API
            </h4>
            <p className="section-description">
              Укажите параметры подключения к API провайдера (например, PetrolPlus, РН-Карт или Газпром-нефть).
            </p>
            
            <div className="form-group">
              <label>
                Тип провайдера API: <span className="required-mark">*</span>
                <select
                  value={connectionSettings.provider_type || 'petrolplus'}
                  onChange={(e) => {
                    const newProviderType = e.target.value
                    // Обновляем настройки в зависимости от типа провайдера
                    if (newProviderType === 'petrolplus') {
                      setConnectionSettings({ 
                        provider_type: 'petrolplus', 
                        base_url: 'https://online.petrolplus.ru/api', 
                        api_token: connectionSettings.api_token || '', 
                        currency: connectionSettings.currency || 'RUB' 
                      })
                    } else if (newProviderType === 'rncard') {
                      setConnectionSettings({ 
                        provider_type: 'rncard', 
                        base_url: 'https://lkapi.rn-card.ru', 
                        login: connectionSettings.login || connectionSettings.username || '', 
                        password: connectionSettings.password || '', 
                        contract: connectionSettings.contract || connectionSettings.contract_code || '', 
                        currency: connectionSettings.currency || 'RUB',
                        use_md5_hash: connectionSettings.use_md5_hash !== false
                      })
                    } else if (newProviderType === 'gpn') {
                      setConnectionSettings({ 
                        provider_type: 'gpn', 
                        base_url: 'https://api-demo.opti-24.ru', 
                        api_key: connectionSettings.api_key || connectionSettings.apiKey || '', 
                        login: connectionSettings.login || connectionSettings.username || '', 
                        password: connectionSettings.password || '', 
                        currency: connectionSettings.currency || 'RUB'
                      })
                    }
                  }}
                  className="input-full-width"
                >
                  <option value="petrolplus">PetrolPlus</option>
                  <option value="rncard">РН-Карт</option>
                  <option value="gpn">Газпром-нефть</option>
                </select>
                <span className="field-help">Тип API провайдера</span>
              </label>
            </div>
            
            <div className="form-group">
              <label>
                Базовый URL API провайдера: <span className="required-mark">*</span>
                <input
                  type="text"
                  value={connectionSettings.base_url || (
                    connectionSettings.provider_type === 'rncard' ? 'https://lkapi.rn-card.ru' : 
                    connectionSettings.provider_type === 'gpn' ? 'https://api-demo.opti-24.ru' : 
                    'https://online.petrolplus.ru/api'
                  )}
                  onChange={(e) => setConnectionSettings({ ...connectionSettings, base_url: e.target.value })}
                  placeholder={
                    connectionSettings.provider_type === 'rncard' ? 'https://lkapi.rn-card.ru' : 
                    connectionSettings.provider_type === 'gpn' ? 'https://api-demo.opti-24.ru' : 
                    'https://online.petrolplus.ru/api'
                  }
                  className="input-full-width"
                />
                <span className="field-help">Базовый URL API провайдера</span>
              </label>
            </div>
            
            {/* Поля для PetrolPlus */}
            {connectionSettings.provider_type === 'petrolplus' && (
              <div className="form-group">
                <label>
                  Токен авторизации: <span className="required-mark">*</span>
                  <input
                    type="password"
                    value={connectionSettings.api_token || ''}
                    onChange={(e) => setConnectionSettings({ ...connectionSettings, api_token: e.target.value })}
                    placeholder="Ваш API токен"
                    className="input-full-width"
                    autoComplete="off"
                  />
                  <span className="field-help">Токен для авторизации в API</span>
                </label>
              </div>
            )}
            
            {/* Поля для РН-Карт */}
            {connectionSettings.provider_type === 'rncard' && (
              <>
                <div className="form-group">
                  <label>
                    Логин: <span className="required-mark">*</span>
                    <input
                      type="text"
                      value={connectionSettings.login || ''}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, login: e.target.value })}
                      placeholder="Логин из Личного кабинета РН-Карт"
                      className="input-full-width"
                      autoComplete="off"
                    />
                    <span className="field-help">Логин из Личного кабинета РН-Карт</span>
                  </label>
                </div>
                
                <div className="form-group">
                  <label>
                    Пароль: <span className="required-mark">*</span>
                    <input
                      type="password"
                      value={connectionSettings.password || ''}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, password: e.target.value })}
                      placeholder="Пароль из Личного кабинета РН-Карт"
                      className="input-full-width"
                      autoComplete="off"
                    />
                    <span className="field-help">Пароль из Личного кабинета РН-Карт</span>
                  </label>
                </div>
                
                <div className="form-group">
                  <label>
                    Код договора: <span className="required-mark">*</span>
                    <input
                      type="text"
                      value={connectionSettings.contract || ''}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, contract: e.target.value })}
                      placeholder="ISS123456"
                      className="input-full-width"
                      autoComplete="off"
                    />
                    <span className="field-help">Код договора (например, ISS123456)</span>
                  </label>
                </div>
                
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={connectionSettings.use_md5_hash !== false}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, use_md5_hash: e.target.checked })}
                    />
                    <span style={{ marginLeft: '8px' }}>Использовать MD5-хеш пароля (рекомендуется)</span>
                  </label>
                  <span className="field-help">Рекомендуется использовать MD5-хеш для безопасности</span>
                </div>
              </>
            )}
            
            {/* Поля для Газпром-нефть */}
            {connectionSettings.provider_type === 'gpn' && (
              <>
                <div className="form-group">
                  <label>
                    API ключ: <span className="required-mark">*</span>
                    <input
                      type="password"
                      value={connectionSettings.api_key || connectionSettings.apiKey || ''}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, api_key: e.target.value })}
                      placeholder="GPN.3ce7b860ece5758d1d27c7f8b4796ea79b33927e..."
                      className="input-full-width"
                      autoComplete="off"
                    />
                    <span className="field-help">API ключ для авторизации в API Газпром-нефть</span>
                  </label>
                </div>
                
                <div className="form-group">
                  <label>
                    Логин: <span className="required-mark">*</span>
                    <input
                      type="text"
                      value={connectionSettings.login || connectionSettings.username || ''}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, login: e.target.value })}
                      placeholder="Логин из Личного кабинета Газпром-нефть"
                      className="input-full-width"
                      autoComplete="off"
                    />
                    <span className="field-help">Логин из Личного кабинета Газпром-нефть</span>
                  </label>
                </div>
                
                <div className="form-group">
                  <label>
                    Пароль: <span className="required-mark">*</span>
                    <input
                      type="password"
                      value={connectionSettings.password || ''}
                      onChange={(e) => setConnectionSettings({ ...connectionSettings, password: e.target.value })}
                      placeholder="Пароль из Личного кабинета Газпром-нефть (исходный, не хеш!)"
                      className="input-full-width"
                      autoComplete="off"
                    />
                    <span className="field-help">Пароль из Личного кабинета Газпром-нефть (исходный пароль, не хеш!)</span>
                  </label>
                </div>
              </>
            )}
            
            <div className="form-group">
              <label>
                Валюта:
                <input
                  type="text"
                  value={connectionSettings.currency || 'RUB'}
                  onChange={(e) => setConnectionSettings({ ...connectionSettings, currency: e.target.value })}
                  placeholder="RUB"
                  className="input-full-width"
                />
                <span className="field-help">Валюта по умолчанию (например, RUB)</span>
              </label>
            </div>
            
            <div className="form-group form-group-test-connection">
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-test-connection"
                  onClick={async () => {
                    if (!connectionSettings.base_url) {
                      setError('Укажите базовый URL API')
                      return
                    }
                    if (connectionSettings.provider_type === 'petrolplus' && !connectionSettings.api_token) {
                      setError('Укажите токен авторизации')
                      return
                    }
                    if (connectionSettings.provider_type === 'rncard' && (!connectionSettings.login || !connectionSettings.password || !connectionSettings.contract)) {
                      setError('Укажите логин, пароль и код договора')
                      return
                    }
                    
                    setTestingConnection(true)
                    setConnectionTestResult(null)
                    
                    try {
                      let response
                      if (template?.id) {
                        response = await authFetch(`${API_URL}/api/v1/templates/${template.id}/test-api-connection`, {
                          method: 'POST'
                        })
                      } else {
                        response = await authFetch(`${API_URL}/api/v1/templates/test-api-connection`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify(connectionSettings)
                        })
                      }
                      
                      const result = await response.json()
                      setConnectionTestResult(result)
                    } catch (err) {
                      // Не показываем ошибку при 401 - это обрабатывается централизованно
                      if (err.isUnauthorized) {
                        return
                      }
                      setConnectionTestResult({ success: false, message: 'Ошибка тестирования: ' + err.message })
                    } finally {
                      setTestingConnection(false)
                    }
                  }}
                  disabled={testingConnection || !connectionSettings.base_url || 
                    (connectionSettings.provider_type === 'petrolplus' && !connectionSettings.api_token) ||
                    (connectionSettings.provider_type === 'rncard' && (!connectionSettings.login || !connectionSettings.password || !connectionSettings.contract))}
                >
                  {testingConnection ? 'Тестирование...' : 'Тестировать подключение'}
                </button>
                <button
                  type="button"
                  className="btn-load-columns"
                  onClick={async () => {
                    if (!connectionSettings.base_url) {
                      setError('Укажите базовый URL API')
                      return
                    }
                    if (connectionSettings.provider_type === 'petrolplus' && !connectionSettings.api_token) {
                      setError('Укажите токен авторизации')
                      return
                    }
                    if (connectionSettings.provider_type === 'rncard' && (!connectionSettings.login || !connectionSettings.password || !connectionSettings.contract)) {
                      setError('Укажите логин, пароль и код договора')
                      return
                    }
                    
                    setLoadingApiFields(true)
                    setError('')
                    
                    try {
                      let response
                      if (template?.id) {
                        response = await fetch(`${API_URL}/api/v1/templates/${template.id}/api-fields`, {
                          method: 'POST'
                        })
                      } else {
                        response = await authFetch(`${API_URL}/api/v1/templates/api-fields`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify(connectionSettings)
                        })
                      }
                      
                      if (!response.ok) {
                        const errorData = await response.json()
                        throw new Error(errorData.detail || errorData.error || 'Ошибка загрузки полей из API')
                      }
                      
                      const result = await response.json()
                      setApiFields(result.fields || [])
                      
                      if (result.fields && result.fields.length > 0) {
                        setError('')
                        // Показываем сообщение об успехе
                        if (result.count > 0) {
                          console.log(`Загружено полей из API: ${result.count}`)
                        }
                      } else {
                        const errorMsg = result.error || 'Не удалось получить поля из API. Убедитесь, что подключение работает и есть данные. Возможные причины: нет доступных карт, нет транзакций за последние 90 дней, или API возвращает пустые данные.'
                        setError(errorMsg)
                      }
                    } catch (err) {
                      // Не показываем ошибку при 401 - это обрабатывается централизованно
                      if (err.isUnauthorized) {
                        return
                      }
                      setError('Ошибка загрузки полей из API: ' + err.message)
                      setApiFields([])
                    } finally {
                      setLoadingApiFields(false)
                    }
                  }}
                  disabled={loadingApiFields || !connectionSettings.base_url || 
                    (connectionSettings.provider_type === 'petrolplus' && !connectionSettings.api_token) ||
                    (connectionSettings.provider_type === 'rncard' && (!connectionSettings.login || !connectionSettings.password || !connectionSettings.contract))}
                  title="Загрузить список полей из API ответа"
                >
                  {loadingApiFields ? '⏳ Загрузка...' : '🔍 Загрузить поля из API'}
                </button>
              </div>
              {connectionTestResult && (
                <div className={`connection-test-result ${connectionTestResult.success ? 'success' : 'error'}`}>
                  {connectionTestResult.success ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {connectionTestResult.message}
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {connectionTestResult.message}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ШАГ 2: Настройки подключения к веб-сервису */}
        {formData.connection_type === 'web' && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">2</span>
              Настройки подключения к веб-сервису
            </h4>
            <p className="section-description">
              Укажите параметры подключения к веб-сервису. 
              Для XML API используется только сертификат, авторизация не требуется.
            </p>
            
            <form onSubmit={(e) => e.preventDefault()} noValidate>
            <div className="form-group">
              <label>
                Базовый URL: <span className="required-mark">*</span>
                <input
                  type="text"
                  value={connectionSettings.base_url || ''}
                  onChange={(e) => setConnectionSettings({ ...connectionSettings, base_url: e.target.value })}
                  placeholder="http://example.com:8080"
                  className="input-full-width"
                />
                <span className="field-help">Базовый URL веб-сервиса (например: http://176.222.217.51:8080)</span>
              </label>
            </div>
            
            {/* Поля логин/пароль скрыты, так как для XML API они не используются */}
            
            <div className="form-group">
              <label>
                Валюта:
                <input
                  type="text"
                  value={connectionSettings.currency || 'RUB'}
                  onChange={(e) => setConnectionSettings({ ...connectionSettings, currency: e.target.value })}
                  placeholder="RUB"
                  className="input-full-width"
                />
                <span className="field-help">Валюта по умолчанию (например: RUB, USD, EUR)</span>
              </label>
            </div>
            
            {/* Параметры XML API (опционально) */}
            <div className="form-section" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
              <h5 style={{ marginTop: '0', marginBottom: '15px', fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                Параметры XML API
              </h5>
              <p style={{ marginBottom: '15px', fontSize: '12px', color: '#6c757d' }}>
                <strong>Важно:</strong> Для работы с XML API используется только сертификат. 
                Логин, пароль, ключ, подпись и salt не используются.
              </p>
              
              <div className="form-group">
                <label>
                  Сертификат (Certificate): <span className="required-mark">*</span>
                  <input
                    type="text"
                    value={connectionSettings.certificate || connectionSettings.xml_api_certificate || ''}
                    onChange={(e) => setConnectionSettings({ 
                      ...connectionSettings, 
                      certificate: e.target.value,
                      xml_api_certificate: e.target.value 
                    })}
                    placeholder="1.4703FECF75257F2E915"
                    className="input-full-width"
                  />
                  <span className="field-help">Сертификат для доступа к XML API (например: 1.4703FECF75257F2E915). При наличии сертификата авторизация не требуется.</span>
                </label>
              </div>
              
              <div className="form-group">
                <label>
                  Код POS (POS Code) (опционально):
                  <input
                    type="number"
                    value={connectionSettings.pos_code || connectionSettings.xml_api_pos_code || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim()
                      setConnectionSettings({ 
                        ...connectionSettings, 
                        pos_code: value ? parseInt(value) || null : null,
                        xml_api_pos_code: value ? parseInt(value) || null : null
                      })
                    }}
                    placeholder="Оставьте пустым для запроса по всем POS"
                    className="input-full-width"
                  />
                  <span className="field-help">
                    Код POS для XML API. Если не указан, запрос будет отправлен по всем POS.
                  </span>
                </label>
              </div>
              
              <div className="form-group">
                <label>
                  Endpoint для получения транзакций (опционально):
                  <input
                    type="text"
                    value={connectionSettings.endpoint || connectionSettings.xml_api_endpoint || ''}
                    onChange={(e) => setConnectionSettings({ 
                      ...connectionSettings, 
                      endpoint: e.target.value,
                      xml_api_endpoint: e.target.value 
                    })}
                    placeholder="http://176.222.217.51:1342/sncapi/sale"
                    className="input-full-width"
                  />
                  <span className="field-help">
                    Полный URL endpoint для получения транзакций (например: http://176.222.217.51:1342/sncapi/sale). 
                    Если не указан, используется BASE_URL/sncapi/sale
                  </span>
                </label>
              </div>
            </div>
            
            <div className="form-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const hasCertificate = connectionSettings.certificate || connectionSettings.xml_api_certificate
                  if (!connectionSettings.base_url) {
                    setError('Укажите базовый URL')
                    return
                  }
                  if (!hasCertificate) {
                    setError('Для XML API требуется указать сертификат (Certificate)')
                    return
                  }
                  
                  // Нормализуем базовый URL (убираем лишние слэши и пробелы)
                  const normalizedSettings = {
                    ...connectionSettings,
                    base_url: connectionSettings.base_url.trim().replace(/\/+$/, '')
                  }
                  
                  setLoadingApiFields(true)
                  setError('')
                  
                  try {
                    let response
                    if (template?.id) {
                      response = await fetch(`${API_URL}/api/v1/templates/${template.id}/test-api-connection`, {
                        method: 'POST'
                      })
                    } else {
                      response = await authFetch(`${API_URL}/api/v1/templates/test-api-connection?connection_type=web`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(normalizedSettings)
                      })
                    }
                    
                    if (!response.ok) {
                      const errorData = await response.json()
                      throw new Error(errorData.detail || errorData.message || 'Ошибка тестирования подключения')
                    }
                    
                    const result = await response.json()
                    setConnectionTestResult(result)
                    
                    if (result.success) {
                      setError('')
                    } else {
                      setError(result.message || 'Ошибка подключения')
                    }
                  } catch (err) {
                    if (err.isUnauthorized) {
                      return
                    }
                    setError('Ошибка тестирования подключения: ' + err.message)
                    setConnectionTestResult({ success: false, message: err.message })
                  } finally {
                    setLoadingApiFields(false)
                  }
                }}
                disabled={loadingApiFields || !connectionSettings.base_url || !(connectionSettings.certificate || connectionSettings.xml_api_certificate)}
                title="Проверить подключение к веб-сервису"
              >
                {loadingApiFields ? '⏳ Проверка...' : '🔍 Проверить подключение'}
              </button>
            </div>
            {connectionTestResult && (
              <div className={`connection-test-result ${connectionTestResult.success ? 'success' : 'error'}`}>
                {connectionTestResult.success ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {connectionTestResult.message}
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    {connectionTestResult.message}
                  </>
                )}
              </div>
            )}
            <div className="form-group" style={{ marginTop: '15px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const hasCertificate = connectionSettings.certificate || connectionSettings.xml_api_certificate
                  if (!connectionSettings.base_url) {
                    setError('Укажите базовый URL')
                    return
                  }
                  if (!hasCertificate) {
                    setError('Для XML API требуется указать сертификат (Certificate)')
                    return
                  }
                  
                  // Нормализуем базовый URL (убираем лишние слэши и пробелы)
                  const normalizedSettings = {
                    ...connectionSettings,
                    base_url: connectionSettings.base_url.trim().replace(/\/+$/, '')
                  }
                  
                  setLoadingApiFields(true)
                  setError('')
                  
                  try {
                    let response
                    if (template?.id) {
                      response = await fetch(`${API_URL}/api/v1/templates/${template.id}/api-fields`, {
                        method: 'POST'
                      })
                    } else {
                      response = await authFetch(`${API_URL}/api/v1/templates/api-fields?connection_type=web`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(normalizedSettings)
                      })
                    }
                    
                    if (!response.ok) {
                      const errorData = await response.json()
                      throw new Error(errorData.detail || errorData.error || 'Ошибка загрузки полей из веб-сервиса')
                    }
                    
                    const result = await response.json()
                    setApiFields(result.fields || [])
                    
                    if (result.fields && result.fields.length > 0) {
                      setError('')
                      console.log(`Загружено полей из веб-сервиса: ${result.count || result.fields.length}`)
                    } else {
                      const errorMsg = result.error || 'Не удалось получить поля из веб-сервиса. Используйте стандартные названия полей.'
                      setError(errorMsg)
                    }
                  } catch (err) {
                    if (err.isUnauthorized) {
                      return
                    }
                    setError('Ошибка загрузки полей из веб-сервиса: ' + err.message)
                    setApiFields([])
                  } finally {
                    setLoadingApiFields(false)
                  }
                }}
                disabled={loadingApiFields || !connectionSettings.base_url || !(connectionSettings.certificate || connectionSettings.xml_api_certificate)}
                title="Загрузить список полей из веб-сервиса"
              >
                {loadingApiFields ? '⏳ Загрузка...' : '🔍 Загрузить поля из веб-сервиса'}
              </button>
            </div>
            </form>
          </div>
        )}

        {/* ШАГ 2: Настройки подключения к Firebird */}
        {formData.connection_type === 'firebird' && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">2</span>
              Настройки подключения к Firebird
            </h4>
            <p className="section-description">
              Укажите параметры подключения к базе данных Firebird.
            </p>
            
            <div className="form-row">
              <div className="form-group">
                <label>
                  Хост сервера:
                  <input
                    type="text"
                    value={connectionSettings.host || 'localhost'}
                    onChange={(e) => setConnectionSettings({ ...connectionSettings, host: e.target.value })}
                    placeholder="localhost"
                    className="input-full-width"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Порт:
                  <input
                    type="number"
                    value={connectionSettings.port || 3050}
                    onChange={(e) => setConnectionSettings({ ...connectionSettings, port: parseInt(e.target.value) || 3050 })}
                    placeholder="3050"
                    className="input-full-width"
                  />
                </label>
              </div>
            </div>
            
            <div className="form-group">
              <label>
                Путь к базе данных: <span className="required-mark">*</span>
                <input
                  type="text"
                  value={connectionSettings.database || ''}
                  onChange={(e) => setConnectionSettings({ ...connectionSettings, database: e.target.value })}
                  placeholder="/path/to/database.fdb или имя базы"
                  className="input-full-width"
                />
                <span className="field-help">Полный путь к файлу базы данных или имя базы на сервере</span>
              </label>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>
                  Пользователь:
                  <input
                    type="text"
                    value={connectionSettings.user || 'SYSDBA'}
                    onChange={(e) => setConnectionSettings({ ...connectionSettings, user: e.target.value })}
                    placeholder="SYSDBA"
                    className="input-full-width"
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Пароль:
                  <input
                    type="password"
                    value={connectionSettings.password || ''}
                    onChange={(e) => setConnectionSettings({ ...connectionSettings, password: e.target.value })}
                    placeholder="masterkey"
                    className="input-full-width"
                    autoComplete="current-password"
                  />
                </label>
              </div>
            </div>
            
            <div className="form-group">
              <label>
                Кодировка:
                <select
                  value={connectionSettings.charset || 'UTF8'}
                  onChange={(e) => setConnectionSettings({ ...connectionSettings, charset: e.target.value })}
                  className="input-full-width"
                >
                  <option value="UTF8">UTF8</option>
                  <option value="WIN1251">WIN1251</option>
                  <option value="WIN1252">WIN1252</option>
                </select>
              </label>
            </div>
            
            <div className="form-group form-group-test-connection">
              <button
                type="button"
                className="btn-test-connection"
                onClick={handleTestConnection}
                disabled={testingConnection || !connectionSettings.database}
              >
                {testingConnection ? 'Тестирование...' : 'Тестировать подключение'}
              </button>
              {connectionTestResult && (
                <div className={`connection-test-result ${connectionTestResult.success ? 'success' : 'error'}`}>
                  {connectionTestResult.success ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {connectionTestResult.message}
                      {connectionTestResult.tables && connectionTestResult.tables.length > 0 && (
                        <div className="tables-list">
                          Найдено таблиц: {connectionTestResult.tables.length}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {connectionTestResult.message}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ШАГ 3: Источник данных для Firebird */}
        {formData.connection_type === 'firebird' && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">3</span>
              Источник данных в Firebird
            </h4>
            <p className="section-description">
              Укажите таблицу или SQL запрос для получения данных из базы Firebird.
              Если данные находятся в нескольких связанных таблицах, используйте SQL запрос с JOIN.
              Вы можете получить список таблиц, подключившись к базе данных.
              <br/><strong>Важно:</strong> В Firebird используйте кавычки для имен таблиц и колонок с учетом регистра.
              Например: <code>"dcCards"."CardID"</code> или <code>"rgAmountRests"."Date"</code>
            </p>
            
            <div className="form-group">
              <label>
                Имя таблицы:
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '10px', width: '100%', flex: '1 1 auto' }}>
                    <select
                      value={selectedTable}
                      onChange={(e) => {
                        const tableName = e.target.value
                        setSelectedTable(tableName)
                        setFormData({ ...formData, source_table: tableName, source_query: '' })
                        // Очищаем колонки при смене таблицы
                        setSelectedTableColumns([])
                      }}
                      className="input-full-width"
                      style={{ flex: 1 }}
                    >
                      <option value="">-- Выберите таблицу --</option>
                      {availableTables.map(table => (
                        <option key={table} value={table}>{table}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={formData.source_table || ''}
                      onChange={(e) => {
                        const tableName = e.target.value
                        setSelectedTable(tableName)
                        setFormData({ ...formData, source_table: tableName, source_query: '' })
                        // Очищаем колонки при изменении имени таблицы
                        setSelectedTableColumns([])
                      }}
                      placeholder="Или введите имя таблицы вручную (например, rgAmountRests)"
                      className="input-full-width"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn-load-tables"
                      onClick={loadTablesFromFirebird}
                      disabled={loadingTables || !connectionSettings.database}
                      title={!connectionSettings.database ? 'Сначала укажите путь к базе данных' : 'Загрузить список таблиц из базы данных'}
                    >
                      {loadingTables ? '⏳' : '📋'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-load-columns"
                    onClick={async () => {
                      const tableName = formData.source_table || selectedTable
                      if (!tableName) {
                        setError('Сначала выберите или введите имя таблицы')
                        return
                      }
                      await loadTableColumns(tableName)
                    }}
                    disabled={(!formData.source_table && !selectedTable) || loadingColumns}
                    title="Загрузить колонки выбранной таблицы"
                  >
                    {loadingColumns ? '⏳ Загрузка...' : '🔍 Загрузить колонки'}
                  </button>
                </div>
                <span className="field-help">
                  Выберите таблицу из списка (после загрузки) или введите имя вручную (например, rgAmountRests). 
                  Нажмите на иконку 📋 для загрузки списка таблиц из базы данных.
                  После выбора таблицы нажмите "Загрузить колонки" для получения списка полей.
                </span>
              </label>
            </div>
            
            {selectedTableColumns.length > 0 && (
              <div className="table-columns-info">
                <div className="success-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Найдено колонок в таблице "{selectedTable}": {selectedTableColumns.length}
                </div>
                <div className="columns-list">
                  {selectedTableColumns.map((col, idx) => (
                    <span key={idx} className="column-badge">{col}</span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label>
                SQL запрос: <span className="required-mark">*</span>
                <textarea
                  value={formData.source_query || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, source_query: e.target.value, source_table: '' })
                    // Очищаем колонки при изменении SQL запроса
                    setSelectedTableColumns([])
                  }}
                  placeholder={`SELECT
    "dcCards"."Name" AS "Наименование карты",
    rg."AZSCode" AS "АЗС",
    rg."Date" AS "Дата и время",
    rg."Quantity" AS "Количество",
    "dcAmounts"."Name" AS "Вид топлива",
    rg."PartnerID" AS "Организация"
FROM "rgAmountRests" rg
LEFT JOIN "dcCards" ON rg."CardID" = "dcCards"."CardID"
LEFT JOIN "dcAmounts" ON rg."AmountID" = "dcAmounts"."AmountID"
WHERE rg."DocTypeID" = 3
ORDER BY rg."Date" DESC`}
                  rows="12"
                  className="textarea-full-width"
                  style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                />
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-load-columns"
                    onClick={async () => {
                      if (!formData.source_query || !formData.source_query.trim()) {
                        setError('Сначала введите SQL запрос')
                        return
                      }
                      await loadQueryColumns(formData.source_query)
                    }}
                    disabled={!formData.source_query || loadingColumns}
                    title="Получить список колонок из SQL запроса"
                  >
                    {loadingColumns ? '⏳ Загрузка...' : '🔍 Получить колонки из SQL запроса'}
                  </button>
                </div>
                <span className="field-help">
                  <strong>SQL запрос для получения данных (имеет приоритет над именем таблицы).</strong><br/>
                  Используйте SQL запрос с JOIN, если данные находятся в нескольких связанных таблицах.
                  В запросе используйте AS для переименования колонок в понятные названия (например, "Дата и время", "Количество").
                  После ввода запроса нажмите "Получить колонки" для получения списка полей из результата запроса.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* ШАГ 4: Основная информация о шаблоне */}
        <div className="form-section">
          <h4 className="section-title">
            <span className="step-number">4</span>
            Основная информация
          </h4>
          <div className="form-row form-row-basic-info">
            <div className="form-group form-group-name">
              <label>
                Название шаблона: <span className="required-mark">*</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Например: Стандартный шаблон РП-газпром"
                  className="input-full-width"
                />
              </label>
            </div>
            <div className="form-group form-group-description">
              <label>
                Описание:
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Описание шаблона..."
                  rows="3"
                  className="textarea-full-width"
                />
              </label>
            </div>
          </div>
        </div>

        {/* ШАГ 5: Параметры парсинга файла (только для типа file) */}
        {formData.connection_type === 'file' && fileColumns.length > 0 && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">5</span>
              Параметры парсинга файла
            </h4>
            <p className="section-description">
              Укажите, в каких строках находятся заголовки и данные в исходном файле Excel.
            </p>
            <div className="form-row form-row-numbers">
              <div className="form-group form-group-number">
                <label>
                  Строка заголовков (начиная с 0):
                  <input
                    type="number"
                    value={formData.header_row}
                    onChange={(e) => setFormData({ ...formData, header_row: parseInt(e.target.value) || 0 })}
                    min="0"
                    className="input-number"
                  />
                  <span className="field-help">Номер строки, где находятся названия колонок</span>
                </label>
              </div>
              <div className="form-group form-group-number">
                <label>
                  Строка начала данных (начиная с 0):
                  <input
                    type="number"
                    value={formData.data_start_row}
                    onChange={(e) => setFormData({ ...formData, data_start_row: parseInt(e.target.value) || 1 })}
                    min="0"
                    className="input-number"
                  />
                  <span className="field-help">Номер строки, с которой начинаются данные</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ШАГ 6: Параметры экспорта (только для типа file) */}
        {formData.connection_type === 'file' && (
          <div className="form-section export-settings-section">
            <h4 className="section-title">
              <span className="step-number">6</span>
              Параметры экспорта в Excel
            </h4>
            <p className="section-description">
              Настройте параметры для экспорта данных в формат ЮПМ Газпром.
              Эти параметры определяют, как будут форматироваться выходные файлы.
            </p>

          <div className="form-row form-row-numbers">
            <div className="form-group form-group-number">
              <label>
                Строка начала экспорта (отступ сверху):
                <input
                  type="number"
                  value={formData.export_start_row}
                  onChange={(e) => setFormData({ ...formData, export_start_row: parseInt(e.target.value) || 0 })}
                  min="0"
                  placeholder="0"
                  className="input-number"
                />
                <span className="field-help">Количество пустых строк перед началом данных в экспортируемом файле</span>
              </label>
            </div>

            <div className="form-group form-group-number">
              <label>
                Строка заголовков в экспорте:
                <input
                  type="number"
                  value={formData.export_header_row}
                  onChange={(e) => setFormData({ ...formData, export_header_row: parseInt(e.target.value) || 0 })}
                  min="0"
                  placeholder="0"
                  className="input-number"
                />
                <span className="field-help">Номер строки, где будут размещены заголовки колонок</span>
              </label>
            </div>
          </div>
        </div>
        )}

        {/* ШАГ 7: Сопоставление полей */}
        {((formData.connection_type === 'file' && fileColumns.length > 0) || formData.connection_type === 'firebird' || formData.connection_type === 'api' || formData.connection_type === 'web') && (
          <div className="form-section mapping-section">
            <h4 className="section-title">
              <span className="step-number">7</span>
              Сопоставление полей
            </h4>
            <p className="section-description">
              {formData.connection_type === 'file' 
                ? 'Система автоматически сопоставила поля, где это было возможно. Проверьте и при необходимости исправьте сопоставление вручную.'
                : formData.connection_type === 'firebird'
                ? 'Укажите соответствие полей из базы данных Firebird полям системы.'
                : formData.connection_type === 'web'
                ? 'Для веб-сервиса укажите соответствие полей из API ответа полям системы. Используйте стандартные названия полей или введите вручную.'
                : 'Для API подключения используйте кнопку "Загрузить поля из API" для получения списка доступных полей из API ответа. Затем выберите соответствующие поля из выпадающего списка или введите вручную.'}
              Поля, отмеченные <span className="required-mark">*</span>, обязательны для заполнения.
            </p>
            {(formData.connection_type === 'api' || formData.connection_type === 'web') && apiFields.length > 0 && (
              <div className="success-badge" style={{ marginBottom: '15px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Загружено полей из API: {apiFields.length}
              </div>
            )}

            <div className="mapping-table">
              <table>
                <thead>
                  <tr>
                    <th>Поле системы</th>
                    <th>{formData.connection_type === 'file' ? 'Колонка из файла' : formData.connection_type === 'api' || formData.connection_type === 'web' ? 'Поле из API ответа' : 'Поле из БД Firebird'}</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {systemFields.map(field => {
                    const isMapped = !!formData.field_mapping[field.key]
                    const isAutoMapped = !!autoMappedFields[field.key]
                    const isRequired = field.required
                    
                    return (
                      <tr 
                        key={field.key} 
                        className={`${isRequired ? 'required' : ''} ${isAutoMapped ? 'auto-mapped' : ''} ${isRequired && !isMapped ? 'missing-required' : ''}`}
                      >
                        <td data-label="Поле системы">
                          <span className="field-label">
                            {field.label}
                            {isRequired && <span className="required-mark"> *</span>}
                          </span>
                        </td>
                        <td data-label={formData.connection_type === 'file' ? 'Колонка из файла' : formData.connection_type === 'api' || formData.connection_type === 'web' ? 'Поле из API ответа' : 'Поле из БД Firebird'}>
                          {formData.connection_type === 'file' ? (
                            <select
                              value={formData.field_mapping[field.key] || ''}
                              onChange={(e) => {
                                handleFieldMapping(field.key, e.target.value)
                                // Убираем из автоматически сопоставленных, если пользователь изменил вручную
                                if (e.target.value && autoMappedFields[field.key]) {
                                  setAutoMappedFields(prev => {
                                    const newAuto = { ...prev }
                                    delete newAuto[field.key]
                                    return newAuto
                                  })
                                }
                              }}
                              className={`mapping-select ${isAutoMapped ? 'auto-mapped-select' : ''} ${isRequired && !isMapped ? 'missing-required-select' : ''}`}
                            >
                              <option value="">-- Не выбрано --</option>
                              {fileColumns.map((col, idx) => (
                                <option key={idx} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          ) : (formData.connection_type === 'api' || formData.connection_type === 'web') ? (
                            // Для API показываем выпадающий список с полями из API или поле ввода
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <select
                                value={formData.field_mapping[field.key] || ''}
                                onChange={(e) => handleFieldMapping(field.key, e.target.value)}
                                className={`mapping-select ${isRequired && !isMapped ? 'missing-required-select' : ''}`}
                                style={{ flex: 1 }}
                              >
                                <option value="">-- Не выбрано --</option>
                                {apiFields.map((fieldName, idx) => (
                                  <option key={idx} value={fieldName}>
                                    {fieldName}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={formData.field_mapping[field.key] || ''}
                                onChange={(e) => handleFieldMapping(field.key, e.target.value)}
                                placeholder="Или введите имя поля"
                                className={`mapping-input ${isRequired && !isMapped ? 'missing-required-select' : ''}`}
                                style={{ flex: 1 }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <select
                                value={formData.field_mapping[field.key] || ''}
                                onChange={(e) => handleFieldMapping(field.key, e.target.value)}
                                className={`mapping-select ${isRequired && !isMapped ? 'missing-required-select' : ''}`}
                                style={{ flex: 1 }}
                              >
                                <option value="">-- Не выбрано --</option>
                                {selectedTableColumns.map((col, idx) => (
                                  <option key={idx} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={formData.field_mapping[field.key] || ''}
                                onChange={(e) => handleFieldMapping(field.key, e.target.value)}
                                placeholder="Или введите имя поля"
                                className={`mapping-input ${isRequired && !isMapped ? 'missing-required-select' : ''}`}
                                style={{ flex: 1 }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="mapping-status-cell" data-label="Статус">
                          {isMapped ? (
                            <span className={`status-badge ${isAutoMapped ? 'status-auto' : 'status-manual'}`}>
                              {isAutoMapped ? (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="icon-tiny" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Авто
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="icon-tiny" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                  </svg>
                                  Вручную
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="status-badge status-empty">
                              Не выбрано
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="form-group fuel-mapping-group">
              <label>
                Маппинг видов топлива (опционально)
                <textarea
                  value={fuelMappingText}
                  onChange={(e) => {
                    setFuelMappingText(e.target.value)
                    setError('')
                  }}
                  placeholder={`{\n  "Дизельное топливо": "ДТ",\n  "Бензин": "АИ-92",\n  "Бензин АИ-95": "АИ-95"\n}`}
                  className="input-full-width"
                  rows={6}
                  style={{ fontFamily: 'monospace' }}
                />
                <span className="field-help">
                  <strong>Важно:</strong> Ключ — исходное название топлива из базы данных (например, "Дизельное топливо"), 
                  значение — нормализованное название для системы (например, "ДТ"). 
                  Формат JSON объекта. Можно оставить пустым.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* ШАГ 6: Активация шаблона */}
        <div className="form-section">
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              Шаблон активен
            </label>
            <span className="field-help">Активные шаблоны доступны для использования при загрузке файлов</span>
          </div>
        </div>

        {/* ШАГ 7: Настройки автоматической загрузки (только для Firebird, API и Web) */}
        {(formData.connection_type === 'firebird' || formData.connection_type === 'api' || formData.connection_type === 'web') && (
          <div className="form-section">
            <h3 className="section-title">Настройки автоматической загрузки</h3>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.auto_load_enabled}
                  onChange={(e) => setFormData({ ...formData, auto_load_enabled: e.target.checked })}
                />
                Включить автоматическую загрузку
              </label>
              <span className="field-help">
                При включении шаблон будет автоматически загружать данные по расписанию
              </span>
            </div>

            {formData.auto_load_enabled && (
              <>
                {/* Информационное сообщение о статусе автозагрузки */}
                {formData.auto_load_schedule && (
                  <div className="auto-load-info" style={{
                    padding: '12px 16px',
                    marginBottom: '15px',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid #90caf9',
                    borderRadius: '4px',
                    color: '#1565c0'
                  }}>
                    <strong>Автоматическая загрузка включена</strong>
                    <div style={{ marginTop: '8px', fontSize: '14px' }}>
                      Расписание: <strong>{formatSchedule(formData.auto_load_schedule)}</strong>
                    </div>
                  </div>
                )}
                
                <div className="form-group">
                  <label className="form-label">
                    Расписание (cron-выражение):
                    <input
                      type="text"
                      value={formData.auto_load_schedule}
                      onChange={(e) => setFormData({ ...formData, auto_load_schedule: e.target.value })}
                      placeholder='Например: "0 2 * * *" (каждый день в 2:00) или "hourly" (каждый час)'
                      className="input-full-width"
                    />
                  </label>
                  <span className="field-help">
                    Формат cron: минута час день месяц день_недели. Примеры: "0 2 * * *" - каждый день в 2:00,
                    "0 */6 * * *" - каждые 6 часов, "0 0 * * 1" - каждый понедельник в полночь.
                    Также поддерживаются простые форматы: "hourly" (каждый час), "daily" (каждый день в 2:00), "weekly" (каждую неделю)
                  </span>
                </div>

                <div className="form-group" style={{ display: 'flex', gap: '15px' }}>
                  <label className="form-label" style={{ flex: 1 }}>
                    Смещение начальной даты (дни):
                    <input
                      type="number"
                      value={formData.auto_load_date_from_offset}
                      onChange={(e) => setFormData({ ...formData, auto_load_date_from_offset: parseInt(e.target.value) || -7 })}
                      className="input-full-width"
                      min="-365"
                      max="0"
                    />
                  </label>
                  <label className="form-label" style={{ flex: 1 }}>
                    Смещение конечной даты (дни):
                    <input
                      type="number"
                      value={formData.auto_load_date_to_offset}
                      onChange={(e) => {
                        const value = e.target.value === '' ? -1 : parseInt(e.target.value);
                        setFormData({ ...formData, auto_load_date_to_offset: isNaN(value) ? -1 : value });
                      }}
                      className="input-full-width"
                      min="-365"
                      max="0"
                    />
                  </label>
                </div>
                <span className="field-help" style={{ marginTop: '-10px', marginBottom: '15px', display: 'block' }}>
                  Отрицательные значения означают дни назад от текущей даты. 
                  Например: -7 для начала означает неделю назад, -1 для конца означает вчера.
                  Значение 0 для конечной даты означает текущую дату и текущее время.
                </span>
              </>
            )}
          </div>
        )}

        <div className="form-actions">
          <IconButton 
            icon="save" 
            variant="success" 
            onClick={handleSave}
            title={template ? 'Сохранить изменения' : 'Создать шаблон'}
            size="medium"
          />
          <IconButton 
            icon="cancel" 
            variant="secondary" 
            onClick={onCancel}
            title="Отмена"
            size="medium"
          />
        </div>
      </div>
    </div>
  )
}

export default TemplateEditor

