/**
 * Тесты рендера редактора шаблонов.
 *
 * Страховка перед разрезанием редактора на компоненты: проверяют, что набор
 * секций на экране и их нумерация не меняются при переносе разметки. Модель
 * шагов отдельно покрыта в src/utils/__tests__/templateModel.test.js — здесь
 * сверяется именно отрисованный DOM с этой моделью.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import TemplateEditor from '../TemplateEditor'
import { visibleStepIds } from '../../utils/templateModel'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
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
