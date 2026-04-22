import React, { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Table, Modal, Select, Badge, Skeleton, Checkbox } from './ui'
import ConfirmModal from './ConfirmModal'
import StatusBadge from './StatusBadge'
import IconButton from './IconButton'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import './UsersList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

/** Преобразует ответ API об ошибке в читаемую строку (в т.ч. 422 с массивом detail) */
function formatApiError (detail, fallback) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    const loc = first.loc && first.loc.length > 0 ? first.loc[first.loc.length - 1] : ''
    const msg = first.msg || ''
    return loc ? `${String(loc)}: ${msg}` : msg
  }
  return fallback
}

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
  const [organizations, setOrganizations] = useState([])
  const [assignOrgsModal, setAssignOrgsModal] = useState({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })

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

  const loadOrganizations = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/organizations?limit=1000`)
      if (response.ok) {
        const data = await response.json()
        setOrganizations(data.items || [])
      }
    } catch (err) {
      // Игнорируем ошибки загрузки организаций
    }
  }

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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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
    if (isAdmin) {
      loadUsers()
      loadOrganizations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, isAdmin])

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
          const msg = formatApiError(errorData.detail, 'Ошибка сохранения')
          throw new Error(msg)
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
          const msg = formatApiError(errorData.detail, 'Ошибка создания пользователя')
          throw new Error(msg)
        }
        const created = await response.json()
        success(`Пользователь ${created.username} создан`)
      }

      await loadUsers()
      closeModal()
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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
    { key: 'organizations', header: 'Организации', sortable: false },
    { key: 'status', header: 'Статус', sortable: true },
    { key: 'last_login', header: 'Последний вход', sortable: true },
    { key: 'actions', header: 'Действия', sortable: false }
  ]

  const tableData = users.map((u) => ({
    id: u.id,
    username: (
      <div>
        <div className="user-username-primary">{u.username}</div>
        <div className="user-username-meta">
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
    organizations: (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {u.organization_ids && u.organization_ids.length > 0 ? (
          organizations
            .filter(org => u.organization_ids.includes(org.id))
            .map(org => (
              <Badge key={org.id} variant="secondary" title={org.description || org.name}>
                {org.name}
              </Badge>
            ))
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>—</span>
        )}
      </div>
    ),
    status: (
      <StatusBadge
        status={u.is_active ? 'success' : 'error'}
        text={u.is_active ? 'Активен' : 'Отключен'}
      />
    ),
    last_login: u.last_login ? new Date(u.last_login).toLocaleString() : '—',
    actions: (
      <div className="cell actions">
        <IconButton
          icon="edit"
          variant="secondary"
          size="small"
          title="Редактировать"
          disabled={loading}
          onClick={() => openEditModal(u)}
        />
        <IconButton
          icon="users"
          variant="secondary"
          size="small"
          title="Назначить организации"
          disabled={loading}
          onClick={() => {
            const userOrgs = organizations.filter(org => u.organization_ids?.includes(org.id))
            setAssignOrgsModal({
              isOpen: true,
              userId: u.id,
              userName: u.username,
              selectedOrgs: userOrgs.map(org => org.id)
            })
          }}
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
              placeholder="Поиск по имени или электронной почте"
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

      {/* Модальное окно назначения организаций */}
      <Modal
        isOpen={assignOrgsModal.isOpen}
        onClose={() => setAssignOrgsModal({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })}
        title={`Назначить организации: ${assignOrgsModal.userName}`}
      >
        <Modal.Body>
          <div style={{ marginBottom: 'var(--spacing-element)' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: 'var(--spacing-small)', 
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-primary)'
            }}>
              Выберите организации:
            </label>
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto', 
              border: '1px solid var(--color-border)', 
              borderRadius: 'var(--radius-medium)', 
              padding: 'var(--spacing-small)',
              background: 'var(--color-bg-card)'
            }}>
              {organizations.length === 0 ? (
                <div style={{ 
                  padding: 'var(--spacing-element)', 
                  textAlign: 'center', 
                  color: 'var(--color-text-secondary)' 
                }}>
                  Нет доступных организаций
                </div>
              ) : (
                organizations.map(org => {
                  const isChecked = assignOrgsModal.selectedOrgs.includes(org.id)
                  const handleToggle = (checked) => {
                    if (checked) {
                      setAssignOrgsModal(prev => ({
                        ...prev,
                        selectedOrgs: [...prev.selectedOrgs, org.id]
                      }))
                    } else {
                      setAssignOrgsModal(prev => ({
                        ...prev,
                        selectedOrgs: prev.selectedOrgs.filter(id => id !== org.id)
                      }))
                    }
                  }
                  
                  return (
                    <div
                      key={org.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--spacing-small)',
                        padding: 'var(--spacing-small)',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-small)',
                        transition: 'background-color var(--duration-fast) var(--ease-in-out)',
                        marginBottom: 'var(--spacing-tiny)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div 
                        style={{ flexShrink: 0, marginTop: '2px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isChecked}
                          onChange={handleToggle}
                        />
                      </div>
                      <div 
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => handleToggle(!isChecked)}
                      >
                        <div style={{ 
                          fontWeight: 'var(--font-weight-medium)',
                          color: 'var(--color-text-primary)',
                          marginBottom: 'var(--spacing-tiny)'
                        }}>
                          {org.name}
                        </div>
                        {org.description && (
                          <div style={{ 
                            fontSize: 'var(--font-size-sm)', 
                            color: 'var(--color-text-secondary)'
                          }}>
                            {org.description}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setAssignOrgsModal({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })}
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!assignOrgsModal.userId) return
              setLoading(true)
              try {
                const response = await authFetch(`${API_URL}/api/v1/organizations/assign`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    user_id: assignOrgsModal.userId,
                    organization_ids: assignOrgsModal.selectedOrgs
                  })
                })
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}))
                  throw new Error(errorData.detail || 'Не удалось назначить организации')
                }
                success('Организации успешно назначены')
                setAssignOrgsModal({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })
                await loadUsers()
              } catch (err) {
                if (err.isUnauthorized) return
                showError(err.message)
              } finally {
                setLoading(false)
              }
            }}
            disabled={loading}
          >
            Назначить
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  )
}

export default UsersList

