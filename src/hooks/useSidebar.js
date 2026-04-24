import { useCallback, useEffect, useState } from 'react'
import { logger } from '../utils/logger'
import { useTouchGestures } from './useTouchGestures'

const STORAGE_KEY = 'sidebar-visible'
const MOBILE_BREAKPOINT = 768

export const useSidebar = () => {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (mobile && !localStorage.getItem(STORAGE_KEY)) {
        setSidebarVisible(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved !== null) {
        setSidebarVisible(saved === 'true')
      }
    }
  }, [isMobile])

  useTouchGestures({
    onSwipeRight: () => {
      if (isMobile && !sidebarVisible) setSidebarVisible(true)
    },
    onSwipeLeft: () => {
      if (isMobile && sidebarVisible) setSidebarVisible(false)
    },
    minSwipeDistance: 50,
    maxSwipeTime: 300,
  })

  const persist = useCallback((value) => {
    if (!isMobile) {
      localStorage.setItem(STORAGE_KEY, value.toString())
    }
  }, [isMobile])

  const toggleSidebar = useCallback(() => {
    setSidebarVisible(prev => {
      const next = !prev
      persist(next)
      logger.debug('Состояние сайдбара изменено', { visible: next, isMobile })
      return next
    })
  }, [persist, isMobile])

  const closeSidebar = useCallback(() => {
    setSidebarVisible(false)
    persist(false)
  }, [persist])

  return { sidebarVisible, isMobile, toggleSidebar, closeSidebar }
}

export default useSidebar
