/* Форматирование данных Топаза: резервуары, лимиты, заправки.
 *
 * Время замеров приходит без часового пояса — это часы сервера АЗС. Его выводим
 * как есть, не пропуская через new Date(): браузер сдвинул бы его на свой пояс. */

const litersFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export const formatLiters = (value) =>
  value === null || value === undefined ? '—' : litersFormatter.format(value)

export const formatDecimal = (value) =>
  value === null || value === undefined ? '—' : decimalFormatter.format(value)

export const formatPercent = (value) =>
  value === null || value === undefined ? '—' : `${Math.round(value)} %`

const SOURCE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/

export const formatSourceDateTime = (value) => {
  if (!value) return '—'
  const match = SOURCE_DATE_RE.exec(value)
  if (!match) return value
  const [, year, month, day, hour, minute] = match
  return `${day}.${month}.${year} ${hour}:${minute}`
}

export const formatSourceDate = (value) => {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value
}

export const formatAge = (minutes) => {
  if (minutes === null || minutes === undefined) return 'нет замеров'
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  return `${days} дн назад`
}

/* Тон заполнения — состояние остатка, а не вид топлива. */
export const fillTone = (percent) => {
  if (percent === null || percent === undefined) return 'neutral'
  if (percent < 20) return 'low'
  if (percent < 35) return 'warn'
  return 'ok'
}

export const TANK_WARNING_LABELS = {
  stale: 'Замер устарел',
  density_mismatch: 'Плотность не от этого топлива',
  no_capacity: 'Не задана вместимость',
  over_capacity: 'Объём больше вместимости',
  no_readings: 'Нет замеров',
}

export const toIsoDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
