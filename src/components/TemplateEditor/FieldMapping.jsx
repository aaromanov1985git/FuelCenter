import FuelTypeMapping from './FuelTypeMapping'
import Icon from '../ui/Icon'
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
          <Icon name="check" className="icon-tiny" size={12} strokeWidth={2} />
          Авто
        </>
      ) : (
        <>
          {/* Планшет со списком: «заполнено руками». Класс icon-tiny держит 12px,
              strokeWidth 2 при 12px даёт отрисованный штрих 1.5px — иначе на самом
              мелком глифе интерфейса он упал бы до 1.2px. */}
          <Icon name="clipboard" className="icon-tiny" size={12} strokeWidth={2} />
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
          <Icon name="check" className="icon-small" size={16} />
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
