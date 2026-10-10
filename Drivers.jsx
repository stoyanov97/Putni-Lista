import RegistryPage from '../components/RegistryPage'

export default function Drivers() {
  return (
    <RegistryPage
      table="drivers"
      title="Водачи"
      orderBy="full_name"
      emptyText="Все още няма водачи. Добавете първия с формата по-горе."
      fields={[
        { name: 'full_name', label: 'Име и фамилия', type: 'text', required: true, placeholder: 'Иван Петров' },
        { name: 'position', label: 'Длъжност', type: 'text', placeholder: 'Търговски представител' },
      ]}
      columns={[
        { label: 'Име', key: 'full_name' },
        { label: 'Длъжност', key: 'position' },
      ]}
    />
  )
}
