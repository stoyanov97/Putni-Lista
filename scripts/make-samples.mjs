// Генерира примерни PDF и Excel в папка samples/ (node scripts/make-samples.mjs)
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pdfDefinition } from '../src/lib/exportPdf.js'
import { buildWorkbook } from '../src/lib/exportExcel.js'
import { sample } from './sample-data.mjs'

const require = createRequire(import.meta.url)
const pdfMake = require('pdfmake/build/pdfmake.js')
const fonts = require('pdfmake/build/vfs_fonts.js')
pdfMake.vfs = fonts.pdfMake ? fonts.pdfMake.vfs : fonts.vfs || fonts

const sept = sample(1, '2026-09-01', '2026-09-30', 126500, 1850, 11, 120)
const oct = sample(2, '2026-10-01', '2026-10-31', sept.waybill.end_odometer, 2100, 12)

fs.mkdirSync('samples', { recursive: true })
const pdf = (list, file) => new Promise((res) => pdfMake.createPdf(pdfDefinition(list)).getBuffer((b) => { fs.writeFileSync(file, Buffer.from(b)); res() }))
await pdf([sept], 'samples/putni-list-000001.pdf')
await pdf([sept, oct], 'samples/putni-listove-period.pdf')
await (await buildWorkbook([sept])).xlsx.writeFile('samples/putni-list-000001.xlsx')
await (await buildWorkbook([sept, oct])).xlsx.writeFile('samples/putni-listove-period.xlsx')
console.log('готово:', fs.readdirSync('samples'))
