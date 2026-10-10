// Четене и запис на пътни листа в базата.
import { supabase, friendlyError } from './supabase'

function check({ data, error }) {
  if (error) throw new Error(friendlyError(error))
  return data
}

// Регистри, нужни за формата и генерирането.
export async function loadSetup() {
  const [vehicles, drivers, destinations, distances, company] = await Promise.all([
    supabase.from('vehicles').select('*').order('reg_number').then(check),
    supabase.from('drivers').select('*').order('full_name').then(check),
    supabase.from('destinations').select('*').order('name').then(check),
    supabase.from('distances').select('from_id,to_id,km').then(check),
    supabase.from('company').select('*').eq('id', 1).maybeSingle().then(check),
  ])
  const table = new Map(distances.map((d) => [`${d.from_id}-${d.to_id}`, Number(d.km)]))
  const distance = (from, to) => table.get(`${from}-${to}`) ?? null
  return { vehicles, drivers, destinations, distance, company }
}

// Последният издаден лист на автомобила: оттам започва новият период.
export async function lastIssued(vehicleId) {
  return supabase
    .from('waybills')
    .select('number, period_from, period_to, end_odometer')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'issued')
    .order('period_to', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(check)
}

export async function issuedOverlapping(vehicleId, from, to, exceptId) {
  let q = supabase
    .from('waybills')
    .select('number, period_from, period_to')
    .eq('vehicle_id', vehicleId)
    .eq('status', 'issued')
    .lte('period_from', to)
    .gte('period_to', from)
  if (exceptId) q = q.neq('id', exceptId)
  return q.then(check)
}

// Записва чернова: заглавна част + редове (маршрути) + зареждания.
export async function saveDraft(id, header, trips, refuelings) {
  let waybillId = id
  if (waybillId) {
    check(await supabase.from('waybills').update(header).eq('id', waybillId))
    check(await supabase.from('trips').delete().eq('waybill_id', waybillId))
    check(await supabase.from('refuelings').delete().eq('waybill_id', waybillId))
  } else {
    const row = check(await supabase.from('waybills').insert(header).select('id').single())
    waybillId = row.id
  }
  if (trips.length) {
    check(
      await supabase.from('trips').insert(
        trips.map((t, i) => ({
          waybill_id: waybillId,
          seq: i + 1,
          trip_date: t.date,
          route: t.route,
          purpose: t.purpose,
          km: t.km,
          start_odometer: t.startOdometer,
          end_odometer: t.endOdometer,
          is_personal: !!t.isPersonal,
        })),
      ),
    )
  }
  if (refuelings.length) {
    check(
      await supabase.from('refuelings').insert(
        refuelings.map((r) => ({
          waybill_id: waybillId,
          refuel_date: r.date,
          liters: Number(r.liters),
          invoice_number: r.invoice || null,
        })),
      ),
    )
  }
  return waybillId
}

// Издаване: номерът и всички проверки се правят в базата (функция issue_waybill).
export async function issue(id) {
  return check(await supabase.rpc('issue_waybill', { p_waybill_id: id }))
}

// Пълни данни за един лист: за преглед, PDF и Excel.
export async function loadWaybill(id) {
  const [waybill, trips, refuelings, company] = await Promise.all([
    supabase.from('waybills').select('*, vehicles(*), drivers(*)').eq('id', id).single().then(check),
    supabase.from('trips').select('*').eq('waybill_id', id).order('seq').then(check),
    supabase.from('refuelings').select('*').eq('waybill_id', id).order('refuel_date').then(check),
    supabase.from('company').select('*').eq('id', 1).maybeSingle().then(check),
  ])
  return { waybill, trips, refuelings, company }
}

export async function deleteDraft(id) {
  check(await supabase.from('waybills').delete().eq('id', id))
}
