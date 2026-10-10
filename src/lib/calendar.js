// Работни дни в България: без събота, неделя, официални празници и избрани от потребителя дати.
// Датите се пазят като текст 'YYYY-MM-DD' и се смятат в UTC, за да няма грешки с часовите зони.

export function toISO(date) {
  return date.toISOString().slice(0, 10)
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDays(date, n) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

const isWeekend = (date) => date.getUTCDay() === 0 || date.getUTCDay() === 6

// Православен Великден (алгоритъм на Meeus за юлианския календар + 13 дни, валиден 1900–2099)
export function orthodoxEaster(year) {
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  return addDays(new Date(Date.UTC(year, month - 1, day)), 13)
}

// Официални празници по чл. 154 от Кодекса на труда.
// Ако фиксиран празник се падне в събота или неделя, почива се следващият работен ден.
export function bulgarianHolidays(year) {
  const result = new Set()
  const fixed = ['01-01', '03-03', '05-01', '05-06', '05-24', '09-06', '09-22', '12-24', '12-25', '12-26']
  const fixedDates = fixed.map((md) => parseISO(`${year}-${md}`))
  fixedDates.forEach((d) => result.add(toISO(d)))
  for (const d of fixedDates) {
    if (isWeekend(d)) {
      let next = addDays(d, 1)
      while (isWeekend(next) || result.has(toISO(next))) next = addDays(next, 1)
      result.add(toISO(next))
    }
  }
  const easter = orthodoxEaster(year)
  for (const offset of [-2, -1, 0, 1]) result.add(toISO(addDays(easter, offset)))
  return result
}

export function workingDays(fromISO, toISO_, { includeWeekends = false, excluded = [] } = {}) {
  const excludedSet = new Set(excluded)
  const holidays = new Set()
  const start = parseISO(fromISO)
  const end = parseISO(toISO_)
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    bulgarianHolidays(y).forEach((d) => holidays.add(d))
  }
  const days = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const iso = toISO(d)
    if (excludedSet.has(iso)) continue
    if (!includeWeekends && (isWeekend(d) || holidays.has(iso))) continue
    days.push(iso)
  }
  return days
}
