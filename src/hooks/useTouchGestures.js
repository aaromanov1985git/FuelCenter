import { useEffect, useRef } from 'react'

/**
 * Хук для обработки touch-жестов на мобильных устройствах
 * 
 * @param {function} onSwipeLeft - Обработчик свайпа влево
 * @param {function} onSwipeRight - Обработчик свайпа вправо
 * @param {function} onSwipeUp - Обработчик свайпа вверх
 * @param {function} onSwipeDown - Обработчик свайпа вниз
 * @param {number} minSwipeDistance - Минимальное расстояние для распознавания свайпа (по умолчанию 50px)
 * @param {number} maxSwipeTime - Максимальное время для распознавания свайпа в мс (по умолчанию 300ms)
 */
export const useTouchGestures = ({
  onSwipeLeft = null,
  onSwipeRight = null,
  onSwipeUp = null,
  onSwipeDown = null,
  minSwipeDistance = 50,
  maxSwipeTime = 300
}) => {
  const touchStart = useRef(null)
  const touchEnd = useRef(null)

  useEffect(() => {
    const handleTouchStart = (e) => {
      touchEnd.current = null
      touchStart.current = e.touches[0].clientX
    }

    const handleTouchMove = (e) => {
      touchEnd.current = e.touches[0].clientX
    }

    const handleTouchEnd = () => {
      if (!touchStart.current || !touchEnd.current) return

      const distance = touchStart.current - touchEnd.current
      const timeElapsed = Date.now() - (touchStart.current.timestamp || Date.now())
      const isLeftSwipe = distance > minSwipeDistance && timeElapsed < maxSwipeTime
      const isRightSwipe = distance < -minSwipeDistance && timeElapsed < maxSwipeTime

      // Также проверяем вертикальный свайп
      const touchStartY = touchStart.current
      const touchEndY = touchEnd.current
      const verticalDistance = touchStartY - touchEndY
      const isUpSwipe = verticalDistance < -minSwipeDistance && timeElapsed < maxSwipeTime
      const isDownSwipe = verticalDistance > minSwipeDistance && timeElapsed < maxSwipeTime

      if (isLeftSwipe && onSwipeLeft) {
        onSwipeLeft()
      }
      if (isRightSwipe && onSwipeRight) {
        onSwipeRight()
      }
      if (isUpSwipe && onSwipeUp) {
        onSwipeUp()
      }
      if (isDownSwipe && onSwipeDown) {
        onSwipeDown()
      }
    }

    // Улучшенная версия с отслеживанием Y координат
    const handleTouchStartFull = (e) => {
      touchEnd.current = null
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        timestamp: Date.now()
      }
    }

    const handleTouchMoveFull = (e) => {
      touchEnd.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      }
    }

    const handleTouchEndFull = () => {
      if (!touchStart.current || !touchEnd.current) return

      const deltaX = touchStart.current.x - touchEnd.current.x
      const deltaY = touchStart.current.y - touchEnd.current.y
      const timeElapsed = Date.now() - touchStart.current.timestamp

      // Проверяем, что движение достаточно быстрое и в одном направлении
      if (timeElapsed > maxSwipeTime) return

      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      // Определяем основное направление
      if (absX > absY && absX > minSwipeDistance) {
        // Горизонтальный свайп
        if (deltaX > 0 && onSwipeLeft) {
          onSwipeLeft()
        } else if (deltaX < 0 && onSwipeRight) {
          onSwipeRight()
        }
      } else if (absY > absX && absY > minSwipeDistance) {
        // Вертикальный свайп
        if (deltaY > 0 && onSwipeUp) {
          onSwipeUp()
        } else if (deltaY < 0 && onSwipeDown) {
          onSwipeDown()
        }
      }
    }

    // Используем улучшенную версию
    document.addEventListener('touchstart', handleTouchStartFull)
    document.addEventListener('touchmove', handleTouchMoveFull)
    document.addEventListener('touchend', handleTouchEndFull)

    return () => {
      document.removeEventListener('touchstart', handleTouchStartFull)
      document.removeEventListener('touchmove', handleTouchMoveFull)
      document.removeEventListener('touchend', handleTouchEndFull)
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, minSwipeDistance, maxSwipeTime])
}

export default useTouchGestures

