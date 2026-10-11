import { describe, it, expect } from 'vitest'
import { normalizeRegNumber, validateRegNumber, validateEik } from '../src/lib/validators.js'

describe('рег. номер', () => {
  it('латиница → кирилица, без интервали и тирета', () => {
    expect(normalizeRegNumber('ca 1234 ab')).toBe('СА1234АВ')
    expect(normalizeRegNumber('CB-5678-KM')).toBe('СВ5678КМ')
    expect(normalizeRegNumber('са1234ав')).toBe('СА1234АВ')
    // латиница и кирилица дават един и същ резултат → няма "два различни" автомобила
    expect(normalizeRegNumber('CA1234AB')).toBe(normalizeRegNumber('СА1234АВ'))
  })
  it('приема валидни и отказва невалидни', () => {
    expect(validateRegNumber('CA1234AB')).toBe('')
    expect(validateRegNumber('Х 1234 ВК')).toBe('')
    expect(validateRegNumber('ББ1234ББ')).not.toBe('')
    expect(validateRegNumber('CA12AB')).not.toBe('')
    expect(validateRegNumber('QA1234AB')).not.toBe('')
  })
})

describe('ЕИК', () => {
  it('9 или 13 цифри', () => {
    expect(validateEik('204512387')).toBe('')
    expect(validateEik('2045123870001')).toBe('')
    expect(validateEik('12345')).not.toBe('')
  })
})
