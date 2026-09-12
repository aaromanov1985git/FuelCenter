import { useState, useEffect } from 'react'
import { authFetch } from '../../utils/api'
import { logger } from '../../utils/logger'

const API_URL = import.meta.env.VITE_API_URL || ''

const JSON_PLACEHOLDER = `{
  "Дизельное топливо": "ДТ",
  "Бензин": "АИ-92",
  "Бензин АИ-95": "АИ-95"
}`

/** Разбор текста маппинга в список пар. Неразобранный текст даёт пустой список. */
const entriesFromText = (text) => {
  if (!text) {
    return []
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, value]) => ({ key, value }))
    }
  } catch {
    // Пока текст недописан, разбирать нечего — это не ошибка.
  }
  return []
}

/** Сборка текста маппинга из списка пар. Пустые пары отбрасываются. */
const textFromEntries = (entries) => {
  const mapping = {}
  entries.forEach(({ key, value }) => {
    if (key && value) {
      mapping[key] = value
    }
  })
  return JSON.stringify(mapping, null, 2)
}

/**
 * Маппинг видов топлива: исходное название из источника -> название в системе.
 *
 * Хранится как текст JSON — его же сохраняет шаблон. Визуальный редактор
 * работает со списком пар, разобранным из этого текста, и собирает текст обратно
 * при каждом изменении. Какой редактор открыт и список пар — дело местное,
 * наружу видна только строка.
 */
const FuelTypeMapping = ({ text, onTextChange }) => {
  const [fuelTypes, setFuelTypes] = useState([])
  const [useVisualEditor, setUseVisualEditor] = useState(false)
  const [entries, setEntries] = useState(() => entriesFromText(text))

  // Список видов топлива нужен только здесь — для подсказки в выпадающем списке.
  useEffect(() => {
    const loadFuelTypes = async () => {
      try {
        const response = await authFetch(`${API_URL}/api/v1/fuel-types?limit=1000`)
        if (response.ok) {
          const result = await response.json()
          setFuelTypes(result.items || [])
        }
      } catch (err) {
        // Не показываем ошибку при 401 - это обрабатывается централизованно
        if (!err.isUnauthorized) {
          logger.error('Ошибка загрузки видов топлива:', err)
        }
      }
    }
    loadFuelTypes()
  }, [])

  /**
   * Пока визуальный редактор открыт, источник правды — список пар, а текст из
   * него выводится. Обратная сборка нужна только на входе в визуальный режим.
   *
   * Раньше это делалось эффектом на каждое изменение текста, и неполные пары
   * теряли строку: в текст они не попадают, а список тут же пересобирался из
   * текста. При пустом маппинге «+ Добавить запись» добавляла строку, текст
   * становился «{}», эффект срабатывал и строку стирал — кнопка выглядела
   * неработающей.
   */
  const toggleEditor = () => {
    const goingVisual = !useVisualEditor
    if (goingVisual) {
      setEntries(entriesFromText(text))
    }
    setUseVisualEditor(goingVisual)
  }

  const changeEntries = (newEntries) => {
    setEntries(newEntries)
    onTextChange(textFromEntries(newEntries))
  }

  const updateEntry = (index, field, value) => {
    const newEntries = [...entries]
    newEntries[index] = { ...newEntries[index], [field]: value }
    changeEntries(newEntries)
  }

  const addEntry = () => changeEntries([...entries, { key: '', value: '' }])

  const removeEntry = (index) => changeEntries(entries.filter((_, i) => i !== index))

  const clearMapping = () => {
    setEntries([])
    onTextChange('')
  }

  return (
    <div className="form-group fuel-mapping-group">
      <label>
        <div className="fuel-mapping-header">
          <span>Маппинг видов топлива (опционально)</span>
          <div className="fuel-mapping-actions">
            <button
              type="button"
              className={`btn-toggle-editor ${useVisualEditor ? 'is-active' : ''}`}
              onClick={toggleEditor}
            >
              {useVisualEditor ? '📝 Текстовый редактор' : '🎨 Визуальный редактор'}
            </button>
            {text && (
              <button
                type="button"
                className="btn-clear-mapping"
                onClick={clearMapping}
                title="Очистить маппинг"
              >
                🗑️ Очистить
              </button>
            )}
          </div>
        </div>

        {useVisualEditor ? (
          <div className="fuel-mapping-entries">
            {entries.length === 0 ? (
              <div className="fuel-mapping-empty">
                Нет записей маппинга. Нажмите "Добавить" для создания новой записи.
              </div>
            ) : (
              <div className="fuel-mapping-rows">
                {entries.map((entry, index) => (
                  <div key={index} className="fuel-mapping-row">
                    <input
                      type="text"
                      value={entry.key}
                      onChange={(e) => updateEntry(index, 'key', e.target.value)}
                      placeholder="Исходное название (из БД)"
                      className="fuel-mapping-input"
                    />
                    <span className="fuel-mapping-arrow">→</span>
                    <div className="fuel-mapping-target">
                      <select
                        value={entry.value}
                        onChange={(e) => updateEntry(index, 'value', e.target.value)}
                        className="fuel-mapping-input"
                      >
                        <option value="">Выберите или введите</option>
                        {fuelTypes.map((ft) => (
                          <option key={ft.id} value={ft.normalized_name || ft.original_name}>
                            {ft.normalized_name || ft.original_name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={entry.value}
                        onChange={(e) => updateEntry(index, 'value', e.target.value)}
                        placeholder="Введите вручную"
                        className="fuel-mapping-input"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-remove-entry"
                      onClick={() => removeEntry(index)}
                      title="Удалить запись"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn-add-entry" onClick={addEntry}>
              + Добавить запись
            </button>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={JSON_PLACEHOLDER}
            className="input-full-width fuel-mapping-json"
            rows={6}
          />
        )}
        <span className="field-help">
          <strong>Важно:</strong> Ключ — исходное название топлива из базы данных (например, "Дизельное топливо"),
          значение — нормализованное название для системы (например, "ДТ").
          Формат JSON объекта. Можно оставить пустым.
        </span>
      </label>
    </div>
  )
}

export default FuelTypeMapping
