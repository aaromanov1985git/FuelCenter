import { describe, it, expect } from 'vitest'
import {
  SYSTEM_FIELDS,
  formatSchedule,
  extractPprKey,
  parseConnectionSettings,
  buildConnectionSettings,
  PPR_KEY_ALIASES,
  STEP_IDS,
  visibleStepIds,
  stepNumbers,
  settingsForConnectionType
} from '../templateModel'

/**
 * Формы взяты из provider_templates на 10.35.0.60 (11.09.2026): наборы ключей
 * настоящие, значения заменены на плейсхолдеры. Это страховка перед разрезанием
 * редактора: тесты закрепляют поведение ДО рефакторинга, а не описывают желаемое.
 */
const FIXTURES = {
  // id 1, 2 — файловые: только api_key
  file: { api_key: 'PPR-FILE-KEY' },

  // id 3, 4 — firebird: все три алиаса ключа плюс ppr_api_key
  firebird: {
    host: 'db.example.local',
    database: '/data/base.fdb',
    user: 'SYSDBA',
    password: 'encrypted:xxx',
    port: 3050,
    charset: 'UTF8',
    api_key: 'PPR-FB',
    apiKey: 'PPR-FB',
    ppr_api_key: 'PPR-FB',
    'КлючАвторизации': 'PPR-FB'
  },

  // id 5 — api/petrolplus
  apiPetrolplus: {
    provider_type: 'petrolplus',
    base_url: 'https://online.petrolplus.ru/api',
    api_token: 'encrypted:token',
    currency: 'RUB',
    api_key: 'PPR-PP',
    apiKey: 'PPR-PP',
    ppr_api_key: 'PPR-PP',
    'КлючАвторизации': 'PPR-PP'
  },

  // id 12 — api/rncard: ppr_api_key ОТСУТСТВУЕТ
  apiRncard: {
    provider_type: 'rncard',
    base_url: 'https://lkapi.rn-card.ru',
    login: 'user',
    password: 'encrypted:pwd',
    contract: 'C-1',
    currency: 'RUB',
    use_md5_hash: true,
    api_key: 'PPR-RN',
    apiKey: 'PPR-RN',
    'КлючАвторизации': 'PPR-RN'
  },

  // id 14 — api/gpn: есть И pprApiKey, И ppr_api_key; api_key — ключ САМОГО API
  apiGpn: {
    provider_type: 'gpn',
    base_url: 'https://api.opti-24.ru',
    login: 'user@example.com',
    password: 'encrypted:pwd',
    currency: 'RUB',
    api_key: 'GPN-OWN-API-KEY',
    apiKey: 'GPN-OWN-API-KEY',
    ppr_api_key: 'PPR-GPN',
    pprApiKey: 'PPR-GPN',
    'КлючАвторизации': 'GPN-OWN-API-KEY'
  },

  // id 11 — web: ppr_api_key ОТСУТСТВУЕТ, ключ только в алиасах
  webNoPpr: {
    base_url: 'http://web.example.local:8080',
    username: 'user',
    endpoint: '/svc',
    key: 'K',
    signature: 'S',
    salt: 'SA',
    pos_code: 'P',
    cod_azs: 1000001,
    currency: 'RUB',
    certificate: 'encrypted:cert',
    xml_api_certificate: 'encrypted:cert',
    xml_api_endpoint: '/xml',
    xml_api_pos_code: 'P',
    api_key: 'PPR-WEB',
    apiKey: 'PPR-WEB',
    'КлючАвторизации': 'PPR-WEB'
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o))

describe('SYSTEM_FIELDS', () => {
  it('содержит семь полей системы', () => {
    expect(SYSTEM_FIELDS).toHaveLength(7)
  })

  it('обязательными помечены дата, количество и вид топлива', () => {
    const required = SYSTEM_FIELDS.filter((f) => f.required).map((f) => f.key)
    expect(required).toEqual(['date', 'quantity', 'fuel'])
  })
})

describe('formatSchedule', () => {
  it('возвращает null для пустого расписания', () => {
    expect(formatSchedule('')).toBeNull()
    expect(formatSchedule('   ')).toBeNull()
    expect(formatSchedule(null)).toBeNull()
  })

  it('понимает простые форматы', () => {
    expect(formatSchedule('daily')).toBe('один раз в сутки (в 2:00)')
    expect(formatSchedule('hourly')).toBe('один раз в час')
    expect(formatSchedule('weekly')).toBe('один раз в неделю (понедельник в 2:00)')
  })

  it('понимает cron каждый день в заданное время', () => {
    expect(formatSchedule('0 2 * * *')).toBe('один раз в сутки (в 02:00)')
    expect(formatSchedule('30 14 * * *')).toBe('один раз в сутки (в 14:30)')
  })

  it('понимает cron каждый час и каждые N часов', () => {
    expect(formatSchedule('0 * * * *')).toBe('один раз в час')
    expect(formatSchedule('0 */1 * * *')).toBe('один раз в час')
    expect(formatSchedule('0 */6 * * *')).toBe('каждые 6 часа')
  })

  it('понимает формат every N unit', () => {
    expect(formatSchedule('every 1 hour')).toBe('один раз в час')
    expect(formatSchedule('every 3 hours')).toBe('каждые 3 часа')
    expect(formatSchedule('every 1 minute')).toBe('каждую минуту')
  })

  it('нераспознанное расписание возвращает как есть', () => {
    expect(formatSchedule('0 0 1 1 1')).toBe('0 0 1 1 1')
    expect(formatSchedule('что-то своё')).toBe('что-то своё')
  })
})

describe('extractPprKey', () => {
  it('перебирает алиасы в порядке приоритета', () => {
    expect(PPR_KEY_ALIASES[0]).toBe('ppr_api_key')
    expect(extractPprKey({ ppr_api_key: 'A', api_key: 'B' })).toBe('A')
    expect(extractPprKey({ pprApiKey: 'A', api_key: 'B' })).toBe('A')
    expect(extractPprKey({ api_key: 'B', apiKey: 'C' })).toBe('B')
  })

  it('находит ключ в русском имени, когда других нет', () => {
    expect(extractPprKey({ 'КлючАвторизации': 'RU' })).toBe('RU')
  })

  it('возвращает пустую строку, когда ключа нет', () => {
    expect(extractPprKey({})).toBe('')
    expect(extractPprKey(null)).toBe('')
    expect(extractPprKey('строка')).toBe('')
  })
})

describe('parseConnectionSettings — настройки отсутствуют', () => {
  it('для api отдаёт дефолты PetrolPlus без ppr_api_key', () => {
    const r = parseConnectionSettings(null, 'api')
    expect(r.provider_type).toBe('petrolplus')
    expect(r).not.toHaveProperty('ppr_api_key')
  })

  it('для file отдаёт только пустой api_key', () => {
    expect(parseConnectionSettings(null, 'file')).toEqual({ api_key: '' })
  })

  it('для firebird отдаёт дефолты подключения', () => {
    const r = parseConnectionSettings(undefined, 'firebird')
    expect(r.host).toBe('localhost')
    expect(r.port).toBe(3050)
  })
})

describe('parseConnectionSettings — реальные формы из базы', () => {
  it('file: из всего набора остаётся только PPR-ключ, продублированный в api_key', () => {
    const r = parseConnectionSettings(JSON.stringify(FIXTURES.file), 'file')
    expect(r).toEqual({ ppr_api_key: 'PPR-FILE-KEY', api_key: 'PPR-FILE-KEY' })
  })

  it('web без ppr_api_key (id 11): ключ восстанавливается из алиаса', () => {
    const r = parseConnectionSettings(JSON.stringify(FIXTURES.webNoPpr), 'web')
    expect(r.ppr_api_key).toBe('PPR-WEB')
  })

  it('rncard без ppr_api_key (id 12): ключ восстанавливается из алиаса', () => {
    const r = parseConnectionSettings(JSON.stringify(FIXTURES.apiRncard), 'api')
    expect(r.ppr_api_key).toBe('PPR-RN')
    expect(r.use_md5_hash).toBe(true)
  })

  it('gpn (id 14): api_key провайдера НЕ подменяется PPR-ключом', () => {
    const r = parseConnectionSettings(JSON.stringify(FIXTURES.apiGpn), 'api')
    expect(r.api_key).toBe('GPN-OWN-API-KEY')
    expect(r.ppr_api_key).toBe('PPR-GPN')
  })

  it('firebird: параметры подключения сохраняются целиком', () => {
    const r = parseConnectionSettings(JSON.stringify(FIXTURES.firebird), 'firebird')
    expect(r.host).toBe('db.example.local')
    expect(r.database).toBe('/data/base.fdb')
    expect(r.port).toBe(3050)
    expect(r.ppr_api_key).toBe('PPR-FB')
  })

  it('нераспознанный JSON у api/gpn отдаёт дефолты ГПН', () => {
    const r = parseConnectionSettings('{провалится', 'api')
    expect(r.provider_type).toBe('petrolplus')
    expect(r.ppr_api_key).toBe('')
  })
})

describe('buildConnectionSettings', () => {
  it('firebird, api и web уходят на сервер без изменений', () => {
    for (const type of ['firebird', 'api', 'web']) {
      const src = clone(FIXTURES.firebird)
      expect(buildConnectionSettings(type, src)).toBe(src)
    }
  })

  it('file сохраняет только PPR-ключ, продублированный в api_key', () => {
    expect(buildConnectionSettings('file', { ppr_api_key: '  K  ' })).toEqual({
      ppr_api_key: 'K',
      api_key: 'K'
    })
  })

  it('file без ключа сохраняет null, а не пустой объект', () => {
    expect(buildConnectionSettings('file', { ppr_api_key: '   ' })).toBeNull()
    expect(buildConnectionSettings('file', {})).toBeNull()
    expect(buildConnectionSettings('file', null)).toBeNull()
  })
})

describe('инвариант: разбор и обратная сборка не теряют ключи', () => {
  const cases = [
    ['file', FIXTURES.file, 'PPR-FILE-KEY'],
    ['firebird', FIXTURES.firebird, 'PPR-FB'],
    ['api', FIXTURES.apiPetrolplus, 'PPR-PP'],
    ['api', FIXTURES.apiRncard, 'PPR-RN'],
    ['api', FIXTURES.apiGpn, 'PPR-GPN'],
    ['web', FIXTURES.webNoPpr, 'PPR-WEB']
  ]

  it.each(cases)('%s: PPR-ключ переживает цикл разбор → сборка', (type, fixture, expectedKey) => {
    const parsed = parseConnectionSettings(JSON.stringify(fixture), type)
    const built = buildConnectionSettings(type, parsed)
    expect(extractPprKey(built)).toBe(expectedKey)
  })

  it('gpn: собственный ключ API провайдера переживает цикл', () => {
    const parsed = parseConnectionSettings(JSON.stringify(FIXTURES.apiGpn), 'api')
    const built = buildConnectionSettings('api', parsed)
    expect(built.api_key).toBe('GPN-OWN-API-KEY')
  })

  it('firebird: параметры подключения переживают цикл', () => {
    const parsed = parseConnectionSettings(JSON.stringify(FIXTURES.firebird), 'firebird')
    const built = buildConnectionSettings('firebird', parsed)
    expect(built.host).toBe('db.example.local')
    expect(built.database).toBe('/data/base.fdb')
    expect(built.user).toBe('SYSDBA')
  })
})

/**
 * Нумерация шагов. До этого этапа номера были вписаны в разметку и врали при
 * каждом типе подключения: file видел 1, 2, 4, 5, 6.5, 7, остальные начинались
 * с 2 и имели две секции под номером 2. Здесь закреплено главное свойство —
 * что бы ни показывалось, номера идут 1..N без пропусков, дублей и дробей.
 */
describe('нумерация шагов редактора', () => {
  const states = [
    ['file без разобранного файла', { connectionType: 'file', hasFileColumns: false }],
    ['file с разобранным файлом', { connectionType: 'file', hasFileColumns: true }],
    ['firebird', { connectionType: 'firebird', hasFileColumns: false }],
    ['api', { connectionType: 'api', hasFileColumns: false }],
    ['web', { connectionType: 'web', hasFileColumns: false }]
  ]

  it.each(states)('%s: номера идут 1..N без пропусков и дублей', (_name, state) => {
    const numbers = Object.values(stepNumbers(state))
    const visible = visibleStepIds(state)

    expect(numbers).toEqual(Array.from({ length: visible.length }, (_, i) => i + 1))
  })

  it.each(states)('%s: порядок шагов не расходится с порядком в реестре', (_name, state) => {
    const visible = visibleStepIds(state)
    const positions = visible.map(id => STEP_IDS.indexOf(id))

    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions).not.toContain(-1)
  })

  it('у скрытого шага номера нет', () => {
    const fileState = { connectionType: 'file', hasFileColumns: true }

    // Настройки подключения и автозагрузка файловому шаблону не показываются.
    expect(stepNumbers(fileState)['connection-settings']).toBeUndefined()
    expect(stepNumbers(fileState)['auto-load']).toBeUndefined()
  })

  it('первым шагом у file идёт выбор файла, у остальных — тип подключения', () => {
    expect(visibleStepIds({ connectionType: 'file', hasFileColumns: false })[0]).toBe('file-upload')
    expect(visibleStepIds({ connectionType: 'firebird', hasFileColumns: false })[0]).toBe('connection-type')
    expect(visibleStepIds({ connectionType: 'api', hasFileColumns: false })[0]).toBe('connection-type')
    expect(visibleStepIds({ connectionType: 'web', hasFileColumns: false })[0]).toBe('connection-type')
  })

  it('сопоставление полей у file появляется только после разбора примера', () => {
    expect(visibleStepIds({ connectionType: 'file', hasFileColumns: false })).not.toContain('field-mapping')
    expect(visibleStepIds({ connectionType: 'file', hasFileColumns: true })).toContain('field-mapping')
  })

  it('разбор примера файла не влияет на нефайловые типы', () => {
    for (const type of ['firebird', 'api', 'web']) {
      expect(visibleStepIds({ connectionType: type, hasFileColumns: false }))
        .toEqual(visibleStepIds({ connectionType: type, hasFileColumns: true }))
    }
  })
})

/**
 * Смена типа подключения. Наборы полей у типов не пересекаются, поэтому прежние
 * настройки сбрасываются — кроме ключа PPR API, который к типу не относится.
 */
describe('настройки при смене типа подключения', () => {
  const withKey = { ppr_api_key: 'PPR-CARRIED', host: 'db.example.local', database: '/data/base.fdb' }

  it.each([
    ['api', ['provider_type', 'base_url', 'api_token', 'currency', 'api_key', 'ppr_api_key']],
    ['firebird', ['host', 'database', 'user', 'password', 'port', 'charset', 'api_key', 'ppr_api_key']],
    ['web', ['base_url', 'username', 'password', 'currency', 'certificate', 'pos_code', 'key', 'signature', 'salt', 'cod_azs', 'api_key', 'ppr_api_key']],
    ['file', ['ppr_api_key', 'api_key']]
  ])('%s: набор полей совпадает с ожидаемым', (type, keys) => {
    expect(Object.keys(settingsForConnectionType(type, {})).sort()).toEqual([...keys].sort())
  })

  it.each(['api', 'firebird', 'web', 'file'])('%s: ключ PPR переносится', (type) => {
    expect(settingsForConnectionType(type, withKey).ppr_api_key).toBe('PPR-CARRIED')
  })

  it('у файла ключ дублируется в api_key, у остальных типов api_key пуст', () => {
    expect(settingsForConnectionType('file', withKey).api_key).toBe('PPR-CARRIED')
    for (const type of ['api', 'firebird', 'web']) {
      expect(settingsForConnectionType(type, withKey).api_key).toBe('')
    }
  })

  it('ключ берётся из любого своего алиаса', () => {
    for (const alias of PPR_KEY_ALIASES) {
      expect(settingsForConnectionType('firebird', { [alias]: 'K' }).ppr_api_key).toBe('K')
    }
  })

  it('прежние настройки прошлого типа не протекают', () => {
    const fromFirebird = settingsForConnectionType('api', withKey)
    expect(fromFirebird.host).toBeUndefined()
    expect(fromFirebird.database).toBeUndefined()
  })

  it('без ключа он пустой, а не undefined', () => {
    expect(settingsForConnectionType('firebird', {}).ppr_api_key).toBe('')
    expect(settingsForConnectionType('file', {}).api_key).toBe('')
  })
})

/**
 * Объектный путь parseConnectionSettings. Именно он и работает в жизни: схема
 * ответа ProviderTemplateResponse отдаёт connection_settings уже словарём (и
 * расшифровывает пароли), так что редактор передаёт сюда объект, а не строку.
 * Все прежние тесты передавали строку, поэтому этот путь оставался непокрытым.
 */
describe('parseConnectionSettings — на входе объект', () => {
  it('не трогает переданный объект', () => {
    const settings = clone(FIXTURES.webNoPpr)
    const before = clone(settings)

    parseConnectionSettings(settings, 'web')

    expect(settings).toEqual(before)
  })

  it('не трогает переданный объект и для файла', () => {
    const settings = clone(FIXTURES.file)
    const before = clone(settings)

    parseConnectionSettings(settings, 'file')

    expect(settings).toEqual(before)
  })

  it('возвращает не тот же объект, что передали', () => {
    const settings = clone(FIXTURES.firebird)

    expect(parseConnectionSettings(settings, 'firebird')).not.toBe(settings)
  })

  it('даёт тот же результат, что и разбор той же формы из строки', () => {
    for (const [type, fixture] of [
      ['web', FIXTURES.webNoPpr],
      ['api', FIXTURES.apiRncard],
      ['api', FIXTURES.apiGpn],
      ['firebird', FIXTURES.firebird],
      ['file', FIXTURES.file]
    ]) {
      const fromObject = parseConnectionSettings(clone(fixture), type)
      const fromString = parseConnectionSettings(JSON.stringify(fixture), type)
      expect(fromObject).toEqual(fromString)
    }
  })

  it('повторный разбор одной и той же формы даёт одно и то же', () => {
    // Пока объект мутировался, второй разбор шёл по другой ветке: ключ уже был
    // восстановлен из алиаса, и условия его восстановления больше не срабатывали.
    const settings = clone(FIXTURES.webNoPpr)

    const first = parseConnectionSettings(settings, 'web')
    const second = parseConnectionSettings(settings, 'web')

    expect(second).toEqual(first)
  })
})
