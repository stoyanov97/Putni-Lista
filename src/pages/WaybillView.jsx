import { useEffect, useState } from 'react'
import { loadWaybill } from '../lib/waybillData'
import WaybillDocument from '../components/WaybillDocument'
import { waybillNumber } from '../lib/waybillSummary'
import { downloadPdf } from '../lib/exportPdf'
import { downloadExcel } from '../lib/exportExcel'

export default function WaybillView({ id, issuedNumber, navigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(`Експортът не успя: ${e.message}`)
    }
    setBusy(false)
  }
  const fileBase = () => `putni-list-${waybillNumber(data.waybill.number)}`

  useEffect(() => {
    loadWaybill(id).then(setData).catch((e) => setError(e.message))
  }, [id])

  if (error && !data) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Зареждане…</p>

  return (
    <section>
      <div className="toolbar no-print">
        <button onClick={() => navigate('history')}>Към историята</button>
        <button className="primary" disabled={busy} onClick={() => run(() => downloadPdf([data], `${fileBase()}.pdf`))}>Изтегли PDF</button>
        <button className="primary" disabled={busy} onClick={() => run(() => downloadExcel([data], `${fileBase()}.xlsx`))}>Изтегли Excel</button>
        <button onClick={() => window.print()}>Печат</button>
        {issuedNumber && <p className="ok">Издаден е пътен лист № {waybillNumber(issuedNumber)}.</p>}
        {error && <p className="error">{error}</p>}
      </div>
      <WaybillDocument data={data} />
    </section>
  )
}
