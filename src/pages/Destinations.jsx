import { useState } from 'react'
import RegistryPage from '../components/RegistryPage'
import ImportDestinations from '../components/ImportDestinations'
import { geocode } from '../lib/maps'

// При запис адресът се търси в OpenStreetMap, за да получим координати.
// Без координати дестинацията пак се записва, а разстоянията до нея се въвеждат ръчно.
async function addCoordinates(values, { original }) {
  if (original && original.address === values.address && original.lat != null) return values
  try {
    const hit = await geocode(values.address)
    if (!hit) {
      return {
        values: { ...values, lat: null, lon: null },
        notice: 'Адресът не е намерен в картата. Записан е без координати: въведете разстоянията до него ръчно.',
      }
    }
    return {
      values: { ...values, lat: hit.lat, lon: hit.lon },
      notice: hit.precise ? '' : 'Намерено е само населеното място, затова разстоянията ще са приблизителни.',
    }
  } catch {
    return {
      values: { ...values, lat: null, lon: null },
      notice: 'Картата не отговори. Записано е без координати; опитайте пак по-късно с „Редактирай“ → „Запази“.',
    }
  }
}

export default function Destinations() {
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <>
    <RegistryPage
      key={reloadKey}
      table="destinations"
      title="Дестинации"
      intro="Клиенти, обекти и доставчици, между които системата ще разпределя пътуванията. Отбележете офиса като база: всеки маршрут започва и завършва там."
      orderBy="name"
      emptyText="Все още няма дестинации. Започнете с офиса (база), после добавете клиенти и обекти."
      fields={[
        { name: 'name', label: 'Наименование', type: 'text', required: true, placeholder: 'Клиент „Алфа“ ООД' },
        { name: 'address', label: 'Адрес', type: 'text', required: true, placeholder: 'гр. Пловдив, бул. Марица 10' },
        { name: 'purpose', label: 'Цел на посещението', type: 'text', placeholder: 'Доставка на стока' },
        { name: 'is_base', label: 'Това е базата (офисът)', type: 'checkbox' },
      ]}
      prepare={addCoordinates}
      columns={[
        { label: 'Наименование', render: (r) => (r.is_base ? <strong>{r.name} (база)</strong> : r.name) },
        { label: 'Адрес', key: 'address' },
        { label: 'Цел', key: 'purpose' },
        { label: 'В картата', render: (r) => (r.lat != null ? 'Намерен' : <span className="warn">Не е намерен</span>) },
      ]}
      extra={<ImportDestinations onImported={() => setReloadKey((k) => k + 1)} />}
    />
    </>
  )
}
