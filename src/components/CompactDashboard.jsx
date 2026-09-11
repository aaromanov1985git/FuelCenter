import React, { useState, useEffect } from 'react'
import VehiclesList from './VehiclesList'
import { SkeletonCard } from './Skeleton'
import { Button } from './ui'
import { authFetch } from '../utils/api'
import './CompactDashboard.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const CompactDashboard = ({ 
  stats, 
  errorsWarnings, 
  errorsLoading,
  onNavigateToVehicles,
  onNavigateToTransactions 
}) => {
  const [activeSection, setActiveSection] = useState('overview') // overview, vehicles, transactions

  return (
    <div className="compact-dashboard">
      {/* Компактный обзор */}
      {activeSection === 'overview' && (
        <>
          {/* Объединенная статистика */}
          <div className="compact-stats-section">
            <div className="compact-stats-grid">
              {/* Транспорт */}
              <div className="compact-stat-card compact-stat-vehicles">
                <div className="compact-stat-header">
                  <span className="compact-stat-icon">🚗</span>
                  <h3>Транспорт</h3>
                </div>
                {errorsWarnings && errorsWarnings.vehicles ? (
                  <div className="compact-stat-values">
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Всего:</span>
                      <span className="compact-stat-value-large">{errorsWarnings.vehicles.total}</span>
                    </div>
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Валидные:</span>
                      <span className="compact-stat-value success">{errorsWarnings.vehicles.valid}</span>
                    </div>
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Требуют проверки:</span>
                      <span className="compact-stat-value warning">{errorsWarnings.vehicles.pending}</span>
                    </div>
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">С ошибками:</span>
                      <span className="compact-stat-value error">{errorsWarnings.vehicles.invalid}</span>
                    </div>
                  </div>
                ) : errorsLoading ? (
                  <SkeletonCard />
                ) : (
                  <div className="compact-stat-empty">Нет данных</div>
                )}
                <Button 
                  variant="ghost"
                  size="sm"
                  className="compact-stat-action"
                  onClick={() => {
                    setActiveSection('vehicles')
                    if (onNavigateToVehicles) onNavigateToVehicles()
                  }}
                >
                  Перейти к транспорту →
                </Button>
              </div>

              {/* Транзакции */}
              <div className="compact-stat-card compact-stat-transactions">
                <div className="compact-stat-header">
                  <span className="compact-stat-icon">📊</span>
                  <h3>Транзакции</h3>
                </div>
                {stats ? (
                  <div className="compact-stat-values">
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Всего транзакций:</span>
                      <span className="compact-stat-value-large">{stats.total_transactions || 0}</span>
                    </div>
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Всего литров:</span>
                      <span className="compact-stat-value">{stats.total_quantity ? stats.total_quantity.toFixed(2) : '0.00'}</span>
                    </div>
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Видов топлива:</span>
                      <span className="compact-stat-value">{stats.products ? Object.keys(stats.products).length : 0}</span>
                    </div>
                    <div className="compact-stat-row">
                      <span className="compact-stat-label">Провайдеров:</span>
                      <span className="compact-stat-value">{stats.provider_count || 0}</span>
                    </div>
                    {errorsWarnings && errorsWarnings.transactions_with_errors > 0 && (
                      <div className="compact-stat-row">
                        <span className="compact-stat-label">С проблемными ТС:</span>
                        <span className="compact-stat-value error">{errorsWarnings.transactions_with_errors}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="compact-stat-empty">Нет данных</div>
                )}
                <Button 
                  variant="ghost"
                  size="sm"
                  className="compact-stat-action"
                  onClick={() => {
                    setActiveSection('transactions')
                    if (onNavigateToTransactions) onNavigateToTransactions()
                  }}
                >
                  Перейти к транзакциям →
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Секция транспорта */}
      {activeSection === 'vehicles' && (
        <div className="compact-section-content">
          <div className="compact-section-header">
            <Button 
              variant="ghost"
              size="sm"
              className="compact-back-button"
              onClick={() => setActiveSection('overview')}
            >
              ← Назад к обзору
            </Button>
            <h2>Транспорт</h2>
          </div>
          <VehiclesList />
        </div>
      )}

      {/* Секция транзакций - будет отображаться через родительский компонент */}
      {activeSection === 'transactions' && (
        <div className="compact-section-content">
          <div className="compact-section-header">
            <Button 
              variant="ghost"
              size="sm"
              className="compact-back-button"
              onClick={() => setActiveSection('overview')}
            >
              ← Назад к обзору
            </Button>
            <h2>Транзакции</h2>
          </div>
          {onNavigateToTransactions && (
            <div className="compact-placeholder">
              Переключитесь на вкладку "Транзакции" для просмотра данных
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CompactDashboard

