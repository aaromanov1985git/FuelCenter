import React, { useState, useEffect, useMemo } from 'react'
import IconButton from './IconButton'
import ApiConnection from './TemplateEditor/ApiConnection'
import WebConnection from './TemplateEditor/WebConnection'
import FirebirdConnection from './TemplateEditor/FirebirdConnection'
import PprApiKey from './TemplateEditor/PprApiKey'
import { SYSTEM_FIELDS, formatSchedule, parseConnectionSettings, buildConnectionSettings, stepNumbers } from '../utils/templateModel'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './TemplateEditor.css'

const API_URL = import.meta.env.VITE_API_URL || ''

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
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    connection_type: template?.connection_type || 'file',
    connection_settings: template?.connection_settings || null,
    header_row: template?.header_row ?? 0,
    data_start_row: template?.data_start_row ?? 1,
    source_table: template?.source_table || '',
    source_query: template?.source_query || '',
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
  const [fuelTypes, setFuelTypes] = useState([])
  const [loadingFuelTypes, setLoadingFuelTypes] = useState(false)
  const [fuelMappingEntries, setFuelMappingEntries] = useState(() => {
    // Инициализируем из существующего маппинга
    const parsed = parseFuelMapping(template?.fuel_type_mapping)
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([key, value]) => ({ key, value }))
    }
    return []
  })
  const [useVisualEditor, setUseVisualEditor] = useState(false) // Переключатель между визуальным редактором и текстовым
  
  // Парсим connection_settings если это строка JSON
  
  const [connectionSettings, setConnectionSettings] = useState(
    parseConnectionSettings(template?.connection_settings, template?.connection_type || formData.connection_type)
  )
  const [selectedTableColumns, setSelectedTableColumns] = useState([])
  const [fileColumns, setFileColumns] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [autoMappedFields, setAutoMappedFields] = useState({}) // Отслеживаем автоматически сопоставленные поля
  const [apiFields, setApiFields] = useState([]) // Поля из API ответа
  const [saving, setSaving] = useState(false) // Блокирует повторную отправку формы

  // Загрузка списка видов топлива
  useEffect(() => {
    const loadFuelTypes = async () => {
      setLoadingFuelTypes(true)
      try {
        const response = await authFetch(`${API_URL}/api/v1/fuel-types?limit=1000`)
        if (response.ok) {
          const result = await response.json()
          setFuelTypes(result.items || [])
        }
      } catch (err) {
        // Не показываем ошибку при 401 - это обрабатывается централизованно
        if (!err.isUnauthorized) {
          logger.error('Ошибка загрузки видов топлива:', err)
        }
      } finally {
        setLoadingFuelTypes(false)
      }
    }
    loadFuelTypes()
  }, [])

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

  // Синхронизация визуального редактора с текстовым полем
  useEffect(() => {
    if (useVisualEditor) {
      // Обновляем визуальный редактор при изменении текста
      try {
        const parsed = fuelMappingText ? JSON.parse(fuelMappingText) : {}
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setFuelMappingEntries(Object.entries(parsed).map(([key, value]) => ({ key, value })))
        } else {
          setFuelMappingEntries([])
        }
      } catch {
        // Игнорируем ошибки парсинга
      }
    }
  }, [fuelMappingText, useVisualEditor])

  // Обновление текстового поля при изменении визуального редактора
  const updateFuelMappingFromEntries = (entries) => {
    const mapping = {}
    entries.forEach(({ key, value }) => {
      if (key && value) {
        mapping[key] = value
      }
    })
    setFuelMappingText(JSON.stringify(mapping, null, 2))
  }

  const addFuelMappingEntry = () => {
    const newEntries = [...fuelMappingEntries, { key: '', value: '' }]
    setFuelMappingEntries(newEntries)
    updateFuelMappingFromEntries(newEntries)
  }

  const removeFuelMappingEntry = (index) => {
    const newEntries = fuelMappingEntries.filter((_, i) => i !== index)
    setFuelMappingEntries(newEntries)
    updateFuelMappingFromEntries(newEntries)
  }

  const updateFuelMappingEntry = (index, field, value) => {
    const newEntries = [...fuelMappingEntries]
    newEntries[index] = { ...newEntries[index], [field]: value }
    setFuelMappingEntries(newEntries)
    updateFuelMappingFromEntries(newEntries)
  }

  const clearFuelMapping = () => {
    setFuelMappingText('')
    setFuelMappingEntries([])
    setError('')
  }

  // Стандартные поля системы
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

  const handleSave = async () => {
    if (saving) return

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
    
    const missingFields = SYSTEM_FIELDS
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
    
    saveData.connection_settings = buildConnectionSettings(formData.connection_type, connectionSettings)
    
    setSaving(true)
    try {
      await onSave(saveData)
    } finally {
      setSaving(false)
    }
  }

  // Номера шагов считаются по фактически видимым секциям, а не пишутся в
  // разметке: набор секций зависит от типа подключения и от того, разобран ли
  // пример файла.
  const step = useMemo(
    () => stepNumbers({
      connectionType: formData.connection_type,
      hasFileColumns: fileColumns.length > 0
    }),
    [formData.connection_type, fileColumns.length]
  )

  return (
    <div className="template-editor">
      <div className="template-editor-header">
        <h3>{template ? 'Редактирование шаблона' : 'Новый шаблон'}</h3>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="template-form">
        {/* Выбор файла для анализа (только для типа file) */}
        {formData.connection_type === 'file' && (
          <div className="form-section file-upload-section">
          <h4 className="section-title">
            <span className="step-number">{step['file-upload']}</span>
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
                    Автоматически сопоставлено полей: {Object.keys(autoMappedFields).length} из {SYSTEM_FIELDS.length}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Тип подключения */}
        <div className="form-section">
          <h4 className="section-title">
            <span className="step-number">{step['connection-type']}</span>
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
                  // Обновляем настройки подключения в зависимости от типа
                  // Сохраняем ppr_api_key и api_key при смене типа подключения
                  const currentPprApiKey = connectionSettings.ppr_api_key || connectionSettings.pprApiKey || connectionSettings.api_key || connectionSettings.apiKey || connectionSettings.КлючАвторизации || ''
                  const currentGpnApiKey = connectionSettings.provider_type === 'gpn' ? (connectionSettings.api_key || '') : ''
                  
                  if (newConnectionType === 'api') {
                    setConnectionSettings({ 
                      provider_type: 'petrolplus', 
                      base_url: 'https://online.petrolplus.ru/api', 
                      api_token: '', 
                      currency: 'RUB', 
                      api_key: '',  // Для API провайдеров api_key используется для самого API
                      ppr_api_key: currentPprApiKey  // PPR API ключ хранится отдельно
                    })
                  } else if (newConnectionType === 'firebird') {
                    setConnectionSettings({ 
                      host: 'localhost', 
                      database: '', 
                      user: 'SYSDBA', 
                      password: '', 
                      port: 3050, 
                      charset: 'UTF8', 
                      api_key: '',  // Для Firebird api_key не используется
                      ppr_api_key: currentPprApiKey  // PPR API ключ хранится отдельно
                    })
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
                      cod_azs: 1000001,
                      api_key: '',  // Для Web api_key не используется
                      ppr_api_key: currentPprApiKey  // PPR API ключ хранится отдельно
                    })
                  } else {
                    // Для типа 'file' сохраняем только PPR API ключ
                    setConnectionSettings({ 
                      ppr_api_key: currentPprApiKey,
                      api_key: currentPprApiKey  // Для обратной совместимости
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

        {/* Настройки подключения к API */}
        {formData.connection_type === 'api' && (
          <ApiConnection
            stepNumber={step['connection-settings']}
            connectionSettings={connectionSettings}
            setConnectionSettings={setConnectionSettings}
            templateId={template?.id}
            onApiFields={setApiFields}
            onError={setError}
          />
        )}

        {/* Настройки подключения к веб-сервису */}
        {formData.connection_type === 'web' && (
          <WebConnection
            stepNumber={step['connection-settings']}
            connectionSettings={connectionSettings}
            setConnectionSettings={setConnectionSettings}
            templateId={template?.id}
            onApiFields={setApiFields}
            onError={setError}
          />
        )}

        {/* Подключение к Firebird и источник данных в нём */}
        {formData.connection_type === 'firebird' && (
          <FirebirdConnection
            connectionStep={step['connection-settings']}
            sourceStep={step['firebird-source']}
            connectionSettings={connectionSettings}
            setConnectionSettings={setConnectionSettings}
            sourceTable={formData.source_table}
            sourceQuery={formData.source_query}
            onSourceChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
            columns={selectedTableColumns}
            onColumns={setSelectedTableColumns}
            onError={setError}
          />
        )}

        {/* Основная информация о шаблоне */}
        <div className="form-section">
          <h4 className="section-title">
            <span className="step-number">{step['basic-info']}</span>
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

        {/* Параметры парсинга файла (только для типа file) */}
        {formData.connection_type === 'file' && fileColumns.length > 0 && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">{step['file-parsing']}</span>
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

        {/* Настройки PPR API ключа */}
        <PprApiKey
          stepNumber={step['ppr-key']}
          connectionSettings={connectionSettings}
          setConnectionSettings={setConnectionSettings}
          onError={setError}
        />

        {/* Сопоставление полей */}
        {((formData.connection_type === 'file' && fileColumns.length > 0) || formData.connection_type === 'firebird' || formData.connection_type === 'api' || formData.connection_type === 'web') && (
          <div className="form-section mapping-section">
            <h4 className="section-title">
              <span className="step-number">{step['field-mapping']}</span>
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
                  {SYSTEM_FIELDS.map(field => {
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-small)' }}>
                  <span>Маппинг видов топлива (опционально)</span>
                  <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                    <button
                      type="button"
                      onClick={() => setUseVisualEditor(!useVisualEditor)}
                      style={{
                        padding: 'var(--spacing-tiny) var(--spacing-small)',
                        fontSize: 'var(--font-size-sm)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-medium)',
                        backgroundColor: useVisualEditor ? 'var(--color-primary)' : 'var(--color-bg)',
                        color: useVisualEditor ? 'white' : 'var(--color-text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      {useVisualEditor ? '📝 Текстовый редактор' : '🎨 Визуальный редактор'}
                    </button>
                    {fuelMappingText && (
                      <button
                        type="button"
                        onClick={clearFuelMapping}
                        style={{
                          padding: 'var(--spacing-tiny) var(--spacing-small)',
                          fontSize: 'var(--font-size-sm)',
                          border: '1px solid var(--color-error)',
                          borderRadius: 'var(--radius-medium)',
                          backgroundColor: 'var(--color-bg)',
                          color: 'var(--color-error)',
                          cursor: 'pointer'
                        }}
                        title="Очистить маппинг"
                      >
                        🗑️ Очистить
                      </button>
                    )}
                  </div>
                </div>
                
                {useVisualEditor ? (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-medium)', padding: 'var(--spacing-block)' }}>
                    {fuelMappingEntries.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 'var(--spacing-block)', color: 'var(--color-text-secondary)' }}>
                        Нет записей маппинга. Нажмите "Добавить" для создания новой записи.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)' }}>
                        {fuelMappingEntries.map((entry, index) => (
                          <div key={index} style={{ display: 'flex', gap: 'var(--spacing-small)', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={entry.key}
                              onChange={(e) => updateFuelMappingEntry(index, 'key', e.target.value)}
                              placeholder="Исходное название (из БД)"
                              style={{
                                flex: 1,
                                padding: 'var(--spacing-tiny) var(--spacing-small)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-medium)',
                                fontSize: 'var(--font-size-sm)'
                              }}
                            />
                            <span style={{ color: 'var(--color-text-secondary)' }}>→</span>
                            <div style={{ flex: 1, display: 'flex', gap: 'var(--spacing-tiny)' }}>
                              <select
                                value={entry.value}
                                onChange={(e) => updateFuelMappingEntry(index, 'value', e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: 'var(--spacing-tiny) var(--spacing-small)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-medium)',
                                  fontSize: 'var(--font-size-sm)'
                                }}
                              >
                                <option value="">Выберите или введите</option>
                                {fuelTypes.map((ft) => (
                                  <option key={ft.id} value={ft.normalized_name || ft.original_name}>
                                    {ft.normalized_name || ft.original_name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={entry.value}
                                onChange={(e) => updateFuelMappingEntry(index, 'value', e.target.value)}
                                placeholder="Введите вручную"
                                style={{
                                  flex: 1,
                                  padding: 'var(--spacing-tiny) var(--spacing-small)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-medium)',
                                  fontSize: 'var(--font-size-sm)'
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFuelMappingEntry(index)}
                              style={{
                                padding: 'var(--spacing-tiny)',
                                border: '1px solid var(--color-error)',
                                borderRadius: 'var(--radius-medium)',
                                backgroundColor: 'var(--color-bg)',
                                color: 'var(--color-error)',
                                cursor: 'pointer',
                                minWidth: '32px'
                              }}
                              title="Удалить запись"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={addFuelMappingEntry}
                      style={{
                        marginTop: 'var(--spacing-block)',
                        padding: 'var(--spacing-small) var(--spacing-block)',
                        border: '1px solid var(--color-primary)',
                        borderRadius: 'var(--radius-medium)',
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        width: '100%'
                      }}
                    >
                      + Добавить запись
                    </button>
                  </div>
                ) : (
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
                )}
                <span className="field-help">
                  <strong>Важно:</strong> Ключ — исходное название топлива из базы данных (например, "Дизельное топливо"), 
                  значение — нормализованное название для системы (например, "ДТ"). 
                  Формат JSON объекта. Можно оставить пустым.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Активация шаблона */}
        <div className="form-section">
          <h4 className="section-title">
            <span className="step-number">{step['activation']}</span>
            Активация шаблона
          </h4>
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

        {/* Настройки автоматической загрузки (только для Firebird, API и Web) */}
        {(formData.connection_type === 'firebird' || formData.connection_type === 'api' || formData.connection_type === 'web') && (
          <div className="form-section">
            <h4 className="section-title">
              <span className="step-number">{step['auto-load']}</span>
              Настройки автоматической загрузки
            </h4>
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
            disabled={saving}
            title={saving ? 'Сохранение…' : (template ? 'Сохранить изменения' : 'Создать шаблон')}
            size="medium"
          />
          <IconButton 
            icon="cancel" 
            variant="secondary" 
            onClick={onCancel}
            disabled={saving}
            title="Отмена"
            size="medium"
          />
        </div>
      </div>
    </div>
  )
}

export default TemplateEditor

