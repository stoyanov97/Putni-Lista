// =====================================================================
// Алгоритъм за генериране на маршрути
// =====================================================================
// Вход: период, въведени км, база (офис), дестинации и функция за разстояние.
// Изход: пътувания по дни, чиято сума е на не повече от 1 км от въведените.
//
// Стъпки:
//  1. Работни дни в периода (без почивни, празници и отпуски).
//  2. Възможни пътувания:
//     - еднодневни обиколки: База → 1 до 3 дестинации → База;
//     - двудневни командировки до далечни дестинации (обиколката е над
//       дневния лимит): ден 1 База → Х, ден 2 Х → База, в поредни дни.
//  3. Част от км се покриват с командировки (според дела на далечните
//     дестинации), останалите дни се пълнят с еднодневни обиколки.
//     Км се разпределят по дни със случайни тегла, без повтарящ се шаблон.
//  4. Донастройка: пътувания се разменят (по едно и по две), докато
//     разликата стане ≤ 1 км.
//  5. Гаранция: ако разликата още е над 1 км, се маха излишно пътуване
//     и/или се добавят кратки градски служебни пътувания с точния остатък.
//     Затова толерансът е спазен винаги, а не "обикновено".
// =====================================================================

import { workingDays } from './calendar.js'

// Детерминиран генератор на случайни числа: еднакво "семе" → еднакъв резултат.
// Нужно е за тестовете; при "Генерирай отново" се подава ново семе.
export function createRandom(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CITY_TRIP_MAX_KM = 40
const MAX_TOURS_PER_DAY = 4

// Всички разумни обиколки База → ... → База.
// Обиколка с няколко спирки се пази само ако е по-къса от отделните обиколки
// до всяка спирка (иначе водачът би се върнал в офиса между тях).
export function buildTours(base, destinations, distance, maxStops = 3) {
  const stops = destinations.filter(
    (d) => d.id !== base.id && distance(base.id, d.id) != null && distance(d.id, base.id) != null,
  )
  const limit = stops.length > 25 ? 2 : maxStops
  const single = new Map(stops.map((d) => [d.id, distance(base.id, d.id) + distance(d.id, base.id)]))
  const tours = []

  function extend(path, km) {
    if (path.length > 0) {
      const total = km + distance(path[path.length - 1].id, base.id)
      const separate = path.reduce((s, d) => s + single.get(d.id), 0)
      if (path.length === 1 || total < separate) {
        tours.push({ key: path.map((d) => d.id).join('-'), stops: path, km: Math.round(total) })
      }
    }
    if (path.length === limit) return
    for (const next of stops) {
      if (path.includes(next)) continue
      const from = path.length ? path[path.length - 1].id : base.id
      const leg = distance(from, next.id)
      if (leg == null) continue
      extend([...path, next], km + leg)
    }
  }
  extend([], 0)
  return tours.filter((t) => t.km > 0)
}

function pickRandom(random, list) {
  return list[Math.floor(random() * list.length)]
}

function shuffle(random, list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Двудневни командировки: обиколката не се събира в един ден,
// но всяка посока поотделно се събира.
export function buildLongTours(base, destinations, distance, maxDailyKm) {
  return destinations.flatMap((d) => {
    if (d.id === base.id) return []
    const out = distance(base.id, d.id)
    const back = distance(d.id, base.id)
    if (out == null || back == null) return []
    if (out + back <= maxDailyKm || out > maxDailyKm || back > maxDailyKm) return []
    const legs = [Math.round(out), Math.round(back)]
    return [{ key: `long-${d.id}`, stops: [d], legs, km: legs[0] + legs[1] }]
  })
}

const nextCalendarDay = (iso) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const CITY_PURPOSES = [
  'Банка и куриер',
  'Документи в НАП / НОИ',
  'Покупка на консумативи',
  'Пощенски и куриерски пратки',
  'Среща с местен контрагент',
]

export function generateTrips(options) {
  const {
    periodFrom,
    periodTo,
    targetKm,
    startOdometer = 0,
    base,
    destinations,
    distance,
    excludedDates = [],
    includeWeekends = false,
    maxDailyKm = 400,
    personalKm = 0,
    seed = Date.now(),
  } = options

  // ---- Проверки на входа ----
  if (!Number.isInteger(targetKm) || targetKm <= 0) throw new Error('Километрите трябва да са цяло положително число.')
  if (!Number.isInteger(personalKm) || personalKm < 0) throw new Error('Км за лично ползване трябва да са цяло число ≥ 0.')
  if (personalKm >= targetKm) throw new Error('Км за лично ползване трябва да са по-малко от общите км.')
  if (!base) throw new Error('Няма зададена база (офис).')

  const businessKm = targetKm - personalKm
  const random = createRandom(seed)
  const days = workingDays(periodFrom, periodTo, { includeWeekends, excluded: excludedDates })
  if (days.length === 0) throw new Error('В избрания период няма работни дни.')
  if (businessKm > days.length * maxDailyKm) {
    throw new Error(
      `${businessKm} км в ${days.length} работни дни са над ${maxDailyKm} км на ден. Увеличете дневния лимит или периода.`,
    )
  }

  const tours = buildTours(base, destinations, distance).filter((t) => t.km <= maxDailyKm)
  const longTours = buildLongTours(base, destinations, distance, maxDailyKm)
  if (tours.length === 0 && longTours.length === 0) {
    throw new Error('Няма дестинации с разстояние до базата. Добавете дестинации и изчислете разстоянията.')
  }
  const kms = tours.map((t) => t.km).sort((a, b) => a - b)
  const minTour = kms[0] ?? Infinity
  const maxTour = kms[kms.length - 1] ?? 0
  const medianTour = kms[Math.floor(kms.length / 2)] ?? 0

  // Най-много км, които могат да се покрият правдоподобно с тези дестинации.
  const shortCapacity = Math.min(maxDailyKm, MAX_TOURS_PER_DAY * maxTour + CITY_TRIP_MAX_KM)
  const longCapacity = longTours.length ? Math.max(...longTours.map((t) => t.km)) / 2 : 0
  const perDayCapacity = Math.max(shortCapacity, longCapacity)
  if (businessKm > days.length * perDayCapacity) {
    throw new Error(
      `С тези дестинации могат да се покрият най-много около ${Math.floor(days.length * perDayCapacity)} км за периода. ` +
        'Добавете по-далечни дестинации или удължете периода.',
    )
  }

  let gap = businessKm // > 0: липсват км; < 0: има излишни
  const usage = new Map()
  // Предпочитаме по-рядко използвани пътувания, за да има разнообразие.
  const pickVaried = (list) => {
    const weights = list.map((t) => 1 / (1 + (usage.get(t.key) || 0)))
    let r = random() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < list.length; i++) {
      r -= weights[i]
      if (r <= 0) return list[i]
    }
    return list[list.length - 1]
  }
  const use = (tour, delta = 1) => usage.set(tour.key, (usage.get(tour.key) || 0) + delta)

  // ---- 3а. Двудневни командировки ----
  const longTrips = [] // { tour, dates: [ден1, ден2] }
  const reserved = new Set()
  if (longTours.length) {
    const shortDestinations = new Set(tours.filter((t) => t.stops.length === 1).map((t) => t.stops[0].id)).size
    const share = tours.length ? longTours.length / (longTours.length + shortDestinations) : 1
    let budget = tours.length ? businessKm * share * (0.7 + random() * 0.6) : businessKm
    const pairs = days
      .map((d, i) => [d, days[i + 1]])
      .filter(([a, b]) => b && nextCalendarDay(a) === b)
    for (let attempt = 0; attempt < 60; attempt++) {
      const free = pairs.filter(([a, b]) => !reserved.has(a) && !reserved.has(b))
      const options = longTours.filter((t) => t.km <= gap && t.km <= budget + t.km / 2)
      if (!free.length || !options.length) break
      // Оставяме достатъчно свободни дни за останалите км.
      const tour = pickVaried(options)
      const daysLeft = days.length - reserved.size - 2
      if (tours.length && (gap - tour.km) > daysLeft * shortCapacity) continue
      const pair = pickRandom(random, free)
      longTrips.push({ tour, dates: pair })
      pair.forEach((d) => reserved.add(d))
      use(tour)
      gap -= tour.km
      budget -= tour.km
    }
  }
  const freeDays = days.filter((d) => !reserved.has(d))

  // ---- 3б. Еднодневни обиколки в свободните дни ----
  const trips = [] // { date, tour }
  const dayKm = new Map()
  const toursOn = (date) => trips.filter((t) => t.date === date).length
  if (tours.length && freeDays.length && gap >= minTour * 0.6) {
    const neededDays = Math.ceil(gap / maxDailyKm)
    const dayCount = Math.min(freeDays.length, Math.max(1, neededDays, Math.round(gap / medianTour)))
    const travelDays = shuffle(random, freeDays).slice(0, dayCount).sort()
    const weights = travelDays.map(() => 0.6 + random() * 0.8)
    const weightSum = weights.reduce((a, b) => a + b, 0)
    const dayTargets = weights.map((w) => (w / weightSum) * gap)
    let previousKey = null
    travelDays.forEach((date, i) => {
      let remaining = dayTargets[i]
      let count = 0
      while (remaining >= minTour * 0.6 && count < MAX_TOURS_PER_DAY) {
        const used = dayKm.get(date) || 0
        const aim = remaining > maxTour * 1.2 ? Math.min(remaining / 2, maxTour) : remaining
        const fitting = tours.filter((t) => used + t.km <= maxDailyKm)
        // Не повтаряме вчерашния маршрут, освен ако няма друг вариант.
        const fresh = fitting.filter((t) => t.key !== previousKey)
        const candidates = (fresh.length ? fresh : fitting)
          .sort((a, b) => Math.abs(a.km - aim) - Math.abs(b.km - aim))
          .slice(0, 4)
        if (candidates.length === 0) break
        const tour = pickVaried(candidates)
        trips.push({ date, tour })
        use(tour)
        dayKm.set(date, used + tour.km)
        remaining -= tour.km
        previousKey = tour.key
        count++
      }
    })
    gap = businessKm - longTrips.reduce((s, t) => s + t.tour.km, 0) - trips.reduce((s, t) => s + t.tour.km, 0)
  }

  // ---- 4. Донастройка чрез размяна ----
  for (let iter = 0; iter < 5000 && Math.abs(gap) > 1 && trips.length > 0; iter++) {
    const trip = pickRandom(random, trips)
    const used = dayKm.get(trip.date) - trip.tour.km
    const wanted = trip.tour.km + gap
    const best = tours
      .filter((t) => used + t.km <= maxDailyKm)
      .sort((a, b) => Math.abs(a.km - wanted) - Math.abs(b.km - wanted))
      .slice(0, 3)
    const option = pickRandom(random, best)
    const newGap = gap - (option.km - trip.tour.km)
    if (Math.abs(newGap) < Math.abs(gap)) {
      dayKm.set(trip.date, used + option.km)
      use(trip.tour, -1)
      use(option)
      trip.tour = option
      gap = newGap
    }
    // Ако липсват много км, добавяме обиколка: първо в свободен ден,
    // после в най-слабо натоварения ден, в който има място.
    if (gap > minTour) {
      const free = freeDays.filter((d) => !dayKm.has(d))
      const date = free.length
        ? pickRandom(random, free)
        : [...freeDays].filter((d) => toursOn(d) < MAX_TOURS_PER_DAY).sort((a, b) => dayKm.get(a) - dayKm.get(b))[0]
      if (date) {
        const used2 = dayKm.get(date) || 0
        const t = tours.filter((x) => x.km <= gap + 1 && used2 + x.km <= maxDailyKm).sort((a, b) => b.km - a.km)[0]
        if (t) {
          trips.push({ date, tour: t })
          use(t)
          dayKm.set(date, used2 + t.km)
          gap -= t.km
        }
      }
    }
  }

  // 4б. Размяна на две пътувания наведнъж.
  for (let iter = 0; iter < 400 && Math.abs(gap) > 1 && trips.length > 1; iter++) {
    const a = pickRandom(random, trips)
    const b = pickRandom(random, trips)
    if (a === b) continue
    const target = a.tour.km + b.tour.km + gap
    const roomA = maxDailyKm - (dayKm.get(a.date) - a.tour.km)
    const roomB = maxDailyKm - (dayKm.get(b.date) - b.tour.km)
    let best = null
    for (const ta of tours) {
      if (ta.km > roomA || ta.km >= target) continue
      for (const tb of tours) {
        if (tb.km > roomB) continue
        const miss = Math.abs(ta.km + tb.km - target)
        if (!best || miss < best.miss) best = { ta, tb, miss }
        if (miss === 0) break
      }
      if (best && best.miss === 0) break
    }
    if (best && best.miss < Math.abs(gap)) {
      if (a.date === b.date && dayKm.get(a.date) - a.tour.km - b.tour.km + best.ta.km + best.tb.km > maxDailyKm) continue
      dayKm.set(a.date, dayKm.get(a.date) - a.tour.km + best.ta.km)
      dayKm.set(b.date, dayKm.get(b.date) - b.tour.km + best.tb.km)
      gap = gap - (best.ta.km + best.tb.km - a.tour.km - b.tour.km)
      a.tour = best.ta
      b.tour = best.tb
    }
  }

  // 4в. Размяна на командировка с друга командировка (същите два дни).
  for (let iter = 0; iter < 200 && Math.abs(gap) > 1 && longTrips.length > 0; iter++) {
    const trip = pickRandom(random, longTrips)
    const wanted = trip.tour.km + gap
    const option = [...longTours].sort((a, b) => Math.abs(a.km - wanted) - Math.abs(b.km - wanted))[0]
    const newGap = gap - (option.km - trip.tour.km)
    // Командировките са дълги: не допускаме да "прескочат" целта, защото
    // после излишъкът се маха с цяло пътуване.
    if (newGap >= -1 && Math.abs(newGap) < Math.abs(gap)) {
      trip.tour = option
      gap = newGap
    }
  }

  // ---- 5. Гаранция за толеранса ----
  // 5а. Излишни км: махаме пътуването, което най-добре затваря разликата.
  while (gap < -1 && trips.length + longTrips.length > 0) {
    const all = [...trips.map((t) => ({ list: trips, t })), ...longTrips.map((t) => ({ list: longTrips, t }))]
    const best = all.reduce((a, b) => (Math.abs(gap + b.t.tour.km) < Math.abs(gap + a.t.tour.km) ? b : a))
    best.list.splice(best.list.indexOf(best.t), 1)
    if (best.list === trips) dayKm.set(best.t.date, dayKm.get(best.t.date) - best.t.tour.km)
    else best.t.dates.forEach((d) => reserved.delete(d))
    gap += best.t.tour.km
  }

  // 5б. Липсващи км: кратки градски служебни пътувания с различна дължина
  //     (12–40 км), в дни без командировка и с място до дневния лимит.
  const cityTrips = []
  let rest = gap > 1 ? gap : 0
  for (let guard = 0; rest > 1 && guard < 500; guard++) {
    const open = days.filter((d) => !reserved.has(d) && maxDailyKm - (dayKm.get(d) || 0) >= 2)
    if (!open.length) break
    const date = pickRandom(random, open)
    const room = maxDailyKm - (dayKm.get(date) || 0)
    let piece = Math.min(rest, room, 12 + Math.floor(random() * 29))
    if (rest - piece > 0 && rest - piece < 12) piece = Math.min(rest, room, CITY_TRIP_MAX_KM)
    if (rest - piece === 1) piece -= 1 // не оставяме остатък от 1 км
    if (piece < 2) continue
    cityTrips.push({ date, km: piece, purpose: pickRandom(random, CITY_PURPOSES) })
    dayKm.set(date, (dayKm.get(date) || 0) + piece)
    rest -= piece
  }
  if (gap > 1) gap = rest
  if (Math.abs(gap) > 1) {
    throw new Error('Не успях да разпределя километрите в рамките на ±1 км. Опитайте „Генерирай отново“.')
  }

  // ---- Сглобяване на редовете на пътния лист ----
  const visit = (d) => (d.purpose ? `${d.purpose} – ${d.name}` : `Служебно посещение – ${d.name}`)
  const rows = [
    ...trips.map((t) => ({
      date: t.date,
      order: 0,
      route: [base.name, ...t.tour.stops.map((d) => d.name), base.name].join(' – '),
      purpose: t.tour.stops.map(visit).join('; '),
      km: t.tour.km,
      isPersonal: false,
    })),
    ...longTrips.flatMap(({ tour, dates }) => {
      const dest = tour.stops[0]
      return [
        { date: dates[0], order: 0, route: `${base.name} – ${dest.name}`, purpose: `Командировка: ${visit(dest)}`, km: tour.legs[0], isPersonal: false, leg: 'out' },
        { date: dates[1], order: 0, route: `${dest.name} – ${base.name}`, purpose: `Връщане от командировка – ${dest.name}`, km: tour.legs[1], isPersonal: false, leg: 'back' },
      ]
    }),
    ...cityTrips.map((c) => ({
      date: c.date,
      order: 1,
      route: `${base.name} – служебни ангажименти в населеното място – ${base.name}`,
      purpose: c.purpose,
      km: c.km,
      isPersonal: false,
    })),
  ]
  if (personalKm > 0) {
    rows.push({ date: periodTo, order: 2, route: 'Лично ползване', purpose: 'Лично ползване', km: personalKm, isPersonal: true })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)

  // Свързан километраж: всеки ред започва там, където е свършил предишният.
  let odometer = startOdometer
  const result = rows.map(({ order, ...row }) => {
    const start = odometer
    odometer += row.km
    return { ...row, startOdometer: start, endOdometer: odometer }
  })

  const totalKm = result.reduce((s, r) => s + r.km, 0)
  const fallbackKm = cityTrips.reduce((s, c) => s + c.km, 0)
  return {
    trips: result,
    totalKm,
    targetKm,
    difference: totalKm - targetKm,
    seed,
    workingDays: days.length,
    fallbackKm,
    fallbackShare: fallbackKm / businessKm,
  }
}

// Пресмята наново километража и сумите след ръчна редакция на ред.
export function recalculate(trips, startOdometer) {
  let odometer = startOdometer
  const result = trips.map((t) => {
    const start = odometer
    odometer += t.km
    return { ...t, startOdometer: start, endOdometer: odometer }
  })
  return { trips: result, totalKm: odometer - startOdometer }
}

// Норма × км / 100, закръглено до 2 знака.
export function fuelLiters(km, consumptionPer100) {
  return Math.round(km * consumptionPer100) / 100
}
