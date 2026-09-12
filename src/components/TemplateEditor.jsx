import React, { useState, useEffect, useMemo } from 'react'
import IconButton from './IconButton'
import ApiConnection from './TemplateEditor/ApiConnection'
import WebConnection from './TemplateEditor/WebConnection'
import FirebirdConnection from './TemplateEditor/FirebirdConnection'
import PprApiKey from './TemplateEditor/PprApiKey'
import Activation from './TemplateEditor/Activation'
import AutoLoad from './TemplateEditor/AutoLoad'
import FieldMapping from './TemplateEditor/FieldMapping'
import FileUpload from './TemplateEditor/FileUpload'
import ConnectionType from './TemplateEditor/ConnectionType'
import BasicInfo from './TemplateEditor/BasicInfo'
import FileParsing from './TemplateEditor/FileParsing'
import { SYSTEM_FIELDS, parseConnectionSettings, buildConnectionSettings, stepNumbers, settingsForConnectionType } from '../utils/templateModel'
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

  // У сохранённого шаблона списка колонок источника нет — примера файла нам не
  // дали, таблицу Firebird и поля API ещё не загружали. Восстанавливаем набор
  // колонок из самого сопоставления, чтобы в списках было из чего выбирать.
  //
  // Отметка «сопоставлено автоматически» при этом НЕ ставится: сохранённое
  // сопоставление — решение человека, а не догадка системы. Раньше ставилась, и
  // у сохранённого шаблона каждое поле подписывалось «Авто».
  useEffect(() => {
    if (template && template.field_mapping && Object.keys(parseFieldMapping(template.field_mapping)).length > 0) {
      const mapping = parseFieldMapping(template.field_mapping)
      const columnsFromMapping = Object.values(mapping).filter(Boolean)
      if (columnsFromMapping.length > 0 && fileColumns.length === 0) {
        setFileColumns(columnsFromMapping)
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
          <FileUpload
            stepNumber={step['file-upload']}
            analyzing={analyzing}
            fileName={selectedFileName}
            columnCount={fileColumns.length}
            autoMappedCount={Object.keys(autoMappedFields).length}
            systemFieldCount={SYSTEM_FIELDS.length}
            onFileChange={handleFileUpload}
          />
        )}

        {/* Тип подключения */}
        <ConnectionType
          stepNumber={step['connection-type']}
          value={formData.connection_type}
          onChange={(newType) => {
            setFormData(prev => ({ ...prev, connection_type: newType }))
            setConnectionSettings(settingsForConnectionType(newType, connectionSettings))
          }}
        />

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
        <BasicInfo
          stepNumber={step['basic-info']}
          name={formData.name}
          description={formData.description}
          onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
        />

        {/* Параметры парсинга файла (только для типа file) */}
        {formData.connection_type === 'file' && fileColumns.length > 0 && (
          <FileParsing
            stepNumber={step['file-parsing']}
            headerRow={formData.header_row}
            dataStartRow={formData.data_start_row}
            onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
          />
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

