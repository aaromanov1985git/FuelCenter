import { useRef } from 'react'
import { useToast } from '../ToastContainer'
import { extractPprKey } from '../../utils/templateModel'

/** Длина генерируемого ключа и алфавит, из которого он набирается. */
const KEY_LENGTH = 32
const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const generateApiKey = () => {
  let result = ''
  for (let i = 0; i < KEY_LENGTH; i++) {
    result += KEY_CHARS.charAt(Math.floor(Math.random() * KEY_CHARS.length))
  }
  return result
}

/**
 * Ключ доступа к эмулированному PPR API.
 *
 * Ключ пишется во все свои исторические имена сразу: и бэкенд, и фронтенд
 * предпочитают ppr_api_key, поэтому остальные алиасы нужны только для старых
 * записей — но оставлять их с прежним значением при правке ключа значит хранить
 * в шаблоне два разных ключа. Исключение — Газпром-нефть: там api_key занят
 * ключом самого API провайдера, и трогать его нельзя.
 */
const PprApiKey = ({ stepNumber, connectionSettings, setConnectionSettings, onError }) => {
  const inputRef = useRef(null)
  const toast = useToast()

  const currentKey = extractPprKey(connectionSettings) || ''

  const writeKey = (newKey) => {
    const isGpn = connectionSettings.provider_type === 'gpn'
    setConnectionSettings({
      ...connectionSettings,
      ppr_api_key: newKey,
      pprApiKey: newKey,
      ...(isGpn ? {} : { api_key: newKey, apiKey: newKey, КлючАвторизации: newKey })
    })
  }

  const generate = () => {
    writeKey(generateApiKey())
    // Выделяем новый ключ, чтобы его сразу можно было скопировать руками.
    // Через таймер, иначе select() застанет в поле прежнее значение.
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }

  const copyToClipboard = async () => {
    if (!currentKey) {
      onError('Нет ключа для копирования')
      return
    }
    try {
      await navigator.clipboard.writeText(currentKey)
      toast.success('Ключ скопирован в буфер обмена')
    } catch (err) {
      onError('Не удалось скопировать ключ: ' + err.message)
    }
  }

  return (
    <div className="form-section">
      <h4 className="section-title">
        <span className="step-number">{stepNumber}</span>
        Настройки PPR API ключа
      </h4>
      <p className="section-description">
        API ключ для доступа к эмулированному PPR API. Этот ключ используется для аутентификации при запросах к PPR API и определяет, какие транзакции будут доступны (только транзакции данного провайдера).
      </p>

      <div className="form-group">
        <label>
          API ключ для PPR API:
          <div className="ppr-key-row">
            <input
              ref={inputRef}
              type="text"
              value={currentKey}
              onChange={(e) => writeKey(e.target.value)}
              placeholder="Введите API ключ для PPR API"
              className="input-full-width"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-generate-key"
              onClick={generate}
              title="Сгенерировать новый случайный ключ"
            >
              Создать ключ
            </button>
            <button
              type="button"
              className="btn-copy-key"
              onClick={copyToClipboard}
              disabled={!currentKey}
              title="Скопировать ключ в буфер обмена"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
              Копировать
            </button>
          </div>
          <span className="field-help">
            Уникальный ключ для доступа к PPR API. При запросе с этим ключом будут возвращены только транзакции данного провайдера.
            <br />
            <strong>Важно:</strong> Каждый провайдер должен иметь свой уникальный ключ.
          </span>
        </label>
      </div>

      <div className="info-box">
        <svg xmlns="http://www.w3.org/2000/svg" className="info-box-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <div className="info-box-body">
          <strong>Как это работает:</strong>
          <ul>
            <li>API ключ хранится в настройках шаблона провайдера</li>
            <li>При запросе к PPR API с этим ключом система определяет провайдера</li>
            <li>Возвращаются только транзакции этого провайдера</li>
            <li>Если ключ не указан, PPR API будет недоступен для этого провайдера</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default PprApiKey
