import { useState } from 'react'
import ConnectionTestResult from './ConnectionTestResult'
import Icon from '../ui/Icon'
import { authFetch } from '../../utils/api'
import { logger } from '../../utils/logger'

const API_URL = import.meta.env.VITE_API_URL || ''

const SQL_PLACEHOLDER = `SELECT
    "dcCards"."Name" AS "Наименование карты",
    rg."AZSCode" AS "АЗС",
    rg."Date" AS "Дата и время",
    rg."Quantity" AS "Количество",
    "dcAmounts"."Name" AS "Вид топлива",
    rg."PartnerID" AS "Организация"
FROM "rgAmountRests" rg
LEFT JOIN "dcCards" ON rg."CardID" = "dcCards"."CardID"
LEFT JOIN "dcAmounts" ON rg."AmountID" = "dcAmounts"."AmountID"
WHERE rg."DocTypeID" = 3
ORDER BY rg."Date" DESC`

/**
 * Подключение к Firebird и источник данных в нём — два шага формы.
 *
 * Все запросы уходят с настройками из формы, а не из сохранённого шаблона. Так
 * было задумано у кнопки «Тестировать подключение» (тестируем то, что человек
 * видит на экране, включая несохранённые правки), а загрузка таблиц и колонок
 * для сохранённого шаблона брала настройки из базы и потому противоречила
 * соседней кнопке: поправил хост, нажал «загрузить таблицы» — получил таблицы
 * старого хоста. Пароли в ответе сервера расшифрованы, так что настройки из
 * формы для сохранённого шаблона рабочие.
 *
 * Найденные колонки поднимаются наверх: их показывает секция сопоставления полей.
 */
const FirebirdConnection = ({
  connectionStep,
  sourceStep,
  connectionSettings,
  setConnectionSettings,
  sourceTable,
  sourceQuery,
  onSourceChange,
  columns,
  onColumns,
  onError
}) => {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [loadingTables, setLoadingTables] = useState(false)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [availableTables, setAvailableTables] = useState([])

  const updateSettings = (patch) => setConnectionSettings({ ...connectionSettings, ...patch })

  /** Настройки подключения для тела запроса. */
  const postSettings = (url, body) => authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const testConnection = async () => {
    if (!connectionSettings.database || !connectionSettings.database.trim()) {
      onError('Укажите путь к базе данных')
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = await postSettings(`${API_URL}/api/v1/templates/test-firebird-connection`, connectionSettings)
      setTestResult(await response.json())
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setTestResult({ success: false, message: 'Ошибка тестирования: ' + err.message })
    } finally {
      setTesting(false)
    }
  }

  const loadTables = async () => {
    if (!connectionSettings.database) {
      onError('Укажите путь к базе данных Firebird')
      return
    }

    setLoadingTables(true)
    onError('')

    try {
      const response = await postSettings(`${API_URL}/api/v1/templates/test-firebird-connection`, connectionSettings)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка подключения к Firebird')
      }

      const result = await response.json()
      setTestResult(result)

      if (result.success && result.tables) {
        setAvailableTables(result.tables)
        // Если таблица уже выбрана, сразу подтягиваем её колонки
        if (sourceTable) {
          await loadTableColumns(sourceTable)
        }
      } else {
        onError(result.message || 'Не удалось получить список таблиц')
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      onError('Ошибка загрузки таблиц: ' + err.message)
      setTestResult({ success: false, message: err.message })
    } finally {
      setLoadingTables(false)
    }
  }

  const loadTableColumns = async (tableName) => {
    if (!tableName) {
      onColumns([])
      return
    }

    setLoadingColumns(true)
    onError('')
    logger.debug('Загрузка колонок для таблицы:', { tableName })

    try {
      const response = await postSettings(`${API_URL}/api/v1/templates/firebird-table-columns`, {
        connection_settings: connectionSettings,
        table_name: tableName
      })

      if (!response.ok) {
        const errorData = await response.json()
        logger.error('Ошибка ответа:', errorData)
        throw new Error(errorData.detail || 'Ошибка загрузки колонок')
      }

      const result = await response.json()
      logger.debug('Колонки загружены:', result)
      onColumns(result.columns || [])
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки колонок:', err)
      onError('Ошибка загрузки колонок таблицы: ' + err.message)
      onColumns([])
    } finally {
      setLoadingColumns(false)
    }
  }

  const loadQueryColumns = async (query) => {
    if (!query || !query.trim()) {
      onColumns([])
      return
    }

    setLoadingColumns(true)
    onError('')
    logger.debug('Загрузка колонок из SQL запроса')

    try {
      const response = await postSettings(`${API_URL}/api/v1/templates/firebird-query-columns`, {
        connection_settings: connectionSettings,
        query: query.trim()
      })

      if (!response.ok) {
        const errorData = await response.json()
        logger.error('Ошибка ответа:', errorData)
        throw new Error(errorData.detail || 'Ошибка загрузки колонок из SQL запроса')
      }

      const result = await response.json()
      logger.debug('Колонки из SQL запроса загружены:', result)
      onColumns(result.columns || [])
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки колонок из SQL запроса:', err)
      onError('Ошибка загрузки колонок из SQL запроса: ' + err.message)
      onColumns([])
    } finally {
      setLoadingColumns(false)
    }
  }

  /** Выбор таблицы отменяет SQL-запрос: источник данных всегда один. */
  const selectTable = (tableName) => {
    onSourceChange({ source_table: tableName, source_query: '' })
    onColumns([])
  }

  return (
    <>
      <div className="form-section">
        <h4 className="section-title">
          <span className="step-number">{connectionStep}</span>
          Настройки подключения к Firebird
        </h4>
        <p className="section-description">
          Укажите параметры подключения к базе данных Firebird.
        </p>

        <div className="form-row">
          <div className="form-group">
            <label>
              Хост сервера:
              <input
                type="text"
                value={connectionSettings.host || 'localhost'}
                onChange={(e) => updateSettings({ host: e.target.value })}
                placeholder="localhost"
                className="input-full-width"
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Порт:
              <input
                type="number"
                value={connectionSettings.port || 3050}
                onChange={(e) => updateSettings({ port: parseInt(e.target.value) || 3050 })}
                placeholder="3050"
                className="input-full-width"
              />
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>
            Путь к базе данных: <span className="required-mark">*</span>
            <input
              type="text"
              value={connectionSettings.database || ''}
              onChange={(e) => updateSettings({ database: e.target.value })}
              placeholder="/path/to/database.fdb или имя базы"
              className="input-full-width"
            />
            <span className="field-help">Полный путь к файлу базы данных или имя базы на сервере</span>
          </label>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              Пользователь:
              <input
                type="text"
                value={connectionSettings.user || 'SYSDBA'}
                onChange={(e) => updateSettings({ user: e.target.value })}
                placeholder="SYSDBA"
                className="input-full-width"
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Пароль:
              <input
                type="password"
                value={connectionSettings.password || ''}
                onChange={(e) => updateSettings({ password: e.target.value })}
                placeholder="masterkey"
                className="input-full-width"
                autoComplete="current-password"
              />
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>
            Кодировка:
            <select
              value={connectionSettings.charset || 'UTF8'}
              onChange={(e) => updateSettings({ charset: e.target.value })}
              className="input-full-width"
            >
              <option value="UTF8">UTF8</option>
              <option value="WIN1251">WIN1251</option>
              <option value="WIN1252">WIN1252</option>
            </select>
          </label>
        </div>

        <div className="form-group form-group-test-connection">
          <button
            type="button"
            className="btn-test-connection"
            onClick={testConnection}
            disabled={testing || !connectionSettings.database}
          >
            {testing ? 'Тестирование...' : 'Тестировать подключение'}
          </button>
          <ConnectionTestResult result={testResult}>
            {testResult?.tables && testResult.tables.length > 0 && (
              <div className="tables-list">
                Найдено таблиц: {testResult.tables.length}
              </div>
            )}
          </ConnectionTestResult>
        </div>
      </div>

      <div className="form-section">
        <h4 className="section-title">
          <span className="step-number">{sourceStep}</span>
          Источник данных в Firebird
        </h4>
        <p className="section-description">
          Укажите таблицу или SQL запрос для получения данных из базы Firebird.
          Если данные находятся в нескольких связанных таблицах, используйте SQL запрос с JOIN.
          Вы можете получить список таблиц, подключившись к базе данных.
          <br/><strong>Важно:</strong> В Firebird используйте кавычки для имен таблиц и колонок с учетом регистра.
          Например: <code>"dcCards"."CardID"</code> или <code>"rgAmountRests"."Date"</code>
        </p>

        <div className="form-group">
          <label>
            Имя таблицы:
            <div className="source-table-row">
              <div className="source-table-controls">
                <select
                  value={sourceTable || ''}
                  onChange={(e) => selectTable(e.target.value)}
                  className="input-full-width"
                >
                  <option value="">-- Выберите таблицу --</option>
                  {availableTables.map(table => (
                    <option key={table} value={table}>{table}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={sourceTable || ''}
                  onChange={(e) => selectTable(e.target.value)}
                  placeholder="Или введите имя таблицы вручную (например, rgAmountRests)"
                  className="input-full-width"
                />
                <button
                  type="button"
                  className="btn-load-tables"
                  onClick={loadTables}
                  disabled={loadingTables || !connectionSettings.database}
                  title={!connectionSettings.database ? 'Сначала укажите путь к базе данных' : 'Загрузить список таблиц из базы данных'}
                >
                  <Icon name={loadingTables ? 'clock' : 'rows'} size={16} />
                </button>
              </div>
              <button
                type="button"
                className="btn-load-columns"
                onClick={() => loadTableColumns(sourceTable)}
                disabled={!sourceTable || loadingColumns}
                title="Загрузить колонки выбранной таблицы"
              >
                <Icon name={loadingColumns ? 'clock' : 'search'} size={16} />
                {loadingColumns ? 'Загрузка...' : 'Загрузить колонки'}
              </button>
            </div>
            <span className="field-help">
              Выберите таблицу из списка (после загрузки) или введите имя вручную (например, rgAmountRests).
              Нажмите кнопку со списком справа, чтобы загрузить перечень таблиц из базы данных.
              После выбора таблицы нажмите "Загрузить колонки" для получения списка полей.
            </span>
          </label>
        </div>

        {columns.length > 0 && (
          <div className="table-columns-info">
            <div className="success-badge">
              <Icon name="check" className="icon-small" size={16} />
              Найдено колонок в таблице "{sourceTable}": {columns.length}
            </div>
            <div className="columns-list">
              {columns.map(col => (
                <span key={col} className="column-badge">{col}</span>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>
            SQL запрос: <span className="required-mark">*</span>
            <textarea
              value={sourceQuery || ''}
              onChange={(e) => {
                onSourceChange({ source_query: e.target.value, source_table: '' })
                onColumns([])
              }}
              placeholder={SQL_PLACEHOLDER}
              rows="12"
              className="textarea-full-width sql-editor"
            />
            <div className="sql-actions">
              <button
                type="button"
                className="btn-load-columns"
                onClick={() => {
                  if (!sourceQuery || !sourceQuery.trim()) {
                    onError('Сначала введите SQL запрос')
                    return
                  }
                  loadQueryColumns(sourceQuery)
                }}
                disabled={!sourceQuery || loadingColumns}
                title="Получить список колонок из SQL запроса"
              >
                <Icon name={loadingColumns ? 'clock' : 'search'} size={16} />
                {loadingColumns ? 'Загрузка...' : 'Получить колонки из SQL запроса'}
              </button>
            </div>
            <span className="field-help">
              <strong>SQL запрос для получения данных (имеет приоритет над именем таблицы).</strong><br/>
              Используйте SQL запрос с JOIN, если данные находятся в нескольких связанных таблицах.
              В запросе используйте AS для переименования колонок в понятные названия (например, "Дата и время", "Количество").
              После ввода запроса нажмите "Получить колонки" для получения списка полей из результата запроса.
            </span>
          </label>
        </div>
      </div>
    </>
  )
}

export default FirebirdConnection
