// Проверки на полетата, преди данните да отидат към базата.

export function validateEik(value) {
  const v = String(value || '').trim()
  return /^\d{9}$|^\d{13}$/.test(v) ? '' : 'ЕИК трябва да е 9 или 13 цифри.'
}

// Рег. номер: главни букви, без интервали (СА 1234 АВ → СА1234АВ)
export function normalizeRegNumber(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '')
}
