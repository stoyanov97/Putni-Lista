import RegistryPage from '../components/RegistryPage'

export default function Destinations() {
  return (
    <RegistryPage
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
      validate={() => ''}
      columns={[
        { label: 'Наименование', render: (r) => (r.is_base ? <strong>{r.name} (база)</strong> : r.name) },
        { label: 'Адрес', key: 'address' },
        { label: 'Цел', key: 'purpose' },
      ]}
    />
  )
}
