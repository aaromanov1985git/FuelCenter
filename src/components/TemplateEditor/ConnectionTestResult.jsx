/**
 * Результат проверки подключения: зелёная галка или красный крест с сообщением.
 *
 * Разметка была дословно продублирована в секциях API и веб-сервиса, вместе с
 * обоими SVG. Пока результата нет, ничего не рисуется.
 */
const ConnectionTestResult = ({ result }) => {
  if (!result) {
    return null
  }

  return (
    <div className={`connection-test-result ${result.success ? 'success' : 'error'}`}>
      {result.success ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="icon-small" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
      {result.message}
    </div>
  )
}

export default ConnectionTestResult
