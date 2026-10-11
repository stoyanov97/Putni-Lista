// Проверки на полетата, преди данните да отидат към базата.

export function validateEik(value) {
  const v = String(value || '').trim()
  return /^\d{9}$|^\d{13}$/.test(v) ? '' : 'ЕИК трябва да е 9 или 13 цифри.'
}

// Българските рег. номера ползват само 12 букви, които изглеждат еднакво на
// латиница и кирилица. Латинските се превръщат в кирилски, за да не станат
// "CA1234AB" и "СА1234АВ" два различни автомобила.
const LATIN_TO_CYRILLIC = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' }

export function normalizeRegNumber(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/[ABEKMHOPCTYX]/g, (ch) => LATIN_TO_CYRILLIC[ch])
}

export function validateRegNumber(value) {
  return /^[АВЕКМНОРСТУХ]{1,2}\d{4}[АВЕКМНОРСТУХ]{1,2}$/.test(normalizeRegNumber(value))
    ? ''
    : 'Рег. номерът трябва да е във формат СА1234АВ, само с буквите А, В, Е, К, М, Н, О, Р, С, Т, У, Х (на кирилица или латиница).'
}

// Номер на фактура: без интервали в началото и края.
export const normalizeInvoice = (value) => String(value || '').trim()
