import { useEffect, useState } from 'react'
import api from '../api'
import BoxLista from '../components/BoxLista'

const tabCls = (active) =>
  `px-4 py-2 text-sm font-semibold rounded-lg transition ${active ? 'btn-accent' : 'text-gray-400 hover-pri'}`

const fecha = (d) => new Date(d).toLocaleString()

export default function Registros() {
  const [tab, setTab] = useState('accesos')
  const [accesos, setAccesos] = useState([])
  const [alertas, setAlertas] = useState([])
  const [sincros, setSincros] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { cargar(tab) }, [tab])

  async function cargar(t) {
    setLoading(true)
    try {
      if (t === 'accesos') setAccesos((await api.get('/registros/accesos')).data)
      else if (t === 'alertas') setAlertas((await api.get('/registros/alertas')).data)
      else setSincros((await api.get('/registros/sincronizaciones')).data)
    } finally { setLoading(false) }
  }

  // Accesos: separar autorizados (severidad 1) de denegados
  const autorizados = accesos.filter(e => (e.tipos_evento?.severidad ?? 1) === 1)
  const denegados   = accesos.filter(e => (e.tipos_evento?.severidad ?? 1) !== 1)

  // Alertas: agrupar por tipo de evento
  const grupos = {}
  for (const a of alertas) {
    const k = a.eventos?.tipos_evento?.nombre || 'Otras'
    ;(grupos[k] = grupos[k] || []).push(a)
  }

  const tabs = [
    ['accesos', 'Accesos'], ['alertas', 'Alertas'], ['sincros', 'Historial de tokens'],
  ]

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <h2 className="font-display text-2xl font-bold t-pri">Monitoreo y Registros</h2>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(([k, l]) => (
          <button key={k} className={tabCls(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {loading && <p className="t-mut text-sm">Cargando...</p>}

      {/* ACCESOS: dos cajas */}
      {tab === 'accesos' && !loading && (
        <div className="grid lg:grid-cols-2 gap-5">
          <BoxLista titulo="Accesos autorizados" icon="✅" color="#10b981" items={autorizados}
            vacio="Sin accesos autorizados"
            render={e => (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="t-pri font-medium text-sm">{e.candados?.descripcion}</p>
                  <p className="t-mut text-xs">{e.usuarios?.nombre ?? 'Sin operador'} · {fecha(e.ocurrido_en)}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full font-semibold shrink-0"
                  style={{ background: 'rgba(16,185,129,.15)', color: '#34d399' }}>Autorizado</span>
              </div>
            )} />
          <BoxLista titulo="Accesos denegados" icon="⛔" color="#f87171" items={denegados}
            vacio="Sin accesos denegados"
            render={e => (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="t-pri font-medium text-sm">{e.candados?.descripcion}</p>
                  <p className="t-mut text-xs">{fecha(e.ocurrido_en)}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full font-semibold shrink-0"
                  style={{ background: 'rgba(239,68,68,.15)', color: '#f87171' }}>Denegado</span>
              </div>
            )} />
        </div>
      )}

      {/* ALERTAS: una caja por tipo */}
      {tab === 'alertas' && !loading && (
        <div className="grid lg:grid-cols-2 gap-5">
          {Object.entries(grupos).map(([tipo, items]) => (
            <BoxLista key={tipo} titulo={tipo} icon="🚨" color="#fbbf24" items={items}
              render={a => (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="t-pri font-medium text-sm">{a.eventos?.candados?.descripcion}</p>
                    <p className="t-mut text-xs">{fecha(a.eventos?.ocurrido_en)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-2 py-1 rounded-full font-semibold"
                      style={a.nivel === 3 ? { background: 'rgba(239,68,68,.15)', color: '#f87171' } : { background: 'rgba(245,158,11,.15)', color: '#fbbf24' }}>
                      Nivel {a.nivel}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full font-semibold"
                      style={a.atendida ? { background: 'rgba(16,185,129,.15)', color: '#34d399' } : { background: 'rgba(239,68,68,.15)', color: '#f87171' }}>
                      {a.atendida ? 'Atendida' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              )} />
          ))}
          {alertas.length === 0 && <p className="t-mut text-sm">Sin alertas registradas</p>}
        </div>
      )}

      {/* HISTORIAL DE TOKENS */}
      {tab === 'sincros' && !loading && (
        <BoxLista titulo="Tokens generados" icon="🔑" items={sincros}
          vacio="Sin tokens registrados"
          render={s => (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="t-pri font-medium text-sm font-mono">{s.token}</p>
                <p className="t-mut text-xs">{s.candados?.descripcion} · {fecha(s.creado_en)}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full font-semibold shrink-0"
                style={
                  s.estado === 'activo' ? { background: 'rgba(16,185,129,.15)', color: '#34d399' } :
                  s.estado === 'pendiente' ? { background: 'rgba(245,158,11,.15)', color: '#fbbf24' } :
                  { background: 'var(--accent-soft)', color: 'var(--muted)' }
                }>{s.estado}</span>
            </div>
          )} />
      )}
    </div>
  )
}
