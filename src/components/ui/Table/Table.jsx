import React, { useState, useMemo, useEffect } from 'react';
import Icon from '../Icon';
import useEdgeScroll from './useEdgeScroll';
import './Table.css';

const Table = ({
  columns = [],
  data = [],
  sortable = true,
  selectable = false,
  loading = false,
  emptyMessage = 'Нет данных для отображения',
  onRowClick,
  onSort,
  defaultSortColumn,
  defaultSortOrder = 'asc',
  stickyHeader = false,
  striped = false,
  hoverable = true,
  compact = false,
  className = '',
  ...props
}) => {
  // Указатель горизонтальной прокрутки: измеряем сам контейнер, рисует CSS.
  const { ref: scrollRef, hasStart, hasEnd } = useEdgeScroll();
  const [sortColumn, setSortColumn] = useState(defaultSortColumn);
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);
  const [selectedRows, setSelectedRows] = useState(new Set());
  
  // Синхронизируем состояние сортировки с пропсами (для серверной сортировки)
  useEffect(() => {
    if (onSort) {
      setSortColumn(defaultSortColumn);
      setSortOrder(defaultSortOrder || 'asc');
    }
  }, [defaultSortColumn, defaultSortOrder, onSort]);

  // Сортировка данных
  // Если передан onSort, значит используется серверная сортировка - не применяем клиентскую
  const sortedData = useMemo(() => {
    if (onSort) {
      // Серверная сортировка - используем данные как есть
      return data;
    }
    
    if (!sortColumn || !sortable) return data;

    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      // Числовая сортировка
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Строковая сортировка
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortOrder === 'asc') {
        return aStr.localeCompare(bStr, 'ru');
      } else {
        return bStr.localeCompare(aStr, 'ru');
      }
    });

    return sorted;
  }, [data, sortColumn, sortOrder, sortable, onSort]);

  // Обработка клика по заголовку для сортировки
  const handleHeaderClick = (column) => {
    if (!sortable || column.sortable !== true) return;

    const newSortOrder = sortColumn === column.key && sortOrder === 'asc' ? 'desc' : 'asc';

    setSortColumn(column.key);
    setSortOrder(newSortOrder);

    if (onSort) {
      onSort(column.key, newSortOrder);
    }
  };

  // Выбор всех строк
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(new Set(data.map((_, idx) => idx)));
    } else {
      setSelectedRows(new Set());
    }
  };

  // Выбор одной строки
  const handleSelectRow = (index) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  // Иконка сортировки
  const getSortIcon = (column) => {
    if (!sortable || column.sortable !== true) return null;

    // Направление показывает поворот одного и того же шеврона: отдельных глифов
    // «вверх/вниз» в наборе Icon нет, а поворот честнее случайной иконки.
    if (sortColumn !== column.key) {
      return (
        <span className="ui-table-sort-icon">
          <Icon name="chevron-down" size={16} />
        </span>
      );
    }

    return (
      <span
        className={`ui-table-sort-icon active${
          sortOrder === 'asc' ? ' ui-table-sort-icon-asc' : ''
        }`}
      >
        <Icon name="chevron-down" size={16} />
      </span>
    );
  };

  const tableClasses = [
    'ui-table',
    stickyHeader && 'ui-table-sticky',
    striped && 'ui-table-striped',
    hoverable && 'ui-table-hoverable',
    compact && 'ui-table-compact',
    loading && 'ui-table-loading',
    className
  ].filter(Boolean).join(' ');

  if (loading) {
    return (
      <div className={tableClasses}>
        <div className="ui-table-loading-overlay">
          <div className="ui-table-spinner"></div>
          <span>Загрузка...</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="ui-table-empty">
        <div className="ui-table-empty-icon"><Icon name="chart" size={32} /></div>
        <div className="ui-table-empty-message">{emptyMessage}</div>
      </div>
    );
  }

  return (
    /* Две обёртки, а не одна: внутренняя — контейнер прокрутки (липкой шапке
       нужен ограниченный по высоте scrollport, иначе она уезжает вместе со
       страницей), внешняя — неподвижный якорь для указателей прокрутки. */
    <div className="ui-table-scroll">
      <div
        ref={scrollRef}
        className={['ui-table-wrapper', stickyHeader && 'ui-table-wrapper-sticky']
          .filter(Boolean).join(' ')}
        data-scroll-start={hasStart ? 'true' : undefined}
        data-scroll-end={hasEnd ? 'true' : undefined}
        {...props}
      >
        <table className={tableClasses}>
          <thead className="ui-table-header">
            <tr>
              {selectable && (
                <th className="ui-table-cell ui-table-cell-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === data.length}
                    onChange={handleSelectAll}
                    aria-label="Выбрать все"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={[
                    'ui-table-cell',
                    'ui-table-header-cell',
                    sortable && column.sortable !== false && 'ui-table-sortable',
                    sortColumn === column.key && 'ui-table-sorted',
                    column.align && `ui-table-align-${column.align}`,
                    column.sticky && `ui-table-cell-sticky-${column.sticky}`,
                    column.headerClassName
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleHeaderClick(column)}
                  style={{ width: column.width }}
                  role={sortable && column.sortable === true ? 'columnheader button' : 'columnheader'}
                  aria-sort={
                    sortColumn === column.key
                      ? sortOrder === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  tabIndex={sortable && column.sortable === true ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (!sortable || column.sortable !== true) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleHeaderClick(column);
                    }
                  }}
                >
                  <div className="ui-table-header-content">
                    {column.header || column.label}
                    {getSortIcon(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ui-table-body">
            {sortedData.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                className={[
                  'ui-table-row',
                  selectedRows.has(rowIndex) && 'ui-table-row-selected',
                  onRowClick && 'ui-table-row-clickable',
                  row.className
                ].filter(Boolean).join(' ')}
                onClick={() => onRowClick && onRowClick(row, rowIndex)}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {selectable && (
                  <td className="ui-table-cell ui-table-cell-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(rowIndex)}
                      onChange={() => handleSelectRow(rowIndex)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Выбрать строку ${rowIndex + 1}`}
                    />
                  </td>
                )}
                {columns.map((column) => {
                  const cellValue = row[column.key];
                  const displayValue = column.render
                    ? column.render(cellValue, row, rowIndex)
                    : cellValue;

                  return (
                    <td
                      key={column.key}
                      className={[
                        'ui-table-cell',
                        column.align && `ui-table-align-${column.align}`,
                        column.sticky && `ui-table-cell-sticky-${column.sticky}`,
                        column.cellClassName
                      ].filter(Boolean).join(' ')}
                      data-label={column.header || column.label}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Указатели скрытого содержимого. Лежат вне контейнера прокрутки —
          внутри него они уезжали бы вместе с таблицей. */}
      {hasStart && <span className="ui-table-edge ui-table-edge-start" aria-hidden="true" />}
      {hasEnd && <span className="ui-table-edge ui-table-edge-end" aria-hidden="true" />}
    </div>
  );
};

// Подкомпонент для пагинации
Table.Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  total,
  className = ''
}) => {
  const showingFrom = (currentPage - 1) * pageSize + 1;
  const showingTo = Math.min(currentPage * pageSize, total);

  return (
    <div className={`ui-table-pagination ${className}`}>
      <div className="ui-table-pagination-info">
        Показано {showingFrom}–{showingTo} из {total}
      </div>

      {onPageSizeChange && (
        <div className="ui-table-pagination-size">
          <label htmlFor="page-size-select">Строк на странице:</label>
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="ui-table-pagination-select"
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}

      <div className="ui-table-pagination-controls">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="ui-table-pagination-button"
          aria-label="Первая страница"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="ui-table-pagination-button"
          aria-label="Предыдущая страница"
        >
          ‹
        </button>

        <span className="ui-table-pagination-pages">
          Страница {currentPage} из {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="ui-table-pagination-button"
          aria-label="Следующая страница"
        >
          ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="ui-table-pagination-button"
          aria-label="Последняя страница"
        >
          »
        </button>
      </div>
    </div>
  );
};

export default Table;
