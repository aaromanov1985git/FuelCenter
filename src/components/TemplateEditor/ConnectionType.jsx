/** Источники данных, которые умеет шаблон. */
const CONNECTION_TYPES = [
  { value: 'file', label: 'Загрузка из файла Excel' },
  { value: 'firebird', label: 'Firebird Database (FDB)' },
  { value: 'api', label: 'Загрузка API' },
  { value: 'web', label: 'Веб-сервис (Web Service)' }
]

/**
 * Выбор источника данных. Смена типа сбрасывает настройки подключения —
 * наборы полей у типов не пересекаются; что при этом переносится, решает
 * settingsForConnectionType в модели шаблона.
 */
const ConnectionType = ({ stepNumber, value, onChange }) => (
  <div className="form-section">
    <h4 className="section-title">
      <span className="step-number">{stepNumber}</span>
      Тип подключения
    </h4>
    <p className="section-description">
      Выберите источник данных для шаблона: загрузка из файла Excel, подключение к базе данных Firebird, загрузка через API провайдера или подключение к веб-сервису с авторизацией.
    </p>
    <div className="form-group">
      <label>
        Тип подключения: <span className="required-mark">*</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-full-width"
        >
          {CONNECTION_TYPES.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </label>
    </div>
  </div>
)

export default ConnectionType
