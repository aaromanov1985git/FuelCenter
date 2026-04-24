export const ROUTES = [
  { tab: 'dashboard',          path: '/',                     label: null },
  { tab: 'transactions',       path: '/transactions',         label: 'Транзакции' },
  { tab: 'vehicles',           path: '/vehicles',             label: 'Транспорт' },
  { tab: 'cards',              path: '/cards',                label: 'Топливные карты' },
  { tab: 'fuel-card-analysis', path: '/fuel-card-analysis',   label: 'Анализ топливных карт' },
  { tab: 'gas-stations',       path: '/gas-stations',         label: 'АЗС' },
  { tab: 'fuel-types',         path: '/fuel-types',           label: 'Виды топлива' },
  { tab: 'providers',          path: '/providers',            label: 'Провайдеры' },
  { tab: 'provider-analysis',  path: '/provider-analysis',    label: 'Анализ Провайдера' },
  { tab: 'templates',          path: '/templates',            label: 'Шаблоны' },
  { tab: 'organizations',      path: '/organizations',        label: 'Организации' },
  { tab: 'users',              path: '/users',                label: 'Пользователи' },
  { tab: 'my-actions',         path: '/my-actions',           label: 'Мои действия' },
  { tab: 'upload-events',      path: '/upload-events',        label: 'События загрузок' },
  { tab: 'notifications',      path: '/notifications',        label: 'Уведомления' },
  { tab: 'settings',           path: '/settings',             label: 'Настройки' },
]

export const TAB_TO_PATH = Object.fromEntries(ROUTES.map(r => [r.tab, r.path]))
export const PATH_TO_TAB = Object.fromEntries(ROUTES.map(r => [r.path, r.tab]))
export const TAB_LABELS = Object.fromEntries(
  ROUTES.filter(r => r.label).map(r => [r.tab, r.label])
)

export const getTabFromPath = (pathname) => PATH_TO_TAB[pathname] || 'dashboard'
export const getPathFromTab = (tab) => TAB_TO_PATH[tab] || '/'
