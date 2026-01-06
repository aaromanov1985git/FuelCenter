import React, { useState, useEffect } from 'react'
import { Card, Button, Badge, Modal, Skeleton } from './ui'
import ConfirmModal from './ConfirmModal'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './BackupManagement.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const BackupManagement = () => {
  const { success, error: showError, info } = useToast()
  const [backups, setBackups] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, filename: null })
  const [restoreConfirm, setRestoreConfirm] = useState({ isOpen: false, filename: null })

  useEffect(() => {
    loadBackups()
    loadSchedule()
  }, [])

  const loadBackups = async () => {
    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/backup/list`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось загрузить список бэкапов')
      }

      const data = await response.json()
      setBackups(data.backups || [])
      setTotalSize(data.total_size_mb || 0)
    } catch (err) {
      logger.error('Ошибка загрузки списка бэкапов', { error: err.message })
      showError(err.message || 'Ошибка при загрузке списка бэкапов')
      setBackups([])
    } finally {
      setLoading(false)
    }
  }

  const loadSchedule = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/backup/schedule`)
      
      if (!response.ok) {
        logger.warn('Не удалось загрузить расписание бэкапов')
        return
      }

      const data = await response.json()
      setSchedule(data)
    } catch (err) {
      logger.warn('Ошибка загрузки расписания бэкапов', { error: err.message })
    }
  }

  const handleCreateBackup = async () => {
    try {
      setCreating(true)
      const response = await authFetch(`${API_URL}/api/v1/backup/create`, {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось создать бэкап')
      }

      const data = await response.json()
      success(`Резервная копия успешно создана: ${data.filename} (${data.size_mb} MB)`)
      logger.info('Бэкап создан', { filename: data.filename, size_mb: data.size_mb })
      
      // Обновляем список бэкапов
      await loadBackups()
    } catch (err) {
      logger.error('Ошибка создания бэкапа', { error: err.message })
      showError(err.message || 'Ошибка при создании резервной копии')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteClick = (filename) => {
    setDeleteConfirm({ isOpen: true, filename })
  }

  const handleDeleteConfirm = async () => {
    const { filename } = deleteConfirm
    if (!filename) return

    try {
      setDeleting(true)
      const response = await authFetch(`${API_URL}/api/v1/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось удалить бэкап')
      }

      success(`Резервная копия ${filename} удалена`)
      logger.info('Бэкап удалён', { filename })
      
      // Обновляем список бэкапов
      await loadBackups()
    } catch (err) {
      logger.error('Ошибка удаления бэкапа', { error: err.message })
      showError(err.message || 'Ошибка при удалении резервной копии')
    } finally {
      setDeleting(false)
      setDeleteConfirm({ isOpen: false, filename: null })
    }
  }

  const handleRestoreClick = (filename) => {
    setRestoreConfirm({ isOpen: true, filename })
  }

  const handleRestoreConfirm = async () => {
    const { filename } = restoreConfirm
    if (!filename) return

    try {
      setRestoring(true)
      const response = await authFetch(`${API_URL}/api/v1/backup/${encodeURIComponent(filename)}/restore`, {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось восстановить базу данных')
      }

      const data = await response.json()
      success(data.message || 'База данных успешно восстановлена из резервной копии')
      logger.info('Бэкап восстановлен', { filename })
      
      // Обновляем список бэкапов
      await loadBackups()
    } catch (err) {
      logger.error('Ошибка восстановления бэкапа', { error: err.message })
      showError(err.message || 'Ошибка при восстановлении базы данных')
    } finally {
      setRestoring(false)
      setRestoreConfirm({ isOpen: false, filename: null })
    }
  }

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  const formatSize = (sizeMb) => {
    if (sizeMb < 1) {
      return `${(sizeMb * 1024).toFixed(2)} KB`
    }
    return `${sizeMb.toFixed(2)} MB`
  }

  return (
    <div className="backup-management">
      <div className="backup-header">
        <div>
          <h2 className="backup-title">Управление резервными копиями</h2>
          <p className="backup-description">
            Создание, просмотр и восстановление резервных копий базы данных
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={handleCreateBackup}
          disabled={creating || loading}
        >
          {creating ? 'Создание...' : 'Создать бэкап'}
        </Button>
      </div>

      {schedule && (
        <Card className="backup-schedule-card">
          <div className="backup-schedule-header">
            <h3>Расписание автоматических бэкапов</h3>
            <Badge variant={schedule.enabled ? 'success' : 'secondary'}>
              {schedule.enabled ? 'Включено' : 'Выключено'}
            </Badge>
          </div>
          {schedule.enabled && (
            <div className="backup-schedule-info">
              <p>
                <strong>Время выполнения:</strong> ежедневно в {String(schedule.cron_hour).padStart(2, '0')}:
                {String(schedule.cron_minute).padStart(2, '0')}
              </p>
              <p>
                <strong>Хранение:</strong> {schedule.retention_days} дней
              </p>
              {schedule.next_run && (
                <p>
                  <strong>Следующий запуск:</strong> {schedule.next_run}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="backup-stats-card">
        <div className="backup-stats">
          <div className="backup-stat">
            <div className="backup-stat-label">Всего бэкапов</div>
            <div className="backup-stat-value">{backups.length}</div>
          </div>
          <div className="backup-stat">
            <div className="backup-stat-label">Общий размер</div>
            <div className="backup-stat-value">{formatSize(totalSize)}</div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="backup-loading">
          <Skeleton height={60} count={5} />
        </div>
      ) : backups.length === 0 ? (
        <Card className="backup-empty">
          <div className="backup-empty-content">
            <div className="backup-empty-icon">💾</div>
            <h3>Нет резервных копий</h3>
            <p>Создайте первую резервную копию базы данных</p>
            <Button
              variant="primary"
              onClick={handleCreateBackup}
              disabled={creating}
            >
              {creating ? 'Создание...' : 'Создать бэкап'}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="backup-list">
          {backups.map((backup) => (
            <Card key={backup.filename} className="backup-item">
              <div className="backup-item-content">
                <div className="backup-item-info">
                  <div className="backup-item-header">
                    <h4 className="backup-item-filename">{backup.filename}</h4>
                    <Badge variant="info">{formatSize(backup.size_mb)}</Badge>
                  </div>
                  <div className="backup-item-meta">
                    <span className="backup-item-date">
                      📅 {formatDate(backup.created)}
                    </span>
                  </div>
                </div>
                <div className="backup-item-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestoreClick(backup.filename)}
                    disabled={restoring}
                  >
                    Восстановить
                  </Button>
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => handleDeleteClick(backup.filename)}
                    disabled={deleting}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Удаление резервной копии"
        message={`Вы уверены, что хотите удалить резервную копию "${deleteConfirm.filename}"? Это действие нельзя отменить.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ isOpen: false, filename: null })}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      <ConfirmModal
        isOpen={restoreConfirm.isOpen}
        title="Восстановление базы данных"
        message={`ВНИМАНИЕ: Восстановление базы данных из резервной копии "${restoreConfirm.filename}" приведёт к полной замене всех текущих данных. Это действие нельзя отменить. Продолжить?`}
        onConfirm={handleRestoreConfirm}
        onCancel={() => setRestoreConfirm({ isOpen: false, filename: null })}
        confirmText="Восстановить"
        cancelText="Отмена"
        variant="danger"
      />
    </div>
  )
}

export default BackupManagement
