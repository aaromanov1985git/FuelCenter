import React, { useEffect, useState, useMemo } from 'react'
import { Card, Input, Button, Badge, Modal, Skeleton } from './ui'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../utils/logger'
import './UserActionLogsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const UserActionLogsList = ({ showMyActionsOnly = false }) => {
  const { user: currentUser } = useAuth()
  const { success, error: showError } = useToast()

  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true) // Начинаем с true, чтобы показать загрузку
  const [search, setSearch] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState('')
  const [actionCategoryFilter, setActionCategoryFilter] = useState('')
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      if (search.trim()) {
        params.append('search', search.trim())
      }
      if (actionTypeFilter) {
        params.append('action_type', actionTypeFilter)
      }
      if (actionCategoryFilter) {
        params.append('action_category', actionCategoryFilter)
      }
      if (entityTypeFilter) {
        params.append('entity_type', entityTypeFilter)
      }
      if (statusFilter) {
        params.append('status', statusFilter)
      }

      let endpoint
      if (showMyActionsOnly) {
        endpoint = API_URL 
          ? `${API_URL}/api/v1/logs/my-actions`
          : '/api/v1/logs/my-actions'
      } else {
        endpoint = API_URL 
          ? `${API_URL}/api/v1/logs/user-actions`
          : '/api/v1/logs/user-actions'
      }

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
          setLogs(data)
          setTotal(data.length)
        } else {
          setLogs([])
          setTotal(0)
        }
      } else {
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
    loadLogs()
  }, [
    currentPage,
    search,
    actionTypeFilter,
    actionCategoryFilter,
    entityTypeFilter,
    statusFilter,
    showMyActionsOnly
  ])


  const handleViewDetails = (log) => {
    setSelectedLog(log)
    setShowDetailModal(true)
  }

  const getStatusBadgeVariant = (status) => {
    switch (status?.toLowerCase()) {
      case 'success':
        return 'success'
      case 'failed':
        return 'error'
      case 'partial':
        return 'warning'
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

  if (!showMyActionsOnly && !isAdmin) {
    return (
      <div className="user-action-logs-list">
        <Card>
          <EmptyState
            title="Доступ запрещен"
            message="Требуются права администратора для просмотра действий пользователей"
          />
        </Card>
      </div>
    )
  }

  const columns = [
    { key: 'id', label: 'ID', width: '80px' },
    { key: 'created_at', label: 'Дата/Время', width: '160px' },
    { key: 'username', label: 'Пользователь', width: '120px' },
    { key: 'action_type', label: 'Тип действия', width: '120px' },
    { key: 'action_category', label: 'Категория', width: '120px' },
    { key: 'entity_type', label: 'Сущность', width: '120px' },
    { key: 'action_description', label: 'Описание', width: 'auto' },
    { key: 'status', label: 'Статус', width: '100px' },
    { key: 'actions', label: 'Действия', width: '100px' }
  ]

  return (
    <div className="user-action-logs-list">
      <Card>
        <div className="logs-header">
          <h2>{showMyActionsOnly ? 'Мои действия' : 'Действия пользователей'}</h2>
        </div>

        <div className="logs-filters">
          <Input
            type="text"
            placeholder="Поиск по описанию..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="search-input"
          />
          <select
            value={actionTypeFilter}
            onChange={(e) => {
              setActionTypeFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-select"
          >
            <option value="">Все типы действий</option>
            <option value="login">Вход</option>
            <option value="logout">Выход</option>
            <option value="create">Создание</option>
            <option value="update">Обновление</option>
            <option value="delete">Удаление</option>
            <option value="view">Просмотр</option>
            <option value="export">Экспорт</option>
            <option value="import">Импорт</option>
          </select>
          <Input
            type="text"
            placeholder="Категория..."
            value={actionCategoryFilter}
            onChange={(e) => {
              setActionCategoryFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-input"
          />
          <Input
            type="text"
            placeholder="Тип сущности..."
            value={entityTypeFilter}
            onChange={(e) => {
              setEntityTypeFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-input"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="filter-select"
          >
            <option value="">Все статусы</option>
            <option value="success">Успешно</option>
            <option value="failed">Ошибка</option>
            <option value="partial">Частично</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-state">
            <Skeleton count={5} />
          </div>
        ) : (!logs || logs.length === 0) ? (
          <EmptyState
            title="Логи не найдены"
            message={search || actionTypeFilter || actionCategoryFilter || entityTypeFilter || statusFilter
              ? "Попробуйте изменить параметры фильтрации"
              : showMyActionsOnly
              ? "Ваши действия будут отображаться здесь после входа в систему"
              : "Действия пользователей будут отображаться здесь после их создания. Если логи не появляются, убедитесь, что миграция БД применена (alembic upgrade head)"}
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
                        <td>{log.username || '-'}</td>
                        <td>{log.action_type || '-'}</td>
                        <td>{log.action_category || '-'}</td>
                        <td>{log.entity_type || '-'}</td>
                        <td>
                          <div className="log-description" title={log.action_description}>
                            {log.action_description && log.action_description.length > 100
                              ? `${log.action_description.substring(0, 100)}...`
                              : log.action_description || '-'}
                          </div>
                        </td>
                        <td>
                          <Badge variant={getStatusBadgeVariant(log.status)}>
                            {log.status}
                          </Badge>
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
          title="Детали действия пользователя"
        >
          <div className="log-detail">
            <div className="detail-row">
              <strong>ID:</strong> {selectedLog.id}
            </div>
            <div className="detail-row">
              <strong>Дата/Время:</strong> {formatDate(selectedLog.created_at)}
            </div>
            <div className="detail-row">
              <strong>Пользователь:</strong> {selectedLog.username || '-'}
            </div>
            <div className="detail-row">
              <strong>Тип действия:</strong> {selectedLog.action_type}
            </div>
            <div className="detail-row">
              <strong>Категория:</strong> {selectedLog.action_category || '-'}
            </div>
            <div className="detail-row">
              <strong>Описание:</strong>
              <div className="detail-value">{selectedLog.action_description}</div>
            </div>
            <div className="detail-row">
              <strong>Тип сущности:</strong> {selectedLog.entity_type || '-'}
            </div>
            <div className="detail-row">
              <strong>ID сущности:</strong> {selectedLog.entity_id || '-'}
            </div>
            <div className="detail-row">
              <strong>Статус:</strong>{' '}
              <Badge variant={getStatusBadgeVariant(selectedLog.status)}>
                {selectedLog.status}
              </Badge>
            </div>
            {selectedLog.ip_address && (
              <div className="detail-row">
                <strong>IP адрес:</strong> {selectedLog.ip_address}
              </div>
            )}
            {selectedLog.request_method && (
              <div className="detail-row">
                <strong>HTTP метод:</strong> {selectedLog.request_method}
              </div>
            )}
            {selectedLog.request_path && (
              <div className="detail-row">
                <strong>Путь запроса:</strong> {selectedLog.request_path}
              </div>
            )}
            {selectedLog.request_data && (
              <div className="detail-row">
                <strong>Данные запроса:</strong>
                <pre className="detail-value">{selectedLog.request_data}</pre>
              </div>
            )}
            {selectedLog.response_data && (
              <div className="detail-row">
                <strong>Данные ответа:</strong>
                <pre className="detail-value">{selectedLog.response_data}</pre>
              </div>
            )}
            {selectedLog.changes && (
              <div className="detail-row">
                <strong>Изменения:</strong>
                <pre className="detail-value">{selectedLog.changes}</pre>
              </div>
            )}
            {selectedLog.error_message && (
              <div className="detail-row">
                <strong>Сообщение об ошибке:</strong>
                <div className="detail-value error-message">{selectedLog.error_message}</div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

export default UserActionLogsList
