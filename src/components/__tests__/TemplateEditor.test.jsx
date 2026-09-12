/**
 * Тесты рендера редактора шаблонов.
 *
 * Страховка перед разрезанием редактора на компоненты: проверяют, что набор
 * секций на экране и их нумерация не меняются при переносе разметки. Модель
 * шагов отдельно покрыта в src/utils/__tests__/templateModel.test.js — здесь
 * сверяется именно отрисованный DOM с этой моделью.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import TemplateEditor from '../TemplateEditor'
import { visibleStepIds } from '../../utils/templateModel'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

// Секция ключа PPR показывает подтверждение копирования через тост приложения,
// а useToast без ToastProvider бросает исключение.
const mockToastSuccess = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: mockToastSuccess, error: vi.fn() })
}))

/**
 * Рендер с ожиданием загрузки видов топлива: без act состояние доезжает после
 * проверок и React ругается предупреждением.
 */
const renderEditor = async (template) => {
  let result
  await act(async () => {
    result = render(
      <TemplateEditor
        providerId={1}
        template={template}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
  })
  return result
}

/** Номера шагов в порядке появления в DOM. */
const renderedStepNumbers = (container) =>
  Array.from(container.querySelectorAll('.step-number')).map(el => el.textContent)

describe('TemplateEditor: нумерация шагов на экране', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Редактор при монтировании тянет только виды топлива.
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const cases = [
    ['file, пример не разобран', { connection_type: 'file' }, false],
    // field_mapping заполняет fileColumns, как если бы пример уже разобрали.
    ['file, пример разобран', { connection_type: 'file', field_mapping: { card_number: 'Номер карты' } }, true],
    ['firebird', { connection_type: 'firebird' }, false],
    ['api', { connection_type: 'api' }, false],
    ['web', { connection_type: 'web' }, false]
  ]

  it.each(cases)('%s: на экране номера 1..N без пропусков и дублей', async (_name, template) => {
    const { container } = await renderEditor(template)
    const numbers = renderedStepNumbers(container)

    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers).toEqual(numbers.map((_, i) => String(i + 1)))
  })

  it.each(cases)('%s: число секций на экране совпадает с моделью', async (_name, template, hasFileColumns) => {
    const { container } = await renderEditor(template)
    const expected = visibleStepIds({
      connectionType: template.connection_type,
      hasFileColumns
    })

    expect(renderedStepNumbers(container)).toHaveLength(expected.length)
  })

  it.each(cases)('%s: пустых кружков нет', async (_name, template) => {
    const { container } = await renderEditor(template)

    // Опечатка в ключе шага дала бы кружок без номера.
    for (const number of renderedStepNumbers(container)) {
      expect(number).toMatch(/^\d+$/)
    }
  })

  it.each(cases)('%s: у каждой секции верхнего уровня есть заголовок с номером', async (_name, template) => {
    const { container } = await renderEditor(template)

    // Только секции верхнего уровня: вложенные группы полей шагами не являются.
    const form = container.querySelector('.template-form')
    const sections = form.querySelectorAll(':scope > .form-section')
    const titled = Array.from(sections).filter(section =>
      section.querySelector(':scope > .section-title > .step-number')
    )

    // Секция без нумерованного заголовка читалась бы как выпавшая из
    // последовательности — до этапа 5а такими были активация и автозагрузка.
    expect(titled).toHaveLength(sections.length)
  })

  it('file не показывает настройки подключения и автозагрузку', async () => {
    await renderEditor({ connection_type: 'file' })

    expect(screen.queryByText(/Настройки подключения/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Настройки автоматической загрузки/)).not.toBeInTheDocument()
  })

  it('firebird показывает подключение, источник данных и автозагрузку', async () => {
    await renderEditor({ connection_type: 'firebird' })

    expect(screen.getByText(/Настройки подключения к Firebird/)).toBeInTheDocument()
    expect(screen.getByText(/Источник данных в Firebird/)).toBeInTheDocument()
    expect(screen.getByText(/Настройки автоматической загрузки/)).toBeInTheDocument()
  })
})

/**
 * Имя таблицы и SQL-запрос — взаимоисключающие источники данных, запрос имеет
 * приоритет. Имя таблицы велось в двух состояниях сразу (formData.source_table и
 * отдельное selectedTable), а ввод запроса очищал только первое: список таблиц
 * продолжал показывать прежнюю таблицу, а кнопка «Загрузить колонки» оставалась
 * доступной и грузила колонки покинутой таблицы.
 */
describe('TemplateEditor: источник данных Firebird', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const tableInput = () => screen.getByPlaceholderText(/введите имя таблицы вручную/i)
  const loadColumnsButton = () => screen.getByTitle('Загрузить колонки выбранной таблицы')
  const queryInput = () => screen.getByPlaceholderText(/^SELECT/)

  it('имя таблицы из шаблона показано, кнопка колонок доступна', async () => {
    await renderEditor({ connection_type: 'firebird', source_table: 'rgAmountRests' })

    expect(tableInput()).toHaveValue('rgAmountRests')
    expect(loadColumnsButton()).toBeEnabled()
  })

  it('ввод SQL-запроса очищает имя таблицы и запирает кнопку колонок', async () => {
    await renderEditor({ connection_type: 'firebird', source_table: 'rgAmountRests' })

    await act(async () => {
      fireEvent.change(queryInput(), { target: { value: 'SELECT 1 FROM "dcCards"' } })
    })

    expect(tableInput()).toHaveValue('')
    expect(loadColumnsButton()).toBeDisabled()
  })

  it('без имени таблицы кнопка колонок заперта', async () => {
    await renderEditor({ connection_type: 'firebird' })

    expect(tableInput()).toHaveValue('')
    expect(loadColumnsButton()).toBeDisabled()
  })

  it('ввод имени таблицы вручную отпирает кнопку колонок', async () => {
    await renderEditor({ connection_type: 'firebird' })

    await act(async () => {
      fireEvent.change(tableInput(), { target: { value: 'dcCards' } })
    })

    expect(tableInput()).toHaveValue('dcCards')
    expect(loadColumnsButton()).toBeEnabled()
  })
})

/**
 * Ключ PPR API живёт под пятью историческими именами. Кнопка копирования
 * проверяла только три из них (api_key, apiKey, КлючАвторизации) и не видела
 * ppr_api_key с pprApiKey, тогда как само поле и обработчик копирования читали
 * всю цепочку. У Газпром-нефти это проявлялось в полный рост: там api_key занят
 * ключом самого API провайдера, поэтому ключ PPR ложится только в ppr_api_key —
 * и скопировать его было нельзя.
 */
describe('TemplateEditor: ключ PPR API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const keyInput = () => screen.getByPlaceholderText('Введите API ключ для PPR API')
  const copyButton = () => screen.getByTitle('Скопировать ключ в буфер обмена')
  const generateButton = () => screen.getByTitle('Сгенерировать новый случайный ключ')

  it('ключ только в ppr_api_key: поле показывает его, копирование доступно', async () => {
    await renderEditor({
      connection_type: 'api',
      connection_settings: JSON.stringify({
        provider_type: 'gpn',
        base_url: 'https://api.opti-24.ru',
        api_key: 'GPN-OWN-API-KEY',
        ppr_api_key: 'PPR-ONLY-KEY'
      })
    })

    expect(keyInput()).toHaveValue('PPR-ONLY-KEY')
    expect(copyButton()).toBeEnabled()
  })

  it('без ключа копирование заперто', async () => {
    await renderEditor({
      connection_type: 'api',
      connection_settings: JSON.stringify({ provider_type: 'gpn', base_url: 'https://api.opti-24.ru' })
    })

    expect(keyInput()).toHaveValue('')
    expect(copyButton()).toBeDisabled()
  })

  it('созданный ключ попадает в поле и отпирает копирование', async () => {
    await renderEditor({
      connection_type: 'api',
      connection_settings: JSON.stringify({ provider_type: 'gpn', base_url: 'https://api.opti-24.ru' })
    })

    await act(async () => {
      fireEvent.click(generateButton())
    })

    expect(keyInput().value).toHaveLength(32)
    expect(copyButton()).toBeEnabled()
  })

  it('ключ ГПН для самого API не подменяется ключом PPR', async () => {
    await renderEditor({
      connection_type: 'api',
      connection_settings: JSON.stringify({
        provider_type: 'gpn',
        base_url: 'https://api.opti-24.ru',
        api_key: 'GPN-OWN-API-KEY',
        ppr_api_key: 'PPR-ONLY-KEY'
      })
    })

    await act(async () => {
      fireEvent.click(generateButton())
    })

    // Поле ключа ГПН стоит в секции подключения и должно сохранить своё значение.
    expect(screen.getByPlaceholderText(/^GPN\./)).toHaveValue('GPN-OWN-API-KEY')
  })
})

/**
 * Смещения дат автозагрузки. У начальной даты обработчик был
 * `parseInt(value) || -7`, а ноль ложный — поэтому 0 отскакивал на -7, хотя
 * max="0" его разрешает, а подсказка под полями объясняет, что 0 значит текущую
 * дату. У конечной даты ноль обрабатывался правильно.
 */
describe('TemplateEditor: смещения дат автозагрузки', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const enabledTemplate = {
    connection_type: 'firebird',
    auto_load_enabled: true,
    auto_load_schedule: '0 2 * * *'
  }

  const fromOffset = () => screen.getByLabelText(/Смещение начальной даты/)
  const toOffset = () => screen.getByLabelText(/Смещение конечной даты/)

  it('ноль в смещении начальной даты сохраняется', async () => {
    await renderEditor(enabledTemplate)

    await act(async () => {
      fireEvent.change(fromOffset(), { target: { value: '0' } })
    })

    expect(fromOffset()).toHaveValue(0)
  })

  it('ноль в смещении конечной даты сохраняется', async () => {
    await renderEditor(enabledTemplate)

    await act(async () => {
      fireEvent.change(toOffset(), { target: { value: '0' } })
    })

    expect(toOffset()).toHaveValue(0)
  })

  it('пустое поле возвращает значение по умолчанию для своего смещения', async () => {
    await renderEditor(enabledTemplate)

    await act(async () => {
      fireEvent.change(fromOffset(), { target: { value: '' } })
      fireEvent.change(toOffset(), { target: { value: '' } })
    })

    expect(fromOffset()).toHaveValue(-7)
    expect(toOffset()).toHaveValue(-1)
  })

  it('отрицательное смещение сохраняется как введено', async () => {
    await renderEditor(enabledTemplate)

    await act(async () => {
      fireEvent.change(fromOffset(), { target: { value: '-30' } })
    })

    expect(fromOffset()).toHaveValue(-30)
  })

  it('расписание показано человеческим текстом', async () => {
    await renderEditor(enabledTemplate)

    expect(screen.getByText(/Автоматическая загрузка включена/)).toBeInTheDocument()
    expect(screen.getByText(/один раз в сутки/)).toBeInTheDocument()
  })
})

describe('TemplateEditor: сопоставление полей', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  it('у файла источник выбирается только списком, без ручного ввода', async () => {
    await renderEditor({
      connection_type: 'file',
      field_mapping: { card_number: 'Номер карты' }
    })

    expect(screen.getByText('Сопоставление полей')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Или введите имя поля')).not.toBeInTheDocument()
  })

  it('у остальных типов рядом со списком есть ручной ввод для каждого поля', async () => {
    await renderEditor({ connection_type: 'firebird' })

    const manualInputs = screen.getAllByPlaceholderText('Или введите имя поля')
    const rows = document.querySelectorAll('.mapping-table tbody tr')

    // По одному полю ручного ввода на каждую строку таблицы сопоставления.
    expect(manualInputs).toHaveLength(rows.length)
  })

  it('заголовок колонки источника зависит от типа подключения', async () => {
    await renderEditor({ connection_type: 'firebird' })
    expect(screen.getByText('Поле из БД Firebird')).toBeInTheDocument()
  })
})

/**
 * Визуальный редактор маппинга видов топлива. Он пересобирал список пар из
 * текста при каждом изменении текста, а неполные пары в текст не попадают:
 * при пустом маппинге «+ Добавить запись» добавляла строку, текст становился
 * «{}», эффект срабатывал и строку стирал.
 */
describe('TemplateEditor: маппинг видов топлива', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const toggleButton = () => screen.getByText(/Визуальный редактор/)
  const addButton = () => screen.getByText(/Добавить запись/)
  const keyInputs = () => screen.queryAllByPlaceholderText('Исходное название (из БД)')

  it('на пустом маппинге добавленная запись остаётся на экране', async () => {
    await renderEditor({ connection_type: 'firebird' })

    await act(async () => {
      fireEvent.click(toggleButton())
    })
    expect(keyInputs()).toHaveLength(0)

    await act(async () => {
      fireEvent.click(addButton())
    })

    expect(keyInputs()).toHaveLength(1)
  })

  it('запись переживает ввод одного только ключа', async () => {
    await renderEditor({ connection_type: 'firebird' })

    await act(async () => {
      fireEvent.click(toggleButton())
    })
    await act(async () => {
      fireEvent.click(addButton())
    })
    await act(async () => {
      fireEvent.change(keyInputs()[0], { target: { value: 'Дизельное топливо' } })
    })

    expect(keyInputs()).toHaveLength(1)
    expect(keyInputs()[0]).toHaveValue('Дизельное топливо')
  })

  it('маппинг из шаблона показывается в визуальном редакторе', async () => {
    await renderEditor({
      connection_type: 'firebird',
      fuel_type_mapping: { 'Дизельное топливо': 'ДТ', 'Бензин': 'АИ-92' }
    })

    await act(async () => {
      fireEvent.click(toggleButton())
    })

    expect(keyInputs()).toHaveLength(2)
  })

  it('текстовый редактор показывает маппинг шаблона как JSON', async () => {
    await renderEditor({
      connection_type: 'firebird',
      fuel_type_mapping: { 'Дизельное топливо': 'ДТ' }
    })

    expect(screen.getByText(/Маппинг видов топлива/)).toBeInTheDocument()
    expect(document.querySelector('.fuel-mapping-json')).toHaveValue(
      JSON.stringify({ 'Дизельное топливо': 'ДТ' }, null, 2)
    )
  })
})

/**
 * Смена типа подключения сбрасывает настройки: наборы полей у типов не
 * пересекаются. Переносится только ключ PPR API — он к типу не относится.
 */
describe('TemplateEditor: смена типа подключения', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const typeSelect = () => screen.getByLabelText(/Тип подключения/)

  it('ключ PPR переносится, а настройки прежнего типа уходят', async () => {
    await renderEditor({
      connection_type: 'api',
      connection_settings: JSON.stringify({
        provider_type: 'petrolplus',
        base_url: 'https://online.petrolplus.ru/api',
        api_token: 'TOKEN',
        ppr_api_key: 'PPR-CARRIED'
      })
    })

    await act(async () => {
      fireEvent.change(typeSelect(), { target: { value: 'firebird' } })
    })

    expect(screen.getByPlaceholderText('Введите API ключ для PPR API')).toHaveValue('PPR-CARRIED')
    expect(screen.getByPlaceholderText('localhost')).toHaveValue('localhost')
    expect(screen.queryByPlaceholderText('Ваш API токен')).not.toBeInTheDocument()
  })

  it('смена типа меняет набор показанных шагов', async () => {
    const { container } = await renderEditor({ connection_type: 'firebird' })
    const before = container.querySelectorAll('.step-number').length

    await act(async () => {
      fireEvent.change(typeSelect(), { target: { value: 'file' } })
    })
    const after = Array.from(container.querySelectorAll('.step-number')).map(el => el.textContent)

    // У файла без разобранного примера шагов меньше, и нумерация снова сквозная.
    expect(after.length).toBeLessThan(before)
    expect(after).toEqual(after.map((_, i) => String(i + 1)))
  })
})

/**
 * Что редактор говорит о сохранённом сопоставлении. Колонки источника у
 * сохранённого шаблона восстанавливаются из самого сопоставления, и раньше этот
 * набор подавался как результат свежего разбора файла.
 */
describe('TemplateEditor: сохранённое сопоставление', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  })

  const savedMapping = { date: 'Дата', quantity: 'Литры', fuel: 'Топливо' }

  it('сохранённое сопоставление помечено как сделанное вручную, а не автоматически', async () => {
    await renderEditor({ connection_type: 'firebird', field_mapping: savedMapping })

    expect(screen.queryAllByText('Авто')).toHaveLength(0)
    expect(screen.getAllByText('Вручную')).toHaveLength(Object.keys(savedMapping).length)
  })

  it('у файлового шаблона не сообщается о разборе файла, которого не было', async () => {
    await renderEditor({ connection_type: 'file', field_mapping: savedMapping })

    expect(screen.queryByText(/Файл проанализирован/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Автоматически сопоставлено полей/)).not.toBeInTheDocument()
  })

  it('сохранённое сопоставление всё равно видно в таблице', async () => {
    await renderEditor({ connection_type: 'firebird', field_mapping: savedMapping })

    const selects = document.querySelectorAll('.mapping-table select')
    const values = Array.from(selects).map(el => el.value).filter(Boolean)
    expect(values.sort()).toEqual(['Дата', 'Литры', 'Топливо'])
  })
})

/**
 * Положительный путь отметки «Авто»: она ставится по итогам разбора примера
 * файла — и только по нему.
 */
describe('TemplateEditor: разбор примера файла', () => {
  const ANALYSIS = {
    columns: ['Дата', 'Литры', 'Топливо'],
    field_mapping: { date: 'Дата', quantity: 'Литры' },
    header_row: 2,
    data_start_row: 3
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockImplementation((url) => {
      if (String(url).includes('/templates/analyze')) {
        return Promise.resolve({ ok: true, json: async () => ANALYSIS })
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) })
    })
  })

  const uploadSample = async () => {
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'sample.xlsx')] } })
    })
  }

  it('после разбора сообщается о разборе и о числе сопоставленных полей', async () => {
    await renderEditor({ connection_type: 'file' })
    await uploadSample()

    expect(screen.getByText(/Файл проанализирован: найдено 3 колонок/)).toBeInTheDocument()
    expect(screen.getByText(/Автоматически сопоставлено полей: 2 из 7/)).toBeInTheDocument()
  })

  it('сопоставленные разбором поля помечены «Авто», остальные пусты', async () => {
    await renderEditor({ connection_type: 'file' })
    await uploadSample()

    expect(screen.getAllByText('Авто')).toHaveLength(2)
    expect(screen.queryAllByText('Вручную')).toHaveLength(0)
  })

  it('правка поля вручную снимает с него отметку «Авто»', async () => {
    await renderEditor({ connection_type: 'file' })
    await uploadSample()

    const selects = document.querySelectorAll('.mapping-table select')
    const mapped = Array.from(selects).find(el => el.value === 'Дата')
    await act(async () => {
      fireEvent.change(mapped, { target: { value: 'Топливо' } })
    })

    expect(screen.getAllByText('Авто')).toHaveLength(1)
    expect(screen.getAllByText('Вручную')).toHaveLength(1)
  })

  it('строки заголовков и данных берутся из разбора', async () => {
    await renderEditor({ connection_type: 'file' })
    await uploadSample()

    expect(screen.getByLabelText(/Строка заголовков/)).toHaveValue(2)
    expect(screen.getByLabelText(/Строка начала данных/)).toHaveValue(3)
  })
})
