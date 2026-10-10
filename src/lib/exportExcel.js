// Excel експорт (.xlsx, ExcelJS). Числата са истински числа, датите са дати,
// а литрите и сумите са формули, за да може счетоводството да ги проверява.
import { fmtDate } from './format.js'
import { summarize, waybillNumber } from './waybillSummary.js'

const thin = { style: 'thin', color: { argb: 'FF9AA7B6' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }
const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F4' } }
const asDate = (iso) => new Date(iso + 'T00:00:00Z')

export function addWaybillSheet(workbook, { waybill, trips, refuelings, company }) {
  const v = waybill.vehicles
  const d = waybill.drivers
  const s = summarize(waybill, trips)
  const ws = workbook.addWorksheet(`ПЛ ${waybillNumber(waybill.number)}`, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [
    { width: 5 }, { width: 12 }, { width: 48 }, { width: 40 }, { width: 12 }, { width: 12 }, { width: 9 }, { width: 10 }, { width: 10 },
  ]

  ws.getCell('A1').value = `Пътен лист № ${waybillNumber(waybill.number)}`
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F3A5F' } }
  const info = [
    ['Фирма', `${company?.name || ''}, ЕИК ${company?.eik || ''}`, 'Автомобил', `${v.make} ${v.model}, ${v.reg_number}`],
    ['Адрес', company?.address || '', 'Вид гориво', v.fuel_type],
    ['Издаден на', waybill.issue_date ? fmtDate(waybill.issue_date) : '', 'Норма, л/100 км', s.norm],
    ['Период', `${fmtDate(waybill.period_from)} – ${fmtDate(waybill.period_to)}`, 'Водач', `${d.full_name}${d.position ? ', ' + d.position : ''}`],
  ]
  info.forEach((row, i) => {
    const r = ws.getRow(3 + i)
    r.getCell(1).value = row[0]
    r.getCell(3).value = row[1]
    r.getCell(4).value = row[2]
    r.getCell(5).value = row[3]
    r.getCell(1).font = r.getCell(4).font = { color: { argb: 'FF5B6675' } }
  })
  ws.mergeCells('A3:B3'); ws.mergeCells('A4:B4'); ws.mergeCells('A5:B5'); ws.mergeCells('A6:B6')
  const normCell = 'E5' // нормата се ползва във формулите за литри

  const headerRowNo = 8
  const header = ws.getRow(headerRowNo)
  ;['№', 'Дата', 'Маршрут (откъде – през – докъде)', 'Цел на пътуването', 'Нач. км', 'Кр. км', 'Км', 'Литри', 'Лично'].forEach((t, i) => {
    const c = header.getCell(i + 1)
    c.value = t
    c.font = { bold: true }
    c.fill = headFill
    c.border = border
    c.alignment = { vertical: 'middle', horizontal: i >= 4 && i <= 7 ? 'right' : 'left', wrapText: true }
  })
  ws.views = [{ state: 'frozen', ySplit: headerRowNo }]

  trips.forEach((t, i) => {
    const n = headerRowNo + 1 + i
    const row = ws.getRow(n)
    row.values = [
      t.seq,
      asDate(t.trip_date),
      t.route,
      t.purpose,
      t.start_odometer,
      t.end_odometer,
      { formula: `F${n}-E${n}`, result: t.km },
      { formula: `ROUND(G${n}*$${normCell.slice(0, 1)}$${normCell.slice(1)}/100,2)`, result: Math.round(t.km * s.norm) / 100 },
      t.is_personal ? 'да' : '',
    ]
    row.getCell(2).numFmt = 'dd.mm.yyyy'
    row.getCell(5).numFmt = row.getCell(6).numFmt = row.getCell(7).numFmt = '#,##0'
    row.getCell(8).numFmt = '#,##0.00'
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col <= 9) {
        c.border = border
        c.alignment = { vertical: 'top', wrapText: col === 3 || col === 4 }
      }
    })
  })

  const first = headerRowNo + 1
  const last = headerRowNo + trips.length
  const totalNo = last + 1
  const total = ws.getRow(totalNo)
  total.getCell(1).value = 'Общо за периода'
  ws.mergeCells(totalNo, 1, totalNo, 6)
  total.getCell(7).value = { formula: `SUM(G${first}:G${last})`, result: s.total }
  total.getCell(8).value = { formula: `SUM(H${first}:H${last})`, result: s.liters }
  const personalNo = totalNo + 1
  const personal = ws.getRow(personalNo)
  personal.getCell(1).value = 'в т.ч. лично ползване'
  ws.mergeCells(personalNo, 1, personalNo, 6)
  personal.getCell(7).value = { formula: `SUMIF(I${first}:I${last},"да",G${first}:G${last})`, result: s.personal }
  personal.getCell(8).value = { formula: `SUMIF(I${first}:I${last},"да",H${first}:H${last})`, result: s.personalLiters }
  for (const r of [total, personal]) {
    for (let c = 1; c <= 9; c++) {
      const cell = r.getCell(c)
      cell.font = { bold: true }
      cell.fill = headFill
      cell.border = border
    }
    r.getCell(7).numFmt = '#,##0'
    r.getCell(8).numFmt = '#,##0.00'
  }

  let rowNo = personalNo + 2
  ws.getCell(`A${rowNo}`).value = `Километраж: начален ${waybill.start_odometer}, краен ${waybill.end_odometer}`
  rowNo += 2
  if (refuelings.length) {
    const h = ws.getRow(rowNo)
    ;['', 'Зареждане', 'Литри', '№ на фактура'].forEach((t, i) => {
      if (!i) return
      h.getCell(i + 1).value = t
      h.getCell(i + 1).font = { bold: true }
      h.getCell(i + 1).fill = headFill
      h.getCell(i + 1).border = border
    })
    refuelings.forEach((r, i) => {
      const row = ws.getRow(rowNo + 1 + i)
      row.getCell(2).value = asDate(r.refuel_date)
      row.getCell(2).numFmt = 'dd.mm.yyyy'
      row.getCell(3).value = Number(r.liters)
      row.getCell(3).numFmt = '#,##0.00'
      row.getCell(4).value = r.invoice_number || ''
      ;[2, 3, 4].forEach((c) => (row.getCell(c).border = border))
    })
    rowNo += refuelings.length + 3
  }
  ws.getCell(`C${rowNo}`).value = '______________________________'
  ws.getCell(`E${rowNo}`).value = '______________________________'
  ws.getCell(`C${rowNo + 1}`).value = `Водач: ${d.full_name}`
  ws.getCell(`E${rowNo + 1}`).value = `Одобрил (МОЛ): ${company?.mol || ''}`
  return ws
}

// Обобщение по листове: за експорт на период.
function addSummarySheet(workbook, list) {
  const ws = workbook.addWorksheet('Обобщение', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.columns = [
    { header: '№ на лист', width: 11 }, { header: 'Период от', width: 12 }, { header: 'Период до', width: 12 },
    { header: 'Рег. номер', width: 13 }, { header: 'Водач', width: 24 }, { header: 'Нач. км', width: 11 },
    { header: 'Кр. км', width: 11 }, { header: 'Км общо', width: 10 }, { header: 'Служебни км', width: 12 },
    { header: 'Лични км', width: 10 }, { header: 'Норма', width: 8 }, { header: 'Литри', width: 10 },
  ]
  const head = ws.getRow(1)
  head.eachCell((c) => { c.font = { bold: true }; c.fill = headFill; c.border = border })
  list.forEach(({ waybill, trips }, i) => {
    const s = summarize(waybill, trips)
    const n = i + 2
    ws.addRow([
      waybillNumber(waybill.number), asDate(waybill.period_from), asDate(waybill.period_to),
      waybill.vehicles.reg_number, waybill.drivers.full_name, waybill.start_odometer, waybill.end_odometer,
      { formula: `G${n}-F${n}`, result: s.total }, s.business, s.personal, s.norm,
      { formula: `ROUND(H${n}*K${n}/100,2)`, result: s.liters },
    ])
    ws.getCell(`B${n}`).numFmt = ws.getCell(`C${n}`).numFmt = 'dd.mm.yyyy'
    ws.getCell(`L${n}`).numFmt = '#,##0.00'
  })
  const end = list.length + 1
  // Готовите стойности (result) се показват и в Protected View, където Excel не смята формули.
  const sums = list.map(({ waybill, trips }) => summarize(waybill, trips))
  const add = (key) => Math.round(sums.reduce((a, s) => a + s[key], 0) * 100) / 100
  const totalRow = ws.addRow(['Общо', '', '', '', '', '', '',
    { formula: `SUM(H2:H${end})`, result: add('total') }, { formula: `SUM(I2:I${end})`, result: add('business') },
    { formula: `SUM(J2:J${end})`, result: add('personal') }, '', { formula: `SUM(L2:L${end})`, result: add('liters') }])
  totalRow.font = { bold: true }
  ws.getCell(`L${end + 1}`).numFmt = '#,##0.00'
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  return ws
}

export async function buildWorkbook(list) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Пътни листа'
  if (list.length > 1) addSummarySheet(workbook, list)
  list.forEach((data) => addWaybillSheet(workbook, data))
  return workbook
}

export async function downloadExcel(list, filename) {
  const workbook = await buildWorkbook(list)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
