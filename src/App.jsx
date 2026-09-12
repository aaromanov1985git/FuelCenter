import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { logger } from './utils/logger'
const Login = lazy(() => import('./components/Login'))
import AppSidebar from './components/AppSidebar'
import AppModals from './components/AppModals'
import AppRoutes from './components/AppRoutes'
import { TAB_LABELS, getTabFromPath, getPathFromTab } from './router/routes'
import TransactionUpload from './components/TransactionUpload'
import TransactionTable from './components/TransactionTable'
import Breadcrumbs from './components/Breadcrumbs'
import Icon from './components/ui/Icon'
import AdvancedSearch from './components/AdvancedSearch'
import './components/ColumnSettingsModal.css'
import StatusIndicator from './components/StatusIndicator'
import ScrollToTop from './components/ScrollToTop'
import { useToast } from './components/ToastContainer'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './hooks/useTheme'
import { useSidebar } from './hooks/useSidebar'
import { useTransactions } from './hooks/useTransactions'
import { useFileUpload } from './hooks/useFileUpload'
import { useAuthConfig } from './hooks/useAuthConfig'
import { useTransactionActions } from './hooks/useTransactionActions'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTableColumns } from './hooks/useTableColumns'
import { authFetch } from './utils/api'
import './App.css'

// Используем прокси Vite в режиме разработки или прямой URL
const API_URL = import.meta.env.VITE_API_URL || ''

// Вкладки, у которых собственный `<h1>` рендерится внутри страницы
const TABS_WITH_OWN_H1 = new Set(['transactions', 'settings', 'provider-analysis'])

const App = () => {
  const { success, error: showError, info } = useToast()
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth()
  const isAdmin = user && (user.role === 'admin' || user.is_superuser)
  const [showRegister, setShowRegister] = useState(false)
  const { authEnabled, checkingAuth } = useAuthConfig(authLoading)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('') // Оставляем для обратной совместимости, но используем toast
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearProviderModal, setShowClearProviderModal] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab = getTabFromPath(location.pathname)
  const setActiveTab = useCallback((tab) => navigate(getPathFromTab(tab)), [navigate])
  const [showRefuelsUpload, setShowRefuelsUpload] = useState(false)
  const [showLocationsUpload, setShowLocationsUpload] = useState(false)
  const { theme, handleThemeChange } = useTheme('dark')
  const { sidebarVisible, isMobile, toggleSidebar, closeSidebar } = useSidebar()
  const [showColumnSettings, setShowColumnSettings] = useState(false) // Видимость настроек колонок
  const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, rowIndex: null })

  // Показывать подсказку по горячим клавишам (скрыто по умолчанию)
  const showKeyboardHint = false

  const {
    data,
    total,
    stats,
    hasLoadedOnce,
    page,
    pageSize,
    filters,
    sortConfig,
    providers,
    selectedProviderTab,
    debouncedCardNumber,
    debouncedAzsNumber,
    debouncedProduct,
    debouncedProvider,
    setFilters,
    setSelectedProviderTab,
    setPage,
    setPageSize,
    loadTransactions,
    loadStats,
    handleSort,
  } = useTransactions({ authEnabled, isAuthenticated, checkingAuth, setLoading, setError })

  const onUploaded = useCallback(async () => {
    await loadTransactions()
    await loadStats()
  }, [loadTransactions, loadStats])

  const {
    fileName,
    fileMatchInfo,
    uploadProgress,
    uploadStatus,
    uploadedBytes,
    totalBytes,
    processedItems,
    totalItems,
    dragActive,
    previewFile,
    showTemplateSelectModal,
    templateSelectData,
    setShowTemplateSelectModal,
    setTemplateSelectData,
    handleDrag,
    handleDrop,
    handleFileInput,
    handleFileConfirm,
    handleFileCancel,
    handleFileWithTemplate,
    checkFileMatch,
  } = useFileUpload({ onUploaded, setLoading, setError, logout })

  const { downloadExcel, clearByProvider, clearAll } = useTransactionActions({
    debouncedCardNumber,
    debouncedAzsNumber,
    debouncedProduct,
    debouncedProvider,
    selectedProviderTab,
    loadTransactions,
    loadStats,
    setLoading,
    setError,
  })

  useKeyboardShortcuts({
    activeTab,
    hasData: data.length > 0,
    toggleSidebar,
    downloadExcel,
    showColumnSettings,
    setShowColumnSettings,
  })


  const handleConfirmClearProvider = async (params) => {
    setShowClearProviderModal(false)
    await clearByProvider(params)
  }

  const handleConfirmClearDatabase = async () => {
    setShowClearConfirm(false)
    await clearAll()
  }

  // Safety net: на каждой смене маршрута сбрасываем body.overflow и body.paddingRight,
  // если они залипли в "hidden" из-за модала, который не отмонтировался корректно.
  // useScrollLock и ручные body.style.overflow в модалках обычно сами восстанавливают
  // значение, но при повторных рендерах/ошибках/HMR оно может остаться "hidden" — тогда
  // вся страница перестаёт скроллиться. Этот эффект страхует от такого случая.
  useEffect(() => {
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = ''
    }
    if (document.body.style.paddingRight) {
      document.body.style.paddingRight = ''
    }
  }, [location.pathname])

  // Обработка события для установки фильтра транзакций и переключения вкладки
  useEffect(() => {
    const handleSetTransactionFilter = (event) => {
      const { product, tab } = event.detail || {}
      if (product) {
        setFilters(prev => ({ ...prev, product }))
        if (tab) {
          setActiveTab(tab)
        }
      }
    }
    
    window.addEventListener('setTransactionFilterAndTab', handleSetTransactionFilter)
    return () => {
      window.removeEventListener('setTransactionFilterAndTab', handleSetTransactionFilter)
    }
  }, [])

  const {
    allHeaders,
    headerFieldMap,
    displayHeaders,
    visibleColumns,
    toggleColumnVisibility,
    resetColumnVisibility,
  } = useTableColumns()

  const transactionFilterConfig = useMemo(() => [
    { key: 'card_number', label: 'Номер карты', placeholder: 'Введите номер карты', type: 'text' },
    { key: 'azs_number', label: 'АЗС', placeholder: 'Введите номер АЗС', type: 'text' },
    { key: 'product', label: 'Товар', placeholder: 'Введите название товара', type: 'text' },
    {
      key: 'provider',
      label: 'Провайдер',
      placeholder: 'Выберите провайдера',
      type: 'select',
      options: providers
        .filter(p => p.is_active)
        .map(p => ({ value: p.id.toString(), label: p.name })),
    },
  ], [providers])

  // Показываем Login, если аутентификация включена и пользователь не авторизован
  if (checkingAuth || authLoading) {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="loading-spinner">Загрузка...</div>
        </div>
      </div>
    )
  }

  if (authEnabled && !isAuthenticated) {
    return (
      <div className="app">
        <Suspense fallback={<div className="app-loading"><div className="loading-spinner">Загрузка...</div></div>}>
          <Login onSuccess={() => {
            // После успешного входа компонент перерендерится с новым состоянием auth
          }} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-layout">
        {/* Кнопка переключения сайдбара (hamburger menu на мобильных) */}
        <button
          className={`sidebar-toggle ${!sidebarVisible ? 'sidebar-hidden-toggle' : ''} ${isMobile ? 'mobile-toggle' : ''}`}
          onClick={toggleSidebar}
          title={sidebarVisible ? (isMobile ? 'Закрыть меню' : 'Скрыть меню (Ctrl+B)') : (isMobile ? 'Открыть меню' : 'Показать меню (Ctrl+B)')}
          aria-label={sidebarVisible ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={sidebarVisible}
        >
          {/* Был встроенный ЗАЛИТЫЙ svg 0 0 20 20 — последний глиф в проекте
              вне общего набора. Теперь контурная иконка 16px из ui/Icon. */}
          <Icon name={sidebarVisible ? 'chevron-left' : 'rows'} className="icon" />
        </button>

        {isMobile && sidebarVisible && (
          <div
            className="sidebar-overlay active"
            onClick={closeSidebar}
            aria-label="Закрыть меню"
          />
        )}

        <AppSidebar
          sidebarVisible={sidebarVisible}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isAdmin={isAdmin}
          user={user}
          authEnabled={authEnabled}
          logout={logout}
          theme={theme}
          onThemeChange={handleThemeChange}
          providers={providers}
          selectedProviderTab={selectedProviderTab}
          setSelectedProviderTab={setSelectedProviderTab}
        />

        {/* Основной контент */}
        <main className="main-content">
          <div className="container">
            <Breadcrumbs
              items={[
                { label: 'Главная', onClick: () => setActiveTab('dashboard') },
                ...(TAB_LABELS[activeTab] ? [{ label: TAB_LABELS[activeTab] }] : []),
              ]}
            />
            
            {activeTab === 'transactions' && (
              <>
                <h1 className="t-page-title tx-page-title">Транзакции ГСМ</h1>
                <p className="subtitle tx-page-subtitle">Загрузите файл для импорта, затем просматривайте и фильтруйте данные</p>
              </>
            )}
            {!TABS_WITH_OWN_H1.has(activeTab) && (
              <h1 className="sr-only">{TAB_LABELS[activeTab] || 'Главная'}</h1>
            )}

        <AppRoutes
          onOpenRefuelsUpload={() => setShowRefuelsUpload(true)}
          onOpenLocationsUpload={() => setShowLocationsUpload(true)}
        />
        
        {activeTab === 'transactions' && (
          <div className="tx-root">
        <TransactionUpload
          dragActive={dragActive}
          loading={loading}
          fileName={fileName}
          fileMatchInfo={fileMatchInfo}
          uploadStatus={uploadStatus}
          uploadProgress={uploadProgress}
          uploadedBytes={uploadedBytes}
          totalBytes={totalBytes}
          processedItems={processedItems}
          totalItems={totalItems}
          error={error}
          stats={stats}
          providers={providers}
          selectedProviderTab={selectedProviderTab}
          onSelectedProviderTabChange={setSelectedProviderTab}
          onDrag={handleDrag}
          onDrop={handleDrop}
          onFileInput={handleFileInput}
        />

        {hasLoadedOnce && (
          <AdvancedSearch
            filters={filters}
            onFiltersChange={setFilters}
            onClear={() => setFilters({ card_number: '', azs_number: '', product: '', provider: '' })}
            loading={loading}
            filterConfig={transactionFilterConfig}
          />
        )}

        {hasLoadedOnce && (
          <TransactionTable
            data={data}
            total={total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            displayHeaders={displayHeaders}
            headerFieldMap={headerFieldMap}
            sortConfig={sortConfig}
            debouncedCardNumber={debouncedCardNumber}
            debouncedAzsNumber={debouncedAzsNumber}
            debouncedProduct={debouncedProduct}
            isAdmin={isAdmin}
            onSort={handleSort}
            onOpenColumnSettings={() => setShowColumnSettings(true)}
            onDownloadExcel={downloadExcel}
            onRefresh={() => loadTransactions()}
            onClearAll={() => setShowClearConfirm(true)}
            onClearByProvider={() => setShowClearProviderModal(true)}
            onContextMenu={setContextMenu}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
          </div>
        )}
          </div>
        </main>
      </div>

      <AppModals
        clearDb={{
          open: showClearConfirm,
          onConfirm: handleConfirmClearDatabase,
          onCancel: () => setShowClearConfirm(false),
        }}
        clearProvider={{
          open: showClearProviderModal,
          onClose: () => setShowClearProviderModal(false),
          onConfirm: handleConfirmClearProvider,
          providers,
          loading,
        }}
        templateSelect={{
          open: showTemplateSelectModal,
          data: templateSelectData,
          loading,
          onClose: () => {
            setShowTemplateSelectModal(false)
            setTemplateSelectData(null)
          },
          onConfirm: async (selected) => {
            if (templateSelectData && templateSelectData.file) {
              setShowTemplateSelectModal(false)
              await handleFileWithTemplate(
                templateSelectData.file,
                selected.provider_id,
                selected.template_id
              )
              setTemplateSelectData(null)
            }
          },
        }}
        columnSettings={{
          open: showColumnSettings,
          onClose: () => setShowColumnSettings(false),
          allHeaders,
          visibleColumns,
          onToggle: toggleColumnVisibility,
          onReset: resetColumnVisibility,
        }}
        keyboardHint={showKeyboardHint}
        filePreview={{
          file: previewFile,
          onConfirm: handleFileConfirm,
          onCancel: handleFileCancel,
          onCheckTemplate: checkFileMatch,
          loading: loading && uploadStatus === 'uploading',
        }}
        contextMenu={{
          state: contextMenu,
          data,
          displayHeaders,
          onClose: () => setContextMenu({ isOpen: false, x: 0, y: 0, rowIndex: null }),
          onExport: () => downloadExcel(),
          onRefresh: () => loadTransactions(),
        }}
        register={{
          open: showRegister,
          onClose: () => setShowRegister(false),
          onSuccess: () => {
            setShowRegister(false)
            success('Пользователь успешно зарегистрирован')
          },
        }}
        refuelsUpload={{
          open: showRefuelsUpload,
          onClose: () => setShowRefuelsUpload(false),
        }}
        locationsUpload={{
          open: showLocationsUpload,
          onClose: () => setShowLocationsUpload(false),
        }}
        toastSuccess={success}
      />

      <ScrollToTop />
    </div>
  )
}

export default App

