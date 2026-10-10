import RegistryPage from '../components/RegistryPage'
import { normalizeRegNumber } from '../lib/validators'

const fuelTypes = ['Бензин', 'Дизел', 'Газ (LPG)', 'Метан (CNG)', 'Хибрид', 'Електричество']

export default function Vehicles() {
  return (
    <RegistryPage
      table="vehicles"
      title="Автомобили"
      intro="Началният километраж е показанието при първия пътен лист за автомобила."
      orderBy="reg_number"
      emptyText="Все още няма автомобили. Добавете първия с формата по-горе."
      fields={[
        { name: 'make', label: 'Марка', type: 'text', required: true, placeholder: 'Skoda' },
        { name: 'model', label: 'Модел', type: 'text', required: true, placeholder: 'Octavia' },
        { name: 'reg_number', label: 'Рег. номер', type: 'text', required: true, placeholder: 'СА1234АВ' },
        { name: 'fuel_type', label: 'Вид гориво', type: 'select', required: true, options: fuelTypes },
        { name: 'consumption_l100', label: 'Разход, л/100 км', type: 'number', required: true, step: '0.1', min: '0.1', placeholder: '6.5' },
        { name: 'start_odometer', label: 'Начален километраж', type: 'number', required: true, step: '1', min: '0', placeholder: '125000' },
      ]}
      prepare={(v) => ({ ...v, reg_number: normalizeRegNumber(v.reg_number) })}
      validate={(v) => {
        if (!(v.consumption_l100 > 0 && v.consumption_l100 < 50)) return 'Разходът трябва да е между 0 и 50 л/100 км.'
        if (!Number.isInteger(v.start_odometer) || v.start_odometer < 0) return 'Километражът трябва да е цяло положително число.'
        return ''
      }}
      columns={[
        { label: 'Рег. номер', key: 'reg_number' },
        { label: 'Автомобил', render: (r) => `${r.make} ${r.model}` },
        { label: 'Гориво', key: 'fuel_type' },
        { label: 'л/100 км', key: 'consumption_l100', num: true },
        { label: 'Нач. км', render: (r) => r.start_odometer.toLocaleString('bg-BG'), num: true },
      ]}
    />
  )
}
