import { describe, it, expect } from 'vitest'
import { fillTone, formatAge, formatSourceDateTime, formatSourceDate } from '../topazFormat'

describe('topazFormat', () => {
  it('выводит время замера по часам АЗС без сдвига пояса', () => {
    expect(formatSourceDateTime('2026-09-14T13:57:41')).toBe('14.09.2026 13:57')
    expect(formatSourceDateTime('2026-09-14 00:00:00')).toBe('14.09.2026 00:00')
    expect(formatSourceDate('2026-09-14')).toBe('14.09.2026')
    expect(formatSourceDateTime(null)).toBe('—')
  })

  it('пишет возраст замера по-человечески', () => {
    expect(formatAge(null)).toBe('нет замеров')
    expect(formatAge(0)).toBe('только что')
    expect(formatAge(12)).toBe('12 мин назад')
    expect(formatAge(180)).toBe('3 ч назад')
    expect(formatAge(60 * 50)).toBe('2 дн назад')
  })

  it('красит заполнение по уровню остатка', () => {
    expect(fillTone(null)).toBe('neutral')
    expect(fillTone(14)).toBe('low')
    expect(fillTone(30)).toBe('warn')
    expect(fillTone(76)).toBe('ok')
  })
})
