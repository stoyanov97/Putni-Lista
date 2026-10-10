// Карта на маршрута (Leaflet + OpenStreetMap). Първо рисува пунктир между точките,
// после го заменя с реалния път от OSRM, щом пристигне.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { roadGeometry } from '../lib/maps'
import { fmtNum } from '../lib/format'

const INK = '#1f3a5f'

export default function RouteMap({ points, sheetKm }) {
  const element = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [roadKm, setRoadKm] = useState(null)

  useEffect(() => {
    map.current = L.map(element.current, { scrollWheelZoom: false }).setView([42.7, 25.3], 7)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])

  useEffect(() => {
    let cancelled = false
    const group = layer.current
    group.clearLayers()
    setRoadKm(null)
    if (!points.length) return
    points.forEach((p, i) =>
      L.circleMarker([p.lat, p.lon], {
        radius: i === 0 ? 8 : 6, color: INK, weight: 2, fillColor: i === 0 ? INK : '#fff', fillOpacity: 1,
      }).bindTooltip(p.name).addTo(group),
    )
    if (points.length === 1) {
      map.current.setView([points[0].lat, points[0].lon], 11)
      return
    }
    const straight = L.polyline(points.map((p) => [p.lat, p.lon]), { color: INK, weight: 3, dashArray: '6 6', opacity: 0.6 }).addTo(group)
    map.current.fitBounds(straight.getBounds().pad(0.2), { maxZoom: 12 })
    roadGeometry(points)
      .then((road) => {
        if (cancelled || !road) return
        group.removeLayer(straight)
        L.polyline(road.coords, { color: INK, weight: 4 }).addTo(group)
        setRoadKm(road.km)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [points])

  return (
    <div>
      <div ref={element} className="route-map" role="img" aria-label="Карта на маршрута" />
      <p className="muted small map-note">
        {points.length === 0 && 'За този ред няма точки на картата (лично ползване или ръчно въведен маршрут).'}
        {points.length === 1 && 'Градско пътуване: показана е базата.'}
        {points.length > 1 && (roadKm != null
          ? `Км в листа: ${fmtNum(sheetKm)} · по картата: ${fmtNum(roadKm, 1)} км`
          : 'Зареждане на пътя…')}
      </p>
    </div>
  )
}
