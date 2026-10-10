// Импорт на дестинации от Excel: избор на файл → преглед → запис с търсене в картата.
import { useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'
import { geocode } from '../lib/maps'
import { parseDestinationRows, readExcelRows, templateWorkbook } from '../lib/importDestinations'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function ImportDestinations({ onImported }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null) // { items, problems }
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  async function chooseFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setResult('')
    try {
      const { data: existing } = await supabase.from('destinations').select('name, is_base')
      setPreview(parseDestinationRows(await readExcelRows(file), existing || []))
    } catch {
      setError('Файлът не може да се прочете. Използвайте .xlsx (Excel 2007 или по-нов).')
    }
  }

  async function downloadTemplate() {
    const workbook = await templateWorkbook()
    const blob = new Blob([await workbook.xlsx.writeBuffer()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'destinacii-shablon.xlsx'
    a.click()
  }

  // Един по един: картата позволява до 1 заявка в секунда.
  async function runImport() {
    const failed = []
    let added = 0
    let withoutCoords = 0
    for (const [i, item] of preview.items.entries()) {
      setProgress(`${i + 1} от ${preview.items.length}: ${item.name}`)
      let coords = { lat: null, lon: null }
      try {
        const hit = await geocode(item.address)
        if (hit) coords = { lat: hit.lat, lon: hit.lon }
        else withoutCoords++
      } catch {
        withoutCoords++
      }
      const { error } = await supabase.from('destinations').insert({ ...item, ...coords })
      if (error) failed.push(`${item.name}: ${friendlyError(error)}`)
      else added++
      await sleep(1100)
    }
    setProgress(null)
    setPreview(null)
    setResult(
      `Добавени: ${added}.` +
        (withoutCoords ? ` Без координати: ${withoutCoords} (въведете разстоянията ръчно).` : '') +
        (failed.length ? ` Неуспешни: ${failed.join('; ')}` : '') +
        ' Следваща стъпка: „Разстояния“ → „Изчисли разстоянията от картата“.',
    )
    onImported()
  }

  return (
    <div className="panel import">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} Импорт на дестинации от Excel
      </button>
      {open && (
        <div className="import-body">
          <p className="muted small">
            Първият ред е заглавен: <strong>Наименование</strong>, <strong>Адрес</strong> (задължителни), Цел на посещението,
            База (да/не). Дублиращи се имена се пропускат.
          </p>
          <div className="toolbar">
            <label className="file-btn">
              Избери .xlsx файл
              <input type="file" accept=".xlsx" onChange={chooseFile} disabled={!!progress} />
            </label>
            <button type="button" onClick={downloadTemplate}>Изтегли шаблон</button>
          </div>
          {error && <p className="error">{error}</p>}
          {result && <p className="ok">{result}</p>}

          {preview && (
            <>
              {preview.problems.map((p) => <p key={p} className="warn small">{p}</p>)}
              {preview.items.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Наименование</th><th>Адрес</th><th>Цел</th><th>База</th></tr></thead>
                      <tbody>
                        {preview.items.map((it) => (
                          <tr key={it.name}><td>{it.name}</td><td>{it.address}</td><td>{it.purpose}</td><td>{it.is_base ? 'да' : ''}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="toolbar" style={{ marginTop: '.8rem' }}>
                    <button className="primary" onClick={runImport} disabled={!!progress}>
                      {progress ? 'Импортиране…' : `Импортирай ${preview.items.length}`}
                    </button>
                    {!progress && <button onClick={() => setPreview(null)}>Откажи</button>}
                    {progress && <span className="muted small">{progress} (адресите се търсят в картата)</span>}
                  </div>
                </>
              ) : (
                <p className="muted">Няма нови дестинации за импорт.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
