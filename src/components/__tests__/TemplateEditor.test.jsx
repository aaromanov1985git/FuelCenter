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
