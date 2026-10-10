// Импорт на дестинации от Excel: разпознаване на колоните и проверка на редовете.
// Отделено от интерфейса, за да може да се тества.

const COLUMNS = {
  name: ['наименование', 'име', 'клиент', 'дестинация'],
  address: ['адрес'],
  purpose: ['цел'],
  base: ['база', 'офис'],
}

const text = (v) => {
  if (v == null) return ''
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('')
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
  return String(v)
}

// rows: масив от редове (масиви от стойности), първият непразен ред е заглавен.
export function parseDestinationRows(rows, existing = []) {
  const headerIndex = rows.findIndex((r) => r && r.some((c) => text(c).trim()))
  if (headerIndex < 0) return { items: [], problems: ['Файлът е празен.'] }
  const header = rows[headerIndex].map((c) => text(c).toLowerCase().trim())
  const col = {}
  for (const [key, words] of Object.entries(COLUMNS)) {
    col[key] = header.findIndex((h) => words.some((w) => h.includes(w)))
  }
  if (col.name < 0 || col.address < 0) {
    return { items: [], problems: ['Липсват задължителните колони „Наименование“ и „Адрес“ в първия ред.'] }
  }

  const known = new Set(existing.map((d) => d.name.trim().toLowerCase()))
  let hasBase = existing.some((d) => d.is_base)
  const items = []
  const problems = []
  rows.slice(headerIndex + 1).forEach((r, i) => {
    const rowNo = headerIndex + i + 2
    if (!r || !r.some((c) => text(c).trim())) return
    const name = text(r[col.name]).trim()
    const address = text(r[col.address]).trim()
    const purpose = col.purpose >= 0 ? text(r[col.purpose]).trim() : ''
    const baseMark = col.base >= 0 ? text(r[col.base]).trim().toLowerCase() : ''
    if (!name || !address) return problems.push(`Ред ${rowNo}: липсва наименование или адрес – пропуснат.`)
    if (known.has(name.toLowerCase())) return problems.push(`Ред ${rowNo}: „${name}“ вече съществува – пропуснат.`)
    let isBase = ['да', 'x', 'х', '1', 'true', 'yes'].includes(baseMark)
    if (isBase && hasBase) {
      problems.push(`Ред ${rowNo}: вече има база – „${name}“ е добавен като обикновена дестинация.`)
      isBase = false
    }
    if (isBase) hasBase = true
    known.add(name.toLowerCase())
    items.push({ name, address, purpose: purpose || null, is_base: isBase })
  })
  return { items, problems }
}

export async function readExcelRows(file) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  const rows = []
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    rows[n - 1] = row.values.slice(1) // ExcelJS номерира колоните от 1
  })
  return Array.from(rows, (r) => r || [])
}

export async function templateWorkbook() {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Дестинации')
  ws.columns = [
    { header: 'Наименование', width: 32 },
    { header: 'Адрес', width: 44 },
    { header: 'Цел на посещението', width: 30 },
    { header: 'База (да/не)', width: 14 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.addRow(['Клиент „Пример“ ООД', 'гр. Пловдив, бул. Христо Ботев 82', 'Среща по договор', ''])
  ws.addRow(['Склад „Пример“', 'гр. Божурище, ул. Индустриална 1', 'Получаване на материали', ''])
  return workbook
}
