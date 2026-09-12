import { useCallback, useEffect, useState } from 'react'

/**
 * Признак горизонтальной прокрутки В ПОКОЕ.
 *
 * Правило B4 фиксировало только сам факт `scrollWidth > clientWidth`, а замеры
 * показали, что у таблиц нет никакого указателя на скрытое содержимое: на 1024
 * у АЗС за краем оставалось 520px из 1262 (41% таблицы), у транзакций 297 из
 * 1039 (29%), у пользователей 217 из 919 (24%). Оверлейный скроллбар в покое не
 * нарисован, а липкая колонка «Действия» закрывает край, из-за чего обрыв
 * читается как замысел.
 *
 * Возвращает ref на контейнер прокрутки и два флага: есть ли скрытое содержимое
 * слева и справа. Сам указатель рисуется CSS-ом (.ui-table-edge, .tx-table-edge)
 * — здесь только измерение.
 *
 * ref — колбэк, а не useRef: контейнер появляется и исчезает (состояния
 * «загрузка» и «нет данных» рендерят другое дерево), а эффект на useRef в такие
 * моменты не перезапускается, и подписка не навешивалась бы вовсе.
 */
export default function useEdgeScroll() {
  const [node, setNode] = useState(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const ref = useCallback((el) => setNode(el ?? null), [])

  const measure = useCallback(() => {
    if (!node) return
    // Округление: дробный scrollLeft при масштабе браузера иначе даёт вечный
    // «есть куда прокрутить» на 0.5px.
    const max = Math.round(node.scrollWidth - node.clientWidth)
    const left = Math.round(node.scrollLeft)
    const next = { start: left > 1, end: max > 1 && left < max - 1 }
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [node])

  useEffect(() => {
    if (!node) {
      setEdges((prev) => (prev.start || prev.end ? { start: false, end: false } : prev))
      return undefined
    }

    measure()
    node.addEventListener('scroll', measure, { passive: true })

    // ResizeObserver — не обязательное условие: без него указатель остаётся
    // верным, просто пересчитывается только по scroll и resize окна. Проверяем
    // и сам конструктор, и метод: в тестовой среде стоит заглушка, у которой
    // после mockReset метода observe уже нет (vitest.config.js: mockReset).
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      const candidate = new ResizeObserver(measure)
      if (candidate && typeof candidate.observe === 'function') {
        observer = candidate
        observer.observe(node)
        // Ширина самой таблицы меняется от данных и от набора колонок, а не от
        // размеров контейнера, поэтому наблюдаем и её.
        if (node.firstElementChild) observer.observe(node.firstElementChild)
      }
    }
    window.addEventListener('resize', measure)

    return () => {
      node.removeEventListener('scroll', measure)
      if (observer && typeof observer.disconnect === 'function') observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [node, measure])

  return { ref, hasStart: edges.start, hasEnd: edges.end, remeasure: measure }
}
