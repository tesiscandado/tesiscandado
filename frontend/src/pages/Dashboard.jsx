import { useEffect, useState } from 'react'
import api from '../api'
import { MapaModal } from '../components/Modal'

const estadoColor = {
  cerrado:     'bg-green-500',
  abierto:     'bg-yellow-500',
  alarma:      'bg-red-500',
  desconocido: 'bg-gray-500',
}

const estadoGeneral = {
  normal:      { color: 'text-green-400',  bg: 'bg-green-900/30 border-green-700',  icono: '🟢', label: 'Normal' },
  advertencia: { color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700', icono: '🟡', label: 'Advertencia' },
  alarma:      { color: 'text-red-400',    bg: 'bg-red-900/30 border-red-700',       icono: '🔴', label: 'Alarma' },
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [mapa, setMapa] = useState(null)

  async function cargar() {
    try {
      const res = await api.get('/dashboard/')
      setData(res.data)
    } catch {
      setError('Error al cargar datos')
    }
  }

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, 10000)
    return () => clearInterval(intervalo)
  }, [])

  if (error) return <p className="text-red-400">{error}</p>
  if (!data) return <p className="t-mut">Cargando...</p>

  const eg = estadoGeneral[data.estado_general] ?? estadoGeneral.normal
  const ind = data.indicadores

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold t-pri">Dashboard</h2>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold ${eg.bg} ${eg.color}`}>
          {eg.icono} Estado general: {eg.label}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Candados',         valor: ind.total_candados },
          { label: 'Activos',          valor: ind.candados_activos },
          { label: 'Operadores',       valor: ind.total_operadores },
          { label: 'Accesos hoy',      valor: ind.accesos_hoy },
          { label: 'Intentos fallidos',valor: ind.intentos_fallidos, alerta: ind.intentos_fallidos > 0 },
          { label: 'Alarmas activas',  valor: ind.alarmas_activas,   alerta: ind.alarmas_activas > 0 },
        ].map(({ label, valor, alerta }) => (
          <div key={label} className={`bg-card border rounded-xl p-4 text-center ${alerta ? 'border-red-700' : 'bd'}`}>
            <p className={`text-3xl font-bold ${alerta ? 'text-red-400' : 't-pri'}`}>{valor}</p>
            <p className="t-mut text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Estado candados */}
      <section>
        <h3 className="t-mut text-xs uppercase tracking-wider mb-3">Estado de candados</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.candados.map(c => (
            <div key={c.id} className="bg-card border bd rounded-xl p-4 flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${estadoColor[c.estado] ?? 'bg-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="t-pri font-medium truncate">{c.descripcion || c.codigo_dispositivo}</p>
                <p className="t-mut text-xs capitalize">{c.estado}</p>
              </div>
              {c.nivel_bateria !== null && c.nivel_bateria !== undefined && (
                <span className={`text-xs px-2 py-1 rounded-full ${c.nivel_bateria < 20 ? 'bg-red-900 text-red-300' : 'surface-soft t-mut'}`}>
                  🔋 {c.nivel_bateria}%
                </span>
              )}
              <button onClick={() => setMapa(c)} className="text-xs px-2 py-1 rounded-full bg-blue-900/50 hover:bg-blue-900 text-blue-300">
                📍 Localizar
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Alarmas activas */}
      <section>
        <h3 className="t-mut text-xs uppercase tracking-wider mb-3">
          Alarmas activas
          {data.alarmas_activas.length > 0 && (
            <span className="ml-2 bg-red-600 t-pri text-xs px-2 py-0.5 rounded-full">
              {data.alarmas_activas.length}
            </span>
          )}
        </h3>
        {data.alarmas_activas.length === 0 ? (
          <p className="t-mut text-sm">Sin alarmas activas</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.alarmas_activas.map(a => (
              <div key={a.id} className="bg-red-950 border border-red-800 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-red-300 font-medium">{a.eventos?.tipos_evento?.nombre}</p>
                  <p className="t-mut text-xs">{a.eventos?.candados?.descripcion} — {new Date(a.eventos?.ocurrido_en).toLocaleString()}</p>
                </div>
                <span className="text-xs bg-red-800 text-red-200 px-2 py-1 rounded-full">Nivel {a.nivel}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Eventos recientes */}
      <section>
        <h3 className="t-mut text-xs uppercase tracking-wider mb-3">Últimos eventos</h3>
        <div className="bg-card border bd rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bd t-mut text-xs uppercase">
                <th className="text-left px-4 py-3">Evento</th>
                <th className="text-left px-4 py-3">Candado</th>
                <th className="text-left px-4 py-3">Operador</th>
                <th className="text-left px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.eventos_recientes.map(e => (
                <tr key={e.id} className="border-b bd last:border-0 hover:bg-gray-800/40">
                  <td className="px-4 py-3 t-pri">{e.tipos_evento?.nombre}</td>
                  <td className="px-4 py-3 t-mut">{e.candados?.descripcion}</td>
                  <td className="px-4 py-3 t-mut">{e.credenciales?.operadores?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 t-mut whitespace-nowrap">{new Date(e.ocurrido_en).toLocaleString()}</td>
                </tr>
              ))}
              {data.eventos_recientes.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center t-mut">Sin eventos aún</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <MapaModal
        open={!!mapa}
        onClose={() => setMapa(null)}
        titulo={`Ubicación — ${mapa?.descripcion || mapa?.codigo_dispositivo || ''}`}
        lat={mapa?.latitud}
        lon={mapa?.longitud}
      />
    </div>
  )
}
