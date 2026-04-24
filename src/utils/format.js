export const formatNumber = (num) =>
  new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)

export const formatLiters = (num) => {
  if (!num && num !== 0) return '0.00'
  if (num >= 1000000) {
    return formatNumber(num / 1000) + ' тыс. л'
  }
  return formatNumber(num) + ' л'
}
