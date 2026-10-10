// Таблица с разстояния (км) между всички дестинации.
// Ред = откъде, колона = докъде. Попълва се от картата и може да се коригира на ръка.
import { useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'
import { roadDistances, estimatedDistances } from '../lib/maps'

const key = (from, to) => `${from}-${to}`

export default function Distances() {
  const [places, setPlaces] = useState([])
  const [cells, setCells] = useState({}) // "from-to" → { km, source }
  const [drafts, setDrafts] = useState({}) // въведено, но още незаписано
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [{ data: d, error: e1 }, { data: dist, error: e2 }] = await Promise.all([
      supabase.from('destinations').select('*').order('is_base', { ascending: false }).order('name'),
      supabase.from('distances').select('*'),
    ])
    if (e1 || e2) return setError(friendlyError(e1 || e2))
    setPlaces(d)
    setCells(Object.fromEntries(dist.map((r) => [key(r.from_id, r.to_id), { km: Number(r.km), source: r.source }])))
    setDrafts({})
  }
  useEffect(() => { load() }, [])

  async function calculate() {
    setError('')
    setMessage('')
    const located = places.filter((p) => p.lat != null)
    if (located.length < 2) return setError('Нужни са поне две дестинации, намерени в картата.')
    setBusy(true)
    let matrix
    let source = 'osrm'
    try {
      matrix = await roadDistances(located)
    } catch {
      matrix = estimatedDistances(located)
      source = 'estimate'
    }
    // Ръчно въведените стойности не се презаписват.
    const rows = []
    located.forEach((from, i) =>
      located.forEach((to, j) => {
        if (i === j || matrix[i][j] == null || matrix[i][j] <= 0) return
        if (cells[key(from.id, to.id)]?.source === 'manual') return
        rows.push({ from_id: from.id, to_id: to.id, km: matrix[i][j], source })
      }),
    )
    const { error } = await supabase.from('distances').upsert(rows, { onConflict: 'from_id,to_id' })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setMessage(
      source === 'osrm'
        ? `Изчислени са ${rows.length} разстояния по пътната мрежа (OpenStreetMap).`
        : 'Картата не отговори, затова са използвани приблизителни разстояния (права линия × 1,3). Опитайте пак по-късно.',
    )
    load()
  }

  async function saveCell(from, to) {
    const k = key(from, to)
    if (!(k in drafts)) return
    const raw = String(drafts[k]).replace(',', '.').trim()
    setError('')
    if (raw === '') {
      const { error } = await supabase.from('distances').delete().match({ from_id: from, to_id: to })
      if (error) return setError(friendlyError(error))
    } else {
      const km = Number(raw)
      if (!(km > 0 && km < 2000)) return setError('Разстоянието трябва да е число между 0 и 2000 км.')
      const { error } = await supabase
        .from('distances')
        .upsert({ from_id: from, to_id: to, km: Math.round(km * 10) / 10, source: 'manual' }, { onConflict: 'from_id,to_id' })
      if (error) return setError(friendlyError(error))
    }
    load()
  }

  const missing = places.filter((p) => p.lat == null)

  return (
    <section>
      <h2>Разстояния</h2>
      <p className="muted">
        Километри по пътя от дестинацията в реда до дестинацията в колоната. Може да коригирате всяка стойност:
        ръчните корекции се пазят и не се презаписват при ново изчисляване.
      </p>

      <div className="toolbar">
        <button className="primary" onClick={calculate} disabled={busy}>
          {busy ? 'Изчисляване…' : 'Изчисли разстоянията от картата'}
        </button>
        <span className="legend"><span className="swatch manual" /> ръчно</span>
        <span className="legend"><span className="swatch estimate" /> приблизително</span>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      {missing.length > 0 && (
        <p className="warn">Без координати (въведете разстоянията ръчно): {missing.map((p) => p.name).join(', ')}</p>
      )}

      {places.length < 2 ? (
        <p className="empty">Добавете поне две дестинации, едната от които базата.</p>
      ) : (
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>от \ до</th>
                {places.map((p) => <th key={p.id} className="num">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {places.map((from) => (
                <tr key={from.id}>
                  <th>{from.name}{from.is_base && ' (база)'}</th>
                  {places.map((to) => {
                    if (from.id === to.id) return <td key={to.id} className="num diag">–</td>
                    const k = key(from.id, to.id)
                    const cell = cells[k]
                    const value = k in drafts ? drafts[k] : cell ? cell.km : ''
                    return (
                      <td key={to.id} className={`num ${cell?.source || ''}`}>
                        <input
                          className="cell"
                          inputMode="decimal"
                          aria-label={`${from.name} до ${to.name}, км`}
                          value={value}
                          onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })}
                          onBlur={() => saveCell(from.id, to.id)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
