// =====================================================================
// Алгоритъм за генериране на маршрути
// =====================================================================
// Вход: период, въведени км, база (офис), дестинации и функция за разстояние.
// Изход: пътувания по дни, чиято сума е на не повече от 1 км от въведените.
//
// Стъпки:
//  1. Работни дни в периода (без почивни, празници и отпуски).
//  2. Възможни обиколки: База → 1 до 3 дестинации → База, с реалните разстояния.
//  3. Избор колко дни ще има пътувания и разпределение на км по тях със
//     случайни тегла, за да не се повтаря шаблон.
//  4. За всеки ден се избира обиколка, близка до целта за деня
//     (случайно между няколкото най-близки, без да се повтаря вчерашната).
//  5. Донастройка: обиколки се разменят, докато разликата стане ≤ 1 км.
//  6. Гаранция: ако разликата още е над 1 км, се маха излишно пътуване
//     и/или се добавя кратко градско служебно пътуване с точния остатък.
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
  if (tours.length === 0) {
    throw new Error('Няма дестинации с разстояние до базата под дневния лимит. Добавете дестинации и разстояния.')
  }
  const kms = tours.map((t) => t.km).sort((a, b) => a - b)
  const minTour = kms[0]
  const medianTour = kms[Math.floor(kms.length / 2)]

  // Най-много км, които могат да се покрият правдоподобно с тези дестинации.
  const perDayCapacity = Math.min(maxDailyKm, MAX_TOURS_PER_DAY * kms[kms.length - 1] + CITY_TRIP_MAX_KM)
  if (businessKm > days.length * perDayCapacity) {
    throw new Error(
      `С тези дестинации могат да се покрият най-много около ${days.length * perDayCapacity} км за периода. ` +
        'Добавете по-далечни дестинации или удължете периода.',
    )
  }

  // ---- 3. Колко дни ще има пътувания и колко км на ден ----
  const neededDays = Math.ceil(businessKm / maxDailyKm)
  const dayCount = Math.min(days.length, Math.max(1, neededDays, Math.round(businessKm / medianTour)))
  const travelDays = shuffle(random, days).slice(0, dayCount).sort()
  const weights = travelDays.map(() => 0.6 + random() * 0.8)
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const dayTargets = weights.map((w) => (w / weightSum) * businessKm)

  // ---- 4. Избор на обиколки за всеки ден ----
  const trips = [] // { date, tour }
  const dayKm = new Map()
  const toursOn = (date) => trips.filter((t) => t.date === date).length
  let previousKey = null
  travelDays.forEach((date, i) => {
    let remaining = dayTargets[i]
    let count = 0
    while (remaining >= minTour * 0.6 && count < MAX_TOURS_PER_DAY) {
      const used = dayKm.get(date) || 0
      const aim = remaining > kms[kms.length - 1] * 1.2 ? Math.min(remaining / 2, kms[kms.length - 1]) : remaining
      const candidates = tours
        .filter((t) => t.key !== previousKey && used + t.km <= maxDailyKm)
        .sort((a, b) => Math.abs(a.km - aim) - Math.abs(b.km - aim))
        .slice(0, 4)
      if (candidates.length === 0) break
      const tour = pickRandom(random, candidates)
      trips.push({ date, tour })
      dayKm.set(date, used + tour.km)
      remaining -= tour.km
      previousKey = tour.key
      count++
    }
  })

  const sumKm = () => trips.reduce((s, t) => s + t.tour.km, 0)
  let gap = businessKm - sumKm() // > 0: липсват км; < 0: има излишни

  // ---- 5. Донастройка чрез размяна на обиколки ----
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
      trip.tour = option
      gap = newGap
    }
    // Ако липсват много км, добавяме обиколка: първо в свободен ден,
    // после в най-слабо натоварения ден, в който има място.
    if (gap > minTour) {
      const free = days.filter((d) => !dayKm.has(d))
      const date = free.length
        ? pickRandom(random, free)
        : [...days].filter((d) => toursOn(d) < MAX_TOURS_PER_DAY).sort((a, b) => dayKm.get(a) - dayKm.get(b))[0]
      if (date) {
        const used = dayKm.get(date) || 0
        const t = tours.filter((x) => x.km <= gap + 1 && used + x.km <= maxDailyKm).sort((a, b) => b.km - a.km)[0]
        if (t) {
          trips.push({ date, tour: t })
          dayKm.set(date, used + t.km)
          gap -= t.km
        }
      }
    }
  }

  // 5б. Ако една размяна не стига, пробваме да сменим две пътувания наведнъж.
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
      // ако двете са в един ден, проверяваме общия дневен лимит
      if (a.date === b.date && dayKm.get(a.date) - a.tour.km - b.tour.km + best.ta.km + best.tb.km > maxDailyKm) continue
      dayKm.set(a.date, dayKm.get(a.date) - a.tour.km + best.ta.km)
      dayKm.set(b.date, dayKm.get(b.date) - b.tour.km + best.tb.km)
      gap = gap - (best.ta.km + best.tb.km - a.tour.km - b.tour.km)
      a.tour = best.ta
      b.tour = best.tb
    }
  }

  // ---- 6. Гаранция за толеранса ----
  // 6а. Излишни км: махаме пътуването, което най-добре затваря разликата.
  while (gap < -1 && trips.length > 0) {
    let bestIndex = 0
    for (let i = 1; i < trips.length; i++) {
      if (Math.abs(gap + trips[i].tour.km) < Math.abs(gap + trips[bestIndex].tour.km)) bestIndex = i
    }
    const [removed] = trips.splice(bestIndex, 1)
    dayKm.set(removed.date, dayKm.get(removed.date) - removed.tour.km)
    gap += removed.tour.km
  }

  // 6б. Липсващи км: кратко градско служебно пътуване (банка, куриер, институции)
  //     в дни с най-малко км. Всяко е до 40 км, за да остане правдоподобно.
  const cityTrips = []
  if (gap > 1) {
    let rest = gap
    const byLoad = [...days].sort((a, b) => (dayKm.get(a) || 0) - (dayKm.get(b) || 0))
    for (const date of byLoad) {
      if (rest <= 0) break
      const room = maxDailyKm - (dayKm.get(date) || 0)
      let piece = Math.min(rest, CITY_TRIP_MAX_KM, room)
      if (piece < 2) continue
      if (rest - piece === 1) piece -= 1 // не оставяме остатък от 1 км за следващ ден
      cityTrips.push({ date, km: piece })
      dayKm.set(date, (dayKm.get(date) || 0) + piece)
      rest -= piece
    }
    gap = rest
  }
  if (Math.abs(gap) > 1) {
    // Не би трябвало да се случва след проверката за капацитет; пазим се от тих грешен резултат.
    throw new Error('Не успях да разпределя километрите в рамките на ±1 км. Опитайте „Генерирай отново“.')
  }

  // ---- Сглобяване на редовете на пътния лист ----
  const rows = [
    ...trips.map((t) => ({
      date: t.date,
      order: 0,
      route: [base.name, ...t.tour.stops.map((d) => d.name), base.name].join(' – '),
      purpose: t.tour.stops.map((d) => (d.purpose ? `${d.purpose} – ${d.name}` : `Служебно посещение – ${d.name}`)).join('; '),
      km: t.tour.km,
      isPersonal: false,
    })),
    ...cityTrips.map((c) => ({
      date: c.date,
      order: 1,
      route: `${base.name} – служебни ангажименти в населеното място – ${base.name}`,
      purpose: 'Банка, куриер, държавни институции',
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
  return { trips: result, totalKm, targetKm, difference: totalKm - targetKm, seed, workingDays: days.length }
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
