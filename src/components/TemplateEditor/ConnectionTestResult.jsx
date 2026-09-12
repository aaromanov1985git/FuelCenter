import Icon from '../ui/Icon'

/**
 * Результат проверки подключения: зелёная галка или красный крест с сообщением.
 *
 * Разметка была дословно продублирована в секциях API и веб-сервиса, вместе с
 * обоими SVG. Пока результата нет, ничего не рисуется.
 *
 * children показываются только при успехе — у Firebird это число найденных
 * таблиц, у остальных подключений добавки нет.
 */
const ConnectionTestResult = ({ result, children }) => {
  if (!result) {
    return null
  }

  return (
    <div className={`connection-test-result ${result.success ? 'success' : 'error'}`}>
      {/* Голые check/close без охватывающего кружка — как в Alert и ui/Toast:
          в одном интерфейсе не должно быть двух написаний одного статуса.
          Класс icon-small оставлен, на нём размер 16px, flex-shrink и отбивка. */}
      <Icon name={result.success ? 'check' : 'close'} className="icon-small" size={16} />
      {result.message}
      {result.success && children}
    </div>
  )
}

export default ConnectionTestResult
