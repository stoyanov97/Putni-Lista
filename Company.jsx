// Данни за фирмата: един-единствен запис (id = 1), който се отпечатва на всеки лист.
import { useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'
import { validateEik } from '../lib/validators'

const empty = { name: '', eik: '', address: '', mol: '' }

export default function Company() {
  const [form, setForm] = useState(empty)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('company').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setForm({ name: data.name, eik: data.eik, address: data.address, mol: data.mol })
    })
  }, [])

  async function save(e) {
    e.preventDefault()
    setMessage('')
    const problem = validateEik(form.eik)
    if (problem) return setError(problem)
    const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]))
    const { error } = await supabase.from('company').upsert({ id: 1, ...values })
    if (error) return setError(friendlyError(error))
    setError('')
    setMessage('Данните на фирмата са запазени.')
  }

  const field = (name, label, placeholder) => (
    <label>
      <span>{label}<span className="req"> *</span></span>
      <input value={form[name]} placeholder={placeholder} required onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
    </label>
  )

  return (
    <section>
      <h2>Фирма</h2>
      <p className="muted">Тези данни се отпечатват в горната част на всеки пътен лист.</p>
      <form className="panel form-grid" onSubmit={save}>
        {field('name', 'Наименование', 'Пример ЕООД')}
        {field('eik', 'ЕИК', '123456789')}
        {field('address', 'Адрес', 'гр. София, ул. Примерна 1')}
        {field('mol', 'МОЛ', 'Име и фамилия')}
        <div className="form-actions">
          <button className="primary">Запази</button>
          {error && <p className="error">{error}</p>}
          {message && <p className="ok">{message}</p>}
        </div>
      </form>
    </section>
  )
}
