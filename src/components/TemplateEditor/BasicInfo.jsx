/**
 * Название и описание шаблона.
 */
const BasicInfo = ({ stepNumber, name, description, onChange }) => (
  <div className="form-section">
    <h4 className="section-title">
      <span className="step-number">{stepNumber}</span>
      Основная информация
    </h4>
    <div className="form-row form-row-basic-info">
      <div className="form-group form-group-name">
        <label>
          Название шаблона: <span className="required-mark">*</span>
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Например: Стандартный шаблон РП-газпром"
            className="input-full-width"
          />
        </label>
      </div>
      <div className="form-group form-group-description">
        <label>
          Описание:
          <textarea
            value={description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Описание шаблона..."
            rows="3"
            className="textarea-full-width"
          />
        </label>
      </div>
    </div>
  </div>
)

export default BasicInfo
