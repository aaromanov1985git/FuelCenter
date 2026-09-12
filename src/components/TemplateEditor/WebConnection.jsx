import { useState } from 'react'
import ConnectionTestResult from './ConnectionTestResult'
import Icon from '../ui/Icon'
import { authFetch } from '../../utils/api'
import { logger } from '../../utils/logger'

const API_URL = import.meta.env.VITE_API_URL || ''

/** Сертификат XML API ведётся под двумя именами, значение одно и то же. */
const certificateOf = (settings) => settings.certificate || settings.xml_api_certificate

/**
 * Чего не хватает для запроса к веб-сервису.
 *
 * @param {object} settings - настройки подключения из формы
 * @returns {string|null} Сообщение для пользователя или null, если всё на месте
 */
const missingRequired = (settings) => {
  if (!settings.base_url) {
    return 'Укажите базовый URL'
  }
  if (!certificateOf(settings)) {
    return 'Для XML API требуется указать сертификат (Certificate)'
  }
  return null
}

/**
 * Настройки подключения к веб-сервису (XML API).
 *
 * Авторизации нет: доступ даёт только сертификат, поэтому поля логина и пароля
 * здесь не показываются.
 */
const WebConnection = ({
  stepNumber,
  connectionSettings,
  setConnectionSettings,
  templateId,
  onApiFields,
  onError
}) => {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [loadingFields, setLoadingFields] = useState(false)

  const missing = missingRequired(connectionSettings)

  const updateSettings = (patch) => setConnectionSettings({ ...connectionSettings, ...patch })

  /** Базовый URL уходит на сервер без хвостовых слэшей и пробелов. */
  const normalizedSettings = () => ({
    ...connectionSettings,
    base_url: connectionSettings.base_url.trim().replace(/\/+$/, '')
  })

  const testConnection = async () => {
    if (missing) {
      onError(missing)
      return
    }

    setTesting(true)
    onError('')

    try {
      const response = templateId
        ? await authFetch(`${API_URL}/api/v1/templates/${templateId}/test-api-connection`, { method: 'POST' })
        : await authFetch(`${API_URL}/api/v1/templates/test-api-connection?connection_type=web`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(normalizedSettings())
          })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || errorData.message || 'Ошибка тестирования подключения')
      }

      const result = await response.json()
      setTestResult(result)
      onError(result.success ? '' : (result.message || 'Ошибка подключения'))
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      onError('Ошибка тестирования подключения: ' + err.message)
      setTestResult({ success: false, message: err.message })
    } finally {
      setTesting(false)
    }
  }

  const loadApiFields = async () => {
    if (missing) {
      onError(missing)
      return
    }

    setLoadingFields(true)
    onError('')

    try {
      const response = templateId
        ? await authFetch(`${API_URL}/api/v1/templates/${templateId}/api-fields`, { method: 'POST' })
        : await authFetch(`${API_URL}/api/v1/templates/api-fields?connection_type=web`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(normalizedSettings())
          })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || errorData.error || 'Ошибка загрузки полей из веб-сервиса')
      }

      const result = await response.json()
      onApiFields(result.fields || [])

      if (result.fields && result.fields.length > 0) {
        onError('')
        logger.debug(`Загружено полей из веб-сервиса: ${result.count || result.fields.length}`)
      } else {
        onError(result.error || 'Не удалось получить поля из веб-сервиса. Используйте стандартные названия полей.')
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      onError('Ошибка загрузки полей из веб-сервиса: ' + err.message)
      onApiFields([])
    } finally {
      setLoadingFields(false)
    }
  }

  return (
    <div className="form-section">
      <h4 className="section-title">
        <span className="step-number">{stepNumber}</span>
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
              onChange={(e) => updateSettings({ base_url: e.target.value })}
              placeholder="http://example.com:8080"
              className="input-full-width"
            />
            <span className="field-help">Базовый URL веб-сервиса (например: http://176.222.217.51:8080)</span>
          </label>
        </div>

        <div className="form-group">
          <label>
            Валюта:
            <input
              type="text"
              value={connectionSettings.currency || 'RUB'}
              onChange={(e) => updateSettings({ currency: e.target.value })}
              placeholder="RUB"
              className="input-full-width"
            />
            <span className="field-help">Валюта по умолчанию (например: RUB, USD, EUR)</span>
          </label>
        </div>

        <div className="form-section xml-api-params">
          <h5 className="subgroup-title">Параметры XML API</h5>
          <p className="section-description">
            <strong>Важно:</strong> Для работы с XML API используется только сертификат.
            Логин, пароль, ключ, подпись и salt не используются.
          </p>

          <div className="form-group">
            <label>
              Сертификат (Certificate): <span className="required-mark">*</span>
              <input
                type="text"
                value={certificateOf(connectionSettings) || ''}
                onChange={(e) => updateSettings({
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
                  const posCode = value ? parseInt(value) || null : null
                  updateSettings({ pos_code: posCode, xml_api_pos_code: posCode })
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
                onChange={(e) => updateSettings({
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

        <div className="form-group form-group-test-connection">
          <div className="connection-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={testConnection}
              disabled={testing || Boolean(missing)}
              title="Проверить подключение к веб-сервису"
            >
              <Icon name={testing ? 'clock' : 'search'} size={16} />
              {testing ? 'Проверка...' : 'Проверить подключение'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadApiFields}
              disabled={loadingFields || Boolean(missing)}
              title="Загрузить список полей из веб-сервиса"
            >
              <Icon name={loadingFields ? 'clock' : 'search'} size={16} />
              {loadingFields ? 'Загрузка...' : 'Загрузить поля из веб-сервиса'}
            </button>
          </div>
          <ConnectionTestResult result={testResult} />
        </div>
      </form>
    </div>
  )
}

export default WebConnection
