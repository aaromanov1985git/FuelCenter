import React, { useMemo } from 'react'
import Icon from './ui/Icon'
import ThemeToggle from './ThemeToggle'
import { useNotifications } from '../hooks/useNotifications'
import './AppSidebar.css'

/* Меню объявлено данными, а не разметкой: порядок групп и пунктов — часть
 * навигационного контракта, его удобнее читать одним списком.
 * access: 'admin' — только администратору, 'self' — только рядовому пользователю. */
const NAV_GROUPS = [
  {
    id: 'work',
    title: 'Работа',
    items: [
      { tab: 'dashboard', icon: 'grid', label: 'Дашборд' },
      { tab: 'transactions', icon: 'rows', label: 'Транзакции' },
      { tab: 'vehicles', icon: 'truck', label: 'Транспорт' },
      { tab: 'cards', icon: 'card', label: 'Топливные карты' },
      { tab: 'fuel-card-analysis', icon: 'chart', label: 'Анализ карт' },
      { tab: 'gas-stations', icon: 'pin', label: 'АЗС' },
      { tab: 'tanks', icon: 'tank', label: 'Резервуары' },
      { tab: 'card-limits', icon: 'gauge', label: 'Лимиты карт' },
      { tab: 'fills-report', icon: 'file', label: 'Заправки по картам' },
      { tab: 'fuel-types', icon: 'drop', label: 'Виды топлива' },
    ],
  },
  {
    id: 'registry',
    title: 'Справочники',
    items: [
      { tab: 'providers', icon: 'box', label: 'Провайдеры' },
      { tab: 'provider-analysis', icon: 'chart', label: 'Анализ провайдера' },
      { tab: 'templates', icon: 'layers', label: 'Шаблоны' },
      { tab: 'organizations', icon: 'building', label: 'Организации', access: 'admin' },
      { tab: 'users', icon: 'users', label: 'Пользователи', access: 'admin' },
    ],
  },
  {
    id: 'system',
    title: 'Система',
    items: [
      { tab: 'my-actions', icon: 'check', label: 'Мои действия', access: 'self' },
      { tab: 'upload-events', icon: 'clock', label: 'События загрузок' },
      { tab: 'notifications', icon: 'bell', label: 'Уведомления', counter: 'notifications' },
      { tab: 'settings', icon: 'gear', label: 'Настройки' },
    ],
  },
]

const ROLE_LABELS = {
  admin: 'Администратор',
  viewer: 'Наблюдатель',
}

const AppSidebar = ({
  sidebarVisible,
  activeTab,
  setActiveTab,
  isAdmin,
  user,
  authEnabled,
  logout,
  theme,
  onThemeChange,
  providers,
  selectedProviderTab,
  setSelectedProviderTab,
}) => {
  // Свёрнутый вид = тот же флаг, что и раньше: на десктопе это рельс 64px,
  // на мобильных (см. AppSidebar.css) — по-прежнему уезд за экран.
  const collapsed = !sidebarVisible

  const { unreadCount } = useNotifications(true, 30000)

  const groups = useMemo(
    () =>
      NAV_GROUPS
        .map(group => ({
          ...group,
          items: group.items.filter(item => {
            if (item.access === 'admin') return Boolean(isAdmin)
            if (item.access === 'self') return Boolean(user) && !isAdmin
            return true
          }),
        }))
        .filter(group => group.items.length > 0),
    [isAdmin, user]
  )

  const activeProviders = useMemo(
    () => (providers || []).filter(provider => provider.is_active),
    [providers]
  )

  const renderItem = item => {
    const isActive = activeTab === item.tab
    const showCounter = item.counter === 'notifications' && unreadCount > 0

    return (
      <button
        key={item.tab}
        type="button"
        className={`nav-item${isActive ? ' nav-item-active' : ''}`}
        onClick={() => setActiveTab(item.tab)}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon name={item.icon} size={16} className="nav-item-icon" />
        <span className="nav-item-label">{item.label}</span>
        {showCounter && (
          <span
            className="nav-item-count"
            aria-label={`Непрочитанных уведомлений: ${unreadCount}`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <aside className={`sidebar${collapsed ? ' sidebar-hidden' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark" aria-hidden="true">ГСМ</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">ГСМ Конвертер</div>
            <div className="sidebar-logo-sub">v2.0</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Основная навигация">
        {groups.map(group => (
          <div className="sidebar-nav-group" key={group.id}>
            <div className="sidebar-nav-title t-caption">{group.title}</div>
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Список провайдеров — НЕ навигация: он задаёт provider_id в запросе
          транзакций (см. useTransactions). Поэтому отдельная зона со своим
          заголовком и видом переключателя, а не пункт меню. */}
      {activeTab === 'transactions' && !collapsed && (
        <div className="sidebar-filter">
          <div className="sidebar-filter-title t-caption">Фильтр: провайдер</div>
          <div
            className="sidebar-filter-list"
            role="radiogroup"
            aria-label="Фильтр транзакций по провайдеру"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedProviderTab === null}
              className={`sidebar-filter-option${selectedProviderTab === null ? ' sidebar-filter-option-active' : ''}`}
              onClick={() => setSelectedProviderTab(null)}
            >
              <span className="sidebar-filter-marker" aria-hidden="true" />
              <span className="sidebar-filter-option-label">Все провайдеры</span>
            </button>
            {activeProviders.map(provider => (
              <button
                key={provider.id}
                type="button"
                role="radio"
                aria-checked={selectedProviderTab === provider.id}
                className={`sidebar-filter-option${selectedProviderTab === provider.id ? ' sidebar-filter-option-active' : ''}`}
                onClick={() => setSelectedProviderTab(provider.id)}
              >
                <span className="sidebar-filter-marker" aria-hidden="true" />
                <span className="sidebar-filter-option-label">{provider.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {authEnabled && user && (
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user.username}</div>
            <div className="sidebar-user-role">
              {ROLE_LABELS[user.role] || 'Пользователь'}
            </div>
          </div>
          <div className="sidebar-footer-actions">
            <ThemeToggle currentTheme={theme} onThemeChange={onThemeChange} />
            <button
              type="button"
              className="sidebar-logout"
              onClick={logout}
              title="Выйти из системы"
            >
              <Icon name="log-out" size={16} className="sidebar-logout-icon" />
              <span className="sidebar-logout-label">Выйти</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

export default AppSidebar
