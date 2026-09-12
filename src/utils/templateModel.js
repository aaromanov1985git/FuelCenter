/**
 * Чистые функции модели шаблона провайдера.
 *
 * Вынесены из TemplateEditor.jsx БЕЗ изменения логики — это страховочная сетка
 * перед разрезанием редактора на шаги. Сначала поведение закрепляется тестами,
 * и только потом его можно менять.
 *
 * Почему это важно: PPR-ключ читается из шести разных имён, и в проде
 * используются все. Выгрузка ключей из provider_templates на 11.09.2026:
 *   - `КлючАвторизации` присутствует во ВСЕХ 11 нефайловых шаблонах;
 *   - у шаблона id=11 нет `ppr_api_key` вовсе, только алиасы;
 *   - у id=14 одновременно `pprApiKey` и `ppr_api_key`.
 * Любая «уборка» алиасов без этих тестов молча обнулит ключи провайдеров.
 */

/** Поля системы, на которые отображаются колонки источника. */
export const SYSTEM_FIELDS = [
  { key: 'user', label: 'Пользователь / ТС', required: false },
  { key: 'card', label: 'Номер карты', required: false },
  { key: 'kazs', label: 'КАЗС / АЗС', required: false },
  { key: 'date', label: 'Дата и время', required: true },
  { key: 'quantity', label: 'Количество', required: true },
  { key: 'fuel', label: 'Вид топлива', required: true },
  { key: 'organization', label: 'Организация', required: false }
]

/**
 * Человекочитаемое описание расписания автозагрузки.
 *
 * Функция была продублирована в TemplateEditor.jsx и TemplatesList.jsx, и копии
 * разошлись в пяти местах: список писал «один раз в сутки (2:00)», редактор —
 * «(в 2:00)», и по-разному склонял «час». Один шаблон подписывался по-разному
 * на двух экранах. Канонической взята версия редактора как более полная.
 *
 * @param {string} schedule - cron-выражение или простой формат
 * @returns {string|null} Описание или null, если расписание пустое
 */
export const formatSchedule = (schedule) => {
  if (!schedule || !schedule.trim()) return null

  const scheduleStr = schedule.trim().toLowerCase()

  if (scheduleStr === 'daily' || scheduleStr === 'day') {
    return 'один раз в сутки (в 2:00)'
  }
  if (scheduleStr === 'hourly' || scheduleStr === 'hour') {
    return 'один раз в час'
  }
  if (scheduleStr === 'weekly' || scheduleStr === 'week') {
    return 'один раз в неделю (понедельник в 2:00)'
  }

  if (scheduleStr.startsWith('every ')) {
    const parts = scheduleStr.split(/\s+/)
    if (parts.length >= 3) {
      const interval = parts[1]
      const unit = parts[2]
      if (unit.includes('hour') || unit.includes('час')) {
        if (interval === '1') return 'один раз в час'
        return `каждые ${interval} ${interval === '1' ? 'час' : 'часа'}`
      }
      if (unit.includes('minute') || unit.includes('мин')) {
        if (interval === '1') return 'каждую минуту'
        return `каждые ${interval} ${interval === '1' ? 'минуту' : 'минуты'}`
      }
    }
  }

  const cronParts = scheduleStr.split(/\s+/)
  if (cronParts.length === 5) {
    const [minute, hour, day, month, dayOfWeek] = cronParts

    if (minute === '0' && (hour === '*' || hour === '*/1') && day === '*' && month === '*' && dayOfWeek === '*') {
      return 'один раз в час'
    }

    // Условие намеренно исключает шаг вида */N: без этого '0 */6 * * *' попадал
    // сюда раньше своей ветки, parseInt('*/6') давал NaN, и шаблон id=5 в проде
    // показывал «один раз в сутки (в NaN:00)». Ветка «каждые N часов» ниже была
    // недостижима. Единственное отступление от переноса без изменений — оно
    // убирает NaN с экрана.
    if (minute !== '*' && hour !== '*' && !hour.startsWith('*/') && day === '*' && month === '*' && dayOfWeek === '*') {
      const h = parseInt(hour)
      const m = parseInt(minute)
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      return `один раз в сутки (в ${timeStr})`
    }

    if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && dayOfWeek === '*') {
      const interval = hour.substring(2)
      if (interval === '1') return 'один раз в час'
      return `каждые ${interval} часа`
    }

    return schedule
  }

  return schedule
}

/** Имена, под которыми в базе встречается PPR-ключ. Порядок = приоритет. */
export const PPR_KEY_ALIASES = ['ppr_api_key', 'pprApiKey', 'api_key', 'apiKey', 'КлючАвторизации']

/**
 * Достать PPR-ключ из настроек подключения, перебирая все известные имена.
 *
 * @param {object} settings - connection_settings
 * @returns {string} Ключ или пустая строка
 */
export const extractPprKey = (settings) => {
  if (!settings || typeof settings !== 'object') return ''
  for (const alias of PPR_KEY_ALIASES) {
    if (settings[alias]) return settings[alias]
  }
  return ''
}

/**
 * Настройки подключения по умолчанию для типа, когда сохранённых нет.
 *
 * @param {string} connectionType - file | firebird | api | web
 * @param {boolean} withPprKey - добавлять ли пустой ppr_api_key
 */
const defaultsFor = (connectionType, withPprKey) => {
  const ppr = withPprKey ? { ppr_api_key: '' } : {}
  if (connectionType === 'api') {
    return { provider_type: 'petrolplus', base_url: 'https://online.petrolplus.ru/api', api_token: '', currency: 'RUB', api_key: '', ...ppr }
  }
  if (connectionType === 'web') {
    return { base_url: '', username: '', password: '', currency: 'RUB', certificate: '', pos_code: '', key: '', signature: '', salt: '', cod_azs: 1000001, api_key: '', ...ppr }
  }
  if (connectionType === 'file') {
    return { api_key: '' }
  }
  return { host: 'localhost', database: '', user: 'SYSDBA', password: '', port: 3050, charset: 'UTF8', api_key: '', ...ppr }
}

/**
 * Разобрать connection_settings шаблона в состояние формы.
 *
 * ВНИМАНИЕ: поведение сохранено в точности, включая мутацию переданного объекта,
 * когда settings уже объект. Это известная острая грань — чинить её следует
 * отдельно и под тестами, а не заодно с переносом.
 *
 * @param {string|object|null} settings - connection_settings из шаблона
 * @param {string} connectionType - тип подключения
 * @returns {object} Настройки для формы
 */
export const parseConnectionSettings = (settings, connectionType) => {
  let parsed = null

  if (!settings) {
    return defaultsFor(connectionType, false)
  }

  if (typeof settings === 'string') {
    try {
      parsed = JSON.parse(settings)
    } catch {
      // Строка не разобралась как JSON: отдаём дефолты, но с учётом того,
      // какой провайдер был указан (для api различаются три набора полей).
      if (connectionType === 'api') {
        const probe = (() => { try { return JSON.parse(settings) } catch { return {} } })()
        if (probe.provider_type === 'rncard') {
          return { provider_type: 'rncard', base_url: 'https://lkapi.rn-card.ru', login: '', password: '', contract: '', currency: 'RUB', use_md5_hash: true, api_key: '', ppr_api_key: '' }
        }
        if (probe.provider_type === 'gpn' || probe.provider_type === 'gazprom-neft' || probe.provider_type === 'gazpromneft') {
          return { provider_type: 'gpn', base_url: 'https://api.opti-24.ru', api_key: '', ppr_api_key: '', login: '', password: '', currency: 'RUB' }
        }
        // У ветки api в исходнике был собственный терминальный return
        return defaultsFor('api', true)
      }
      // ВАЖНО: в исходнике ветки api и web обработаны выше, а всё остальное —
      // включая file — проваливалось к дефолтам firebird. Поведение сохранено.
      return defaultsFor(connectionType === 'web' ? 'web' : 'firebird', true)
    }
  } else {
    parsed = settings
  }

  if (parsed && typeof parsed === 'object') {
    // Для файловых шаблонов из всего набора значим только PPR-ключ
    if (connectionType === 'file') {
      const pprKey = extractPprKey(parsed)
      return {
        ppr_api_key: pprKey,
        api_key: pprKey // дублируется для обратной совместимости с бэкендом
      }
    }

    if (!parsed.ppr_api_key && !parsed.pprApiKey) {
      parsed.ppr_api_key = parsed.api_key || parsed.apiKey || parsed.КлючАвторизации || ''
    }

    // У ГПН api_key — ключ самого API провайдера, а не PPR: перезаписывать нельзя
    if (parsed.provider_type !== 'gpn') {
      if (!parsed.api_key && (parsed.apiKey || parsed.КлючАвторизации || parsed.authorization_key || parsed.key)) {
        parsed.api_key = parsed.apiKey || parsed.КлючАвторизации || parsed.authorization_key || parsed.key
      }
      if (!parsed.api_key && !parsed.apiKey && !parsed.КлючАвторизации) {
        parsed.api_key = ''
      }
    }

    if (!parsed.ppr_api_key && !parsed.pprApiKey) {
      parsed.ppr_api_key = ''
    }
  }

  return parsed || settings
}

/**
 * Собрать connection_settings для отправки на сервер.
 *
 * Для file сохраняется только PPR-ключ, продублированный в api_key: бэкенд
 * читает его именно оттуда. Если ключа нет — сохраняется null.
 *
 * @param {string} connectionType - тип подключения
 * @param {object} connectionSettings - настройки из формы
 * @returns {object|null} Значение для поля connection_settings
 */
export const buildConnectionSettings = (connectionType, connectionSettings) => {
  if (connectionType === 'firebird' || connectionType === 'api' || connectionType === 'web') {
    return connectionSettings
  }

  const pprApiKey = extractPprKey(connectionSettings)
  if (pprApiKey && pprApiKey.trim()) {
    return {
      ppr_api_key: pprApiKey.trim(),
      api_key: pprApiKey.trim()
    }
  }
  return null
}

/**
 * Порядок секций редактора на экране и условие показа каждой.
 *
 * Единственный источник правды о том, какие шаги видит пользователь при
 * данном типе подключения. Номера шагов не хранятся: они выводятся из этого
 * списка, поэтому у любого типа получается сквозная нумерация 1..N без
 * пропусков и дублей.
 *
 * Три блока настроек подключения (api, web, firebird) взаимоисключающие —
 * одновременно рендерится ровно один, поэтому у них общий id и общий номер.
 */
const STEP_ORDER = [
  { id: 'file-upload', visible: ({ type }) => type === 'file' },
  { id: 'connection-type', visible: () => true },
  { id: 'connection-settings', visible: ({ type }) => type === 'api' || type === 'web' || type === 'firebird' },
  { id: 'firebird-source', visible: ({ type }) => type === 'firebird' },
  { id: 'basic-info', visible: () => true },
  { id: 'file-parsing', visible: ({ type, hasFileColumns }) => type === 'file' && hasFileColumns },
  { id: 'ppr-key', visible: () => true },
  {
    id: 'field-mapping',
    visible: ({ type, hasFileColumns }) =>
      (type === 'file' && hasFileColumns) || type === 'firebird' || type === 'api' || type === 'web'
  },
  { id: 'activation', visible: () => true },
  { id: 'auto-load', visible: ({ type }) => type === 'firebird' || type === 'api' || type === 'web' }
]

export const STEP_IDS = STEP_ORDER.map(step => step.id)

/**
 * Список id видимых шагов в порядке появления на экране.
 *
 * @param {object} state
 * @param {string} state.connectionType - тип подключения шаблона
 * @param {boolean} state.hasFileColumns - разобран ли пример файла
 * @returns {string[]} id видимых шагов в порядке рендера
 */
export const visibleStepIds = ({ connectionType, hasFileColumns }) =>
  STEP_ORDER
    .filter(step => step.visible({ type: connectionType, hasFileColumns: Boolean(hasFileColumns) }))
    .map(step => step.id)

/**
 * Номера видимых шагов для показа на экране.
 *
 * Скрытые шаги в результат не попадают, поэтому обращение к ним даёт
 * undefined — у скрытой секции номера и не должно быть.
 *
 * @param {object} state - то же, что у visibleStepIds
 * @returns {Object<string, number>} id шага -> его номер, начиная с 1
 */
export const stepNumbers = (state) =>
  Object.fromEntries(visibleStepIds(state).map((id, index) => [id, index + 1]))

/**
 * Настройки подключения при смене его типа.
 *
 * Набор полей у каждого типа свой, поэтому прежние настройки не сохраняются —
 * кроме ключа PPR API: он к типу подключения не относится и переносится.
 *
 * Эти же наборы полей отдаёт defaultsFor при разборе шаблона, но в обработчике
 * смены типа они были выписаны заново, ветка за ветку.
 *
 * @param {string} connectionType - новый тип подключения
 * @param {object} currentSettings - настройки до смены типа
 * @returns {object} Настройки для формы
 */
export const settingsForConnectionType = (connectionType, currentSettings) => {
  const pprApiKey = extractPprKey(currentSettings) || ''

  if (connectionType === 'file') {
    // У файла ключ дублируется в api_key: бэкенд читает его именно оттуда.
    return { ppr_api_key: pprApiKey, api_key: pprApiKey }
  }

  return { ...defaultsFor(connectionType, true), ppr_api_key: pprApiKey }
}
