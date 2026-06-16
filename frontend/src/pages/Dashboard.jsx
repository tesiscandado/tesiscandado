import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../api'
import { MapaModal } from '../components/Modal'

const estadoDot = {
  cerrado: '#10b981', abierto: '#f59e0b', alarma: '#ef4444', activo: '#10b981', desconocido: '#6b7280',
}

const estadoGeneral = {
  normal:      { color: '#10b981', label: 'Normal' },
  advertencia: { color: '#f59e0b', label: 'Advertencia' },
  alarma:      { color: '#ef4444', label: 'Alarma' },
}

const sevPill = {
  3: { bg: 'rgba(239,68,68,.15)',  c: '#f87171', t: 'Crítico' },
  2: { bg: 'rgba(245,158,11,.15)', c: '#fbbf24', t: 'Aviso' },
  1: { bg: 'rgba(45,212,191,.15)', c: '#2dd4bf', t: 'Info' },
}

const metricas = [
  { key: 'total_candados',    label: 'Candados',          icon: '🔒' },
  { key: 'candados_activos',  label: 'Activos',           icon: '📡' },
  { key: 'total_operadores',  label: 'Operadores',        icon: '👥' },
  { key: 'accesos_hoy',       label: 'Accesos hoy',       icon: '🚪' },
  { key: 'intentos_fallidos', label: 'Intentos fallidos', icon: '⚠️', alerta: true },
  { key: 'alarmas_activas',   label: 'Alarmas activas',   icon: '🔔', alerta: true },
]

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [mapa, setMapa] = useState(null)
  const [limite, setLimite] = useState(7)

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

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>
  if (!data) return <p className="t-mut">Cargando...</p>

  const eg = estadoGeneral[data.estado_general] ?? estadoGeneral.normal
  const ind = data.indicadores
  const eventos = data.eventos_recientes.slice(0, limite)

  return (
    <div className="flex flex-col gap-7 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-2xl font-bold t-pri">Dashboard</h2>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold"
          style={{ borderColor: eg.color + '55', background: eg.color + '18', color: eg.color }}>
          <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: eg.color }} />
          Estado general: {eg.label}
        </div>
      </div>

      {/* Indicadores */}
      <motion.div variants={container} initial="hidden" animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {metricas.map(m => {
          const valor = ind[m.key]
          const alerta = m.alerta && valor > 0
          return (
            <motion.div key={m.key} variants={item} whileHover={{ y: -4 }}
              className="surface-card rounded-2xl p-5 relative overflow-hidden"
              style={alerta ? { borderColor: 'var(--danger)' } : {}}>
              <span className="absolute right-3 top-3 text-lg opacity-60">{m.icon}</span>
              <p className="font-display text-4xl font-bold"
                style={{ color: alerta ? 'var(--danger)' : 'var(--text)' }}>{valor}</p>
              <p className="t-mut text-xs mt-1">{m.label}</p>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Estado de candados */}
      <section>
        <h3 className="t-mut text-xs uppercase tracking-wider mb-3 font-semibold">Estado de candados</h3>
        <motion.div variants={container} initial="hidden" animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.candados.map(c => {
            const bat = c.nivel_bateria
            const batColor = bat == null ? '#6b7280' : bat < 20 ? '#ef4444' : '#2dd4bf'
            return (
              <motion.div key={c.id} variants={item} whileHover={{ y: -4 }}
                className="surface-card rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: estadoDot[c.estado] ?? '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <p className="t-pri font-semibold leading-tight">{c.descripcion || c.codigo_dispositivo}</p>
                    <p className="t-mut text-xs mt-0.5">{c.codigo_dispositivo} · <span className="capitalize">{c.estado}</span></p>
                  </div>
                </div>

                {bat != null && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="t-mut">Batería</span>
                      <span style={{ color: batColor }}>{bat}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${bat}%` }}
                        transition={{ duration: 0.8 }} className="h-full rounded-full"
                        style={{ background: batColor }} />
                    </div>
                  </div>
                )}

                <button onClick={() => setMapa(c)}
                  className="self-start text-xs px-3 py-1.5 rounded-lg font-semibold transition hover:opacity-80"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  📍 Localizar
                </button>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* Alarmas activas */}
      <section>
        <h3 className="t-mut text-xs uppercase tracking-wider mb-3 font-semibold flex items-center gap-2">
          Alarmas activas
          {data.alarmas_activas.length > 0 && (
            <span className="text-white text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--danger)' }}>
              {data.alarmas_activas.length}
            </span>
          )}
        </h3>
        {data.alarmas_activas.length === 0 ? (
          <div className="surface-card rounded-2xl p-6 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="t-pri font-medium">Todo tranquilo</p>
              <p className="t-mut text-sm">No hay alarmas activas en este momento.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.alarmas_activas.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-2xl p-4 flex justify-between items-center border"
                style={{ background: 'rgba(239,68,68,.10)', borderColor: 'rgba(239,68,68,.4)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚨</span>
                  <div>
                    <p className="font-semibold" style={{ color: '#f87171' }}>{a.eventos?.tipos_evento?.nombre}</p>
                    <p className="t-mut text-xs">{a.eventos?.candados?.descripcion} — {new Date(a.eventos?.ocurrido_en).toLocaleString()}</p>
                  </div>
                </div>
                <span className="text-xs px-3 py-1 rounded-full font-semibold"
                  style={{ background: 'rgba(239,68,68,.2)', color: '#fca5a5' }}>Nivel {a.nivel}</span>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Últimos eventos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="t-mut text-xs uppercase tracking-wider font-semibold">Últimos eventos</h3>
          <label className="flex items-center gap-2 text-xs t-mut">
            Mostrar
            <select value={limite} onChange={e => setLimite(Number(e.target.value))}
              className="fld rounded-lg px-2 py-1 text-xs">
              {[7, 15, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="surface-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bd t-mut text-xs uppercase">
                <th className="text-left px-4 py-3 font-semibold">Evento</th>
                <th className="text-left px-4 py-3 font-semibold">Candado</th>
                <th className="text-left px-4 py-3 font-semibold">Operador</th>
                <th className="text-left px-4 py-3 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e, i) => {
                const sev = sevPill[e.tipos_evento?.severidad] ?? sevPill[1]
                return (
                  <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className="border-b bd last:border-0 hover:bg-gray-800/40 transition">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: sev.c }} />
                        <span className="t-pri">{e.tipos_evento?.nombre}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 t-mut">{e.candados?.descripcion}</td>
                    <td className="px-4 py-3 t-mut">{e.usuarios?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 t-mut whitespace-nowrap">{new Date(e.ocurrido_en).toLocaleString()}</td>
                  </motion.tr>
                )
              })}
              {eventos.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center t-mut">Sin eventos aún</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data.eventos_recientes.length > limite && (
          <p className="t-mut text-xs text-center mt-3">
            Mostrando {limite} de {data.eventos_recientes.length} eventos
          </p>
        )}
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
