import React, { useEffect, useState, useMemo } from 'react'
import { Card, Input, Button, Badge, Modal, Skeleton } from './ui'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../utils/logger'
import './SystemLogsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const SystemLogsList = () => {
  const { user: currentUser } = useAuth()
  const { success, error: showError } = useToast()

  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true) // Начинаем с true, чтобы показать загрузку
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [eventCategoryFilter, setEventCategoryFilter] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(50)

  const isAdmin = useMemo(
    () => currentUser && (currentUser.role === 'admin' || currentUser.is_superuser),
    [currentUser]
  )

  const loadLogs = async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      if (search.trim()) {
        params.append('search', search.trim())
      }
      if (levelFilter) {
        params.append('level', levelFilter)
      }
      if (eventTypeFilter) {
        params.append('event_type', eventTypeFilter)
      }
      if (eventCategoryFilter) {
        params.append('event_category', eventCategoryFilter)
      }

      const endpoint = API_URL 
        ? `${API_URL}/api/v1/logs/system`
        : '/api/v1/logs/system'
      const url = `${endpoint}?${params.toString()}`
      const response = await authFetch(url)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось загрузить логи')
      }

      const data = await response.json()
      // Проверяем структуру данных
      if (data && typeof data === 'object') {
        if (Array.isArray(data.items)) {
          setLogs([...data.items])
          setTotal(data.total || data.items.length)
        } else if (Array.isArray(data)) {
          // Если вернулся массив напрямую
          logger.warn('Ответ - массив, а не объект с items')
          setLogs(data)
          setTotal(data.length)
        } else {
          logger.warn('Неожиданная структура ответа:', data)
          setLogs([])
          setTotal(0)
        }
      } else {
        logger.error('Некорректный формат ответа:', data)
        setLogs([])
        setTotal(0)
      }
    } catch (err) {
      // Более детальная обработка ошибок
      if (err.isUnauthorized) {
        showError('Требуется авторизация для просмотра логов')
      } else if (err.message) {
        showError(err.message)
      } else {
        showError('Ошибка при загрузке логов. Проверьте консоль для деталей.')
      }
      // В случае ошибки тоже сбрасываем состояние
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadLogs()
    }
  }, [currentPage, search, levelFilter, eventTypeFilter, eventCategoryFilter, isAdmin])


  const handleViewDetails = (log) => {
    setSelectedLog(log)
    setShowDetailModal(true)
  }

  const getLevelBadgeVariant = (level) => {
    switch (level?.toUpperCase()) {
      case 'DEBUG':
        return 'secondary'
      case 'INFO':
        return 'info'
      case 'WARNING':
        return 'warning'
      case 'ERROR':
        return 'error'
      case 'CRITICAL':
        return 'error'
      default:
        return 'secondary'
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  if (!isAdmin) {
    return (
      <div className="system-logs-list">
        <Card>
          <EmptyState
            title="Доступ запрещен"
            message="Требуются права администратора для просмотра системных логов"
          />
        </Card>
      </div>
    )
  }

  const columns = [
    { key: 'id', label: 'ID', width: '80px' },
    { key: 'created_at', label: 'Дата/Время', width: '160px' },
    { key: 'level', label: 'Уровень', width: '100px' },
    { key: 'event_type', label: 'Тип события', width: '120px' },
    { key: 'event_category', label: 'Категория', width: '120px' },
    { key: 'message', label: 'Сообщение', width: 'auto' },
    { key: 'actions', label: 'Действия', width: '100px' }
  ]

  return (
    <div className="system-logs-list">
      <Card>
        <div className="logs-header">
          <h2>Системные логи</h2>
        </div>

        <div className="logs-filters">
          <Input
            type="text"
            placeholder="Поиск по сообщению..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="search-input"
          />
          <select
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-select"
          >
            <option value="">Все уровни</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <Input
            type="text"
            placeholder="Тип события..."
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-input"
          />
          <Input
            type="text"
            placeholder="Категория..."
            value={eventCategoryFilter}
            onChange={(e) => {
              setEventCategoryFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-input"
          />
        </div>

        {loading ? (
          <div className="loading-state">
            <Skeleton count={5} />
          </div>
        ) : (!logs || logs.length === 0) ? (
          <EmptyState
            title="Логи не найдены"
            message={search || levelFilter || eventTypeFilter || eventCategoryFilter
              ? "Попробуйте изменить параметры фильтрации"
              : "Системные логи будут отображаться здесь после их создания. Если логи не появляются, убедитесь, что миграция БД применена (alembic upgrade head)"}
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="logs-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} style={{ width: col.width }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs && logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.id}</td>
                        <td>{formatDate(log.created_at)}</td>
                        <td>
                          <Badge variant={getLevelBadgeVariant(log.level)}>
                            {log.level}
                          </Badge>
                        </td>
                        <td>{log.event_type || '-'}</td>
                        <td>{log.event_category || '-'}</td>
                        <td>
                          <div className="log-message" title={log.message}>
                            {log.message && log.message.length > 100
                              ? `${log.message.substring(0, 100)}...`
                              : log.message || '-'}
                          </div>
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(log)}
                          >
                            Детали
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem' }}>
                        Нет данных для отображения
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {total > limit && (
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(total / limit)}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        )}
      </Card>

      {showDetailModal && selectedLog && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedLog(null)
          }}
          title="Детали системного лога"
        >
          <div className="log-detail">
            <div className="detail-row">
              <strong>ID:</strong> {selectedLog.id}
            </div>
            <div className="detail-row">
              <strong>Дата/Время:</strong> {formatDate(selectedLog.created_at)}
            </div>
            <div className="detail-row">
              <strong>Уровень:</strong>{' '}
              <Badge variant={getLevelBadgeVariant(selectedLog.level)}>
                {selectedLog.level}
              </Badge>
            </div>
            <div className="detail-row">
              <strong>Тип события:</strong> {selectedLog.event_type || '-'}
            </div>
            <div className="detail-row">
              <strong>Категория:</strong> {selectedLog.event_category || '-'}
            </div>
            <div className="detail-row">
              <strong>Модуль:</strong> {selectedLog.module || '-'}
            </div>
            <div className="detail-row">
              <strong>Функция:</strong> {selectedLog.function || '-'}
            </div>
            <div className="detail-row">
              <strong>Строка:</strong> {selectedLog.line_number || '-'}
            </div>
            <div className="detail-row">
              <strong>Сообщение:</strong>
              <div className="detail-value">{selectedLog.message}</div>
            </div>
            {selectedLog.extra_data && (
              <div className="detail-row">
                <strong>Дополнительные данные:</strong>
                <pre className="detail-value">{selectedLog.extra_data}</pre>
              </div>
            )}
            {selectedLog.exception_type && (
              <div className="detail-row">
                <strong>Тип исключения:</strong> {selectedLog.exception_type}
              </div>
            )}
            {selectedLog.exception_message && (
              <div className="detail-row">
                <strong>Сообщение исключения:</strong>
                <div className="detail-value">{selectedLog.exception_message}</div>
              </div>
            )}
            {selectedLog.stack_trace && (
              <div className="detail-row">
                <strong>Трассировка стека:</strong>
                <pre className="detail-value stack-trace">{selectedLog.stack_trace}</pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

export default SystemLogsList
