import { authFetch } from './api'
import { logger } from './logger'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

export const loadApiTemplates = async () => {
  const response = await authFetch(`${API_URL}/api/v1/templates`)
  if (!response.ok) return []

  const result = await response.json()
  const apiTemplates = result.items.filter(t => {
    const connectionType = (t.connection_type || '').toLowerCase()
    return (connectionType === 'web' || connectionType === 'api') && t.is_active !== false
  })

  if (apiTemplates.length === 0 && result.items.length > 0) {
    logger.warn('Не найдено шаблонов с типом "web" или "api"', {
      total_templates: result.items.length,
      templates: result.items.map(t => ({
        id: t.id,
        name: t.name,
        connection_type: t.connection_type,
        is_active: t.is_active
      }))
    })
  }

  return apiTemplates
}
