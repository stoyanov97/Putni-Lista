import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveRoute } from '../lib/maps'
import { fmtDate } from '../lib/format'
import RouteMap from '../components/RouteMap'
import { loadWaybill } from '../lib/waybillData'
import WaybillDocument from '../components/WaybillDocument'
import { waybillNumber } from '../lib/waybillSummary'
import { downloadPdf } from '../lib/exportPdf'
import { downloadExcel } from '../lib/exportExcel'

export default function WaybillView({ id, issuedNumber, navigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [destinations, setDestinations] = useState([])
  const [selected, setSelected] = useState(0)

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(`Експортът не успя: ${e.message}`)
    }
    setBusy(false)
  }
  const fileBase = () => `putni-list-${waybillNumber(data.waybill.number)}`

  useEffect(() => {
    loadWaybill(id).then(setData).catch((e) => setError(e.message))
    supabase.from('destinations').select('*').then(({ data: d }) => setDestinations(d || []))
  }, [id])

  const trip = data?.trips[selected]
  const points = useMemo(() => (trip ? resolveRoute(trip.route, destinations) : []), [trip, destinations])

  if (error && !data) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Зареждане…</p>

  return (
    <section>
      <div className="toolbar no-print">
        <button onClick={() => navigate('history')}>Към историята</button>
        <button className="primary" disabled={busy} onClick={() => run(() => downloadPdf([data], `${fileBase()}.pdf`))}>Изтегли PDF</button>
        <button className="primary" disabled={busy} onClick={() => run(() => downloadExcel([data], `${fileBase()}.xlsx`))}>Изтегли Excel</button>
        <button onClick={() => window.print()}>Печат</button>
        {issuedNumber && <p className="ok">Издаден е пътен лист № {waybillNumber(issuedNumber)}.</p>}
        {error && <p className="error">{error}</p>}
      </div>
      <WaybillDocument data={data} selected={selected} onSelect={setSelected} />

      <section className="map-panel no-print">
        <h3>Маршрут на картата</h3>
        <label className="map-select">
          <span>Ред от листа (или кликнете ред в таблицата)</span>
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {data.trips.map((t, i) => (
              <option key={t.id} value={i}>{t.seq}. {fmtDate(t.trip_date)} – {t.route}</option>
            ))}
          </select>
        </label>
        <RouteMap points={points} sheetKm={trip?.km ?? 0} />
      </section>
    </section>
  )
}
