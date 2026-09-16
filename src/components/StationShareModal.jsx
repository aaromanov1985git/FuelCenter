/**
 * Модальное окно создания ссылки на просмотр АЗС без входа.
 * Администратор настраивает открытые разделы и срок, получает готовую ссылку для копирования.
 * Список уже выданных ссылок по этой АЗС показывается ниже с кнопками отзыва.
 */
import { useEffect, useState } from 'react'
import Modal from './ui/Modal/Modal'
import Checkbox from './ui/Checkbox/Checkbox'
import Button from './ui/Button/Button'
import Icon from './ui/Icon/Icon'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import './StationShareModal.css'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function StationShareModal({ station, onClose }) {
  const { error: showError, success } = useToast()
  const [loading, setLoading] = useState(false)
  const [existingShares, setExistingShares] = useState([])
  const [loadingShares, setLoadingShares] = useState(true)

  const [showTanks, setShowTanks] = useState(true)
  const [showFills, setShowFills] = useState(false)
  const [showLimits, setShowLimits] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [note, setNote] = useState('')
  const [createdShare, setCreatedShare] = useState(null)

  const loadShares = async () => {
    setLoadingShares(true)
    try {
      const response = await authFetch(
        `${API_URL}/api/v1/station-shares?provider_id=${station.provider_id}&azs_code=${encodeURIComponent(station.azs_code)}`,
        { credentials: 'include' }
      )
      if (response.ok) {
        setExistingShares(await response.json())
      }
    } catch (err) {
      console.error('Failed to load shares:', err)
    } finally {
      setLoadingShares(false)
    }
  }

  useEffect(() => {
    loadShares()
  }, [station.provider_id, station.azs_code])

  const handleCreate = async () => {
    if (!showTanks && !showFills && !showLimits) {
      showError('Откройте хотя бы один раздел')
      return
    }
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/station-shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider_id: station.provider_id,
          azs_code: station.azs_code,
          show_tanks: showTanks,
          show_fills: showFills,
          show_limits: showLimits,
          expires_in_days: expiresInDays,
          note: note.trim() || null,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Не удалось создать ссылку')
      }
      const share = await response.json()
      setCreatedShare(share)
      success('Ссылка создана')
      loadShares()
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (shareId) => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/station-shares/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Не удалось отозвать ссылку')
      success('Ссылка отозвана')
      loadShares()
      if (createdShare?.id === shareId) setCreatedShare(null)
    } catch (err) {
      showError(err.message)
    }
  }

  const copyLink = (token) => {
    const url = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(url).then(() => success('Ссылка скопирована'))
  }

  return (
    <Modal isOpen onClose={onClose} title={`Поделиться АЗС ${station.azs_code}`} className="ssm">
      <div className="ssm-body">
        {createdShare ? (
          <div className="ssm-created">
            <div className="ssm-created__icon">
              <Icon name="check" />
            </div>
            <h3>Ссылка создана</h3>
            <div className="ssm-link">
              <input
                type="text"
                value={`${window.location.origin}${createdShare.url_path}`}
                readOnly
                onClick={(e) => e.target.select()}
              />
              <Button onClick={() => copyLink(createdShare.token)} icon={<Icon name="copy" size={16} />}>
                Скопировать
              </Button>
            </div>
            <div className="ssm-created__meta">
              <p>Доступ до {new Date(createdShare.expires_at).toLocaleString('ru-RU')}</p>
              <p>
                Открыты:{' '}
                {[
                  createdShare.show_tanks && 'резервуары',
                  createdShare.show_fills && 'заправки',
                  createdShare.show_limits && 'лимиты',
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </div>
            <Button onClick={() => setCreatedShare(null)} variant="secondary">
              Создать ещё
            </Button>
          </div>
        ) : (
          <>
            <div className="ssm-form">
              <div className="ssm-section">
                <h4>Что открыто</h4>
                <div className="ssm-checkboxes">
                  <Checkbox checked={showTanks} onChange={setShowTanks} label="Остатки в резервуарах" />
                  <Checkbox checked={showFills} onChange={setShowFills} label="Заправки по картам" />
                  <Checkbox checked={showLimits} onChange={setShowLimits} label="Лимиты карт" />
                </div>
              </div>

              <div className="ssm-section">
                <h4>Срок действия</h4>
                <div className="ssm-expiry">
                  {[1, 7, 30].map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={`ssm-expiry__btn ${expiresInDays === days ? 'ssm-expiry__btn--active' : ''}`}
                      onClick={() => setExpiresInDays(days)}
                    >
                      {days === 1 ? '1 день' : `${days} дней`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ssm-section">
                <label htmlFor="ssm-note">Для кого (видно только в GSM)</label>
                <input
                  id="ssm-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Подрядчик Север"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="ssm-actions">
              <Button onClick={handleCreate} loading={loading} disabled={loading}>
                Создать ссылку
              </Button>
              <Button onClick={onClose} variant="secondary">
                Отменить
              </Button>
            </div>
          </>
        )}

        {!loadingShares && existingShares.length > 0 && (
          <div className="ssm-existing">
            <h4>Выданные ссылки ({existingShares.length})</h4>
            <ul className="ssm-list">
              {existingShares.map((share) => (
                <li key={share.id} className={`ssm-item ssm-item--${share.status}`}>
                  <div className="ssm-item__main">
                    <div className="ssm-item__note">{share.note || 'Без пометки'}</div>
                    <div className="ssm-item__meta">
                      {share.status === 'active' && (
                        <>до {new Date(share.expires_at).toLocaleDateString('ru-RU')}</>
                      )}
                      {share.status === 'expired' && <span className="ssm-badge ssm-badge--expired">истёк</span>}
                      {share.status === 'revoked' && <span className="ssm-badge ssm-badge--revoked">отозвана</span>}
                      {' · '}
                      {[
                        share.show_tanks && 'резервуары',
                        share.show_fills && 'заправки',
                        share.show_limits && 'лимиты',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      {share.open_count > 0 && ` · открывали ${share.open_count}`}
                    </div>
                  </div>
                  <div className="ssm-item__actions">
                    {share.status === 'active' && (
                      <>
                        <button type="button" className="ssm-icon-btn" onClick={() => copyLink(share.token)} title="Скопировать">
                          <Icon name="copy" size={16} />
                        </button>
                        <button
                          type="button"
                          className="ssm-icon-btn ssm-icon-btn--danger"
                          onClick={() => handleRevoke(share.id)}
                          title="Отозвать"
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
