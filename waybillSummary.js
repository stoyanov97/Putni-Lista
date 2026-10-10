// Обобщени стойности за един пътен лист. Използва се от прегледа, PDF и Excel,
// за да са навсякъде едни и същи числа.
import { fuelLiters } from './routeGenerator.js'

export function summarize(waybill, trips) {
  const norm = Number(waybill.consumption_l100)
  const total = trips.reduce((s, t) => s + t.km, 0)
  const personal = trips.filter((t) => t.is_personal).reduce((s, t) => s + t.km, 0)
  return {
    norm,
    total,
    personal,
    business: total - personal,
    liters: fuelLiters(total, norm),
    personalLiters: fuelLiters(personal, norm),
    businessLiters: fuelLiters(total - personal, norm),
    difference: total - waybill.requested_km,
  }
}

export const waybillNumber = (n) => (n == null ? 'чернова' : String(n).padStart(6, '0'))
