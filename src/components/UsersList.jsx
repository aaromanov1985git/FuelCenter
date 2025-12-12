import React, { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Table, Modal, Select, Badge, Skeleton } from './ui'
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

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(50) // Количество записей на странице

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
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
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

  // Сбрасываем на первую страницу при изменении поиска
  useEffect(() => {
    setCurrentPage(1)
  }, [search])

  // Загружаем пользователей при изменении страницы или поиска
  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search])

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

  // Подготовка данных для таблицы
  const tableColumns = [
    { key: 'username', header: 'Имя', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'role', header: 'Роль', sortable: true },
    { key: 'status', header: 'Статус', sortable: true },
    { key: 'last_login', header: 'Последний вход', sortable: true },
    { key: 'actions', header: 'Действия', sortable: false }
  ]

  const tableData = users.map((u) => ({
    id: u.id,
    username: (
      <div>
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{u.username}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
          Создан: {new Date(u.created_at).toLocaleDateString()}
        </div>
      </div>
    ),
    email: u.email,
    role: (
      <Select
        value={u.role}
        onChange={(value) => handleRoleChange(u.id, value)}
        options={[
          { value: 'user', label: 'Пользователь' },
          { value: 'admin', label: 'Администратор' },
          { value: 'viewer', label: 'Наблюдатель' }
        ]}
        disabled={loading || currentUser?.id === u.id}
      />
    ),
    status: (
      <StatusBadge
        status={u.is_active ? 'success' : 'error'}
        text={u.is_active ? 'Активен' : 'Отключен'}
      />
    ),
    last_login: u.last_login ? new Date(u.last_login).toLocaleString() : '—',
    actions: (
      <div style={{ display: 'flex', gap: 'var(--spacing-small)', justifyContent: 'flex-end' }}>
        <IconButton
          icon="edit"
          variant="secondary"
          size="small"
          title="Редактировать"
          disabled={loading}
          onClick={() => openEditModal(u)}
        />
        <Button
          variant={u.is_active ? 'error' : 'success'}
          size="sm"
          onClick={() => handleToggleActive(u)}
          disabled={loading}
        >
          {u.is_active ? 'Отключить' : 'Включить'}
        </Button>
        <IconButton
          icon="trash"
          variant="danger"
          size="small"
          title="Удалить"
          disabled={loading || currentUser?.id === u.id}
          onClick={() => setDeleteConfirm({ isOpen: true, userId: u.id })}
        />
      </div>
    )
  }))

  if (!isAdmin) {
    return (
      <Card>
        <Card.Body>
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 'var(--spacing-block)' }}>
            Управление пользователями доступно только администраторам
          </div>
        </Card.Body>
      </Card>
    )
  }

  return (
    <Card>
      <Card.Header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <Card.Title>Пользователи</Card.Title>
            <p style={{ margin: 'var(--spacing-tiny) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Всего: {total}
            </p>
          </div>
          <Card.Actions>
            <Input
              type="search"
              placeholder="Поиск по имени или email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
              icon="🔍"
              iconPosition="left"
              style={{ minWidth: '240px' }}
            />
            <IconButton
              icon="refresh"
              variant="secondary"
              title="Обновить"
              onClick={loadUsers}
              disabled={loading}
            />
            <Button
              variant="primary"
              onClick={openAddModal}
              disabled={loading}
            >
              Добавить
            </Button>
          </Card.Actions>
        </div>
      </Card.Header>
      <Card.Body>

        {loading ? (
          <Skeleton rows={6} columns={6} />
        ) : (
          <Table
            columns={tableColumns}
            data={tableData}
            emptyMessage="Пользователи не найдены"
            striped
            hoverable
            compact
          />
        )}

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingUser ? 'Редактирование пользователя' : 'Новый пользователь'}
        size="md"
      >
        <Modal.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-section)' }}>
            <Input
              label="Имя пользователя"
              name="username"
              value={newUser.username}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.username && errors.username ? errors.username : ''}
              required
              disabled={!!editingUser}
              fullWidth
            />
            <Input
              label="Email"
              name="email"
              type="email"
              value={newUser.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.email && errors.email ? errors.email : ''}
              required
              fullWidth
            />
            <Input
              label={editingUser ? 'Новый пароль (не обязательно)' : 'Пароль'}
              name="password"
              type="password"
              value={newUser.password}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.password && errors.password ? errors.password : ''}
              fullWidth
            />
            <Select
              label="Роль"
              name="role"
              value={newUser.role}
              onChange={(value) => handleChange({ target: { name: 'role', value } })}
              options={[
                { value: 'user', label: 'Пользователь' },
                { value: 'admin', label: 'Администратор' },
                { value: 'viewer', label: 'Наблюдатель' }
              ]}
              required
              fullWidth
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal} disabled={loading}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={loading} loading={loading}>
            {editingUser ? 'Сохранить' : 'Создать'}
          </Button>
        </Modal.Footer>
      </Modal>

        {total > limit && (
          <Table.Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(total / limit)}
            total={total}
            pageSize={limit}
            onPageChange={setCurrentPage}
          />
        )}
      </Card.Body>

      {deleteConfirm.isOpen && (
        <ConfirmModal
          title="Удалить пользователя?"
          message="Действие необратимо. Учетная запись будет удалена."
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm({ isOpen: false, userId: null })}
        />
      )}
    </Card>
  )
}

export default UsersList

