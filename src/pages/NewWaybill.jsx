// Основният поток: въвеждане на км → генериране → преглед и редакция → издаване.
import { useEffect, useMemo, useState } from 'react'
import { generateTrips, recalculate, fuelLiters } from '../lib/routeGenerator'
import { loadSetup, lastIssued, issuedOverlapping, saveDraft, issue, loadWaybill } from '../lib/waybillData'
import { fmtDate, fmtNum } from '../lib/format'

const iso = (d) => d.toISOString().slice(0, 10)
function previousMonth() {
  const now = new Date()
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1))
  const to = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0))
  return [iso(from), iso(to)]
}
function nextDay(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return iso(d)
}
function endOfMonth(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z')
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
}

export default function NewWaybill({ draftId: initialDraftId, navigate }) {
  const [setup, setSetup] = useState(null)
  const [draftId, setDraftId] = useState(initialDraftId || null)
  const [form, setForm] = useState(() => {
    const [from, to] = previousMonth()
    return {
      vehicleId: '', driverId: '', periodFrom: from, periodTo: to, mode: 'end', endOdometer: '', totalKm: '',
      personalKm: '0', includeWeekends: false, maxDailyKm: '400', excluded: [],
    }
  })
  const [startOdometer, setStartOdometer] = useState(null)
  const [previous, setPrevious] = useState(null)
  const [newExcluded, setNewExcluded] = useState('')
  const [trips, setTrips] = useState(null)
  const [refuelings, setRefuelings] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const vehicle = setup?.vehicles.find((v) => v.id === Number(form.vehicleId))

  // Зареждане на регистрите и (ако има) на черновата
  useEffect(() => {
    loadSetup().then(setSetup).catch((e) => setError(e.message))
    if (!initialDraftId) return
    loadWaybill(initialDraftId).then(({ waybill, trips: rows, refuelings: refs }) => {
      setForm((f) => ({
        ...f, vehicleId: String(waybill.vehicle_id), driverId: String(waybill.driver_id),
        periodFrom: waybill.period_from, periodTo: waybill.period_to, mode: 'total',
        totalKm: String(waybill.requested_km),
      }))
      setStartOdometer(waybill.start_odometer)
      setTrips(rows.map((r) => ({
        date: r.trip_date, route: r.route, purpose: r.purpose, km: r.km,
        startOdometer: r.start_odometer, endOdometer: r.end_odometer, isPersonal: r.is_personal,
      })))
      setRefuelings(refs.map((r) => ({ date: r.refuel_date, liters: String(r.liters), invoice: r.invoice_number || '' })))
    })
  }, [initialDraftId])

  // При избор на автомобил: началният километраж и периодът продължават от предишния лист.
  async function chooseVehicle(id) {
    set({ vehicleId: id })
    setTrips(null)
    if (!id) return setStartOdometer(null)
    const v = setup.vehicles.find((x) => x.id === Number(id))
    const last = await lastIssued(id)
    setPrevious(last)
    setStartOdometer(last ? last.end_odometer : v.start_odometer)
    if (last) {
      const from = nextDay(last.period_to)
      set({ vehicleId: id, periodFrom: from, periodTo: endOfMonth(from) })
    }
  }

  const requestedKm = form.mode === 'end'
    ? (form.endOdometer === '' || startOdometer == null ? null : Number(form.endOdometer) - startOdometer)
    : (form.totalKm === '' ? null : Number(form.totalKm))

  function validateInput() {
    if (!form.vehicleId) return 'Изберете автомобил.'
    if (!form.driverId) return 'Изберете водач.'
    if (!form.periodFrom || !form.periodTo || form.periodTo < form.periodFrom) return 'Краят на периода не може да е преди началото.'
    if (form.mode === 'end' && Number(form.endOdometer) <= startOdometer) {
      return `Крайният километраж трябва да е по-голям от началния (${fmtNum(startOdometer)}).`
    }
    if (!Number.isInteger(requestedKm) || requestedKm <= 0) return 'Въведете изминатите километри като цяло положително число.'
    return ''
  }

  async function generate() {
    setError('')
    setNotice('')
    setWarning('')
    const problem = validateInput()
    if (problem) return setError(problem)
    const overlap = await issuedOverlapping(form.vehicleId, form.periodFrom, form.periodTo, draftId)
    if (overlap.length) {
      return setError(`За този период вече има издаден лист № ${overlap[0].number} (${fmtDate(overlap[0].period_from)} – ${fmtDate(overlap[0].period_to)}).`)
    }
    const base = setup.destinations.find((d) => d.is_base)
    if (!base) return setError('Няма база (офис). Отбележете една дестинация като база.')
    try {
      const result = generateTrips({
        periodFrom: form.periodFrom, periodTo: form.periodTo, targetKm: requestedKm, startOdometer,
        base, destinations: setup.destinations, distance: setup.distance,
        excludedDates: form.excluded, includeWeekends: form.includeWeekends,
        maxDailyKm: Number(form.maxDailyKm) || 400, personalKm: Number(form.personalKm) || 0,
        seed: Math.floor(Math.random() * 2 ** 31),
      })
      setTrips(result.trips)
      // Много градски пътувания = дестинациите не стигат за реалистичен лист.
      setWarning(
        result.fallbackShare > 0.15
          ? `${fmtNum(result.fallbackKm)} км (${Math.round(result.fallbackShare * 100)}%) са разпределени като градски служебни пътувания, ` +
              'защото дестинациите не стигат. За по-реалистичен резултат добавете още клиенти, включително по-близки до базата.'
          : '',
      )
    } catch (e) {
      setError(e.message)
    }
  }

  // Ръчна редакция на ред: километражът и сумите се преизчисляват веднага.
  function updateTrip(index, patch) {
    let next = trips.map((t, i) => (i === index ? { ...t, ...patch } : t))
    if ('date' in patch) next = [...next].sort((a, b) => a.date.localeCompare(b.date))
    setTrips(recalculate(next, startOdometer).trips)
  }
  function removeTrip(index) {
    setTrips(recalculate(trips.filter((_, i) => i !== index), startOdometer).trips)
  }
  function addTrip() {
    const base = setup.destinations.find((d) => d.is_base)
    const last = trips[trips.length - 1]
    const row = { date: last ? last.date : form.periodFrom, route: base ? `${base.name} – … – ${base.name}` : '', purpose: '', km: 1, isPersonal: false }
    setTrips(recalculate([...trips, row], startOdometer).trips)
  }

  const totals = useMemo(() => {
    if (!trips) return null
    const total = trips.reduce((s, t) => s + (Number(t.km) || 0), 0)
    const personal = trips.filter((t) => t.isPersonal).reduce((s, t) => s + (Number(t.km) || 0), 0)
    const norm = vehicle ? Number(vehicle.consumption_l100) : 0
    return { total, personal, business: total - personal, diff: total - (requestedKm || 0), fuel: fuelLiters(total, norm) }
  }, [trips, vehicle, requestedKm])

  function validateTrips() {
    for (const [i, t] of trips.entries()) {
      const n = i + 1
      if (!t.date || t.date < form.periodFrom || t.date > form.periodTo) return `Ред ${n}: датата е извън периода.`
      if (!Number.isInteger(Number(t.km)) || Number(t.km) <= 0) return `Ред ${n}: км трябва да са цяло положително число.`
      if (!t.route.trim() || !t.purpose.trim()) return `Ред ${n}: попълнете маршрут и цел.`
    }
    for (const [i, r] of refuelings.entries()) {
      if (!r.date || !(Number(r.liters) > 0)) return `Зареждане ${i + 1}: попълнете дата и литри.`
    }
    return ''
  }

  async function save(andIssue) {
    setError('')
    setNotice('')
    const problem = validateInput() || validateTrips()
    if (problem) return setError(problem)
    if (andIssue && Math.abs(totals.diff) > 1) return setError('Разликата е над 1 км. Коригирайте маршрутите преди издаване.')
    if (andIssue && !confirm('След издаване пътният лист получава пореден номер и не може да се променя. Продължавате ли?')) return
    setBusy(true)
    try {
      const header = {
        vehicle_id: Number(form.vehicleId), driver_id: Number(form.driverId),
        period_from: form.periodFrom, period_to: form.periodTo,
        start_odometer: startOdometer, requested_km: requestedKm,
        end_odometer: startOdometer + totals.total, consumption_l100: Number(vehicle.consumption_l100),
      }
      const fixed = trips.map((t) => ({ ...t, km: Number(t.km) }))
      const id = await saveDraft(draftId, header, fixed, refuelings)
      setDraftId(id)
      if (andIssue) {
        const number = await issue(id)
        navigate('view', { id, issuedNumber: number })
      } else {
        setNotice('Черновата е запазена. Може да я продължите от „История“.')
      }
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  if (!setup) return <p className="muted">{error || 'Зареждане…'}</p>
  if (!setup.vehicles.length || !setup.drivers.length) {
    return <p className="empty">Първо добавете поне един автомобил и един водач в „Настройки“.</p>
  }

  return (
    <section>
      <h2>{draftId ? 'Пътен лист (чернова)' : 'Нов пътен лист'}</h2>
      <p className="muted">Въведете изминатите километри за периода. Системата ще ги разпредели в маршрути по работните дни.</p>

      <div className="panel form-grid">
        <label><span>Автомобил<span className="req"> *</span></span>
          <select value={form.vehicleId} onChange={(e) => chooseVehicle(e.target.value)} disabled={!!draftId}>
            <option value="">Изберете…</option>
            {setup.vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg_number} – {v.make} {v.model}</option>)}
          </select>
        </label>
        <label><span>Водач<span className="req"> *</span></span>
          <select value={form.driverId} onChange={(e) => set({ driverId: e.target.value })}>
            <option value="">Изберете…</option>
            {setup.drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </label>
        <label><span>Период от<span className="req"> *</span></span>
          <input type="date" value={form.periodFrom} onChange={(e) => set({ periodFrom: e.target.value })} />
        </label>
        <label><span>Период до<span className="req"> *</span></span>
          <input type="date" value={form.periodTo} min={form.periodFrom} onChange={(e) => set({ periodTo: e.target.value })} />
        </label>

        <label><span>Начален километраж</span>
          <input value={startOdometer == null ? '' : fmtNum(startOdometer)} readOnly className="readonly" placeholder="Изберете автомобил" />
          {previous && <small className="muted">Продължава от лист № {previous.number}</small>}
        </label>
        <div className="mode">
          <span className="mode-label">Въвеждане</span>
          <label className="check"><input type="radio" checked={form.mode === 'end'} onChange={() => set({ mode: 'end' })} /> Краен километраж</label>
          <label className="check"><input type="radio" checked={form.mode === 'total'} onChange={() => set({ mode: 'total' })} /> Общо км</label>
        </div>
        {form.mode === 'end' ? (
          <label><span>Краен километраж<span className="req"> *</span></span>
            <input type="number" step="1" min={startOdometer ?? 0} value={form.endOdometer} onChange={(e) => set({ endOdometer: e.target.value })} />
            {requestedKm > 0 && <small className="muted">= {fmtNum(requestedKm)} км</small>}
          </label>
        ) : (
          <label><span>Изминати км<span className="req"> *</span></span>
            <input type="number" step="1" min="1" value={form.totalKm} onChange={(e) => set({ totalKm: e.target.value })} />
          </label>
        )}
        <label><span>От тях лично ползване, км</span>
          <input type="number" step="1" min="0" value={form.personalKm} onChange={(e) => set({ personalKm: e.target.value })} />
        </label>

        <details className="more">
          <summary>Още настройки: отпуски, почивни дни, дневен лимит</summary>
          <div className="form-grid">
            <label><span>Максимум км на ден</span>
              <input type="number" step="10" min="50" value={form.maxDailyKm} onChange={(e) => set({ maxDailyKm: e.target.value })} />
            </label>
            <label className="check"><input type="checkbox" checked={form.includeWeekends} onChange={(e) => set({ includeWeekends: e.target.checked })} /> Пътувания и в почивни дни</label>
            <label><span>Неработни дни / отпуска</span>
              <span className="inline">
                <input type="date" value={newExcluded} min={form.periodFrom} max={form.periodTo} onChange={(e) => setNewExcluded(e.target.value)} />
                <button type="button" onClick={() => { if (newExcluded && !form.excluded.includes(newExcluded)) set({ excluded: [...form.excluded, newExcluded].sort() }); setNewExcluded('') }}>Добави</button>
              </span>
            </label>
            {form.excluded.length > 0 && (
              <div className="chips">
                {form.excluded.map((d) => (
                  <button type="button" key={d} className="chip" onClick={() => set({ excluded: form.excluded.filter((x) => x !== d) })} aria-label={`Премахни ${fmtDate(d)}`}>
                    {fmtDate(d)} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        </details>

        <div className="form-actions">
          <button className="primary" onClick={generate} disabled={busy}>{trips ? 'Генерирай отново' : 'Генерирай маршрути'}</button>
          {error && <p className="error">{error}</p>}
          {notice && <p className="ok">{notice}</p>}
        </div>
      </div>
      {warning && <p className="warn callout">{warning}</p>}

      {trips && totals && (
        <>
          <div className={`summary ${Math.abs(totals.diff) <= 1 ? 'good' : 'bad'}`}>
            <div><span>Въведени</span><strong>{fmtNum(requestedKm || 0)} км</strong></div>
            <div><span>Сума на маршрутите</span><strong>{fmtNum(totals.total)} км</strong></div>
            <div className="diff"><span>Разлика</span><strong>{totals.diff > 0 ? '+' : ''}{totals.diff} км</strong>
              <small>{Math.abs(totals.diff) <= 1 ? 'в рамките на ±1 км' : 'над допустимия ±1 км'}</small></div>
            <div><span>Служебни / лични</span><strong>{fmtNum(totals.business)} / {fmtNum(totals.personal)} км</strong></div>
            <div><span>Норм. разход</span><strong>{fmtNum(totals.fuel, 2)} л</strong></div>
          </div>

          <div className="table-wrap">
            <table className="trips">
              <thead>
                <tr>
                  <th>№</th><th>Дата</th><th>Маршрут</th><th>Цел</th>
                  <th className="num">Км</th><th className="num">Нач. км</th><th className="num">Кр. км</th>
                  <th className="num">Литри</th><th>Лично</th><th />
                </tr>
              </thead>
              <tbody>
                {trips.map((t, i) => (
                  <tr key={i} className={t.isPersonal ? 'personal' : ''}>
                    <td>{i + 1}</td>
                    <td><input type="date" value={t.date} min={form.periodFrom} max={form.periodTo} onChange={(e) => updateTrip(i, { date: e.target.value })} /></td>
                    <td><input className="wide" value={t.route} onChange={(e) => updateTrip(i, { route: e.target.value })} /></td>
                    <td><input className="wide" value={t.purpose} onChange={(e) => updateTrip(i, { purpose: e.target.value })} /></td>
                    <td className="num"><input className="km" type="number" step="1" min="1" value={t.km} onChange={(e) => updateTrip(i, { km: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                    <td className="num">{fmtNum(t.startOdometer)}</td>
                    <td className="num">{fmtNum(t.endOdometer)}</td>
                    <td className="num">{vehicle ? fmtNum(fuelLiters(Number(t.km) || 0, Number(vehicle.consumption_l100)), 2) : ''}</td>
                    <td><input type="checkbox" checked={!!t.isPersonal} aria-label="Лично ползване" onChange={(e) => updateTrip(i, { isPersonal: e.target.checked })} /></td>
                    <td><button className="danger small-btn" onClick={() => removeTrip(i)}>Премахни</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar"><button onClick={addTrip}>Добави ред</button></div>

          <h3>Зареждания (по избор)</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Дата</th><th className="num">Литри</th><th>№ на фактура</th><th /></tr></thead>
              <tbody>
                {refuelings.map((r, i) => (
                  <tr key={i}>
                    <td><input type="date" value={r.date} min={form.periodFrom} max={form.periodTo} onChange={(e) => setRefuelings(refuelings.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></td>
                    <td className="num"><input className="km" inputMode="decimal" value={r.liters} onChange={(e) => setRefuelings(refuelings.map((x, j) => (j === i ? { ...x, liters: e.target.value.replace(',', '.') } : x)))} /></td>
                    <td><input value={r.invoice} onChange={(e) => setRefuelings(refuelings.map((x, j) => (j === i ? { ...x, invoice: e.target.value } : x)))} /></td>
                    <td><button className="danger small-btn" onClick={() => setRefuelings(refuelings.filter((_, j) => j !== i))}>Премахни</button></td>
                  </tr>
                ))}
                {refuelings.length === 0 && <tr><td colSpan="4" className="muted">Няма въведени зареждания.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <button onClick={() => setRefuelings([...refuelings, { date: form.periodFrom, liters: '', invoice: '' }])}>Добави зареждане</button>
          </div>

          <div className="toolbar final">
            <button onClick={() => save(false)} disabled={busy}>Запази чернова</button>
            <button className="primary" onClick={() => save(true)} disabled={busy || Math.abs(totals.diff) > 1}>Издай пътен лист</button>
            {error && <p className="error">{error}</p>}
            {notice && <p className="ok">{notice}</p>}
          </div>
        </>
      )}
    </section>
  )
}
