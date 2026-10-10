// Обща страница за регистър: форма за добавяне/редакция + таблица.
// Използва се за автомобили, водачи и дестинации, за да не повтаряме код.
import { useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'

export default function RegistryPage({ table, title, intro, fields, columns, orderBy = 'id', prepare, validate, emptyText }) {
  const blank = Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : '']))
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order(orderBy)
    if (error) setError(friendlyError(error))
    else setRows(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [table])

  function startEdit(row) {
    setEditingId(row.id)
    setForm(Object.fromEntries(fields.map((f) => [f.name, row[f.name] ?? (f.type === 'checkbox' ? false : '')])))
    setError('')
  }

  function cancel() {
    setEditingId(null)
    setForm(blank)
    setError('')
  }

  async function save(e) {
    e.preventDefault()
    let values = { ...form }
    for (const f of fields) {
      if (f.type === 'number') values[f.name] = values[f.name] === '' ? null : Number(values[f.name])
      if (f.type === 'text' || f.type === 'select') values[f.name] = String(values[f.name] ?? '').trim() || null
    }
    if (prepare) values = prepare(values)
    const problem = validate ? validate(values) : ''
    if (problem) return setError(problem)

    const query = editingId
      ? supabase.from(table).update(values).eq('id', editingId)
      : supabase.from(table).insert(values)
    const { error } = await query
    if (error) return setError(friendlyError(error))
    cancel()
    load()
  }

  async function remove(row) {
    if (!confirm('Да се изтрие ли записът?')) return
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) return setError(friendlyError(error))
    if (editingId === row.id) cancel()
    load()
  }

  return (
    <section>
      <h2>{title}</h2>
      {intro && <p className="muted">{intro}</p>}

      <form className="panel form-grid" onSubmit={save}>
        {fields.map((f) => (
          <label key={f.name} className={f.type === 'checkbox' ? 'check' : ''}>
            {f.type === 'checkbox' ? (
              <>
                <input type="checkbox" checked={!!form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} />
                {f.label}
              </>
            ) : (
              <>
                <span>{f.label}{f.required && <span className="req"> *</span>}</span>
                {f.type === 'select' ? (
                  <select value={form[f.name] ?? ''} required={f.required} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                    <option value="">Изберете…</option>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    step={f.step}
                    min={f.min}
                    placeholder={f.placeholder}
                    required={f.required}
                    value={form[f.name] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  />
                )}
              </>
            )}
          </label>
        ))}
        <div className="form-actions">
          <button className="primary">{editingId ? 'Запази промените' : 'Добави'}</button>
          {editingId && <button type="button" onClick={cancel}>Откажи</button>}
          {error && <p className="error">{error}</p>}
        </div>
      </form>

      {loading ? <p className="muted">Зареждане…</p> : rows.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{columns.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={editingId === row.id ? 'editing' : ''}>
                  {columns.map((c) => <td key={c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(row) : row[c.key]}</td>)}
                  <td className="row-actions">
                    <button onClick={() => startEdit(row)}>Редактирай</button>
                    <button className="danger" onClick={() => remove(row)}>Изтрий</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
