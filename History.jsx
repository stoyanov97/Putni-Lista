// Издадени листове и чернови, с филтър по автомобил и период.
import { useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'
import { deleteDraft } from '../lib/waybillData'
import { fmtDate, fmtNum } from '../lib/format'
import { fuelLiters } from '../lib/routeGenerator'
import { waybillNumber } from '../lib/waybillSummary'
import { loadWaybill } from '../lib/waybillData'
import { downloadPdf } from '../lib/exportPdf'
import { downloadExcel } from '../lib/exportExcel'

export default function History({ navigate }) {
  const [vehicles, setVehicles] = useState([])
  const [filter, setFilter] = useState({ vehicleId: '', from: '', to: '' })
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('vehicles').select('id, reg_number').order('reg_number').then(({ data }) => setVehicles(data || []))
  }, [])

  async function load() {
    let q = supabase
      .from('waybills')
      .select('*, vehicles(reg_number, make, model), drivers(full_name)')
      .order('status', { ascending: true }) // чернови ('draft') първи
      .order('number', { ascending: false })
    if (filter.vehicleId) q = q.eq('vehicle_id', filter.vehicleId)
    if (filter.from) q = q.gte('period_to', filter.from)
    if (filter.to) q = q.lte('period_from', filter.to)
    const { data, error } = await q
    if (error) return setError(friendlyError(error))
    setRows(data)
  }
  useEffect(() => { load() }, [filter])

  async function remove(row) {
    if (!confirm('Да се изтрие ли черновата?')) return
    try {
      await deleteDraft(row.id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  // Експорт на всички издадени листове, видими с текущия филтър (сортирани по номер).
  const issued = (rows || []).filter((r) => r.status === 'issued').sort((a, b) => a.number - b.number)
  async function exportPeriod(kind) {
    setBusy(true)
    setError('')
    try {
      const list = await Promise.all(issued.map((r) => loadWaybill(r.id)))
      const name = `putni-listove-${waybillNumber(issued[0].number)}-${waybillNumber(issued[issued.length - 1].number)}`
      if (kind === 'pdf') await downloadPdf(list, `${name}.pdf`)
      else await downloadExcel(list, `${name}.xlsx`)
    } catch (e) {
      setError(`Експортът не успя: ${e.message}`)
    }
    setBusy(false)
  }

  return (
    <section>
      <h2>История</h2>
      <div className="panel form-grid">
        <label><span>Автомобил</span>
          <select value={filter.vehicleId} onChange={(e) => setFilter({ ...filter, vehicleId: e.target.value })}>
            <option value="">Всички</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg_number}</option>)}
          </select>
        </label>
        <label><span>Период от</span><input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></label>
        <label><span>Период до</span><input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></label>
        <div className="form-actions">
          <span className="muted small">Експорт на {issued.length} издадени листа от филтъра:</span>
          <button disabled={busy || !issued.length} onClick={() => exportPeriod('pdf')}>PDF</button>
          <button disabled={busy || !issued.length} onClick={() => exportPeriod('excel')}>Excel</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {rows === null ? <p className="muted">Зареждане…</p> : rows.length === 0 ? (
        <p className="empty">Няма пътни листа за избрания филтър. Създайте първия от „Нов пътен лист“.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th><th>Период</th><th>Автомобил</th><th>Водач</th>
                <th className="num">Км</th><th className="num">Литри</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const km = r.end_odometer != null ? r.end_odometer - r.start_odometer : r.requested_km
                return (
                  <tr key={r.id}>
                    <td>{r.status === 'issued' ? waybillNumber(r.number) : <span className="badge">чернова</span>}</td>
                    <td>{fmtDate(r.period_from)} – {fmtDate(r.period_to)}</td>
                    <td>{r.vehicles.reg_number}</td>
                    <td>{r.drivers.full_name}</td>
                    <td className="num">{fmtNum(km)}</td>
                    <td className="num">{fmtNum(fuelLiters(km, Number(r.consumption_l100)), 2)}</td>
                    <td className="row-actions">
                      {r.status === 'issued' ? (
                        <button onClick={() => navigate('view', { id: r.id })}>Преглед и експорт</button>
                      ) : (
                        <>
                          <button onClick={() => navigate('new', { draftId: r.id })}>Продължи</button>
                          <button className="danger" onClick={() => remove(r)}>Изтрий</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
