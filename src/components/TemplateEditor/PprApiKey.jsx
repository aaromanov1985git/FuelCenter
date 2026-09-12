import { useRef } from 'react'
import Icon from '../ui/Icon'
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
              {/* Класс icon-small здесь ни к чему не привязан (правило есть только
                  внутри .success-badge и .connection-test-result), поэтому у svg не
                  было ни одного размера — замещаемый элемент разворачивался в
                  дефолтные 300x150. Размер задаём явно: 16px. */}
              <Icon name="copy" size={16} />
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
        {/* Класс info-box-icon оставлен: на нём 20px, цвет --cyan и отбивка.
            strokeWidth 1.28 = 1.6 x 16/20 держит отрисованный штрих на 1.6px. */}
        <Icon name="info" className="info-box-icon" size={20} strokeWidth={1.28} />
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
