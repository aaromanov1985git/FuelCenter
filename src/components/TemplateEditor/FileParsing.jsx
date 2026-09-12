/**
 * В каких строках файла Excel лежат заголовки и где начинаются данные.
 *
 * Нумерация с нуля, как её понимает разборщик на сервере.
 */
const FileParsing = ({ stepNumber, headerRow, dataStartRow, onChange }) => (
  <div className="form-section">
    <h4 className="section-title">
      <span className="step-number">{stepNumber}</span>
      Параметры парсинга файла
    </h4>
    <p className="section-description">
      Укажите, в каких строках находятся заголовки и данные в исходном файле Excel.
    </p>
    <div className="form-row form-row-numbers">
      <div className="form-group form-group-number">
        <label>
          Строка заголовков (начиная с 0):
          <input
            type="number"
            value={headerRow}
            onChange={(e) => onChange({ header_row: parseInt(e.target.value) || 0 })}
            min="0"
            className="input-number"
          />
          <span className="field-help">Номер строки, где находятся названия колонок</span>
        </label>
      </div>
      <div className="form-group form-group-number">
        <label>
          Строка начала данных (начиная с 0):
          <input
            type="number"
            value={dataStartRow}
            onChange={(e) => onChange({ data_start_row: parseInt(e.target.value) || 1 })}
            min="0"
            className="input-number"
          />
          <span className="field-help">Номер строки, с которой начинаются данные</span>
        </label>
      </div>
    </div>
  </div>
)

export default FileParsing
