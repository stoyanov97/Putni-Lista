// PDF експорт (pdfmake). Шрифтът Roboto е вграден в pdfmake и поддържа кирилица.
// Един лист = една или повече страници A4 (хоризонтално); при експорт на период
// всеки лист започва на нова страница.
import { fmtDate, fmtNum } from './format.js'
import { fuelLiters } from './routeGenerator.js'
import { summarize, waybillNumber } from './waybillSummary.js'

const INK = '#1f3a5f'
const LINE = '#9aa7b6'

const label = (text) => ({ text, color: '#5b6675', fontSize: 8 })

function infoTable(rows) {
  return {
    table: { widths: [70, '*'], body: rows.map(([k, v]) => [label(k), { text: v, fontSize: 9 }]) },
    layout: 'noBorders',
  }
}

export function waybillContent({ waybill, trips, refuelings, company }) {
  const v = waybill.vehicles
  const d = waybill.drivers
  const s = summarize(waybill, trips)

  const head = ['№', 'Дата', 'Маршрут (откъде – през – докъде)', 'Цел на пътуването', 'Нач. км', 'Кр. км', 'Км', 'Литри'].map((t, i) => ({
    text: t, bold: true, fontSize: 8, fillColor: '#eef1f4', alignment: i >= 4 ? 'right' : 'left',
  }))
  const body = trips.map((t) => [
    t.seq,
    fmtDate(t.trip_date),
    t.is_personal ? `${t.route} (лично ползване)` : t.route,
    t.purpose,
    { text: fmtNum(t.start_odometer), alignment: 'right' },
    { text: fmtNum(t.end_odometer), alignment: 'right' },
    { text: fmtNum(t.km), alignment: 'right' },
    { text: fmtNum(fuelLiters(t.km, s.norm), 2), alignment: 'right' },
  ].map((c) => (typeof c === 'object' ? { fontSize: 8, ...c } : { text: String(c), fontSize: 8 })))
  const totalRow = (text, km, liters) => [
    { text, colSpan: 6, bold: true, fontSize: 8, fillColor: '#f6f8fa' }, {}, {}, {}, {}, {},
    { text: fmtNum(km), alignment: 'right', bold: true, fontSize: 8, fillColor: '#f6f8fa' },
    { text: fmtNum(liters, 2), alignment: 'right', bold: true, fontSize: 8, fillColor: '#f6f8fa' },
  ]
  const totals = [totalRow('Общо за периода', s.total, s.liters)]
  if (s.personal > 0) totals.push(totalRow('в т.ч. лично ползване', s.personal, s.personalLiters))

  const content = [
    {
      columns: [
        [
          { text: `Пътен лист № ${waybillNumber(waybill.number)}`, fontSize: 16, bold: true, color: INK },
          { text: `Дата на издаване: ${waybill.issue_date ? fmtDate(waybill.issue_date) : '—'}`, fontSize: 9, margin: [0, 4, 0, 0] },
          { text: `Период: ${fmtDate(waybill.period_from)} – ${fmtDate(waybill.period_to)}`, fontSize: 9 },
        ],
        { width: 260, ...infoTable([['Фирма', company?.name || ''], ['ЕИК', company?.eik || ''], ['Адрес', company?.address || '']]) },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 770, y2: 0, lineWidth: 1.5, lineColor: INK }], margin: [0, 8, 0, 8] },
    {
      columns: [
        infoTable([
          ['Автомобил', `${v.make} ${v.model}`], ['Рег. номер', v.reg_number],
          ['Вид гориво', v.fuel_type], ['Норма', `${fmtNum(s.norm, 2)} л/100 км`],
        ]),
        infoTable([
          ['Водач', d.full_name], ['Длъжност', d.position || '—'],
          ['Километраж', `${fmtNum(waybill.start_odometer)} – ${fmtNum(waybill.end_odometer)}`],
          ['Изминати', `${fmtNum(s.total)} км (служебно ${fmtNum(s.business)}, лично ${fmtNum(s.personal)})`],
        ]),
      ],
      columnGap: 30,
      margin: [0, 0, 0, 10],
    },
    {
      table: { headerRows: 1, dontBreakRows: true, widths: [18, 50, '*', '*', 48, 48, 32, 38], body: [head, ...body, ...totals] },
      layout: { hLineColor: LINE, vLineColor: LINE, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    },
    {
      text: `Нормативен разход: ${fmtNum(s.total)} км × ${fmtNum(s.norm, 2)} л/100 км = ${fmtNum(s.liters, 2)} л ` +
        `(служебно ${fmtNum(s.businessLiters, 2)} л, лично ${fmtNum(s.personalLiters, 2)} л)`,
      fontSize: 8, margin: [0, 6, 0, 0],
    },
  ]

  if (refuelings.length) {
    content.push({
      margin: [0, 10, 0, 0],
      table: {
        headerRows: 1,
        widths: [70, 60, 140],
        body: [
          ['Дата на зареждане', 'Литри', '№ на фактура'].map((t) => ({ text: t, bold: true, fontSize: 8, fillColor: '#eef1f4' })),
          ...refuelings.map((r) => [
            { text: fmtDate(r.refuel_date), fontSize: 8 },
            { text: fmtNum(r.liters, 2), fontSize: 8, alignment: 'right' },
            { text: r.invoice_number || '—', fontSize: 8 },
          ]),
        ],
      },
      layout: { hLineColor: LINE, vLineColor: LINE, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
    })
  }

  content.push({
    unbreakable: true,
    margin: [0, 36, 0, 0],
    columns: [
      [{ text: '_______________________________' }, { text: `Водач: ${d.full_name}`, fontSize: 9, margin: [0, 4, 0, 0] }],
      [{ text: '_______________________________' }, { text: `Одобрил (МОЛ): ${company?.mol || ''}`, fontSize: 9, margin: [0, 4, 0, 0] }],
    ],
  })
  return content
}

// Описание на целия PDF документ; списък от листове → всеки на нова страница.
export function pdfDefinition(list) {
  const content = list.flatMap((data, i) => {
    const part = waybillContent(data)
    if (i > 0) part[0] = { ...part[0], pageBreak: 'before' }
    return part
  })
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 30, 36, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    info: { title: list.length === 1 ? `Пътен лист ${waybillNumber(list[0].waybill.number)}` : 'Пътни листа' },
    content,
    footer: (page, pages) => ({ text: `стр. ${page} от ${pages}`, alignment: 'right', fontSize: 7, color: '#5b6675', margin: [0, 10, 36, 0] }),
  }
}

// Шрифтът, който PDF документът използва (bold = Roboto Medium).
export const pdfFonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Regular.ttf',
    bolditalics: 'Roboto-Medium.ttf',
  },
}

// В браузъра: зарежда pdfmake и шрифта само при нужда (по-бързо първо отваряне на сайта).
export async function downloadPdf(list, filename) {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default
  const vfs = (await import('./pdfFonts.js')).default
  pdfMake.createPdf(pdfDefinition(list), null, pdfFonts, vfs).download(filename)
}
