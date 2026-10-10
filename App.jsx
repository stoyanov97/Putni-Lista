import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Company from './pages/Company'
import Vehicles from './pages/Vehicles'
import Drivers from './pages/Drivers'
import Destinations from './pages/Destinations'
import Distances from './pages/Distances'
import NewWaybill from './pages/NewWaybill'
import History from './pages/History'
import WaybillView from './pages/WaybillView'

// Навигацията следва реда на работа: първо регистрите, после листовете.
const sections = [
  { group: 'Настройки', items: [
    { id: 'company', label: 'Фирма', page: Company },
    { id: 'vehicles', label: 'Автомобили', page: Vehicles },
    { id: 'drivers', label: 'Водачи', page: Drivers },
    { id: 'destinations', label: 'Дестинации', page: Destinations },
    { id: 'distances', label: 'Разстояния', page: Distances },
  ] },
  { group: 'Пътни листа', items: [
    { id: 'new', label: 'Нов пътен лист', page: NewWaybill },
    { id: 'history', label: 'История', page: History },
  ] },
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = още проверяваме
  // Текуща страница + параметри (напр. кой лист да се отвори)
  const [route, setRoute] = useState({ page: 'company', params: {} })
  const navigate = (page, params = {}) => setRoute({ page, params })
  const current = route.page

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />

  const pages = [...sections.flatMap((s) => s.items), { id: 'view', page: WaybillView }]
  const Page = pages.find((i) => i.id === current).page
  const activeNav = current === 'view' ? 'history' : current

  return (
    <div className="layout">
      <nav className="sidebar no-print">
        <div className="brand">Пътни листа</div>
        {sections.map((s) => (
          <div key={s.group} className="nav-group">
            <div className="nav-title">{s.group}</div>
            {s.items.map((i) => (
              <button key={i.id} className={i.id === activeNav ? 'nav-item active' : 'nav-item'} onClick={() => navigate(i.id)}>
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
        <Page key={JSON.stringify(route)} navigate={navigate} {...route.params} />
      </main>
    </div>
  )
}
