import React from 'react'
import IconButton from './IconButton'
import ClearMenu from './ClearMenu'
import ExportMenu from './ExportMenu'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import Highlight from './Highlight'
import { SkeletonTable } from './Skeleton'
import { Icon } from './ui'
import { useCopyToClipboard } from '../hooks/useCopyToClipboard'
import { useToast } from './ToastContainer'
import './TransactionTable.css'

const rowsToCsv = (rows, headers) => {
  const csvHeaders = headers.join(',')
  const csvRows = rows.map(row =>
    headers.map(h => {
      const value = row[h] || ''
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${String(value).replace(/"/g, '""')}"`
      }
      return value
    }).join(',')
  ).join('\n')
  return csvHeaders + '\n' + csvRows
}

// Моноширинный — только там, где цифры стоят в колонку и их сравнивают по вертикали.
// В остальных колонках (провайдер, ТС, товар, валюта) текст остаётся в Golos Text.
const NUMERIC_HEADERS = new Set([
  'ID',
  'Дата и время',
  '№ карты',
  'АЗС',
  'Кол-во',
  'Курс конвертации',
])

// Чистые числа выравниваем по правому краю вместе с их заголовками
const RIGHT_ALIGNED_HEADERS = new Set(['Кол-во', 'Курс конвертации'])

const OPERATION_TYPE_HEADER = 'Тип'

const TransactionTable = ({
  data,
  total,
  page,
  pageSize,
  loading,
  displayHeaders,
  headerFieldMap,
  sortConfig,
  debouncedCardNumber,
  debouncedAzsNumber,
  debouncedProduct,
  isAdmin,
  onSort,
  onOpenColumnSettings,
  onDownloadExcel,
  onRefresh,
  onClearAll,
  onClearByProvider,
  onContextMenu,
  onPageChange,
  onPageSizeChange,
}) => {
  const { copy } = useCopyToClipboard()
  const { success, error: showError } = useToast()

  const handleCopyAll = async () => {
    const csvContent = rowsToCsv(data, displayHeaders)
    const copied = await copy(csvContent)
    if (copied) {
      success('Данные скопированы в буфер обмена')
    } else {
      showError('Не удалось скопировать данные')
    }
  }

  const cellClasses = (header) => [
    'table-cell-clickable',
    NUMERIC_HEADERS.has(header) && 't-numeric',
    RIGHT_ALIGNED_HEADERS.has(header) && 'tx-cell-right',
  ].filter(Boolean).join(' ')

  return (
    /* Панель таблицы: рамка и радиус на ней, тени нет. Шапка и подвал — зоны
       внутри панели, со своей подложкой и без собственного бордера. */
    <div className="tx-table-card">
      <div className="tx-table-head">
        <h2 className="t-section-title tx-table-title">
          Транзакции
          {/* Цифры заголовка остаются в Golos Text: моноширинный оправдан только
              в колонках таблицы, здесь он читался бы как чужеродная вставка. */}
          <span className="tx-table-count">{total} записей, показано {data.length}</span>
        </h2>
        <div className="header-actions">
          <IconButton
            icon="settings"
            variant="primary"
            onClick={onOpenColumnSettings}
            title="Настройка колонок таблицы"
            size="medium"
          />
          <ExportMenu
            data={data}
            headers={displayHeaders}
            onExportExcel={onDownloadExcel}
            filename="transactions"
          />
          <IconButton
            icon="copy"
            variant="primary"
            onClick={handleCopyAll}
            title="Копировать данные в буфер обмена (CSV)"
            size="medium"
          />
          <IconButton
            icon="refresh"
            variant="primary"
            onClick={onRefresh}
            title="Обновить данные"
            size="medium"
          />
          {isAdmin && (
            <ClearMenu
              onClearAll={onClearAll}
              onClearByProvider={onClearByProvider}
              disabled={loading}
            />
          )}
        </div>
      </div>

      <div className="table-wrapper">
        {loading && data.length === 0 ? (
          <SkeletonTable rows={10} columns={displayHeaders.length} />
        ) : data.length === 0 ? (
          <EmptyState
            title="Нет данных"
            message="Транзакции не найдены. Попробуйте изменить фильтры или загрузить новый файл."
            icon={<Icon name="chart" size={32} />}
            variant="large"
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {displayHeaders.map((h) => {
                  const field = headerFieldMap[h]
                  const isSortable = !!field
                  const isActive = sortConfig.field === field
                  const isAsc = isActive && sortConfig.order === 'asc'

                  return (
                    <th
                      key={h}
                      className={[
                        isSortable && 'sortable',
                        RIGHT_ALIGNED_HEADERS.has(h) && 'tx-cell-right',
                      ].filter(Boolean).join(' ')}
                      onClick={() => isSortable && onSort(field)}
                      style={{ cursor: isSortable ? 'pointer' : 'default' }}
                      data-label={h}
                      role={isSortable ? 'columnheader button' : 'columnheader'}
                      aria-sort={isSortable ? (isActive ? (sortConfig.order === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                      tabIndex={isSortable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (isSortable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          onSort(field)
                        }
                      }}
                    >
                      <span className="th-content">
                        {h}
                        {isSortable && (
                          /* В наборе иконок нет chevron-up, поэтому направление
                             «по возрастанию» — тот же chevron, повёрнутый в CSS. */
                          <span className={`tx-sort ${isActive ? 'is-active' : ''} ${isAsc ? 'is-asc' : ''}`}>
                            <Icon name="chevron-down" size={16} />
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => {
                const rowKey = row.ID != null ? `${row.ID}-${idx}` : `row-${idx}`
                return (
                  <tr
                    key={rowKey}
                    className={row._hasErrors ? 'row-with-errors' : ''}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onContextMenu({
                        isOpen: true,
                        x: e.clientX,
                        y: e.clientY,
                        rowIndex: idx,
                      })
                    }}
                  >
                    {displayHeaders.map((h) => {
                      const searchTerms = [
                        debouncedCardNumber,
                        debouncedAzsNumber,
                        debouncedProduct,
                      ].filter(Boolean)
                      const cellValue = row[h] || ''

                      return (
                        <td
                          key={h}
                          data-label={h}
                          className={cellClasses(h)}
                          title="Двойной клик для копирования"
                          onDoubleClick={async () => {
                            if (cellValue) {
                              const copied = await copy(String(cellValue))
                              if (copied) {
                                success(`Скопировано: ${cellValue}`)
                              }
                            }
                          }}
                        >
                          {h === 'Закреплена за' && row._hasErrors ? (
                            <span className="error-highlight" title="Требуется проверка данных ТС">
                              <Icon name="alert" size={16} className="tx-cell-alert" />
                              {searchTerms.length > 0 ? (
                                <Highlight text={cellValue} searchTerm={searchTerms} />
                              ) : (
                                cellValue
                              )}
                            </span>
                          ) : h === OPERATION_TYPE_HEADER && cellValue ? (
                            <span className="tx-op-badge">{cellValue}</span>
                          ) : searchTerms.length > 0 ? (
                            <Highlight text={cellValue} searchTerm={searchTerms} />
                          ) : (
                            cellValue
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="table-footer">
        <span className="tx-table-note">
          Показаны основные колонки. Полные данные — в скачиваемом файле.
        </span>
        {total > 0 && (
          <Pagination
            currentPage={page + 1}
            totalPages={Math.ceil(total / pageSize)}
            total={total}
            pageSize={pageSize}
            onPageChange={(newPage) => onPageChange(newPage - 1)}
            onPageSizeChange={onPageSizeChange}
            loading={loading}
          />
        )}
      </div>
    </div>
  )
}

export default TransactionTable
