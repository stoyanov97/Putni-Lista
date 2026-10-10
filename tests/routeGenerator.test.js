import { describe, it, expect } from 'vitest'
import { generateTrips, buildTours, recalculate, fuelLiters } from '../src/lib/routeGenerator.js'
import { workingDays, orthodoxEaster, bulgarianHolidays, toISO } from '../src/lib/calendar.js'
import { estimatedDistances } from '../src/lib/maps.js'

// Тестови данни: офис в София и реални населени места наоколо.
const places = [
  { id: 1, name: 'Офис София', lat: 42.6977, lon: 23.3219 },
  { id: 2, name: 'Клиент Перник', lat: 42.6052, lon: 23.0378, purpose: 'Доставка' },
  { id: 3, name: 'Склад Божурище', lat: 42.7586, lon: 23.2003 },
  { id: 4, name: 'Клиент Пловдив', lat: 42.1354, lon: 24.7453, purpose: 'Среща' },
  { id: 5, name: 'Обект Ботевград', lat: 42.9077, lon: 23.7934 },
  { id: 6, name: 'Доставчик Самоков', lat: 42.3370, lon: 23.5528 },
  { id: 7, name: 'Клиент Ихтиман', lat: 42.4363, lon: 23.8167 },
  { id: 8, name: 'Обект Костинброд', lat: 42.8166, lon: 23.2148 },
]
const matrix = estimatedDistances(places)
const index = new Map(places.map((p, i) => [p.id, i]))
const distance = (a, b) => matrix[index.get(a)][index.get(b)]
const base = places[0]
const destinations = places.slice(1)

const scenario = (overrides = {}) => ({
  periodFrom: '2026-09-01',
  periodTo: '2026-09-30',
  targetKm: 1500,
  startOdometer: 100000,
  base,
  destinations,
  distance,
  seed: 42,
  ...overrides,
})

describe('толеранс ±1 км', () => {
  it('е спазен при 1000 случайни комбинации от км, период и дестинации', () => {
    let cityTripRuns = 0
    let rejected = 0
    for (let seed = 1; seed <= 1000; seed++) {
      const targetKm = 20 + ((seed * 7919) % 5500)
      const subset = destinations.filter((_, i) => (seed >> i) % 2 === 0 || i === 0)
      let result
      try {
        result = generateTrips(scenario({ seed, targetKm, destinations: subset }))
      } catch (e) {
        // Единствената допустима грешка: км са повече от възможното с тези дестинации.
        expect(e.message).toMatch(/най-много около/)
        rejected++
        continue
      }
      expect(Math.abs(result.difference)).toBeLessThanOrEqual(1)
      expect(result.totalKm).toBe(result.trips.reduce((s, t) => s + t.km, 0))
      if (result.trips.some((t) => t.route.includes('населеното място'))) cityTripRuns++
    }
    // Градското пътуване е резервен вариант, не основният механизъм.
    expect(cityTripRuns).toBeLessThan(300)
    expect(rejected).toBeLessThan(200)
    console.log(`градско пътуване: ${cityTripRuns}, невъзможни: ${rejected} от 1000`)
  })

  it('работи и при много малко км (по-малко от най-късата обиколка)', () => {
    const result = generateTrips(scenario({ targetKm: 5 }))
    expect(Math.abs(result.difference)).toBeLessThanOrEqual(1)
  })
})

describe('реалистични маршрути', () => {
  const result = generateTrips(scenario())
  const days = new Set(workingDays('2026-09-01', '2026-09-30'))

  it('са само в работни дни от периода', () => {
    for (const t of result.trips) expect(days.has(t.date)).toBe(true)
  })

  it('започват и завършват в базата', () => {
    for (const t of result.trips) {
      expect(t.route.startsWith(base.name)).toBe(true)
      expect(t.route.endsWith(base.name)).toBe(true)
    }
  })

  it('не надвишават дневния лимит', () => {
    const perDay = {}
    for (const t of result.trips) perDay[t.date] = (perDay[t.date] || 0) + t.km
    for (const km of Object.values(perDay)) expect(km).toBeLessThanOrEqual(400)
  })

  it('не повтарят един и същ маршрут ден след ден', () => {
    const routes = result.trips.map((t) => t.route)
    expect(new Set(routes).size).toBeGreaterThan(routes.length / 3)
  })

  it('имат свързан километраж', () => {
    expect(result.trips[0].startOdometer).toBe(100000)
    for (let i = 1; i < result.trips.length; i++) {
      expect(result.trips[i].startOdometer).toBe(result.trips[i - 1].endOdometer)
    }
    for (const t of result.trips) expect(t.endOdometer - t.startOdometer).toBe(t.km)
  })

  it('обиколка с няколко спирки е по-къса от отделните обиколки', () => {
    const tours = buildTours(base, destinations, distance)
    const single = (id) => distance(base.id, id) + distance(id, base.id)
    for (const t of tours.filter((x) => x.stops.length > 1)) {
      expect(t.km).toBeLessThanOrEqual(Math.round(t.stops.reduce((s, d) => s + single(d.id), 0)))
    }
  })
})

describe('други изисквания', () => {
  it('еднакво семе дава еднакъв резултат, различно семе дава различен', () => {
    expect(generateTrips(scenario())).toEqual(generateTrips(scenario()))
    expect(generateTrips(scenario({ seed: 7 })).trips).not.toEqual(generateTrips(scenario()).trips)
  })

  it('отчита отделно личното ползване', () => {
    const result = generateTrips(scenario({ personalKm: 120 }))
    const personal = result.trips.filter((t) => t.isPersonal)
    expect(personal).toHaveLength(1)
    expect(personal[0].km).toBe(120)
    expect(Math.abs(result.difference)).toBeLessThanOrEqual(1)
  })

  it('пропуска отпуски', () => {
    const excluded = ['2026-09-14', '2026-09-15', '2026-09-16']
    const result = generateTrips(scenario({ excludedDates: excluded }))
    for (const t of result.trips) expect(excluded).not.toContain(t.date)
  })

  it('дава ясни грешки при невъзможен вход', () => {
    expect(() => generateTrips(scenario({ targetKm: 0 }))).toThrow()
    expect(() => generateTrips(scenario({ targetKm: 50000 }))).toThrow(/дневния лимит/)
    expect(() => generateTrips(scenario({ destinations: [] }))).toThrow(/дестинации/)
    expect(() => generateTrips(scenario({ periodFrom: '2026-09-05', periodTo: '2026-09-06' }))).toThrow(/работни дни/)
  })

  it('преизчислява километража след ръчна редакция', () => {
    const { trips } = generateTrips(scenario())
    trips[0] = { ...trips[0], km: trips[0].km + 10 }
    const updated = recalculate(trips, 100000)
    expect(updated.trips.at(-1).endOdometer).toBe(100000 + updated.totalKm)
  })

  it('смята разхода на гориво', () => {
    expect(fuelLiters(250, 6.5)).toBe(16.25)
  })
})

describe('календар', () => {
  it('изчислява православния Великден', () => {
    expect(toISO(orthodoxEaster(2025))).toBe('2025-04-20')
    expect(toISO(orthodoxEaster(2026))).toBe('2026-04-12')
    expect(toISO(orthodoxEaster(2027))).toBe('2027-05-02')
  })

  it('мести празник от неделя на понеделник', () => {
    // 6 септември 2026 е неделя → почива се понеделник 7 септември
    expect(bulgarianHolidays(2026).has('2026-09-07')).toBe(true)
  })

  it('брои работните дни', () => {
    expect(workingDays('2026-09-01', '2026-09-30')).toHaveLength(20)
  })
})
