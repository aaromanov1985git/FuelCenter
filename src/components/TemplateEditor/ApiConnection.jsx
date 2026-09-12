import { useState } from 'react'
import ConnectionTestResult from './ConnectionTestResult'
import Icon from '../ui/Icon'
import { authFetch } from '../../utils/api'
import { logger } from '../../utils/logger'

const API_URL = import.meta.env.VITE_API_URL || ''

/** Базовый URL по умолчанию для каждого провайдера API. */
const DEFAULT_BASE_URL = {
  petrolplus: 'https://online.petrolplus.ru/api',
  rncard: 'https://lkapi.rn-card.ru',
  gpn: 'https://api.opti-24.ru'
}

/**
 * Чего не хватает для запроса к API провайдера.
 *
 * Одна проверка вместо четырёх её копий: те же три условия были выписаны в
 * обоих обработчиках и ещё раз в обоих атрибутах disabled. У Газпром-нефти
 * обязательных полей, кроме URL, не проверялось — так и оставлено.
 *
 * @param {object} settings - настройки подключения из формы
 * @returns {string|null} Сообщение для пользователя или null, если всё на месте
 */
const missingRequired = (settings) => {
  if (!settings.base_url) {
    return 'Укажите базовый URL API'
  }
  if (settings.provider_type === 'petrolplus' && !settings.api_token) {
    return 'Укажите токен авторизации'
  }
  if (settings.provider_type === 'rncard' && (!settings.login || !settings.password || !settings.contract)) {
    return 'Укажите логин, пароль и код договора'
  }
  return null
}

/**
 * Настройки подключения к API провайдера: PetrolPlus, РН-Карт, Газпром-нефть.
 *
 * Флаги проверки подключения и загрузки полей — местные: секции api, web и
 * firebird взаимоисключающие, одновременно смонтирована ровно одна, поэтому
 * делить эти флаги с редактором незачем. При смене типа подключения секция
 * размонтируется и результат проверки уходит вместе с ней.
 *
 * Поля, загруженные из API, наоборот поднимаются наверх: их показывает секция
 * сопоставления полей.
 */
const ApiConnection = ({
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

  const providerType = connectionSettings.provider_type || 'petrolplus'
  const missing = missingRequired(connectionSettings)

  const updateSettings = (patch) => setConnectionSettings({ ...connectionSettings, ...patch })

  /** Смена провайдера пересобирает набор настроек, сохраняя совпадающие поля. */
  const changeProviderType = (newProviderType) => {
    if (newProviderType === 'petrolplus') {
      setConnectionSettings({
        provider_type: 'petrolplus',
        base_url: DEFAULT_BASE_URL.petrolplus,
        api_token: connectionSettings.api_token || '',
        currency: connectionSettings.currency || 'RUB'
      })
    } else if (newProviderType === 'rncard') {
      setConnectionSettings({
        provider_type: 'rncard',
        base_url: DEFAULT_BASE_URL.rncard,
        login: connectionSettings.login || connectionSettings.username || '',
        password: connectionSettings.password || '',
        contract: connectionSettings.contract || connectionSettings.contract_code || '',
        currency: connectionSettings.currency || 'RUB',
        use_md5_hash: connectionSettings.use_md5_hash !== false
      })
    } else if (newProviderType === 'gpn') {
      // У ГПН api_key — ключ самого API провайдера, ppr_api_key ведётся отдельно.
      setConnectionSettings({
        provider_type: 'gpn',
        base_url: DEFAULT_BASE_URL.gpn,
        api_key: connectionSettings.api_key || connectionSettings.apiKey || '',
        ppr_api_key: connectionSettings.ppr_api_key || connectionSettings.pprApiKey || '',
        login: connectionSettings.login || connectionSettings.username || '',
        password: connectionSettings.password || '',
        currency: connectionSettings.currency || 'RUB'
      })
    }
  }

  const testConnection = async () => {
    if (missing) {
      onError(missing)
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = templateId
        ? await authFetch(`${API_URL}/api/v1/templates/${templateId}/test-api-connection`, { method: 'POST' })
        : await authFetch(`${API_URL}/api/v1/templates/test-api-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(connectionSettings)
          })

      setTestResult(await response.json())
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setTestResult({ success: false, message: 'Ошибка тестирования: ' + err.message })
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
        : await authFetch(`${API_URL}/api/v1/templates/api-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(connectionSettings)
          })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || errorData.error || 'Ошибка загрузки полей из API')
      }

      const result = await response.json()
      onApiFields(result.fields || [])

      if (result.fields && result.fields.length > 0) {
        onError('')
        if (result.count > 0) {
          logger.debug(`Загружено полей из API: ${result.count}`)
        }
      } else {
        onError(result.error || 'Не удалось получить поля из API. Убедитесь, что подключение работает и есть данные. Возможные причины: нет доступных карт, нет транзакций за последние 90 дней, или API возвращает пустые данные.')
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      onError('Ошибка загрузки полей из API: ' + err.message)
      onApiFields([])
    } finally {
      setLoadingFields(false)
    }
  }

  return (
    <div className="form-section">
      <h4 className="section-title">
        <span className="step-number">{stepNumber}</span>
        Настройки подключения к API
      </h4>
      <p className="section-description">
        Укажите параметры подключения к API провайдера (например, PetrolPlus, РН-Карт или Газпром-нефть).
      </p>

      <div className="form-group">
        <label>
          Тип провайдера API: <span className="required-mark">*</span>
          <select
            value={providerType}
            onChange={(e) => changeProviderType(e.target.value)}
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
            value={connectionSettings.base_url || DEFAULT_BASE_URL[providerType]}
            onChange={(e) => updateSettings({ base_url: e.target.value })}
            placeholder={DEFAULT_BASE_URL[providerType]}
            className="input-full-width"
          />
          <span className="field-help">Базовый URL API провайдера</span>
        </label>
      </div>

      {providerType === 'petrolplus' && (
        <div className="form-group">
          <label>
            Токен авторизации: <span className="required-mark">*</span>
            <input
              type="password"
              value={connectionSettings.api_token || ''}
              onChange={(e) => updateSettings({ api_token: e.target.value })}
              placeholder="Ваш API токен"
              className="input-full-width"
              autoComplete="off"
            />
            <span className="field-help">Токен для авторизации в API</span>
          </label>
        </div>
      )}

      {providerType === 'rncard' && (
        <>
          <div className="form-group">
            <label>
              Логин: <span className="required-mark">*</span>
              <input
                type="text"
                value={connectionSettings.login || ''}
                onChange={(e) => updateSettings({ login: e.target.value })}
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
                onChange={(e) => updateSettings({ password: e.target.value })}
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
                onChange={(e) => updateSettings({ contract: e.target.value })}
                placeholder="ISS123456"
                className="input-full-width"
                autoComplete="off"
              />
              <span className="field-help">Код договора (например, ISS123456)</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={connectionSettings.use_md5_hash !== false}
                onChange={(e) => updateSettings({ use_md5_hash: e.target.checked })}
              />
              Использовать MD5-хеш пароля (рекомендуется)
            </label>
            <span className="field-help">Рекомендуется использовать MD5-хеш для безопасности</span>
          </div>
        </>
      )}

      {providerType === 'gpn' && (
        <>
          <div className="form-group">
            <label>
              API ключ: <span className="required-mark">*</span>
              <input
                type="password"
                value={connectionSettings.api_key || connectionSettings.apiKey || ''}
                onChange={(e) => updateSettings({ api_key: e.target.value })}
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
                onChange={(e) => updateSettings({ login: e.target.value })}
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
                onChange={(e) => updateSettings({ password: e.target.value })}
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
            onChange={(e) => updateSettings({ currency: e.target.value })}
            placeholder="RUB"
            className="input-full-width"
          />
          <span className="field-help">Валюта по умолчанию (например, RUB)</span>
        </label>
      </div>

      <div className="form-group form-group-test-connection">
        <div className="connection-actions">
          <button
            type="button"
            className="btn-test-connection"
            onClick={testConnection}
            disabled={testing || Boolean(missing)}
          >
            {testing ? 'Тестирование...' : 'Тестировать подключение'}
          </button>
          <button
            type="button"
            className="btn-load-columns"
            onClick={loadApiFields}
            disabled={loadingFields || Boolean(missing)}
            title="Загрузить список полей из API ответа"
          >
            <Icon name={loadingFields ? 'clock' : 'search'} size={16} />
            {loadingFields ? 'Загрузка...' : 'Загрузить поля из API'}
          </button>
        </div>
        <ConnectionTestResult result={testResult} />
      </div>
    </div>
  )
}

export default ApiConnection
