import Icon from '../ui/Icon'

/**
 * Пример файла Excel: по нему определяется структура и предлагается
 * сопоставление полей.
 */
const FileUpload = ({
  stepNumber,
  analyzing,
  fileName,
  columnCount,
  autoMappedCount,
  systemFieldCount,
  onFileChange
}) => (
  <div className="form-section file-upload-section">
    <h4 className="section-title">
      <span className="step-number">{stepNumber}</span>
      Выбор файла для анализа
    </h4>
    <p className="section-description">
      Загрузите пример файла Excel для автоматического определения структуры и сопоставления полей.
      Система автоматически проанализирует файл и предложит сопоставление полей.
    </p>
    <div className="form-group file-upload-group">
      <label className="file-upload-label">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileChange}
          disabled={analyzing}
          className="file-input-hidden"
        />
        <span className="file-upload-button">
          {analyzing ? (
            <>
              <span className="spinner-small"></span>
              Анализ файла...
            </>
          ) : fileName ? (
            <>
              <Icon name="file" className="icon" size={20} strokeWidth={1.28} />
              {fileName}
            </>
          ) : (
            <>
              {/* Загрузка В систему — стрелка ВВЕРХ. Прежний залитый глиф был
                  download (стрелка от y=3 вниз к перекладине y=17), то есть
                  указывал противоположно смыслу кнопки. */}
              <Icon name="upload" className="icon" size={20} strokeWidth={1.28} />
              Выберите файл Excel
            </>
          )}
        </span>
      </label>
      {/* Итог разбора показываем, только если файл действительно разбирали в
          этом сеансе. У сохранённого шаблона колонки восстановлены из самого
          сопоставления, и сообщать о разборе было бы неправдой. */}
      {fileName && columnCount > 0 && (
        <div className="analysis-result">
          <div className="success-badge">
            <Icon name="check" className="icon-small" size={16} />
            Файл проанализирован: найдено {columnCount} колонок
          </div>
          {autoMappedCount > 0 && (
            <div className="auto-mapping-info">
              Автоматически сопоставлено полей: {autoMappedCount} из {systemFieldCount}
            </div>
          )}
        </div>
      )}
    </div>
  </div>
)

export default FileUpload
