import { useState } from 'react'
import { supabase } from '../lib/supabase'

function loginError(message) {
  if (message === 'Invalid login credentials') return 'Грешен имейл или парола.'
  if (message === 'Email not confirmed') return 'Имейлът не е потвърден. Потвърдете потребителя в Supabase.'
  return message
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(loginError(error.message))
    setBusy(false)
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={handleLogin}>
        <h1>Пътни листа</h1>
        <p className="muted">Влезте, за да издавате и преглеждате пътни листа.</p>
        <label>
          Имейл
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Парола
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Влизане…' : 'Вход'}</button>
      </form>
    </div>
  )
}
