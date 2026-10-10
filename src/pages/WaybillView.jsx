import { useEffect, useState } from 'react'
import { loadWaybill } from '../lib/waybillData'
import WaybillDocument from '../components/WaybillDocument'
import { waybillNumber } from '../lib/waybillSummary'

export default function WaybillView({ id, issuedNumber, navigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadWaybill(id).then(setData).catch((e) => setError(e.message))
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Зареждане…</p>

  return (
    <section>
      <div className="toolbar no-print">
        <button onClick={() => navigate('history')}>Към историята</button>
        <button onClick={() => window.print()}>Печат</button>
        {issuedNumber && <p className="ok">Издаден е пътен лист № {waybillNumber(issuedNumber)}.</p>}
      </div>
      <WaybillDocument data={data} />
    </section>
  )
}
