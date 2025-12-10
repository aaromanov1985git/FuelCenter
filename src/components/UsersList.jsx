import React, { useEffect, useMemo, useState } from 'react'
import FormField from './FormField'
import ConfirmModal from './ConfirmModal'
import StatusBadge from './StatusBadge'
import IconButton from './IconButton'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import './UsersList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const UsersList = () => {
  const { user: currentUser } = useAuth()
  const { success, error: showError, info } = useToast()

  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, userId: null })

  const isAdmin = useMemo(
    () => currentUser && (currentUser.role === 'admin' || currentUser.is_superuser),
    [currentUser]
  )

  const validationRules = {
    username: {
      required: true,
      minLength: 3,
      message: 'Минимум 3 символа'
    },
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Введите корректный email'
    },
    password: {
      required: false,
      minLength: 8,
      message: 'Пароль минимум 8 символов'
    },
    role: {
      required: true
    }
  }

  const {
    values: newUser,
    errors,
    touched,
    handleChange,
    handleBlur,
    validate,
    reset
  } = useFormValidation(
    { username: '', email: '', password: '', role: 'user' },
    validationRules
  )

  const loadUsers = async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', '0')
      params.append('limit', '200')
      if (search.trim()) {
        params.append('search', search.trim())
      }

      const response = await authFetch(`${API_URL}/api/v1/users?${params.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось загрузить пользователей')
      }

      const data = await response.json()
      setUsers(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openAddModal = () => {
    reset()
    setEditingUser(null)
    setShowModal(true)
  }

  const openEditModal = (user) => {
    reset()
    handleChange({ target: { name: 'username', value: user.username } })
    handleChange({ target: { name: 'email', value: user.email } })
    handleChange({ target: { name: 'role', value: user.role } })
    handleChange({ target: { name: 'password', value: '' } })
    setEditingUser(user)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingUser(null)
    reset()
  }

  const handleSave = async () => {
    const isEdit = !!editingUser

    if (!validate()) {
      showError('Пожалуйста, заполните обязательные поля')
      return
    }

    if (!isEdit && (!newUser.password || newUser.password.length < 8)) {
      showError('Пароль должен быть не короче 8 символов')
      return
    }

    if (isEdit && newUser.password && newUser.password.length < 8) {
      showError('Пароль должен быть не короче 8 символов')
      return
    }

    setLoading(true)
    try {
      if (isEdit) {
        const payload = {
          email: newUser.email,
          role: newUser.role
        }
        if (newUser.password) {
          payload.password = newUser.password
        }
        const response = await authFetch(`${API_URL}/api/v1/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Ошибка сохранения')
        }
        success('Пользователь обновлён')
      } else {
        const response = await authFetch(`${API_URL}/api/v1/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser)
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Ошибка создания пользователя')
        }
        const created = await response.json()
        success(`Пользователь ${created.username} создан`)
      }

      await loadUsers()
      closeModal()
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (user) => {
    if (currentUser?.id === user.id) {
      showError('Нельзя изменить статус собственной учетной записи')
      return
    }
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось обновить статус')
      }
      await loadUsers()
      info(`Пользователь ${user.username} ${user.is_active ? 'отключен' : 'включен'}`)
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось обновить роль')
      }
      await loadUsers()
      success('Роль обновлена')
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.userId) return
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/users/${deleteConfirm.userId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось удалить пользователя')
      }
      success('Пользователь удален')
      setDeleteConfirm({ isOpen: false, userId: null })
      await loadUsers()
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="users-card">
        <div className="users-empty">Управление пользователями доступно только администраторам</div>
      </div>
    )
  }

  return (
    <div className="users-card">
      <div className="users-header">
        <div>
          <h2>Пользователи</h2>
          <p className="users-subtitle">Всего: {total}</p>
        </div>
        <div className="users-actions">
          <input
            type="search"
            placeholder="Поиск по имени или email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
            className="users-search"
          />
          <IconButton
            icon="refresh"
            variant="secondary"
            title="Обновить"
            onClick={loadUsers}
            disabled={loading}
          />
          <button
            className="users-add-button"
            onClick={openAddModal}
            disabled={loading}
          >
            Добавить
          </button>
        </div>
      </div>

      <div className="users-table" role="table">
        <div className="users-row users-head" role="row">
          <div className="cell">Имя</div>
          <div className="cell">Email</div>
          <div className="cell">Роль</div>
          <div className="cell">Статус</div>
          <div className="cell">Последний вход</div>
          <div className="cell actions">Действия</div>
        </div>
        {loading && (
          <div className="users-row">
            <div className="cell cell-full">Загрузка...</div>
          </div>
        )}
        {!loading && users.length === 0 && (
          <div className="users-row">
            <div className="cell cell-full">Пользователи не найдены</div>
          </div>
        )}
        {!loading &&
          users.map((u) => (
            <div className="users-row" key={u.id} role="row">
              <div className="cell">
                <div className="users-name">{u.username}</div>
                <div className="users-meta">Создан: {new Date(u.created_at).toLocaleDateString()}</div>
              </div>
              <div className="cell">{u.email}</div>
              <div className="cell">
                <select
                  className="users-select small"
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  disabled={loading || currentUser?.id === u.id}
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                  <option value="viewer">Наблюдатель</option>
                </select>
              </div>
              <div className="cell">
                <StatusBadge
                  status={u.is_active ? 'success' : 'error'}
                  text={u.is_active ? 'Активен' : 'Отключен'}
                />
              </div>
              <div className="cell">
                {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
              </div>
              <div className="cell actions">
                <IconButton
                  icon="edit"
                  variant="secondary"
                  size="small"
                  title="Редактировать"
                  disabled={loading}
                  onClick={() => openEditModal(u)}
                />
                <button
                  className={`users-toggle ${u.is_active ? 'off' : 'on'}`}
                  onClick={() => handleToggleActive(u)}
                  disabled={loading}
                  title={u.is_active ? 'Отключить' : 'Включить'}
                >
                  {u.is_active ? 'Отключить' : 'Включить'}
                </button>
                <IconButton
                  icon="trash"
                  variant="danger"
                  size="small"
                  title="Удалить"
                  disabled={loading || currentUser?.id === u.id}
                  onClick={() => setDeleteConfirm({ isOpen: true, userId: u.id })}
                />
              </div>
            </div>
          ))}
      </div>

      {showModal && (
        <div className="users-modal" role="dialog" aria-modal="true">
          <div className="users-modal-overlay" onClick={closeModal} />
          <div className="users-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="users-modal-header">
              <h3>{editingUser ? 'Редактирование пользователя' : 'Новый пользователь'}</h3>
              <button className="users-modal-close" onClick={closeModal} aria-label="Закрыть">×</button>
            </div>
            <div className="users-modal-body">
              <FormField
                label="Имя пользователя"
                name="username"
                value={newUser.username}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.username && errors.username ? errors.username : ''}
                required
                disabled={!!editingUser}
              />
              <FormField
                label="Email"
                name="email"
                type="email"
                value={newUser.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.email && errors.email ? errors.email : ''}
                required
              />
              <FormField
                label={editingUser ? 'Новый пароль (не обязательно)' : 'Пароль'}
                name="password"
                type="password"
                value={newUser.password}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.password && errors.password ? errors.password : ''}
              />
              <div className="users-field">
                <label className="users-label">Роль</label>
                <select
                  name="role"
                  value={newUser.role}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className="users-select"
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                  <option value="viewer">Наблюдатель</option>
                </select>
              </div>
            </div>
            <div className="users-modal-footer">
              <button className="users-cancel" onClick={closeModal} disabled={loading}>
                Отмена
              </button>
              <button className="users-save" onClick={handleSave} disabled={loading}>
                {editingUser ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm.isOpen && (
        <ConfirmModal
          title="Удалить пользователя?"
          message="Действие необратимо. Учетная запись будет удалена."
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm({ isOpen: false, userId: null })}
        />
      )}
    </div>
  )
}

export default UsersList

