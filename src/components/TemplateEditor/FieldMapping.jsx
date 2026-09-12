import FuelTypeMapping from './FuelTypeMapping'
import { SYSTEM_FIELDS } from '../../utils/templateModel'

/** Как называется колонка источника у каждого типа подключения. */
const SOURCE_LABEL = {
  file: 'Колонка из файла',
  api: 'Поле из API ответа',
  web: 'Поле из API ответа',
  firebird: 'Поле из БД Firebird'
}

/** Пояснение к шагу: у каждого типа подключения своё. */
const DESCRIPTION = {
  file: 'Система автоматически сопоставила поля, где это было возможно. Проверьте и при необходимости исправьте сопоставление вручную.',
  firebird: 'Укажите соответствие полей из базы данных Firebird полям системы.',
  web: 'Для веб-сервиса укажите соответствие полей из API ответа полям системы. Используйте стандартные названия полей или введите вручную.',
  api: 'Для API подключения используйте кнопку "Загрузить поля из API" для получения списка доступных полей из API ответа. Затем выберите соответствующие поля из выпадающего списка или введите вручную.'
}

const CheckIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
)

/**
 * Состояние сопоставления одного поля: авто, вручную или пусто.
 */
const MappingStatus = ({ isMapped, isAutoMapped }) => {
  if (!isMapped) {
    return <span className="status-badge status-empty">Не выбрано</span>
  }

  return (
    <span className={`status-badge ${isAutoMapped ? 'status-auto' : 'status-manual'}`}>
      {isAutoMapped ? (
        <>
          <CheckIcon className="icon-tiny" />
          Авто
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="icon-tiny" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
          Вручную
        </>
      )}
    </span>
  )
}

/**
 * Сопоставление полей системы с полями источника.
 *
 * Источник у файла выбирается только из списка колонок: их набор определён
 * разобранным примером, вписывать имя руками негде. У остальных подключений
 * список полей может быть неполным или вовсе не загруженным, поэтому рядом со
 * списком стоит поле ручного ввода — раньше эти две ветки, API и Firebird, были
 * выписаны отдельно и совпадали дословно, различаясь только источником списка.
 */
const FieldMapping = ({
  stepNumber,
  connectionType,
  columns,
  fieldMapping,
  onFieldMapping,
  autoMappedFields,
  onManualOverride,
  fuelMappingText,
  onFuelMappingChange
}) => {
  const sourceLabel = SOURCE_LABEL[connectionType]
  const allowsManualInput = connectionType !== 'file'

  return (
    <div className="form-section mapping-section">
      <h4 className="section-title">
        <span className="step-number">{stepNumber}</span>
        Сопоставление полей
      </h4>
      <p className="section-description">
        {DESCRIPTION[connectionType]}
        Поля, отмеченные <span className="required-mark">*</span>, обязательны для заполнения.
      </p>
      {allowsManualInput && connectionType !== 'firebird' && columns.length > 0 && (
        <div className="success-badge mapping-fields-loaded">
          <CheckIcon className="icon-small" />
          Загружено полей из API: {columns.length}
        </div>
      )}

      <div className="mapping-table">
        <table>
          <thead>
            <tr>
              <th>Поле системы</th>
              <th>{sourceLabel}</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {SYSTEM_FIELDS.map(field => {
              const value = fieldMapping[field.key] || ''
              const isMapped = Boolean(fieldMapping[field.key])
              const isAutoMapped = Boolean(autoMappedFields[field.key])
              const missing = field.required && !isMapped
              // Зелёную подсветку списка ставит только файловый вариант: у прочих
              // типов её не было. Для сохранённого шаблона в autoMappedFields
              // попадает весь его маппинг, так что подсветка позеленила бы все
              // списки подряд, хотя сопоставление делали руками.
              const markAuto = isAutoMapped && !allowsManualInput
              const selectClass = `mapping-select ${markAuto ? 'auto-mapped-select' : ''} ${missing ? 'missing-required-select' : ''}`

              return (
                <tr
                  key={field.key}
                  className={`${field.required ? 'required' : ''} ${isAutoMapped ? 'auto-mapped' : ''} ${missing ? 'missing-required' : ''}`}
                >
                  <td data-label="Поле системы">
                    <span className="field-label">
                      {field.label}
                      {field.required && <span className="required-mark"> *</span>}
                    </span>
                  </td>
                  <td data-label={sourceLabel}>
                    <div className={allowsManualInput ? 'mapping-cell' : ''}>
                      <select
                        value={value}
                        onChange={(e) => {
                          onFieldMapping(field.key, e.target.value)
                          // Правка вручную снимает отметку автоматического сопоставления
                          if (e.target.value && isAutoMapped) {
                            onManualOverride(field.key)
                          }
                        }}
                        className={selectClass}
                      >
                        <option value="">-- Не выбрано --</option>
                        {/* Сохранённое сопоставление может ссылаться на колонку,
                            которой в загруженном списке нет: таблицу Firebird или
                            поля API ещё не запрашивали. Без своей опции список
                            показывал бы «Не выбрано» рядом с заполненным полем. */}
                        {value && !columns.includes(value) && (
                          <option value={value}>{value}</option>
                        )}
                        {columns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                      {allowsManualInput && (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => onFieldMapping(field.key, e.target.value)}
                          placeholder="Или введите имя поля"
                          className={`mapping-input ${missing ? 'missing-required-select' : ''}`}
                        />
                      )}
                    </div>
                  </td>
                  <td className="mapping-status-cell" data-label="Статус">
                    <MappingStatus isMapped={isMapped} isAutoMapped={isAutoMapped} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <FuelTypeMapping text={fuelMappingText} onTextChange={onFuelMappingChange} />
    </div>
  )
}

export default FieldMapping
