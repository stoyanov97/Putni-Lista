// Пътният лист като документ: всички реквизити, които изисква заданието (и НАП).
import { fmtDate, fmtNum } from '../lib/format'
import { fuelLiters } from '../lib/routeGenerator'
import { summarize, waybillNumber } from '../lib/waybillSummary'

export default function WaybillDocument({ data, selected, onSelect }) {
  const { waybill, trips, refuelings, company } = data
  const v = waybill.vehicles
  const d = waybill.drivers
  const s = summarize(waybill, trips)

  return (
    <article className="sheet">
      <header className="sheet-head">
        <div>
          <h1>Пътен лист № {waybillNumber(waybill.number)}</h1>
          <p>Дата на издаване: {waybill.issue_date ? fmtDate(waybill.issue_date) : '—'}</p>
          <p>Период: {fmtDate(waybill.period_from)} – {fmtDate(waybill.period_to)}</p>
        </div>
        <dl>
          <dt>Фирма</dt><dd>{company?.name}</dd>
          <dt>ЕИК</dt><dd>{company?.eik}</dd>
          <dt>Адрес</dt><dd>{company?.address}</dd>
        </dl>
      </header>

      <div className="sheet-grid">
        <dl>
          <dt>Автомобил</dt><dd>{v.make} {v.model}</dd>
          <dt>Рег. номер</dt><dd>{v.reg_number}</dd>
          <dt>Гориво</dt><dd>{v.fuel_type}</dd>
          <dt>Норма</dt><dd>{fmtNum(s.norm, 2)} л/100 км</dd>
        </dl>
        <dl>
          <dt>Водач</dt><dd>{d.full_name}</dd>
          <dt>Длъжност</dt><dd>{d.position || '—'}</dd>
          <dt>Километраж</dt><dd>{fmtNum(waybill.start_odometer)} → {fmtNum(waybill.end_odometer)}</dd>
          <dt>Изминати</dt><dd>{fmtNum(s.total)} км (служебно {fmtNum(s.business)}, лично {fmtNum(s.personal)})</dd>
        </dl>
      </div>

      <table className="sheet-table">
        <thead>
          <tr>
            <th>№</th><th>Дата</th><th>Маршрут (откъде – през – докъде)</th><th>Цел на пътуването</th>
            <th className="num">Нач. км</th><th className="num">Кр. км</th><th className="num">Км</th><th className="num">Литри</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => (
            <tr
              key={t.id}
              className={[t.is_personal ? 'personal' : '', onSelect ? 'clickable' : '', selected === i ? 'selected' : ''].join(' ')}
              onClick={onSelect ? () => onSelect(i) : undefined}
            >
              <td>{t.seq}</td>
              <td>{fmtDate(t.trip_date)}</td>
              <td>{t.route}{t.is_personal && !/лично ползване/i.test(t.route) && ' (лично ползване)'}</td>
              <td>{t.purpose}</td>
              <td className="num">{fmtNum(t.start_odometer)}</td>
              <td className="num">{fmtNum(t.end_odometer)}</td>
              <td className="num">{fmtNum(t.km)}</td>
              <td className="num">{fmtNum(fuelLiters(t.km, s.norm), 2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan="6">Общо за периода</td><td className="num">{fmtNum(s.total)}</td><td className="num">{fmtNum(s.liters, 2)}</td></tr>
          {s.personal > 0 && (
            <tr><td colSpan="6">в т.ч. лично ползване</td><td className="num">{fmtNum(s.personal)}</td><td className="num">{fmtNum(s.personalLiters, 2)}</td></tr>
          )}
        </tfoot>
      </table>

      {refuelings.length > 0 && (
        <table className="sheet-table small">
          <thead><tr><th>Зареждане</th><th className="num">Литри</th><th>№ на фактура</th></tr></thead>
          <tbody>
            {refuelings.map((r) => (
              <tr key={r.id}><td>{fmtDate(r.refuel_date)}</td><td className="num">{fmtNum(r.liters, 2)}</td><td>{r.invoice_number || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="signatures">
        <div><span className="line" />Водач: {d.full_name}</div>
        <div><span className="line" />Одобрил (МОЛ): {company?.mol}</div>
      </footer>
    </article>
  )
}
