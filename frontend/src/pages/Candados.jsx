import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../api'
import { ConfirmModal, MapaModal, HistorialModal } from '../components/Modal'

const btnCls = 'px-4 py-2 rounded-lg font-semibold text-sm transition'
const fld = 'fld rounded-lg px-4 py-2.5 w-full'

const estadoStyle = {
  cerrado: { background: 'rgba(16,185,129,.15)', color: '#34d399' },
  activo:  { background: 'rgba(16,185,129,.15)', color: '#34d399' },
  abierto: { background: 'rgba(245,158,11,.15)', color: '#fbbf24' },
  alarma:  { background: 'rgba(239,68,68,.15)',  color: '#f87171' },
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }

export default function Candados() {
  const [candados, setCandados]   = useState([])
  const [form, setForm]           = useState({ codigo_dispositivo: '', descripcion: '', sim_numero: '' })
  const [editId, setEditId]       = useState(null)
  const [msg, setMsg]             = useState('')
  const [expandido, setExpandido] = useState(null)
  const [alertas, setAlertas]     = useState({})
  const [mapa, setMapa]           = useState(null)
  const [historial, setHistorial] = useState(null)   // { candado, puntos, cargando }
  const [confirmar, setConfirmar] = useState(null)
  const [limite, setLimite]       = useState(5)
  const [pagAlertas, setPagAlertas] = useState({})   // pagina actual de alertas por candado

  // Precarga de demo: sobrescribe SOLO en la vista (estado activo + ubicacion
  // fija) para presentaciones cuando el hardware no reporta. No toca el
  // backend ni la logica real; se limpia con la X y todo vuelve a lo real.
  const [precarga, setPrecarga] = useState(() => {
    try { return JSON.parse(localStorage.getItem('candado_precarga') || '{}') } catch { return {} }
  })
  useEffect(() => {
    localStorage.setItem('candado_precarga', JSON.stringify(precarga))
  }, [precarga])

  const COORDS_DEMO = { latitud: -2.1476022144458615, longitud: -79.9123397467648 }

  const POR_PAGINA = 5

  // Refresco cada 30s: estado (en_linea, bateria) y ubicacion vienen juntos.
  // La ubicacion solo cambia cuando el ESP32 postea (heartbeat ~3 min); el
  // backend no la refresca sin datos frescos del dispositivo.
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 30000)
    return () => clearInterval(t)
  }, [])

  async function cargar() {
    try {
      const res = await api.get('/candados/')
      setCandados(res.data)
    } catch { /* noop */ }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editId) { await api.put(`/candados/${editId}`, form); setMsg('Candado actualizado') }
      else { await api.post('/candados/', form); setMsg('Candado registrado') }
      setForm({ codigo_dispositivo: '', descripcion: '', sim_numero: '' }); setEditId(null); cargar()
    } catch { setMsg('Error al guardar') }
  }

  function eliminar(id) {
    setConfirmar({
      title: 'Eliminar candado', danger: true, confirmText: 'Eliminar',
      mensaje: '¿Seguro que deseas eliminar este candado?\n\nSe borrará del sistema de forma permanente.',
      onConfirm: async () => { await api.delete(`/candados/${id}`); cargar() },
    })
  }

  async function verAlertas(id) {
    if (expandido === id) { setExpandido(null); return }
    setExpandido(id)
    if (!alertas[id]) {
      const res = await api.get(`/candados/${id}/alertas`)
      setAlertas(prev => ({ ...prev, [id]: res.data }))
    }
  }

  function atender(alarmaId, candadoId) {
    setConfirmar({
      title: 'Atender alerta', confirmText: 'Atender',
      mensaje: '¿Marcar esta alerta como atendida?\n\nQuedará registrada con la fecha y hora actual.',
      onConfirm: async () => {
        await api.patch(`/candados/alarmas/${alarmaId}/atender`)
        const res = await api.get(`/candados/${candadoId}/alertas`)
        setAlertas(prev => ({ ...prev, [candadoId]: res.data })); cargar()
      },
    })
  }

  const solicitudRef = useRef(0)

  // Precargar demo: marca el candado como activo con la ubicacion fija.
  // Solo afecta la vista (persistido en el navegador); NO abre el mapa.
  function precargarDemo(candado) {
    setPrecarga(prev => ({ ...prev, [candado.id]: { ...COORDS_DEMO, en_linea: true, estado: 'activo' } }))
  }

  // Limpiar la precarga: vuelve a los datos reales del candado.
  function limpiarPrecarga(id) {
    setPrecarga(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  async function abrirMapa(candado) {
    // Si el candado tiene precarga de demo, mostrar esas coordenadas directo
    if (precarga[candado.id]) {
      setMapa({ ...candado, ...precarga[candado.id], cargando: false })
      return
    }
    const miSolicitud = ++solicitudRef.current
    // Mientras se espera la respuesta NO se muestran coordenadas viejas
    setMapa({ ...candado, latitud: null, longitud: null, cargando: true })
    try {
      // Pedir ubicación fresca al candado (publica LOC:<nonce> en el TalkBack)
      const sol = await api.post(`/candados/${candado.id}/solicitar-ubicacion`)
      const desde = sol.data.solicitado_en

      // Esperar una posición capturada DESPUÉS de la solicitud.
      // Peor caso: sync del ESP32 (3 min) + fix GPS (60s) + post -> ~5 min
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000))
        if (solicitudRef.current !== miSolicitud) return   // modal cerrado
        const res = await api.get(`/candados/${candado.id}/ubicacion-actual`, { params: { desde } })
        if (res.data.fresca) {
          setMapa({ ...candado, latitud: res.data.latitud, longitud: res.data.longitud, en_linea: true, cargando: false })
          return
        }
      }
      // Timeout: el candado no respondió — no mostrar coordenadas viejas
      if (solicitudRef.current === miSolicitud)
        setMapa({ ...candado, en_linea: false, latitud: null, longitud: null, cargando: false })
    } catch {
      if (solicitudRef.current === miSolicitud)
        setMapa({ ...candado, en_linea: false, latitud: null, longitud: null, cargando: false })
    }
  }

  function cerrarMapa() {
    solicitudRef.current++   // cancela el polling en curso
    setMapa(null)
  }

  // Abre el historial de últimas ubicaciones en un mini-mapa
  async function verHistorial(candado) {
    setHistorial({ candado, puntos: [], cargando: true })
    // Punto extra por precarga: se agrega COMO ADICIONAL (el más reciente),
    // sin reemplazar las ubicaciones guardadas en la BD.
    const extra = precarga[candado.id]
      ? [{ id: 'precarga', latitud: precarga[candado.id].latitud, longitud: precarga[candado.id].longitud, capturado_en: new Date().toISOString() }]
      : []
    try {
      const res = await api.get(`/candados/${candado.id}/ubicaciones`, { params: { limite: 100 } })
      setHistorial({ candado, puntos: [...extra, ...(res.data || [])], cargando: false })
    } catch {
      setHistorial({ candado, puntos: extra, cargando: false })
    }
  }

  // Vista con la precarga de demo aplicada encima de los datos reales
  const candadosVista = candados.map(c => (precarga[c.id] ? { ...c, ...precarga[c.id] } : c))
  const conectados = candadosVista.filter(c => c.en_linea).length
  const conBateria = candadosVista.filter(c => c.nivel_bateria != null)
  const batProm = conBateria.length ? Math.round(conBateria.reduce((s, c) => s + c.nivel_bateria, 0) / conBateria.length) : null
  const visibles = limite === 'todos' ? candadosVista : candadosVista.slice(0, Number(limite))

  return (
    <div className="flex flex-col gap-7 max-w-7xl mx-auto">
      <h2 className="font-display text-2xl font-bold t-pri">Candados</h2>

      {/* Form + resumen */}
      <div className="grid lg:grid-cols-[minmax(0,460px)_1fr] gap-6 items-stretch">
        <div className="surface-card rounded-2xl p-6">
          <h3 className="font-display t-pri font-semibold mb-4">{editId ? 'Editar candado' : 'Registrar candado'}</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input placeholder="Código dispositivo (ej: ESP32-001)" value={form.codigo_dispositivo} onChange={e => setForm({ ...form, codigo_dispositivo: e.target.value })} className={fld} required />
            <input placeholder="Descripción (ej: Portón Principal)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={fld} />
            <input placeholder="Número SIM" value={form.sim_numero} onChange={e => setForm({ ...form, sim_numero: e.target.value })} className={fld} />
            {msg && <p className="text-sm" style={{ color: 'var(--accent)' }}>{msg}</p>}
            <div className="flex gap-2 mt-1">
              <button type="submit" className={`${btnCls} flex-1 btn-accent`}>{editId ? 'Guardar' : 'Registrar'}</button>
              {editId && <button type="button" onClick={() => { setEditId(null); setForm({ codigo_dispositivo: '', descripcion: '', sim_numero: '' }); setMsg('') }} className={`${btnCls} surface-soft border bd t-pri`}>Cancelar</button>}
            </div>
          </form>
        </div>

        {/* Resumen de la flota */}
        <div className="surface-card rounded-2xl p-6 flex flex-col">
          <h3 className="font-display t-pri font-semibold mb-4">Resumen de la flota</h3>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { l: 'Candados', v: candados.length, c: 'var(--accent)', i: '🔒' },
              { l: 'Conectados', v: conectados, c: '#10b981', i: '📡' },
              { l: 'Batería prom.', v: batProm != null ? `${batProm}%` : '—', c: '#fbbf24', i: '🔋' },
            ].map(s => (
              <div key={s.l} className="rounded-xl p-4 text-center" style={{ background: 'var(--bg)' }}>
                <div className="text-xl mb-1">{s.i}</div>
                <div className="font-display text-2xl font-bold" style={{ color: s.c }}>{s.v}</div>
                <div className="t-mut text-xs mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-auto rounded-xl p-3 text-xs flex items-start gap-2"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <span>💡</span>
            <span>Cada candado reporta batería, ubicación GPS y alarmas por red celular (SIM808). Usa “Localizar” para ver su posición en el mapa.</span>
          </div>
        </div>
      </div>

      {/* Lista */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="font-display t-pri font-semibold flex items-center gap-2">
            Candados registrados
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{candados.length}</span>
          </h3>
          <label className="flex items-center gap-2 text-xs t-mut">
            Mostrar
            <select value={limite} onChange={e => setLimite(e.target.value)} className="fld rounded-lg px-2 py-1.5 text-xs">
              {[5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
              <option value="todos">Todos</option>
            </select>
          </label>
        </div>

        <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-4">
          {visibles.map(c => (
            <motion.div key={c.id} variants={item} className="surface-card glow-card rounded-2xl overflow-hidden">
              <div className="p-5 flex items-start justify-between flex-wrap gap-3">
                <div>
                  <p className="t-pri font-semibold leading-tight">{c.descripcion || c.codigo_dispositivo}</p>
                  <p className="t-mut text-xs mt-0.5">{c.codigo_dispositivo}{c.sim_numero ? ` · SIM: ${c.sim_numero}` : ''}</p>
                  <p className="t-mut text-xs mt-1">Última conexión: {c.ultima_conexion ? new Date(c.ultima_conexion).toLocaleString() : 'Nunca'}</p>
                  {c.latitud != null && c.longitud != null && (
                    <div className="mt-2 flex flex-col gap-0.5">
                      <p className="text-xs font-semibold" style={{ color: c.en_linea ? 'var(--accent)' : 'var(--muted)' }}>
                        📍 {c.en_linea ? 'Ubicación actual' : 'Última ubicación registrada'}
                      </p>
                      <button onClick={() => abrirMapa(c)} className="text-xs font-mono t-pri text-left hover:underline">
                        {Number(c.latitud).toFixed(6)}, {Number(c.longitud).toFixed(6)}
                      </button>
                      <p className="text-xs t-mut">
                        {c.en_linea ? 'Se refresca cada 2 min · toca “Localizar” para GPS al instante' : 'El candado está desconectado'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {c.en_linea
                    ? <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(16,185,129,.15)', color: '#34d399' }}>🟢 En línea</span>
                    : <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(239,68,68,.15)', color: '#f87171' }}>🔴 Desconectado</span>}
                  {c.nivel_bateria != null && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={c.nivel_bateria < 20 ? { background: 'rgba(239,68,68,.15)', color: '#f87171' } : { background: 'var(--accent-soft)', color: 'var(--accent)' }}>🔋 {c.nivel_bateria}%</span>
                  )}
                  {c.estado_gsm && <span className="text-xs surface-soft t-mut px-2.5 py-1 rounded-full">GSM: {c.estado_gsm}</span>}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setEditId(c.id); setForm({ codigo_dispositivo: c.codigo_dispositivo, descripcion: c.descripcion ?? '', sim_numero: c.sim_numero ?? '' }); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={`${btnCls} surface-soft border bd t-pri text-xs`}>Editar</button>
                  <button onClick={() => abrirMapa(c)} className={`${btnCls} text-xs`} style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>📍 Localizar</button>
                  <button onClick={() => verHistorial(c)} className={`${btnCls} text-xs`} style={{ background: 'rgba(59,130,246,.15)', color: '#60a5fa' }}>🗺️ Ubicaciones</button>
                  <button onClick={() => verAlertas(c.id)} className={`${btnCls} text-xs`} style={{ background: 'rgba(239,68,68,.12)', color: '#f87171' }}>{expandido === c.id ? 'Ocultar alertas ▲' : '🔔 Alertas ▼'}</button>
                  <button onClick={() => eliminar(c.id)} className={`${btnCls} text-xs`} style={{ background: 'rgba(239,68,68,.15)', color: '#f87171' }}>Eliminar</button>
                  <button onClick={() => precargarDemo(c)}
                    className="px-2 py-2 rounded-lg text-xs surface-soft border bd t-mut hover:opacity-70 transition">🔄</button>
                  {precarga[c.id] && (
                    <button onClick={() => limpiarPrecarga(c.id)}
                      className="px-2 py-2 rounded-lg text-xs surface-soft border bd t-mut hover:opacity-70 transition">✕</button>
                  )}
                </div>
              </div>

              {expandido === c.id && (
                <div className="border-t bd p-4" style={{ background: 'var(--bg)' }}>
                  <h4 className="t-mut text-xs uppercase tracking-wider mb-3 font-semibold">Alertas de este candado</h4>
                  {!alertas[c.id] ? <p className="t-mut text-sm">Cargando...</p>
                    : alertas[c.id].length === 0 ? <p className="t-mut text-sm">Sin alertas registradas</p>
                    : (() => {
                        const orden = [...alertas[c.id]].sort(
                          (a, b) => new Date(b.eventos?.ocurrido_en || 0) - new Date(a.eventos?.ocurrido_en || 0)
                        )
                        const totalPag = Math.ceil(orden.length / POR_PAGINA)
                        const pag = Math.min(pagAlertas[c.id] || 0, totalPag - 1)
                        const vis = orden.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA)
                        const irPag = (p) => setPagAlertas(prev => ({ ...prev, [c.id]: p }))
                        return (
                          <>
                            <div className="flex flex-col gap-2">
                              {vis.map(a => (
                                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border"
                                  style={a.atendida ? { borderColor: 'var(--line)', background: 'var(--card)' } : { borderColor: 'rgba(239,68,68,.4)', background: 'rgba(239,68,68,.08)' }}>
                                  <div>
                                    <p className="text-sm font-medium" style={{ color: a.atendida ? 'var(--muted)' : '#f87171' }}>{a.eventos?.tipos_evento?.nombre}</p>
                                    <p className="t-mut text-xs">{new Date(a.eventos?.ocurrido_en).toLocaleString()}{a.atendida && a.atendida_en ? ` · Atendida: ${new Date(a.atendida_en).toLocaleString()}` : ''}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs px-2 py-1 rounded-full font-semibold" style={a.nivel === 3 ? { background: 'rgba(239,68,68,.15)', color: '#f87171' } : { background: 'rgba(245,158,11,.15)', color: '#fbbf24' }}>Nivel {a.nivel}</span>
                                    {!a.atendida
                                      ? <button onClick={() => atender(a.id, c.id)} className={`${btnCls} text-xs`} style={{ background: 'rgba(16,185,129,.15)', color: '#34d399' }}>Atender</button>
                                      : <span className="text-xs t-mut">✓ Atendida</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {totalPag > 1 && (
                              <div className="flex items-center justify-center gap-3 mt-3">
                                <button disabled={pag === 0} onClick={() => irPag(pag - 1)}
                                  className={`${btnCls} text-xs surface-soft border bd t-pri disabled:opacity-40`}>‹ Anterior</button>
                                <span className="t-mut text-xs">Página {pag + 1} de {totalPag}</span>
                                <button disabled={pag >= totalPag - 1} onClick={() => irPag(pag + 1)}
                                  className={`${btnCls} text-xs surface-soft border bd t-pri disabled:opacity-40`}>Siguiente ›</button>
                              </div>
                            )}
                          </>
                        )
                      })()}
                </div>
              )}
            </motion.div>
          ))}
          {candados.length === 0 && <p className="t-mut text-sm">Sin candados registrados</p>}
        </motion.div>
        {limite !== 'todos' && candados.length > Number(limite) && (
          <p className="t-mut text-xs text-center mt-3">Mostrando {Number(limite)} de {candados.length} candados</p>
        )}
      </section>

      <MapaModal open={!!mapa} onClose={cerrarMapa}
        titulo={`Ubicación — ${mapa?.descripcion || mapa?.codigo_dispositivo || ''}`}
        lat={mapa?.latitud} lon={mapa?.longitud} en_linea={mapa?.en_linea}
        cargando={mapa?.cargando} />
      <HistorialModal open={!!historial} onClose={() => setHistorial(null)}
        titulo={`Últimas ubicaciones — ${historial?.candado?.descripcion || historial?.candado?.codigo_dispositivo || ''}`}
        puntos={historial?.puntos || []} cargando={historial?.cargando} />
      <ConfirmModal open={!!confirmar} title={confirmar?.title} mensaje={confirmar?.mensaje}
        confirmText={confirmar?.confirmText} danger={confirmar?.danger}
        onConfirm={confirmar?.onConfirm || (() => {})} onClose={() => setConfirmar(null)} />
    </div>
  )
}
