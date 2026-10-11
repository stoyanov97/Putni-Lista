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
    for (const t of result.trips.filter((x) => !x.leg)) {
      expect(t.route.startsWith(base.name)).toBe(true)
      expect(t.route.endsWith(base.name)).toBe(true)
    }
  })

  it('градските пътувания са различни по дължина и цел', () => {
    const r = generateTrips(scenario({ targetKm: 500, destinations: [destinations[2]], seed: 3 }))
    const city = r.trips.filter((t) => t.route.includes('населеното място'))
    expect(city.length).toBeGreaterThan(2)
    expect(new Set(city.map((t) => t.km)).size).toBeGreaterThan(1)
    expect(r.fallbackKm).toBe(city.reduce((s, t) => s + t.km, 0))
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

describe('далечни дестинации (двудневни командировки)', () => {
  // Офис в София, клиенти из цялата страна: обиколка в един ден е над 400 км.
  const country = [
    { id: 1, name: 'Офис София', lat: 42.6977, lon: 23.3219 },
    { id: 2, name: 'Бургас', lat: 42.5048, lon: 27.4626 },
    { id: 3, name: 'Варна', lat: 43.2141, lon: 27.9147 },
    { id: 4, name: 'Стара Загора', lat: 42.4258, lon: 25.6345 },
    { id: 5, name: 'Пловдив', lat: 42.1354, lon: 24.7453 },
    { id: 6, name: 'Русе', lat: 43.8356, lon: 25.9657 },
  ]
  const m = estimatedDistances(country)
  const ix = new Map(country.map((p, i) => [p.id, i]))
  const dist = (a, b) => m[ix.get(a)][ix.get(b)]
  const setup = (overrides) => scenario({ base: country[0], destinations: country.slice(1), distance: dist, ...overrides })

  it('спазват толеранса при различни км', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = generateTrips(setup({ seed, targetKm: 300 + seed * 17 }))
      expect(Math.abs(r.difference)).toBeLessThanOrEqual(1)
    }
  })

  it('са в два поредни дни: отиване от базата и връщане в базата', () => {
    let seen = 0
    for (let seed = 1; seed <= 50; seed++) {
      const r = generateTrips(setup({ seed, targetKm: 3000 }))
      r.trips.forEach((t, i) => {
        if (t.leg !== 'out') return
        seen++
        const back = r.trips.find((x, j) => j > i && x.leg === 'back')
        expect(t.route.startsWith('Офис София')).toBe(true)
        expect(back.route.endsWith('Офис София')).toBe(true)
        const next = new Date(t.date + 'T00:00:00Z')
        next.setUTCDate(next.getUTCDate() + 1)
        expect(back.date).toBe(next.toISOString().slice(0, 10))
        // В дните на командировката няма други пътувания
        expect(r.trips.filter((x) => x.date === t.date || x.date === back.date)).toHaveLength(2)
      })
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('резервният вариант покрива малка част от км', () => {
    let fallback = 0
    let total = 0
    for (let seed = 1; seed <= 100; seed++) {
      const r = generateTrips(setup({ seed, targetKm: 1500 + seed * 20 }))
      fallback += r.fallbackKm
      total += r.totalKm
    }
    expect(fallback / total).toBeLessThan(0.1)
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

describe('достижимост на дестинациите', () => {
  it('отличава твърде далечните и тези без разстояние', async () => {
    const { destinationReach } = await import('../src/lib/routeGenerator.js')
    const D = [{ id: 1, name: 'База' }, { id: 2, name: 'Близо' }, { id: 3, name: 'Варна' }, { id: 4, name: 'Без данни' }]
    const km = { '1-2': 40, '2-1': 40, '1-3': 520, '3-1': 515 }
    const r = destinationReach(D[0], D, (a, b) => km[`${a}-${b}`] ?? null, 400)
    expect(r.unreachable.map((d) => d.name)).toEqual(['Варна'])
    expect(r.unreachable[0].oneWayKm).toBe(520)
    expect(r.missing.map((d) => d.name)).toEqual(['Без данни'])
    expect(destinationReach(D[0], D, (a, b) => km[`${a}-${b}`] ?? null, 550).unreachable).toEqual([])
  })
})
