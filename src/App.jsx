import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Company from './pages/Company'
import Vehicles from './pages/Vehicles'
import Drivers from './pages/Drivers'
import Destinations from './pages/Destinations'

// Навигацията следва реда на работа: първо регистрите, после листовете.
const sections = [
  { group: 'Настройки', items: [
    { id: 'company', label: 'Фирма', page: Company },
    { id: 'vehicles', label: 'Автомобили', page: Vehicles },
    { id: 'drivers', label: 'Водачи', page: Drivers },
    { id: 'destinations', label: 'Дестинации', page: Destinations },
  ] },
  { group: 'Пътни листа', items: [
    { id: 'new', label: 'Нов пътен лист', page: null },
    { id: 'history', label: 'История', page: null },
  ] },
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = още проверяваме
  const [current, setCurrent] = useState('company')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />

  const item = sections.flatMap((s) => s.items).find((i) => i.id === current)
  const Page = item.page

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Пътни листа</div>
        {sections.map((s) => (
          <div key={s.group} className="nav-group">
            <div className="nav-title">{s.group}</div>
            {s.items.map((i) => (
              <button key={i.id} className={i.id === current ? 'nav-item active' : 'nav-item'} onClick={() => setCurrent(i.id)}>
                {i.label}
              </button>
            ))}
          </div>
        ))}
        <div className="nav-footer">
          <span className="muted small">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Изход</button>
        </div>
      </nav>
      <main className="content">
        {Page ? <Page /> : <p className="empty">Тази част предстои.</p>}
      </main>
    </div>
  )
}
