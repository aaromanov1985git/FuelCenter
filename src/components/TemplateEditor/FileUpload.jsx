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
              <svg xmlns="http://www.w3.org/2000/svg" className="icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              {fileName}
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
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
