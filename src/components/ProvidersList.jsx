import React, { useState, useEffect } from 'react'
import TemplateEditor from './TemplateEditor'
import ConfirmModal from './ConfirmModal'
import IconButton from './IconButton'
import FormField from './FormField'
import { SkeletonTable } from './Skeleton'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { useAutoSave } from '../hooks/useAutoSave'
import StatusBadge from './StatusBadge'
import './ProvidersList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const ProvidersList = () => {
  const { error: showError, success, warning, info } = useToast()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', code: '', is_active: true })
  const [showAddForm, setShowAddForm] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', code: '', is_active: true })

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
  } = useFormValidation({ name: '', code: '', is_active: true }, validationRules)

  // Автосохранение формы добавления провайдера
  const { clearAutoSave, hasAutoSavedData, loadAutoSaved } = useAutoSave(
    formValues,
    'provider-add-form',
    1000, // Сохраняем через 1 секунду после последнего изменения
    showAddForm // Включаем только когда форма открыта
  )

  // Загрузка сохраненных данных при открытии формы
  useEffect(() => {
    if (showAddForm && hasAutoSavedData) {
      const saved = loadAutoSaved()
      if (saved && (saved.name || saved.code)) {
        setFormValues(saved)
        info('Восстановлены ранее введенные данные')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddForm])

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
      
      const response = await fetch(`${API_URL}/api/v1/providers?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setProviders(result.items)
      setTotal(result.total)
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [currentPage])

  const handleEdit = (provider) => {
    setEditingId(provider.id)
    setEditForm({
      name: provider.name,
      code: provider.code,
      is_active: provider.is_active
    })
  }

  const handleSave = async (providerId) => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/api/v1/providers/${providerId}`, {
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
    setEditForm({ name: '', code: '', is_active: true })
  }

  const handleAdd = async () => {
    // Валидация перед отправкой
    if (!validateForm()) {
      showError('Пожалуйста, исправьте ошибки в форме')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/api/v1/providers`, {
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

      setShowAddForm(false)
      setNewForm({ name: '', code: '', is_active: true })
      resetForm()
      clearAutoSave() // Очищаем автосохранение после успешного создания
      await loadProviders()
      setError('')
      success('Провайдер успешно создан')
    } catch (err) {
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
      const response = await fetch(`${API_URL}/api/v1/providers/${providerId}/templates?limit=1000`)
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
      const response = await fetch(`${API_URL}/api/v1/templates/${deleteTemplateConfirm.templateId}`, {
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
        response = await fetch(`${API_URL}/api/v1/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(templateData)
        })
      } else {
        // Создание нового шаблона
        response = await fetch(`${API_URL}/api/v1/providers/${selectedProviderId}/templates`, {
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
      setError('Ошибка сохранения шаблона: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.providerId) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/api/v1/providers/${deleteConfirm.providerId}`, {
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
      const errorMessage = 'Ошибка удаления: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
      setDeleteConfirm({ isOpen: false, providerId: null })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="providers-list">
      <div className="providers-header">
        <h2>Справочник провайдеров</h2>
        <IconButton 
          icon={showAddForm ? "cancel" : "add"}
          variant={showAddForm ? "secondary" : "success"}
          onClick={() => setShowAddForm(!showAddForm)}
          title={showAddForm ? "Отмена" : "Добавить провайдера"}
          size="medium"
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <div className="add-form">
          <h3>Новый провайдер</h3>
          <div className="form-row">
            <FormField
              label="Название"
              name="name"
              type="text"
              value={formValues.name}
              onChange={handleFormChange}
              onBlur={handleFormBlur}
              error={formErrors.name}
              touched={formTouched.name}
              required
              placeholder="Например: РП-газпром"
              helpText="Уникальное название провайдера"
            />
            <FormField
              label="Код"
              name="code"
              type="text"
              value={formValues.code}
              onChange={handleFormChange}
              onBlur={handleFormBlur}
              error={formErrors.code}
              touched={formTouched.code}
              required
              placeholder="Например: RP-GAZPROM"
              helpText="Уникальный код (только латиница, цифры, дефисы)"
            />
            <div className="form-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formValues.is_active}
                  onChange={handleFormChange}
                />
                Активен
              </label>
            </div>
            <div className="form-actions">
              <IconButton 
                icon="save" 
                variant="success" 
                onClick={handleAdd}
                title="Создать"
                size="medium"
                disabled={!isFormValid || loading}
              />
              <IconButton 
                icon="cancel" 
                variant="secondary" 
                onClick={() => {
                  setShowAddForm(false)
                  setNewForm({ name: '', code: '', is_active: true })
                  resetForm()
                  // Не очищаем автосохранение при отмене, чтобы пользователь мог восстановить данные
                }}
                title="Отмена"
                size="medium"
              />
            </div>
          </div>
        </div>
      )}

      {loading && providers.length === 0 ? (
        <SkeletonTable rows={10} columns={5} />
      ) : (
        <div className="providers-table-wrapper">
          <table className="providers-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Код</th>
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
                        <div>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="edit-input"
                            placeholder="Название *"
                            required
                          />
                        </div>
                      ) : (
                        provider.name
                      )}
                    </td>
                    <td data-label="Код">
                      {editingId === provider.id ? (
                        <div>
                          <input
                            type="text"
                            value={editForm.code}
                            onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                            className="edit-input"
                            placeholder="Код *"
                            required
                          />
                        </div>
                      ) : (
                        provider.code
                      )}
                    </td>
                    <td data-label="Статус">
                      {editingId === provider.id ? (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.is_active}
                            onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                          />
                          Активен
                        </label>
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
                      <td colSpan="5" className="templates-cell">
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
                      <td colSpan="5" className="template-editor-cell">
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
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || loading}
            className="pagination-btn"
          >
            Предыдущая
          </button>
          <span className="pagination-info">
            Страница {currentPage} из {Math.ceil(total / limit)} (всего: {total})
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(total / limit), prev + 1))}
            disabled={currentPage >= Math.ceil(total / limit) || loading}
            className="pagination-btn"
          >
            Следующая
          </button>
        </div>
      )}

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
    </div>
  )
}

export default ProvidersList

