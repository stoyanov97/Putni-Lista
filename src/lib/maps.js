// Картографски услуги (OpenStreetMap):
//  - Nominatim превръща адрес в координати;
//  - OSRM дава реалното разстояние по пътната мрежа между точки.
// Ако OSRM не отговаря, използваме оценка: права линия × 1,3 (типичен коефициент път/права линия).

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OSRM = 'https://router.project-osrm.org/table/v1/driving/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Премахва съкращения, които пречат на търсенето: "гр.", "ул.", "бул." и т.н.
export function cleanAddress(address) {
  return String(address)
    .replace(/(^|[\s,])(гр|с|ул|бул|ж\.к|жк|кв|пл|обл|№)\.?(?=\s)/gi, '$1')
    .replace(/№/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s,/g, ',')
    .trim()
}

async function searchOnce(query) {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=bg&accept-language=bg&q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Картата не отговаря. Опитайте след малко.')
  const data = await res.json()
  return data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon) } : null
}

// Опитва: пълния адрес → без съкращения → само населеното място (по-неточно).
export async function geocode(address) {
  const cleaned = cleanAddress(address)
  const attempts = [...new Set([address.trim(), cleaned])]
  for (const q of attempts) {
    const hit = await searchOnce(q)
    if (hit) return { ...hit, precise: true }
    await sleep(1100) // Nominatim позволява до 1 заявка в секунда
  }
  const city = cleaned.split(',')[0]
  const hit = city ? await searchOnce(city) : null
  return hit ? { ...hit, precise: false } : null
}

// Матрица с разстояния в км; null, ако между две точки няма маршрут.
export async function roadDistances(points) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';')
  const res = await fetch(`${OSRM}${coords}?annotations=distance`)
  if (!res.ok) throw new Error('OSRM не отговаря')
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error(`OSRM: ${data.code}`)
  return data.distances.map((row) => row.map((m) => (m == null ? null : Math.round(m / 100) / 10)))
}

export function haversineKm(a, b) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function estimatedDistances(points) {
  return points.map((a) => points.map((b) => (a === b ? 0 : Math.round(haversineKm(a, b) * 1.3 * 10) / 10)))
}
