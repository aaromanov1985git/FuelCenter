import React, { useState, useEffect, useMemo } from 'react'
import IconButton from './IconButton'
import ApiConnection from './TemplateEditor/ApiConnection'
import WebConnection from './TemplateEditor/WebConnection'
import FirebirdConnection from './TemplateEditor/FirebirdConnection'
import PprApiKey from './TemplateEditor/PprApiKey'
import Activation from './TemplateEditor/Activation'
import AutoLoad from './TemplateEditor/AutoLoad'
import FieldMapping from './TemplateEditor/FieldMapping'
import { SYSTEM_FIELDS, parseConnectionSettings, buildConnectionSettings, stepNumbers } from '../utils/templateModel'
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

  // Откуда секция сопоставления берёт список полей источника: из разобранного
  // примера файла, из ответа API или из выбранной таблицы Firebird.
  const mappingColumns = formData.connection_type === 'file'
    ? fileColumns
    : formData.connection_type === 'firebird'
      ? selectedTableColumns
      : apiFields

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
          <FieldMapping
            stepNumber={step['field-mapping']}
            connectionType={formData.connection_type}
            columns={mappingColumns}
            fieldMapping={formData.field_mapping}
            onFieldMapping={handleFieldMapping}
            autoMappedFields={autoMappedFields}
            onManualOverride={(fieldKey) => setAutoMappedFields(prev => {
              const next = { ...prev }
              delete next[fieldKey]
              return next
            })}
            fuelMappingText={fuelMappingText}
            onFuelMappingChange={(text) => {
              setFuelMappingText(text)
              setError('')
            }}
          />
        )}

        {/* Активация шаблона */}
        <Activation
          stepNumber={step['activation']}
          isActive={formData.is_active}
          onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
        />

        {/* Автозагрузка — только для подключений, которые забирают данные сами */}
        {(formData.connection_type === 'firebird' || formData.connection_type === 'api' || formData.connection_type === 'web') && (
          <AutoLoad
            stepNumber={step['auto-load']}
            enabled={formData.auto_load_enabled}
            schedule={formData.auto_load_schedule}
            dateFromOffset={formData.auto_load_date_from_offset}
            dateToOffset={formData.auto_load_date_to_offset}
            onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
          />
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

