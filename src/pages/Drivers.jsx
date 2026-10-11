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
      warnDuplicate={{
        field: 'full_name',
        message: (twin) =>
          `Вече има водач „${twin.full_name}“${twin.position ? ` (${twin.position})` : ''}. ` +
          'Ако това е друг човек със същото име, натиснете OK. Добре е да попълните длъжност, за да се различават.',
      }}
      columns={[
        { label: 'Име', key: 'full_name' },
        { label: 'Длъжност', key: 'position' },
      ]}
    />
  )
}
