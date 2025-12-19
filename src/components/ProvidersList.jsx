import React, { useState, useEffect } from 'react'
import TemplateEditor from './TemplateEditor'
import ConfirmModal from './ConfirmModal'
import IconButton from './IconButton'
import FormField from './FormField'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { useAutoSave } from '../hooks/useAutoSave'
import StatusBadge from './StatusBadge'
import { Card, Button, Input, Skeleton, Alert, Modal, Checkbox, Select, Badge } from './ui'
import { authFetch } from '../utils/api'
import './ProvidersList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const ProvidersList = () => {
  const { error: showError, success, warning, info } = useToast()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', is_active: true, organization_id: null })
  const [showAddModal, setShowAddModal] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', code: '', is_active: true, organization_id: null })
  const [organizations, setOrganizations] = useState([])
  const [organizationFilter, setOrganizationFilter] = useState(null) // Фильтр по организации

  // Валидация формы добавления провайдера
  const validationRules = {
    name: {
      required: true,
      minLength: 2,
      message: 'Название должно быть не менее 2 символов'
    },
    code: {
      required: true,
      minLength: 2,
      pattern: /^[A-Z0-9_-]+$/i,
      message: 'Код может содержать только буквы, цифры, дефисы и подчеркивания'
    }
  }

  const {
    values: formValues,
    errors: formErrors,
    touched: formTouched,
    handleChange: handleFormChange,
    handleBlur: handleFormBlur,
    validate: validateForm,
    isValid: isFormValid,
    reset: resetForm,
    setValues: setFormValues
  } = useFormValidation({ name: '', code: '', is_active: true, organization_id: null }, validationRules)

  // Автосохранение формы добавления провайдера
  const { clearAutoSave, hasAutoSavedData, loadAutoSaved } = useAutoSave(
    formValues,
    'provider-add-form',
    1000, // Сохраняем через 1 секунду после последнего изменения
    showAddModal // Включаем только когда форма открыта
  )

  // Загрузка сохраненных данных при открытии формы
  useEffect(() => {
    if (showAddModal && hasAutoSavedData) {
      const saved = loadAutoSaved()
      if (saved && (saved.name || saved.code)) {
        setFormValues(saved)
        info('Восстановлены ранее введенные данные')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal])

  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templates, setTemplates] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, providerId: null })
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState({ isOpen: false, templateId: null })
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице

  const loadProviders = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      // Добавляем фильтр по организации, если выбран
      if (organizationFilter) {
        params.append('organization_id', organizationFilter.toString())
      }
      
      const response = await authFetch(`${API_URL}/api/v1/providers?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setProviders(result.items)
      setTotal(result.total)
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка загрузки: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

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

  // Загружаем организации один раз при монтировании
  useEffect(() => {
    loadOrganizations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Загружаем провайдеров при изменении страницы или фильтра
  useEffect(() => {
    loadProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, organizationFilter])

  const handleEdit = (provider) => {
    setEditingId(provider.id)
    setEditForm({
      name: provider.name,
      code: provider.code,
      is_active: provider.is_active,
      organization_id: provider.organization_id || null
    })
  }

  const handleSave = async (providerId) => {
    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/providers/${providerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editForm)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      setEditingId(null)
      await loadProviders()
      setError('')
      success('Провайдер успешно обновлен')
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      const errorMessage = 'Ошибка сохранения: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }
  
  // Проверяем, нужно ли перейти на предыдущую страницу после удаления
  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const handleCancel = () => {
    setEditingId(null)
    setEditForm({ name: '', code: '', is_active: true, organization_id: null })
  }

  const handleAdd = async () => {
    // Валидация перед отправкой
    if (!validateForm()) {
      showError('Пожалуйста, исправьте ошибки в форме')
      return
    }

    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formValues)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка создания')
      }

      setShowAddModal(false)
      setNewForm({ name: '', code: '', is_active: true, organization_id: null })
      resetForm()
      clearAutoSave() // Очищаем автосохранение после успешного создания
      await loadProviders()
      setError('')
      success('Провайдер успешно создан')
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      const errorMessage = 'Ошибка создания: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (providerId) => {
    setDeleteConfirm({ isOpen: true, providerId })
  }

  const handleShowTemplates = async (providerId) => {
    if (selectedProviderId === providerId) {
      // Скрываем шаблоны, если они уже открыты
      setSelectedProviderId(null)
      setShowTemplateEditor(false)
      setEditingTemplate(null)
    } else {
      // Показываем шаблоны для выбранного провайдера
      setSelectedProviderId(providerId)
      setShowTemplateEditor(false)
      setEditingTemplate(null)
      await loadTemplates(providerId)
    }
  }

  const loadTemplates = async (providerId) => {
    if (!providerId) {
      setTemplates({})
      return
    }
    
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers/${providerId}/templates?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setTemplates(prev => ({
          ...prev,
          [providerId]: result.items
        }))
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка загрузки шаблонов' }))
        setError('Ошибка загрузки шаблонов: ' + (errorData.detail || 'Неизвестная ошибка'))
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка загрузки шаблонов: ' + err.message)
      setTemplates(prev => ({
        ...prev,
        [providerId]: []
      }))
    }
  }

  const handleAddTemplate = (providerId) => {
    setEditingTemplate(null)
    setShowTemplateEditor(true)
  }

  const handleEditTemplate = (template) => {
    setEditingTemplate(template)
    setShowTemplateEditor(true)
  }

  const handleDeleteTemplate = (templateId) => {
    setDeleteTemplateConfirm({ isOpen: true, templateId })
  }

  const handleConfirmDeleteTemplate = async () => {
    if (!deleteTemplateConfirm.templateId) return

    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/templates/${deleteTemplateConfirm.templateId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления')
      }

      // Обновляем список шаблонов для текущего провайдера
      if (selectedProviderId) {
        await loadTemplates(selectedProviderId)
      }
      setError('')
      setDeleteTemplateConfirm({ isOpen: false, templateId: null })
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка удаления шаблона: ' + err.message)
      setDeleteTemplateConfirm({ isOpen: false, templateId: null })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (templateData) => {
    try {
      setLoading(true)
      let response
      
      if (editingTemplate) {
        // Обновление существующего шаблона
        response = await authFetch(`${API_URL}/api/v1/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateData)
        })
      } else {
        // Создание нового шаблона
        response = await authFetch(`${API_URL}/api/v1/providers/${selectedProviderId}/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateData)
        })
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      setShowTemplateEditor(false)
      setEditingTemplate(null)
      
      // Обновляем список шаблонов для текущего провайдера
      if (selectedProviderId) {
        await loadTemplates(selectedProviderId)
      }
      setError('')
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка сохранения шаблона: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.providerId) return

    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/providers/${deleteConfirm.providerId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления')
      }

      await loadProviders()
      setError('')
      setDeleteConfirm({ isOpen: false, providerId: null })
      success('Провайдер успешно удален')
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      const errorMessage = 'Ошибка удаления: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
      setDeleteConfirm({ isOpen: false, providerId: null })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card>
        <Card.Header>
          <Card.Title>Справочник провайдеров</Card.Title>
          <Card.Actions>
            <Button
              variant={showAddModal ? "secondary" : "success"}
              icon={showAddModal ? "×" : "+"}
              onClick={() => {
                if (showAddModal) {
                  setShowAddModal(false)
                  resetForm()
                } else {
                  setShowAddModal(true)
                }
              }}
            >
              {showAddModal ? "Отмена" : "Добавить провайдера"}
            </Button>
          </Card.Actions>
        </Card.Header>

        <Card.Body>
          {error && (
            <Alert variant="error" style={{ marginBottom: 'var(--spacing-element)' }}>
              {error}
            </Alert>
          )}

          {/* Фильтр по организации */}
          <div style={{ marginBottom: 'var(--spacing-element)', display: 'flex', gap: 'var(--spacing-small)', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
              Фильтр по организации:
            </label>
            <Select
              value={organizationFilter ? organizationFilter.toString() : ''}
              onChange={(value) => {
                setOrganizationFilter(value ? parseInt(value) : null)
                setCurrentPage(1) // Сбрасываем на первую страницу при изменении фильтра
              }}
              options={[
                { value: '', label: 'Все организации' },
                ...organizations.filter(o => o.is_active).map(org => ({
                  value: org.id.toString(),
                  label: org.name
                }))
              ]}
              style={{ minWidth: '200px' }}
            />
          </div>

          {loading && providers.length === 0 ? (
            <Skeleton rows={10} columns={5} />
          ) : (
            <div className="providers-table-wrapper">
              <table className="providers-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Код</th>
                <th>Организация</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(provider => (
                <React.Fragment key={provider.id}>
                  <tr>
                    <td data-label="ID">{provider.id}</td>
                    <td data-label="Название">
                      {editingId === provider.id ? (
                        <Input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Название *"
                          required
                          fullWidth
                        />
                      ) : (
                        provider.name
                      )}
                    </td>
                    <td data-label="Код">
                      {editingId === provider.id ? (
                        <Input
                          type="text"
                          value={editForm.code}
                          onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                          placeholder="Код *"
                          required
                          fullWidth
                        />
                      ) : (
                        provider.code
                      )}
                    </td>
                    <td data-label="Организация">
                      {editingId === provider.id ? (
                        <Select
                          value={editForm.organization_id ? editForm.organization_id.toString() : ''}
                          onChange={(value) => setEditForm({ ...editForm, organization_id: value ? parseInt(value) : null })}
                          options={[
                            { value: '', label: 'Не указана' },
                            ...organizations.filter(o => o.is_active).map(org => ({
                              value: org.id.toString(),
                              label: org.name
                            }))
                          ]}
                          fullWidth
                        />
                      ) : (
                        (() => {
                          const org = organizations.find(o => o.id === provider.organization_id)
                          return org ? <Badge variant="secondary">{org.name}</Badge> : '-'
                        })()
                      )}
                    </td>
                    <td data-label="Статус">
                      {editingId === provider.id ? (
                        <Checkbox
                          checked={editForm.is_active}
                          onChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                          label="Активен"
                        />
                      ) : (
                        <StatusBadge 
                          status={provider.is_active ? 'active' : 'inactive'} 
                          size="small"
                        />
                      )}
                    </td>
                    <td data-label="Действия">
                      {editingId === provider.id ? (
                        <div className="action-buttons">
                          <IconButton 
                            icon="save" 
                            variant="success" 
                            onClick={() => handleSave(provider.id)}
                            title="Сохранить"
                            size="small"
                          />
                          <IconButton 
                            icon="cancel" 
                            variant="secondary" 
                            onClick={handleCancel}
                            title="Отмена"
                            size="small"
                          />
                        </div>
                      ) : (
                        <div className="action-buttons">
                          <IconButton 
                            icon="edit" 
                            variant="primary" 
                            onClick={() => handleEdit(provider)}
                            title="Редактировать"
                            size="small"
                          />
                          <IconButton 
                            icon="templates" 
                            variant="primary" 
                            onClick={() => handleShowTemplates(provider.id)}
                            title={selectedProviderId === provider.id ? 'Скрыть шаблоны' : 'Шаблоны'}
                            size="small"
                          />
                          <IconButton 
                            icon="delete" 
                            variant="error" 
                            onClick={() => handleDelete(provider.id)}
                            title="Удалить"
                            size="small"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                  {selectedProviderId === provider.id && !showTemplateEditor && (
                    <tr>
                      <td colSpan="6" className="templates-cell">
                        <div className="templates-section">
                          <div className="templates-header">
                            <h4>Шаблоны провайдера</h4>
                            <IconButton 
                              icon="add" 
                              variant="success" 
                              onClick={() => handleAddTemplate(provider.id)}
                              title="Добавить шаблон"
                              size="small"
                            />
                          </div>
                          {templates[provider.id] && templates[provider.id].length > 0 ? (
                            <div className="templates-list">
                              {templates[provider.id].map(template => (
                                <div key={template.id} className="template-item">
                                  <div className="template-info">
                                    <span className="template-name">{template.name}</span>
                                    {template.description && (
                                      <span className="template-description">{template.description}</span>
                                    )}
                                    <span className={`template-status ${template.is_active ? 'active' : 'inactive'}`}>
                                      {template.is_active ? 'Активен' : 'Неактивен'}
                                    </span>
                                  </div>
                                  <div className="template-actions">
                                    <IconButton 
                                      icon="edit" 
                                      variant="primary" 
                                      onClick={() => handleEditTemplate(template)}
                                      title="Редактировать"
                                      size="small"
                                    />
                                    <IconButton 
                                      icon="delete" 
                                      variant="error" 
                                      onClick={() => handleDeleteTemplate(template.id)}
                                      title="Удалить"
                                      size="small"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="no-templates">
                              Шаблоны не найдены. Добавьте первый шаблон для этого провайдера.
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {selectedProviderId === provider.id && showTemplateEditor && (
                    <tr>
                      <td colSpan="6" className="template-editor-cell">
                        <TemplateEditor
                          providerId={provider.id}
                          template={editingTemplate}
                          onSave={handleSaveTemplate}
                          onCancel={() => {
                            setShowTemplateEditor(false)
                            setEditingTemplate(null)
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
          
          {/* Пагинация */}
          {total > limit && (
            <div className="pagination-container">
              <Button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || loading}
                variant="secondary"
                size="sm"
              >
                Предыдущая
              </Button>
              <span className="pagination-info">
                Страница {currentPage} из {Math.ceil(total / limit)} (всего: {total})
              </span>
              <Button
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(total / limit), prev + 1))}
                disabled={currentPage >= Math.ceil(total / limit) || loading}
                variant="secondary"
                size="sm"
              >
                Следующая
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Подтверждение удаления"
        message="Вы уверены, что хотите удалить этого провайдера? Это действие нельзя отменить."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, providerId: null })}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      <ConfirmModal
        isOpen={deleteTemplateConfirm.isOpen}
        title="Подтверждение удаления шаблона"
        message="Вы уверены, что хотите удалить этот шаблон? Это действие нельзя отменить."
        onConfirm={handleConfirmDeleteTemplate}
        onCancel={() => setDeleteTemplateConfirm({ isOpen: false, templateId: null })}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      {/* Модальное окно добавления провайдера */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false)
          resetForm()
        }}
        title="Добавить провайдера"
        size="md"
      >
        <Modal.Body>
          <div className="form-group">
            <label>
              Название <span className="required">*</span>
            </label>
            <Input
              type="text"
              name="name"
              value={formValues.name}
              onChange={handleFormChange}
              onBlur={handleFormBlur}
              placeholder="Название провайдера"
              error={formTouched.name && formErrors.name ? `⚠️ ${formErrors.name}` : undefined}
              fullWidth
            />
          </div>
          <div className="form-group">
            <label>
              Код <span className="required">*</span>
            </label>
            <Input
              type="text"
              name="code"
              value={formValues.code}
              onChange={handleFormChange}
              onBlur={handleFormBlur}
              placeholder="Код провайдера"
              error={formTouched.code && formErrors.code ? `⚠️ ${formErrors.code}` : undefined}
              fullWidth
            />
          </div>
          <div className="form-group">
            <label>Организация</label>
            <Select
              value={formValues.organization_id ? formValues.organization_id.toString() : ''}
              onChange={(value) => setFormValues({ ...formValues, organization_id: value ? parseInt(value) : null })}
              options={[
                { value: '', label: 'Не указана' },
                ...organizations.filter(o => o.is_active).map(org => ({
                  value: org.id.toString(),
                  label: org.name
                }))
              ]}
              fullWidth
            />
          </div>
          <div className="form-group">
            <Checkbox
              checked={formValues.is_active}
              onChange={(checked) => setFormValues({ ...formValues, is_active: checked })}
              label="Активен"
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowAddModal(false)
              resetForm()
            }}
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleAdd}
            disabled={!isFormValid || loading}
          >
            Создать
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

export default ProvidersList

