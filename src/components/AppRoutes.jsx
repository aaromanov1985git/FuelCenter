import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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

const AppRoutes = ({ onOpenRefuelsUpload, onOpenLocationsUpload }) => (
  <Suspense fallback={<LoadingFallback />}>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/transactions" element={null} />
      <Route path="/vehicles" element={<VehiclesList />} />
      <Route path="/cards" element={<FuelCardsList />} />
      <Route path="/fuel-card-analysis" element={
        <FuelCardAnalysisPage
          onOpenRefuelsUpload={onOpenRefuelsUpload}
          onOpenLocationsUpload={onOpenLocationsUpload}
        />
      } />
      <Route path="/gas-stations" element={<GasStationsList />} />
      <Route path="/fuel-types" element={<FuelTypesList />} />
      <Route path="/providers" element={<ProvidersList />} />
      <Route path="/provider-analysis" element={<ProviderAnalysisDashboard />} />
      <Route path="/templates" element={<TemplatesList />} />
      <Route path="/organizations" element={<OrganizationsList />} />
      <Route path="/users" element={<UsersList />} />
      <Route path="/my-actions" element={<UserActionLogsList showMyActionsOnly={true} />} />
      <Route path="/upload-events" element={<UploadEventsList />} />
      <Route path="/notifications" element={<NotificationsList />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
)

export default AppRoutes
