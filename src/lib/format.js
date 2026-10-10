// Форматиране за показване: български формат на дати и числа.
export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '')
export const fmtNum = (n, digits = 0) =>
  Number(n).toLocaleString('bg-BG', { minimumFractionDigits: digits, maximumFractionDigits: digits })
