import React from 'react'
import './Pagination.css'

/**
 * Компонент расширенной пагинации с выбором количества записей
 * 
 * @param {number} currentPage - Текущая страница (начинается с 1)
 * @param {number} totalPages - Всего страниц
 * @param {number} total - Всего записей
 * @param {number} pageSize - Количество записей на странице
 * @param {function} onPageChange - Обработчик смены страницы (page)
 * @param {function} onPageSizeChange - Обработчик смены размера страницы (pageSize)
 * @param {array} pageSizeOptions - Варианты размера страницы [10, 25, 50, 100]
 * @param {boolean} loading - Состояние загрузки
 */
const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  total = 0,
  pageSize = 50,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  loading = false
}) => {
  const handlePrevPage = () => {
    if (currentPage > 1 && !loading) {
      onPageChange(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages && !loading) {
      onPageChange(currentPage + 1)
    }
  }

  const handleFirstPage = () => {
    if (currentPage > 1 && !loading) {
      onPageChange(1)
    }
  }

  const handleLastPage = () => {
    if (currentPage < totalPages && !loading) {
      onPageChange(totalPages)
    }
  }

  const handlePageInput = (e) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && value >= 1 && value <= totalPages && !loading) {
      onPageChange(value)
    } else if (e.target.value === '') {
      // Позволяем очистить поле
      e.target.value = ''
    }
  }

  const handlePageInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      handlePageInput(e)
      e.target.blur()
    }
  }

  const handlePageSizeChange = (e) => {
    const newPageSize = parseInt(e.target.value)
    if (onPageSizeChange && !loading) {
      onPageSizeChange(newPageSize)
    }
  }

  if (totalPages <= 1 && total <= pageSize) {
    return null // Не показываем пагинацию, если все помещается на одной странице
  }

  // Вычисляем диапазон отображаемых страниц
  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    
    if (totalPages <= maxVisible) {
      // Если страниц мало, показываем все
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Показываем первую, последнюю и несколько вокруг текущей
      if (currentPage <= 3) {
        // В начале: 1, 2, 3, 4, ..., last
        for (let i = 1; i <= 4; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        // В конце: 1, ..., last-3, last-2, last-1, last
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        // В середине: 1, ..., current-1, current, current+1, ..., last
        pages.push(1)
        pages.push('...')
        pages.push(currentPage - 1)
        pages.push(currentPage)
        pages.push(currentPage + 1)
        pages.push('...')
        pages.push(totalPages)
      }
    }
    
    return pages
  }

  const pageNumbers = getPageNumbers()
  const startRecord = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endRecord = Math.min(currentPage * pageSize, total)

  return (
    <div className="pagination-wrapper">
      <div className="pagination-info">
        <span>
          Показано {startRecord}-{endRecord} из {total}
        </span>
        {onPageSizeChange && (
          <div className="pagination-page-size">
            <label htmlFor="page-size-select">Записей на странице:</label>
            <select
              id="page-size-select"
              value={pageSize}
              onChange={handlePageSizeChange}
              disabled={loading}
              className="pagination-page-size-select"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
              {total > 0 && !pageSizeOptions.includes(total) && (
                <option value={total}>Все ({total})</option>
              )}
            </select>
          </div>
        )}
      </div>

      <div className="pagination-controls">
        <button
          className="pagination-button pagination-button-first"
          onClick={handleFirstPage}
          disabled={currentPage === 1 || loading}
          title="Первая страница"
          aria-label="Первая страница"
        >
          ««
        </button>
        
        <button
          className="pagination-button pagination-button-prev"
          onClick={handlePrevPage}
          disabled={currentPage === 1 || loading}
          title="Предыдущая страница"
          aria-label="Предыдущая страница"
        >
          ‹
        </button>

        <div className="pagination-pages">
          {pageNumbers.map((page, index) => (
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                ...
              </span>
            ) : (
              <button
                key={page}
                className={`pagination-button pagination-button-page ${currentPage === page ? 'pagination-button-active' : ''}`}
                onClick={() => !loading && onPageChange(page)}
                disabled={loading}
                aria-label={`Страница ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
              >
                {page}
              </button>
            )
          ))}
        </div>

        <div className="pagination-jump">
          <span>Перейти:</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            defaultValue={currentPage}
            onBlur={handlePageInput}
            onKeyPress={handlePageInputKeyPress}
            disabled={loading}
            className="pagination-jump-input"
            aria-label="Номер страницы"
          />
        </div>

        <button
          className="pagination-button pagination-button-next"
          onClick={handleNextPage}
          disabled={currentPage >= totalPages || loading}
          title="Следующая страница"
          aria-label="Следующая страница"
        >
          ›
        </button>

        <button
          className="pagination-button pagination-button-last"
          onClick={handleLastPage}
          disabled={currentPage >= totalPages || loading}
          title="Последняя страница"
          aria-label="Последняя страница"
        >
          »»
        </button>
      </div>
    </div>
  )
}

export default Pagination

