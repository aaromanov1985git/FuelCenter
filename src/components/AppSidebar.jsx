import React from 'react'
import { Icons } from './ui'
import NotificationBadge from './NotificationBadge'
import ThemeToggle from './ThemeToggle'

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
  const navButton = (tab, icon, label, extra = null) => (
    <button
      className={`nav-item ${activeTab === tab ? 'active' : ''}`}
      onClick={() => setActiveTab(tab)}
    >
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
      {extra}
    </button>
  )

  return (
    <aside className={`sidebar ${sidebarVisible ? '' : 'sidebar-hidden'}`}>
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
        <div className="sidebar-nav-section">Основное</div>
        {navButton('dashboard', Icons.grid, 'Дашборд')}
        {navButton('transactions', Icons.list, 'Транзакции')}
        {navButton('vehicles', Icons.car, 'Транспорт')}
        {navButton('cards', Icons.card, 'Топливные карты')}
        {navButton('fuel-card-analysis', Icons.chart, 'Анализ карт')}
        {navButton('gas-stations', Icons.pin, 'АЗС')}
        {navButton('fuel-types', Icons.fuel, 'Виды топлива')}

        <div className="sidebar-nav-section">Интеграции</div>
        {navButton('providers', Icons.plug, 'Провайдеры')}
        {navButton('provider-analysis', Icons.chart, 'Анализ Провайдера')}
        {navButton('templates', Icons.file, 'Шаблоны')}

        <div className="sidebar-nav-section">Система</div>
        {isAdmin && (
          <>
            {navButton('organizations', Icons.bldg, 'Организации')}
            {navButton('users', Icons.users, 'Пользователи')}
          </>
        )}
        {user && !isAdmin && navButton('my-actions', Icons.check, 'Мои действия')}
        {navButton('upload-events', Icons.up, 'События загрузок')}
        {navButton('notifications', Icons.bell, 'Уведомления', <NotificationBadge />)}
        {navButton('settings', Icons.gear, 'Настройки')}
      </nav>

      {activeTab === 'transactions' && (
        <div className="provider-tabs">
          <div className="provider-tabs-header">
            <h3>Провайдеры</h3>
          </div>
          <div className="provider-tabs-list">
            <button
              className={`provider-tab ${selectedProviderTab === null ? 'active' : ''}`}
              onClick={() => setSelectedProviderTab(null)}
            >
              Все
            </button>
            {providers.filter(p => p.is_active).map(provider => (
              <button
                key={provider.id}
                className={`provider-tab ${selectedProviderTab === provider.id ? 'active' : ''}`}
                onClick={() => setSelectedProviderTab(provider.id)}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {authEnabled && user && (
        <div className="sidebar-footer">
          <div className="sidebar-footer-row sidebar-footer-combined">
            <div className="sidebar-user-section">
              <div className="sidebar-user-compact">
                <div className="sidebar-user-name">{user.username}</div>
                <div className="sidebar-user-role">
                  {user.role === 'admin'
                    ? 'Администратор'
                    : user.role === 'viewer'
                      ? 'Наблюдатель'
                      : 'Пользователь'}
                </div>
              </div>
              <button
                className="sidebar-logout-link"
                onClick={logout}
                title="Выйти из системы"
              >
                Выйти
              </button>
            </div>
            <div className="sidebar-theme-section">
              <ThemeToggle currentTheme={theme} onThemeChange={onThemeChange} />
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default AppSidebar
