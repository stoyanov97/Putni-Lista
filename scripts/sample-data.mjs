// Примерни данни за проверка на експорта без база данни.
import { generateTrips } from '../src/lib/routeGenerator.js'
import { estimatedDistances } from '../src/lib/maps.js'

const places = [
  { id: 1, name: 'Офис София', lat: 42.6977, lon: 23.3219 },
  { id: 2, name: 'Клиент „Алфа“ ООД, Перник', lat: 42.6052, lon: 23.0378, purpose: 'Доставка на стока' },
  { id: 3, name: 'Склад „Бета“, Божурище', lat: 42.7586, lon: 23.2003, purpose: 'Получаване на материали' },
  { id: 4, name: 'Клиент „Гама“ АД, Пловдив', lat: 42.1354, lon: 24.7453, purpose: 'Среща по договор' },
  { id: 5, name: 'Обект Ботевград', lat: 42.9077, lon: 23.7934, purpose: 'Контрол на обект' },
  { id: 6, name: 'Доставчик „Делта“, Самоков', lat: 42.337, lon: 23.5528, purpose: 'Приемане на доставка' },
  { id: 7, name: 'Клиент „Епсилон“, Бургас', lat: 42.5048, lon: 27.4626, purpose: 'Монтаж на оборудване' },
]
const m = estimatedDistances(places)
const ix = new Map(places.map((p, i) => [p.id, i]))

export function sample(number, periodFrom, periodTo, startOdometer, targetKm, seed, personalKm = 0) {
  const r = generateTrips({
    periodFrom, periodTo, targetKm, startOdometer, personalKm, seed,
    base: places[0], destinations: places.slice(1), distance: (a, b) => m[ix.get(a)][ix.get(b)],
  })
  return {
    company: { name: 'Тестова Логистика ЕООД', eik: '123456789', address: 'гр. София, ул. Тестова 15, ет. 2', mol: 'Мария Иванова' },
    waybill: {
      number, issue_date: periodTo, period_from: periodFrom, period_to: periodTo,
      start_odometer: startOdometer, end_odometer: startOdometer + r.totalKm, requested_km: targetKm, consumption_l100: 6.5,
      vehicles: { make: 'Škoda', model: 'Octavia', reg_number: 'СА1234АВ', fuel_type: 'Дизел' },
      drivers: { full_name: 'Иван Петров', position: 'Търговски представител' },
    },
    trips: r.trips.map((t, i) => ({
      id: i + 1, seq: i + 1, trip_date: t.date, route: t.route, purpose: t.purpose, km: t.km,
      start_odometer: t.startOdometer, end_odometer: t.endOdometer, is_personal: t.isPersonal,
    })),
    refuelings: [
      { id: 1, refuel_date: periodFrom.slice(0, 8) + '05', liters: 52.4, invoice_number: '0000123456' },
      { id: 2, refuel_date: periodFrom.slice(0, 8) + '19', liters: 48.1, invoice_number: '0000123987' },
    ],
  }
}
