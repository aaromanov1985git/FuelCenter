import React, { useState, useEffect } from 'react'
import './ScrollToTop.css'

/**
 * Компонент кнопки "Наверх" для быстрого скролла
 * 
 * @param {number} showAfter - Показывать кнопку после скролла на N пикселей (по умолчанию 300)
 * @param {number} scrollDuration - Длительность плавного скролла в миллисекундах (по умолчанию 500)
 */
const ScrollToTop = ({ showAfter = 300, scrollDuration = 500 }) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > showAfter) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)

    return () => {
      window.removeEventListener('scroll', toggleVisibility)
    }
  }, [showAfter])

  const scrollToTop = () => {
    const startPosition = window.pageYOffset
    const startTime = performance.now()

    const easeInOutCubic = (t) => {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2
    }

    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / scrollDuration, 1)
      const eased = easeInOutCubic(progress)

      window.scrollTo(0, startPosition * (1 - eased))

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      }
    }

    requestAnimationFrame(animateScroll)
  }

  if (!isVisible) {
    return null
  }

  return (
    <button
      className="scroll-to-top"
      onClick={scrollToTop}
      aria-label="Наверх"
      title="Наверх"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="scroll-to-top-icon"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}

export default ScrollToTop

