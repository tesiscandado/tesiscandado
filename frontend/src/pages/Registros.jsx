import { useEffect, useState } from 'react'
import api from '../api'

const tabCls = (active) =>
  `px-4 py-2 text-sm font-semibold rounded-lg transition ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`

const severidadInfo = {
  3: { label: 'Crítico',     color: 'bg-red-900 text-red-300' },
  2: { label: 'Advertencia', color: 'bg-yellow-900 text-yellow-300' },
  1: { label: 'Info',        color: 'bg-green-900 text-green-300' },
}

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
      if (t === 'accesos') {
        const res = await api.get('/registros/accesos')
        setAccesos(res.data)
      } else if (t === 'alertas') {
        const res = await api.get('/registros/alertas')
        setAlertas(res.data)
      } else {
        const res = await api.get('/registros/sincronizaciones')
        setSincros(res.data)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-white">📜 Monitoreo y Registros</h2>

      {/* Tabs */}
      <div className="flex gap-2">
        <button className={tabCls(tab === 'accesos')} onClick={() => setTab('accesos')}>Accesos</button>
        <button className={tabCls(tab === 'alertas')} onClick={() => setTab('alertas')}>Alertas</button>
        <button className={tabCls(tab === 'sincros')} onClick={() => setTab('sincros')}>Sincronizaciones</button>
      </div>

      {loading && <p className="text-gray-400 text-sm">Cargando...</p>}

      {/* Tabla accesos */}
      {tab === 'accesos' && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Evento</th>
                <th className="text-left px-4 py-3">Candado</th>
                <th className="text-left px-4 py-3">Operador</th>
                <th className="text-left px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {accesos.map(e => {
                const sev = severidadInfo[e.tipos_evento?.severidad] ?? severidadInfo[1]
                return (
                  <tr key={e.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(e.ocurrido_en).toLocaleString()}</td>
                    <td className="px-4 py-3 text-white">{e.tipos_evento?.nombre}</td>
                    <td className="px-4 py-3 text-gray-400">{e.candados?.descripcion}</td>
                    <td className="px-4 py-3 text-gray-400">{e.usuarios?.nombre ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${sev.color}`}>{sev.label}</span>
                    </td>
                  </tr>
                )
              })}
              {accesos.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Sin registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla alertas */}
      {tab === 'alertas' && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Tipo de alerta</th>
                <th className="text-left px-4 py-3">Candado</th>
                <th className="text-left px-4 py-3">Nivel</th>
                <th className="text-left px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map(a => (
                <tr key={a.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(a.eventos?.ocurrido_en).toLocaleString()}</td>
                  <td className="px-4 py-3 text-white">{a.eventos?.tipos_evento?.nombre}</td>
                  <td className="px-4 py-3 text-gray-400">{a.eventos?.candados?.descripcion}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${a.nivel === 3 ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'}`}>
                      Nivel {a.nivel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${a.atendida ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {a.atendida ? 'Atendida' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
              {alertas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Sin alertas registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla sincronizaciones */}
      {tab === 'sincros' && !loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Candado</th>
                <th className="text-left px-4 py-3">Token</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Sincronizado</th>
              </tr>
            </thead>
            <tbody>
              {sincros.map(s => (
                <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(s.creado_en).toLocaleString()}</td>
                  <td className="px-4 py-3 text-white">{s.candados?.descripcion}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{s.token.slice(0, 12)}...</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      s.estado === 'activo' ? 'bg-green-900 text-green-300' :
                      s.estado === 'pendiente' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>{s.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.sincronizado_en ? new Date(s.sincronizado_en).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {sincros.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Sin sincronizaciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
