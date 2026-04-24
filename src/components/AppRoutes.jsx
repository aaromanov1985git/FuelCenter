import React, { Suspense, lazy } from 'react'
import { Card, Button } from './ui'

const VehiclesList = lazy(() => import('./VehiclesList'))
const GasStationsList = lazy(() => import('./GasStationsList'))
const FuelTypesList = lazy(() => import('./FuelTypesList'))
const FuelCardsList = lazy(() => import('./FuelCardsList'))
const FuelCardAnalysisList = lazy(() => import('./FuelCardAnalysisList'))
const ProviderAnalysisDashboard = lazy(() => import('./ProviderAnalysisDashboard'))
const ProvidersList = lazy(() => import('./ProvidersList'))
const TemplatesList = lazy(() => import('./TemplatesList'))
const Dashboard = lazy(() => import('./Dashboard'))
const UsersList = lazy(() => import('./UsersList'))
const OrganizationsList = lazy(() => import('./OrganizationsList'))
const UploadEventsList = lazy(() => import('./UploadEventsList'))
const UserActionLogsList = lazy(() => import('./UserActionLogsList'))
const Settings = lazy(() => import('./Settings'))
const NotificationsList = lazy(() => import('./NotificationsList'))

const LoadingFallback = () => (
  <div className="loading">
    <div className="spinner"></div>
    Загрузка...
  </div>
)

const FuelCardAnalysisPage = ({ onOpenRefuelsUpload, onOpenLocationsUpload }) => (
  <>
    <FuelCardAnalysisList />
    <Card style={{ marginTop: 'var(--spacing-section)' }}>
      <Card.Body>
        <div style={{ display: 'flex', gap: 'var(--spacing-element)', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onOpenRefuelsUpload}>
            Загрузить заправки
          </Button>
          <Button variant="secondary" onClick={onOpenLocationsUpload}>
            Загрузить местоположения
          </Button>
        </div>
      </Card.Body>
    </Card>
  </>
)

const ROUTES = {
  dashboard: () => <Dashboard />,
  vehicles: () => <VehiclesList />,
  cards: () => <FuelCardsList />,
  'fuel-card-analysis': (ctx) => <FuelCardAnalysisPage {...ctx} />,
  'gas-stations': () => <GasStationsList />,
  'fuel-types': () => <FuelTypesList />,
  providers: () => <ProvidersList />,
  'provider-analysis': () => <ProviderAnalysisDashboard />,
  templates: () => <TemplatesList />,
  organizations: () => <OrganizationsList />,
  users: () => <UsersList />,
  'my-actions': () => <UserActionLogsList showMyActionsOnly={true} />,
  'upload-events': () => <UploadEventsList />,
  notifications: () => <NotificationsList />,
  settings: () => <Settings />,
}

const AppRoutes = ({ activeTab, onOpenRefuelsUpload, onOpenLocationsUpload }) => {
  const renderRoute = ROUTES[activeTab]
  if (!renderRoute) return null

  return (
    <Suspense fallback={<LoadingFallback />}>
      {renderRoute({ onOpenRefuelsUpload, onOpenLocationsUpload })}
    </Suspense>
  )
}

export default AppRoutes
