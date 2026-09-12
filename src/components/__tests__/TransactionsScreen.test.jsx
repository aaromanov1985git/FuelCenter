import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TransactionUpload from '../TransactionUpload'
import TransactionTable from '../TransactionTable'
import { ToastProvider } from '../ToastContainer'

const uploadProps = {
  dragActive: false,
  loading: false,
  fileName: '',
  fileMatchInfo: null,
  uploadStatus: null,
  uploadProgress: 0,
  uploadedBytes: 0,
  totalBytes: 0,
  processedItems: 0,
  totalItems: 0,
  error: '',
  stats: { total_transactions: 85178, total_quantity: 1234.5, products: { AI92: 1, DT: 2 }, provider_count: 3 },
  providers: [{ id: 1, name: 'Роснефть' }],
  selectedProviderTab: null,
  onSelectedProviderTabChange: vi.fn(),
  onDrag: vi.fn(),
  onDrop: vi.fn(),
  onFileInput: vi.fn(),
}

describe('TransactionUpload', () => {
  it('рисует кнопку загрузки и строку сводки, без раскрытой зоны перетаскивания', () => {
    render(<TransactionUpload {...uploadProps} />)
    expect(screen.getByRole('button', { name: /Загрузить файл/ })).toBeTruthy()
    expect(screen.getByText('Всего транзакций')).toBeTruthy()
    expect(screen.getByText(/85.178/)).toBeTruthy()
    expect(screen.queryByText(/Перетащите файл сюда/)).toBeNull()
    expect(document.querySelector('.tx-dropzone')).toBeNull()
  })

  it('оверлей приёма появляется только при dragActive', () => {
    render(<TransactionUpload {...uploadProps} dragActive />)
    expect(document.querySelector('.tx-dropzone')).toBeTruthy()
    expect(screen.getByText('Отпустите файл для загрузки')).toBeTruthy()
  })

  it('перетаскивание файла над окном поднимает флаг, уход опускает', () => {
    const onDrag = vi.fn()
    render(<TransactionUpload {...uploadProps} onDrag={onDrag} />)
    const dt = { types: ['Files'], files: [] }

    fireEvent.dragEnter(window, { dataTransfer: dt })
    expect(onDrag).toHaveBeenCalledTimes(1)
    expect(onDrag.mock.calls[0][0].type).toBe('dragenter')

    // вложенный dragenter/dragleave внутри страницы не должен гасить оверлей
    fireEvent.dragEnter(window, { dataTransfer: dt })
    fireEvent.dragLeave(window, { dataTransfer: dt })
    expect(onDrag).toHaveBeenCalledTimes(2)

    fireEvent.dragLeave(window, { dataTransfer: dt })
    expect(onDrag).toHaveBeenCalledTimes(3)
    expect(onDrag.mock.calls[2][0].type).toBe('dragleave')
  })

  it('перетаскивание текста игнорируется', () => {
    const onDrag = vi.fn()
    render(<TransactionUpload {...uploadProps} onDrag={onDrag} />)
    fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'] } })
    expect(onDrag).not.toHaveBeenCalled()
  })
})

const tableProps = {
  data: [
    {
      ID: '1001',
      'Дата и время': '01.09.2026 10:20',
      '№ карты': '7005 0000 1111',
      'Провайдер': 'Роснефть',
      'Закреплена за': 'А123ВС',
      'АЗС': '0421',
      'Товар / услуга': 'ДТ',
      'Тип': 'Покупка',
      'Кол-во': '42.50',
      'Валюта транзакции': 'RUB',
      'Курс конвертации': '1.0000',
    },
  ],
  total: 1,
  page: 0,
  pageSize: 50,
  loading: false,
  displayHeaders: ['ID', 'Дата и время', '№ карты', 'Провайдер', 'Тип', 'Кол-во', 'Курс конвертации'],
  headerFieldMap: { ID: 'id', 'Дата и время': 'transaction_date', 'Кол-во': 'quantity' },
  sortConfig: { field: 'id', order: 'asc' },
  debouncedCardNumber: '',
  debouncedAzsNumber: '',
  debouncedProduct: '',
  isAdmin: false,
  onSort: vi.fn(),
  onOpenColumnSettings: vi.fn(),
  onDownloadExcel: vi.fn(),
  onRefresh: vi.fn(),
  onClearAll: vi.fn(),
  onClearByProvider: vi.fn(),
  onContextMenu: vi.fn(),
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
}

const renderTable = (props = {}) =>
  render(
    <ToastProvider>
      <TransactionTable {...tableProps} {...props} />
    </ToastProvider>,
  )

describe('TransactionTable', () => {
  it('шапка и подвал лежат внутри панели', () => {
    renderTable()
    const card = document.querySelector('.tx-table-card')
    expect(card).toBeTruthy()
    expect(card.querySelector('.tx-table-head')).toBeTruthy()
    expect(card.querySelector('.table-wrapper')).toBeTruthy()
    expect(card.querySelector('.table-footer')).toBeTruthy()
    expect(document.querySelector('.result-header')).toBeNull()
  })

  it('моноширинный только в числовых и идентификационных колонках', () => {
    renderTable()
    const cells = Array.from(document.querySelectorAll('tbody td'))
    const numeric = cells.filter(td => td.classList.contains('t-numeric')).map(td => td.dataset.label)
    expect(numeric).toEqual(['ID', 'Дата и время', '№ карты', 'Кол-во', 'Курс конвертации'])
  })

  it('тип операции показан бейджем', () => {
    renderTable()
    const badge = document.querySelector('.tx-op-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('Покупка')
  })

  it('сортировка по заголовку работает', () => {
    const onSort = vi.fn()
    renderTable({ onSort })
    fireEvent.click(screen.getByText('Дата и время'))
    expect(onSort).toHaveBeenCalledWith('transaction_date')
  })

  it('в своей разметке нет эмодзи', () => {
    renderTable()
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u
    expect(emoji.test(document.querySelector('.tx-table-card').textContent)).toBe(false)
  })
})
