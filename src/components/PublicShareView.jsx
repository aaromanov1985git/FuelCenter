/**
 * Публичная страница просмотра АЗС по ссылке — без входа в GSM
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from './ui/Icon/Icon'
import './PublicShareView.css'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function PublicShareView() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [activeTab, setActiveTab] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/public/shares/${token}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Ссылка не найдена или отозвана.')
          } else if (response.status === 410) {
            setError('Срок действия ссылки истёк.')
          } else {
            setError('Не удалось загрузить данные.')
          }
          setLoading(false)
          return
        }
        const data = await response.json()
        setInfo(data)
        // Первая открытая вкладка по умолчанию
        if (data.show_tanks) setActiveTab('tanks')
        else if (data.show_fills) setActiveTab('fills')
        else if (data.show_limits) setActiveTab('limits')
        setLoading(false)
      } catch (err) {
        setError('Не удалось загрузить данные.')
        setLoading(false)
      }
    }
    fetchInfo()
  }, [token])

  if (loading) {
    return (
      <div className="psv-root">
        <div className="psv-loading">
          <div className="psv-spinner" />
          <p>Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="psv-root">
        <div className="psv-error">
          <Icon name="alert" />
          <h2>Не удалось открыть ссылку</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const expiresAt = new Date(info.expires_at)
  const expiresStr = expiresAt.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const tabs = []
  if (info.show_tanks) tabs.push({ key: 'tanks', label: 'Резервуары', icon: 'gauge' })
  if (info.show_fills) tabs.push({ key: 'fills', label: 'Заправки', icon: 'gas-pump' })
  if (info.show_limits) tabs.push({ key: 'limits', label: 'Лимиты', icon: 'credit-card' })

  return (
    <div className="psv-root">
      <div className="psv-header">
        <div className="psv-station">
          <div className="psv-station__icon">
            <Icon name="gas-station" />
          </div>
          <div className="psv-station__info">
            <div className="psv-station__code">{info.azs_code}</div>
            <div className="psv-station__provider">{info.provider_name}</div>
            {(info.settlement || info.location) && (
              <div className="psv-station__location">
                {[info.settlement, info.location].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>
        <div className="psv-expiry">
          <Icon name="clock" />
          <span>Доступ до {expiresStr}</span>
        </div>
      </div>

      <div className="psv-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`psv-tab ${activeTab === tab.key ? 'psv-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="psv-content">
        {activeTab === 'tanks' && <ShareTanks token={token} info={info} />}
        {activeTab === 'fills' && <ShareFills token={token} info={info} />}
        {activeTab === 'limits' && <ShareLimits token={token} info={info} />}
      </div>
    </div>
  )
}

function ShareTanks({ token }) {
  return <div className="psv-section">Остатки в резервуарах (заглушка)</div>
}

function ShareFills({ token }) {
  return <div className="psv-section">Заправки по картам (заглушка)</div>
}

function ShareLimits({ token }) {
  return <div className="psv-section">Лимиты карт (заглушка)</div>
}
