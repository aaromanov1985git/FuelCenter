import React, { useState, useEffect } from 'react'
import TemplateEditor from './TemplateEditor'
import ConfirmModal from './ConfirmModal'
import LoadFirebirdModal from './LoadFirebirdModal'
import LoadApiModal from './LoadApiModal'
import IconButton from './IconButton'
import { SkeletonTable } from './Skeleton'
import { useToast } from './ToastContainer'
import { logger } from '../utils/logger'
import './TemplatesList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const TemplatesList = () => {
  const { error: showError, success } = useToast()
  const [providers, setProviders] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, templateId: null })
  const [loadFirebirdModal, setLoadFirebirdModal] = useState({ isOpen: false, templateId: null, templateName: '' })
  const [firebirdDateFrom, setFirebirdDateFrom] = useState('')
  const [firebirdDateTo, setFirebirdDateTo] = useState('')
  const [loadingFirebird, setLoadingFirebird] = useState(false)
  const [loadApiModal, setLoadApiModal] = useState({ isOpen: false, templateId: null, templateName: '' })
  const [apiDateFrom, setApiDateFrom] = useState('')
  const [apiDateTo, setApiDateTo] = useState('')
  const [apiCardNumbers, setApiCardNumbers] = useState('')
  const [loadingApi, setLoadingApi] = useState(false)
  
  // Пагинация для шаблонов
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items.filter(p => p.is_active))
      }
    } catch (err) {
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }

  const loadTemplates = async (providerId) => {
    if (!providerId) {
      setTemplates([])
      setTotal(0)
      return
    }
    
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      const response = await fetch(`${API_URL}/api/v1/providers/${providerId}/templates?${params}`)
      if (response.ok) {
        const result = await response.json()
        setTemplates(result.items)
        setTotal(result.total)
      }
    } catch (err) {
      setError('Ошибка загрузки шаблонов: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Сбрасываем на первую страницу при смене провайдера
  }, [selectedProviderId])

  useEffect(() => {
    if (selectedProviderId) {
      loadTemplates(selectedProviderId)
    } else {
      setTemplates([])
      setTotal(0)
    }
  }, [selectedProviderId, currentPage])
  
  // Проверяем, нужно ли перейти на предыдущую страницу после удаления
  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const handleAddTemplate = () => {
    if (!selectedProviderId) {
      setError('Выберите провайдера')
      return
    }
    setEditingTemplate(null)
    setShowTemplateEditor(true)
    setError('')
  }

  const handleEditTemplate = (template) => {
    setEditingTemplate(template)
    setShowTemplateEditor(true)
    setError('')
  }

  const handleDeleteTemplate = (templateId) => {
    setDeleteConfirm({ isOpen: true, templateId })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.templateId) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/api/v1/templates/${deleteConfirm.templateId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления')
      }

      await loadTemplates(selectedProviderId)
      setError('')
      setDeleteConfirm({ isOpen: false, templateId: null })
    } catch (err) {
      setError('Ошибка удаления: ' + err.message)
      setDeleteConfirm({ isOpen: false, templateId: null })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (templateData) => {
    try {
      setLoading(true)
      setError('')

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
          body: JSON.stringify({
            ...templateData,
            provider_id: selectedProviderId
          })
        })
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      setShowTemplateEditor(false)
      setEditingTemplate(null)
      await loadTemplates(selectedProviderId)
      setError('')
    } catch (err) {
      setError('Ошибка сохранения: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setShowTemplateEditor(false)
    setEditingTemplate(null)
    setError('')
  }

  return (
    <div className="templates-list">
      <div className="templates-header">
        <h2>Конструктор шаблонов</h2>
        <p className="templates-subtitle">
          Настройте шаблоны для преобразования файлов Excel в формат ЮПМ Газпром.
          Выберите провайдера и создайте или отредактируйте шаблон.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="templates-content">
        <div className="provider-selector-section">
          <label className="provider-selector-label">
            Провайдер:
          </label>
          <div className="providers-list-form">
            {providers.length > 0 ? (
              providers.map(provider => (
                <label 
                  key={provider.id} 
                  className={`provider-card ${selectedProviderId === provider.id ? 'provider-card-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={provider.id}
                    checked={selectedProviderId === provider.id}
                    onChange={(e) => {
                      setSelectedProviderId(e.target.checked ? parseInt(e.target.value) : null)
                      setShowTemplateEditor(false)
                      setEditingTemplate(null)
                    }}
                    className="provider-radio"
                  />
                  <span className="provider-card-content">
                    <span className="provider-name">{provider.name}</span>
                    {provider.code && (
                      <span className="provider-code">{provider.code}</span>
                    )}
                  </span>
                </label>
              ))
            ) : (
              <div className="no-providers">
                <p>Провайдеры не найдены. Добавьте провайдеров в разделе "Провайдеры".</p>
              </div>
            )}
          </div>
          {selectedProviderId && (
            <div className="provider-actions">
              <IconButton 
                icon="add" 
                variant="success" 
                onClick={handleAddTemplate}
                title="Создать шаблон"
                size="medium"
              />
            </div>
          )}
        </div>

        {showTemplateEditor && selectedProviderId && (
          <div className="template-editor-section">
            <TemplateEditor
              providerId={selectedProviderId}
              template={editingTemplate}
              onSave={handleSaveTemplate}
              onCancel={handleCancel}
            />
          </div>
        )}

        {!showTemplateEditor && selectedProviderId && (
          <div className="templates-table-section">
            {loading && templates.length === 0 ? (
              <SkeletonTable rows={10} columns={6} />
            ) : templates.length > 0 ? (
              <div className="templates-table-wrapper">
                <table className="templates-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Название</th>
                      <th>Описание</th>
                      <th>Строка заголовков</th>
                      <th>Строка начала данных</th>
                      <th>Статус</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(template => (
                      <tr key={template.id}>
                        <td data-label="ID">{template.id}</td>
                        <td data-label="Название" className="template-name-cell">{template.name}</td>
                        <td data-label="Описание" className="template-description-cell">
                          {template.description || <span className="no-description">—</span>}
                        </td>
                        <td data-label="Строка заголовков">{template.header_row}</td>
                        <td data-label="Строка начала данных">{template.data_start_row}</td>
                        <td data-label="Статус">
                          <span className={`status-badge ${template.is_active ? 'status-active' : 'status-inactive'}`}>
                            {template.is_active ? 'Активен' : 'Неактивен'}
                          </span>
                        </td>
                        <td data-label="Действия">
                          <div className="action-buttons">
                            {template.connection_type === 'firebird' && (
                              <IconButton 
                                icon="download" 
                                variant="success" 
                                onClick={() => setLoadFirebirdModal({ 
                                  isOpen: true, 
                                  templateId: template.id, 
                                  templateName: template.name 
                                })}
                                title="Загрузить транзакции из Firebird"
                                size="small"
                              />
                            )}
                            {template.connection_type === 'api' && (
                              <IconButton 
                                icon="download" 
                                variant="success" 
                                onClick={() => setLoadApiModal({ 
                                  isOpen: true, 
                                  templateId: template.id, 
                                  templateName: template.name 
                                })}
                                title="Загрузить транзакции через API"
                                size="small"
                              />
                            )}
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-templates">
                <p>Шаблоны не найдены для выбранного провайдера.</p>
                <p>Создайте первый шаблон, используя кнопку "Создать шаблон".</p>
              </div>
            )}
          </div>
        )}

        {!selectedProviderId && (
          <div className="no-provider-selected">
            <p>Выберите провайдера для просмотра и редактирования шаблонов.</p>
          </div>
        )}
      </div>

      {/* Пагинация для шаблонов */}
      {selectedProviderId && total > limit && (
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
        message="Вы уверены, что хотите удалить этот шаблон? Это действие нельзя отменить."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, templateId: null })}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />

      {/* Модальное окно для загрузки из Firebird */}
      <LoadFirebirdModal
        isOpen={loadFirebirdModal.isOpen}
        templateName={loadFirebirdModal.templateName}
        dateFrom={firebirdDateFrom}
        dateTo={firebirdDateTo}
        onDateFromChange={setFirebirdDateFrom}
        onDateToChange={setFirebirdDateTo}
        onConfirm={async () => {
          setLoadingFirebird(true)
          setError('')
          try {
            const params = new URLSearchParams()
            params.append('template_id', loadFirebirdModal.templateId.toString())
            if (firebirdDateFrom) {
              params.append('date_from', firebirdDateFrom + ' 00:00:00')
            }
            if (firebirdDateTo) {
              params.append('date_to', firebirdDateTo + ' 23:59:59')
            }
            
            const response = await fetch(`${API_URL}/api/v1/transactions/load-from-firebird?${params}`, {
              method: 'POST'
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.detail || 'Ошибка загрузки данных из Firebird')
            }
            
            const result = await response.json()
            
            // Закрываем модальное окно и очищаем даты
            setLoadFirebirdModal({ isOpen: false, templateId: null, templateName: '' })
            setFirebirdDateFrom('')
            setFirebirdDateTo('')
            
            // Показываем результат
            let message = `Успешно загружено ${result.transactions_created} транзакций из Firebird`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              const warningsText = result.validation_warnings.join('\n')
              message += `\n\n⚠️ Предупреждения валидации:\n${warningsText}`
              setError(message)
            } else {
              alert(message)
              setError('')
            }
            
            // Перезагружаем транзакции в главном окне (если есть доступ к функции)
            if (window.loadTransactions) {
              window.loadTransactions()
            }
          } catch (err) {
            setError('Ошибка загрузки из Firebird: ' + err.message)
            logger.error('Ошибка загрузки из Firebird', { error: err.message })
          } finally {
            setLoadingFirebird(false)
          }
        }}
        onCancel={() => {
          setLoadFirebirdModal({ isOpen: false, templateId: null, templateName: '' })
          setFirebirdDateFrom('')
          setFirebirdDateTo('')
        }}
        loading={loadingFirebird}
      />

      {/* Модальное окно для загрузки через API */}
      <LoadApiModal
        isOpen={loadApiModal.isOpen}
        templateName={loadApiModal.templateName}
        dateFrom={apiDateFrom}
        dateTo={apiDateTo}
        cardNumbers={apiCardNumbers}
        onDateFromChange={setApiDateFrom}
        onDateToChange={setApiDateTo}
        onCardNumbersChange={setApiCardNumbers}
        onConfirm={async () => {
          setLoadingApi(true)
          setError('')
          try {
            const params = new URLSearchParams()
            params.append('template_id', loadApiModal.templateId.toString())
            params.append('date_from', apiDateFrom)
            params.append('date_to', apiDateTo)
            if (apiCardNumbers && apiCardNumbers.trim()) {
              // Преобразуем многострочный текст в список через запятую
              const cards = apiCardNumbers
                .split(/[,\n]/)
                .map(card => card.trim())
                .filter(card => card)
              if (cards.length > 0) {
                params.append('card_numbers', cards.join(','))
              }
            }
            
            const response = await fetch(`${API_URL}/api/v1/transactions/load-from-api?${params}`, {
              method: 'POST'
            })
            
            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.detail || 'Ошибка загрузки данных через API')
            }
            
            const result = await response.json()
            
            // Закрываем модальное окно и очищаем данные
            setLoadApiModal({ isOpen: false, templateId: null, templateName: '' })
            setApiDateFrom('')
            setApiDateTo('')
            setApiCardNumbers('')
            
            // Показываем результат
            let message = `Успешно загружено ${result.transactions_created} транзакций через API`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              const warningsText = result.validation_warnings.join('\n')
              message += `\n\n⚠️ Предупреждения валидации:\n${warningsText}`
              setError(message)
            } else {
              alert(message)
              setError('')
            }
            
            // Перезагружаем транзакции в главном окне (если есть доступ к функции)
            if (window.loadTransactions) {
              window.loadTransactions()
            }
          } catch (err) {
            setError('Ошибка загрузки через API: ' + err.message)
            logger.error('Ошибка загрузки через API', { error: err.message })
          } finally {
            setLoadingApi(false)
          }
        }}
        onCancel={() => {
          setLoadApiModal({ isOpen: false, templateId: null, templateName: '' })
          setApiDateFrom('')
          setApiDateTo('')
          setApiCardNumbers('')
        }}
        loading={loadingApi}
      />
    </div>
  )
}

export default TemplatesList
