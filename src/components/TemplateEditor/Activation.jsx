/**
 * Активность шаблона: доступен ли он для загрузки данных.
 */
const Activation = ({ stepNumber, isActive, onChange }) => (
  <div className="form-section">
    <h4 className="section-title">
      <span className="step-number">{stepNumber}</span>
      Активация шаблона
    </h4>
    <div className="form-group checkbox-group">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => onChange({ is_active: e.target.checked })}
        />
        Шаблон активен
      </label>
      <span className="field-help">Активные шаблоны доступны для использования при загрузке файлов</span>
    </div>
  </div>
)

export default Activation
