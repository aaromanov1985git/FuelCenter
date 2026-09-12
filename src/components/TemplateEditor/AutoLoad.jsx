import { formatSchedule } from '../../utils/templateModel'

/**
 * Смещение даты в днях: пустое поле и нечисловой ввод возвращают значение по
 * умолчанию, ноль остаётся нулём.
 *
 * У начальной даты обработчик был `parseInt(value) || fallback`, а ноль ложный,
 * поэтому ввести 0 было нельзя — поле отскакивало на -7, хотя max="0" его
 * разрешает, а подсказка объясняет, что 0 значит текущую дату.
 *
 * @param {string} value - то, что человек набрал в поле
 * @param {number} fallback - значение по умолчанию для этого поля
 * @returns {number} Смещение в днях
 */
const parseOffset = (value, fallback) => {
  if (value === '') {
    return fallback
  }
  const parsed = parseInt(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

/**
 * Автоматическая загрузка данных по расписанию.
 *
 * Показывается только для подключений, которые умеют забирать данные сами:
 * Firebird, API провайдера и веб-сервис.
 */
const AutoLoad = ({ stepNumber, enabled, schedule, dateFromOffset, dateToOffset, onChange }) => (
  <div className="form-section">
    <h4 className="section-title">
      <span className="step-number">{stepNumber}</span>
      Настройки автоматической загрузки
    </h4>
    <div className="form-group checkbox-group">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ auto_load_enabled: e.target.checked })}
        />
        Включить автоматическую загрузку
      </label>
      <span className="field-help">
        При включении шаблон будет автоматически загружать данные по расписанию
      </span>
    </div>

    {enabled && (
      <>
        {schedule && (
          <div className="auto-load-info">
            <strong>Автоматическая загрузка включена</strong>
            <div className="auto-load-schedule">
              Расписание: <strong>{formatSchedule(schedule)}</strong>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>
            Расписание (cron-выражение):
            <input
              type="text"
              value={schedule}
              onChange={(e) => onChange({ auto_load_schedule: e.target.value })}
              placeholder='Например: "0 2 * * *" (каждый день в 2:00) или "hourly" (каждый час)'
              className="input-full-width"
            />
          </label>
          <span className="field-help">
            Формат cron: минута час день месяц день_недели. Примеры: "0 2 * * *" - каждый день в 2:00,
            "0 */6 * * *" - каждые 6 часов, "0 0 * * 1" - каждый понедельник в полночь.
            Также поддерживаются простые форматы: "hourly" (каждый час), "daily" (каждый день в 2:00), "weekly" (каждую неделю)
          </span>
        </div>

        <div className="form-group form-row-offsets">
          <label>
            Смещение начальной даты (дни):
            <input
              type="number"
              value={dateFromOffset}
              onChange={(e) => onChange({ auto_load_date_from_offset: parseOffset(e.target.value, -7) })}
              className="input-full-width"
              min="-365"
              max="0"
            />
          </label>
          <label>
            Смещение конечной даты (дни):
            <input
              type="number"
              value={dateToOffset}
              onChange={(e) => onChange({ auto_load_date_to_offset: parseOffset(e.target.value, -1) })}
              className="input-full-width"
              min="-365"
              max="0"
            />
          </label>
        </div>
        <span className="field-help offsets-help">
          Отрицательные значения означают дни назад от текущей даты.
          Например: -7 для начала означает неделю назад, -1 для конца означает вчера.
          Значение 0 для конечной даты означает текущую дату и текущее время.
        </span>
      </>
    )}
  </div>
)

export default AutoLoad
