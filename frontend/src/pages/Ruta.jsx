import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../api'

const btnCls = 'px-3 py-2 rounded-lg font-semibold text-sm transition'

const NIVEL_COLOR = { segura: '#22c55e', media: '#f59e0b', peligrosa: '#ef4444' }
const COLOR_DEFAULT = '#3b82f6'
const colorDe = (nivel) => NIVEL_COLOR[nivel] || COLOR_DEFAULT

// Ajusta el mapa para que se vea toda la ruta
function FitBounds({ puntos }) {
  const map = useMap()
  useEffect(() => {
    if (puntos.length > 0) {
      const latlngs = puntos.map(p => [Number(p.latitud), Number(p.longitud)])
      try { map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 16 }) } catch { /* noop */ }
    }
  }, [puntos.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Corrige el tamaño del mapa al montarse dentro de contenedores animados
function MapReady() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}

export default function Ruta() {
  const [candados, setCandados]   = useState([])
  const [candadoId, setCandadoId] = useState('')
  const [puntos, setPuntos]       = useState([])
  const [alarmas, setAlarmas]     = useState([])
  const [selA, setSelA]           = useState(null)   // indices del tramo seleccionado
  const [selB, setSelB]           = useState(null)
  const [cargando, setCargando]   = useState(false)
  const [msg, setMsg]             = useState('')
  const [rutaActiva, setRutaActiva] = useState(null)   // ruta en curso (GPS encendido)
  const [rutas, setRutas]           = useState([])     // rutas guardadas
  const [vista, setVista]           = useState('live') // 'live' o id de ruta guardada
  const [pidiendoNombre, setPidiendoNombre] = useState(false)
  const [nombreRuta, setNombreRuta] = useState('')
  const [nivelSeg, setNivelSeg]     = useState('')   // nivel de seguridad obligatorio al guardar
  const timer = useRef(null)

  // Cargar candados
  useEffect(() => {
    api.get('/candados/').then(res => {
      setCandados(res.data)
      if (res.data.length) setCandadoId(res.data[0].id)
    }).catch(() => {})
  }, [])

  // Cargar ruta + refresco automatico cada 60s (solo en vista "en vivo")
  useEffect(() => {
    if (!candadoId) return
    clearInterval(timer.current)
    if (vista === 'live') {
      cargarRuta()
      timer.current = setInterval(cargarRuta, 60000)
    } else {
      cargarRutaGuardada(vista)
    }
    cargarRutas()
    return () => clearInterval(timer.current)
  }, [candadoId, vista]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarRuta() {
    if (!candadoId) return
    try {
      const res = await api.get(`/candados/${candadoId}/ruta`)
      setPuntos(res.data.puntos || [])
      setAlarmas(res.data.alarmas || [])
      setRutaActiva(res.data.ruta_activa || null)
    } catch { /* noop */ }
  }

  async function cargarRutas() {
    if (!candadoId) return
    try {
      const res = await api.get(`/candados/${candadoId}/rutas`)
      setRutas(res.data || [])
    } catch { /* noop */ }
  }

  async function cargarRutaGuardada(rutaId) {
    try {
      const res = await api.get(`/candados/${candadoId}/rutas/${rutaId}`)
      setPuntos(res.data.puntos || [])
      setAlarmas(res.data.alarmas || [])
    } catch { setMsg('No se pudo cargar la ruta guardada') }
  }

  // ── Control de ruta (enciende/apaga el GPS del candado) ──
  async function iniciarRuta() {
    setCargando(true)
    try {
      await api.post(`/candados/${candadoId}/ruta/iniciar`)
      setMsg('Ruta iniciada. El candado empezará a agrupar los puntos en unos 20 segundos.')
      await cargarRuta(); await cargarRutas()
    } catch { setMsg('No se pudo iniciar la ruta') }
    finally { setCargando(false) }
  }

  // Detener ruta SIEMPRE guarda (ya no se puede descartar): hay que elegir el
  // nivel de seguridad del tramo recien recorrido antes de poder guardarlo.
  async function detenerRuta() {
    if (!nivelSeg) { setMsg('Selecciona el nivel de seguridad del tramo antes de guardar.'); return }
    setCargando(true)
    try {
      await api.post(`/candados/${candadoId}/ruta/detener`, {
        guardar: true, nombre: nombreRuta.trim() || null, nivel_seguridad: nivelSeg,
      })
      setMsg('Ruta guardada.')
      setPidiendoNombre(false); setNombreRuta(''); setNivelSeg('')
      await cargarRuta(); await cargarRutas()
    } catch { setMsg('No se pudo detener la ruta') }
    finally { setCargando(false) }
  }

  // Seleccion de tramo: 1er clic = inicio, 2do clic = fin, 3er clic = reinicia
  function clickPunto(idx) {
    if (selA === null || selB !== null) { setSelA(idx); setSelB(null); return }
    setSelB(idx)
  }
  const rango = (selA !== null && selB !== null)
    ? [Math.min(selA, selB), Math.max(selA, selB)]
    : (selA !== null ? [selA, selA] : null)
  const enRango = (idx) => rango && idx >= rango[0] && idx <= rango[1]

  async function etiquetar(nivel) {
    if (!rango || rango[0] === rango[1]) { setMsg('Toca 2 puntos distintos para elegir un tramo.'); return }
    const [lo, hi] = rango
    // Se etiquetan los puntos finales de cada segmento del tramo (del 2do al ultimo),
    // NO el primero: asi el color cubre exactamente el tramo elegido y no el segmento vecino.
    const ids = puntos.slice(lo + 1, hi + 1).map(p => p.id)
    try {
      await api.patch(`/candados/${candadoId}/ruta/etiqueta`, { nivel, ids })
      setMsg(nivel === 'limpiar' ? 'Tramo sin etiqueta' : `Tramo marcado: ${nivel}`)
      setSelA(null); setSelB(null)
      cargarRuta()
    } catch { setMsg('No se pudo etiquetar el tramo') }
  }

  async function limpiarRastro() {
    setCargando(true)
    try { await api.delete(`/candados/${candadoId}/ruta`); await cargarRuta(); setSelA(null); setSelB(null); setMsg('Rastro borrado') }
    catch { setMsg('No se pudo borrar el rastro') }
    finally { setCargando(false) }
  }

  // Segmentos de la polilinea, coloreados por la etiqueta del tramo
  const segmentos = []
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i], b = puntos[i + 1]
    segmentos.push({
      key: i,
      positions: [[Number(a.latitud), Number(a.longitud)], [Number(b.latitud), Number(b.longitud)]],
      // Cada segmento se colorea SOLO por su punto final (b). Asi un tramo no se
      // "desborda" al segmento vecino que sale del ultimo punto.
      color: colorDe(b.nivel_seguridad),
    })
  }
  const candadoSel = candados.find(c => c.id === candadoId)

  // Centro por defecto: Ecuador (Guayaquil). Si el candado tiene ultima
  // ubicacion conocida, se centra ahi; con puntos de ruta, en el primero.
  const ECUADOR_CENTER = [-2.170998, -79.922359]
  const center = puntos.length
    ? [Number(puntos[0].latitud), Number(puntos[0].longitud)]
    : (candadoSel?.latitud != null && candadoSel?.longitud != null
        ? [Number(candadoSel.latitud), Number(candadoSel.longitud)]
        : ECUADOR_CENTER)

  return (
    <motion.div className="flex flex-col gap-5 max-w-7xl mx-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold t-pri">Ruta del candado</h2>
          <p className="t-mut text-sm">Recorrido en tiempo real con tramos seguros / peligrosos.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={candadoId} onChange={e => { setCandadoId(Number(e.target.value)); setSelA(null); setSelB(null); setVista('live') }}
            className="fld rounded-lg px-3 py-2 text-sm">
            {candados.map(c => <option key={c.id} value={c.id}>{c.descripcion || c.codigo_dispositivo}</option>)}
          </select>
          <select value={vista} onChange={e => { setVista(e.target.value === 'live' ? 'live' : Number(e.target.value)); setSelA(null); setSelB(null) }}
            className="fld rounded-lg px-3 py-2 text-sm">
            <option value="live">En vivo</option>
            {rutas.filter(r => r.estado === 'guardada').map(r => (
              <option key={r.id} value={r.id}>
                {r.nombre || `Ruta #${r.id}`} · {new Date(r.iniciada_en).toLocaleDateString()}
              </option>
            ))}
          </select>
          {vista === 'live' ? (
            <span className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: '#ef4444' }} />
              En vivo · cada 60s
            </span>
          ) : (
            <span className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full surface-soft border bd t-mut">
              Ruta guardada
            </span>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Mapa */}
        <div className="rounded-2xl overflow-hidden border bd" style={{ height: '70vh', minHeight: 440 }}>
          <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapReady />
            <FitBounds puntos={puntos} />

            {segmentos.map(s => (
              <Polyline key={s.key} positions={s.positions} pathOptions={{ color: s.color, weight: 5, opacity: 0.9 }} />
            ))}

            {puntos.map((p, idx) => (
              <CircleMarker key={p.id} center={[Number(p.latitud), Number(p.longitud)]}
                radius={enRango(idx) ? 8 : 5}
                pathOptions={{
                  color: enRango(idx) ? '#ffffff' : colorDe(p.nivel_seguridad),
                  weight: enRango(idx) ? 3 : 1,
                  fillColor: colorDe(p.nivel_seguridad), fillOpacity: 1,
                }}
                eventHandlers={{ click: () => clickPunto(idx) }}>
                <Tooltip>{`#${idx + 1} · ${p.nivel_seguridad || 'sin etiqueta'} · ${new Date(p.capturado_en).toLocaleString()}`}</Tooltip>
              </CircleMarker>
            ))}

            {alarmas.map(a => (
              <CircleMarker key={'al' + a.id} center={[Number(a.latitud), Number(a.longitud)]}
                radius={9}
                pathOptions={{ color: '#7f1d1d', weight: 2, fillColor: '#ef4444', fillOpacity: 0.9 }}>
                <Tooltip>{`⚠ ${a.tipos_evento?.nombre || 'Alarma'} · ${new Date(a.ocurrido_en).toLocaleString()}`}</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Panel lateral */}
        <div className="flex flex-col gap-4">
          {/* Control de ruta (GPS del candado) */}
          <div className="surface-card rounded-2xl p-5">
            <h3 className="font-display t-pri font-semibold mb-1">Control de ruta</h3>
            <p className="t-mut text-xs mb-3">
              El candado reporta su posición todo el tiempo; iniciar una ruta
              agrupa esos puntos en un recorrido con nombre para revisarlo
              después. El candado aplica el cambio en <b>unos 20 segundos</b>.
            </p>
            {rutaActiva ? (
              <>
                <div className="rounded-lg px-3 py-2 mb-3 text-xs flex items-center gap-2"
                  style={{ background: 'rgba(34,197,94,.12)', color: '#22c55e' }}>
                  <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: '#22c55e' }} />
                  Ruta en curso desde {new Date(rutaActiva.iniciada_en).toLocaleTimeString()}
                </div>
                {pidiendoNombre ? (
                  <div className="flex flex-col gap-2">
                    <input value={nombreRuta} onChange={e => setNombreRuta(e.target.value)}
                      placeholder="Nombre de la ruta (opcional)"
                      className="fld rounded-lg px-3 py-2 text-sm" />
                    <label className="t-mut text-xs">Nivel de seguridad del tramo recorrido (obligatorio)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => setNivelSeg('segura')}
                        className={`${btnCls} text-xs`}
                        style={{ background: 'rgba(34,197,94,.15)', color: '#22c55e', opacity: nivelSeg === 'segura' ? 1 : 0.45 }}>🟢 Segura</button>
                      <button type="button" onClick={() => setNivelSeg('media')}
                        className={`${btnCls} text-xs`}
                        style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b', opacity: nivelSeg === 'media' ? 1 : 0.45 }}>🟡 Media</button>
                      <button type="button" onClick={() => setNivelSeg('peligrosa')}
                        className={`${btnCls} text-xs`}
                        style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444', opacity: nivelSeg === 'peligrosa' ? 1 : 0.45 }}>🔴 Peligrosa</button>
                    </div>
                    <button onClick={detenerRuta} disabled={cargando || !nivelSeg}
                      className={`${btnCls} btn-accent disabled:opacity-50`}>💾 Guardar ruta</button>
                    <button onClick={() => { setPidiendoNombre(false); setNivelSeg('') }}
                      className={`${btnCls} surface-soft border bd t-mut`}>Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setPidiendoNombre(true)} disabled={cargando || !candadoId}
                    className={`${btnCls} w-full disabled:opacity-50`}
                    style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444' }}>
                    ⏹ Detener ruta
                  </button>
                )}
              </>
            ) : (
              <button onClick={iniciarRuta} disabled={cargando || !candadoId}
                className={`${btnCls} w-full btn-accent disabled:opacity-50`}>
                ▶ Iniciar ruta
              </button>
            )}
          </div>

          {/* Etiquetar tramo */}
          <div className="surface-card rounded-2xl p-5">
            <h3 className="font-display t-pri font-semibold mb-1">Etiquetar tramo</h3>
            <p className="t-mut text-xs mb-3">
              Toca <b>2 puntos</b> en el mapa para elegir un tramo y marca su nivel de seguridad.
            </p>
            <div className="rounded-lg px-3 py-2 mb-3 text-xs" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
              {rango
                ? `Tramo: punto ${rango[0] + 1} → ${rango[1] + 1} (${rango[1] - rango[0] + 1} puntos)`
                : 'Ningún tramo seleccionado'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => etiquetar('segura')} className={btnCls} style={{ background: 'rgba(34,197,94,.15)', color: '#22c55e' }}>🟢 Segura</button>
              <button onClick={() => etiquetar('media')} className={btnCls} style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>🟡 Media</button>
              <button onClick={() => etiquetar('peligrosa')} className={btnCls} style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444' }}>🔴 Peligrosa</button>
              <button onClick={() => etiquetar('limpiar')} className={`${btnCls} surface-soft border bd t-pri`}>⚪ Quitar</button>
            </div>
            {msg && <p className="text-xs mt-3" style={{ color: 'var(--accent)' }}>{msg}</p>}
          </div>

          {/* Leyenda */}
          <div className="surface-card rounded-2xl p-5">
            <h3 className="font-display t-pri font-semibold mb-3">Leyenda</h3>
            <ul className="flex flex-col gap-2 text-sm t-pri">
              {[['#22c55e', 'Tramo seguro'], ['#f59e0b', 'Medianamente seguro'], ['#ef4444', 'Peligroso'], [COLOR_DEFAULT, 'Sin etiquetar']].map(([c, t]) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="w-5 h-1.5 rounded-full inline-block" style={{ background: c }} /> {t}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#ef4444', border: '2px solid #7f1d1d' }} /> Punto de alarma (automático)
              </li>
            </ul>
          </div>

          {/* Resumen + pruebas */}
          <div className="surface-card rounded-2xl p-5">
            <h3 className="font-display t-pri font-semibold mb-3">Recorrido</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)' }}>
                <div className="font-display text-2xl font-bold" style={{ color: 'var(--accent)' }}>{puntos.length}</div>
                <div className="t-mut text-xs">puntos</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)' }}>
                <div className="font-display text-2xl font-bold" style={{ color: '#ef4444' }}>{alarmas.length}</div>
                <div className="t-mut text-xs">alarmas</div>
              </div>
            </div>
            <button onClick={limpiarRastro} disabled={cargando || !candadoId} className={`${btnCls} w-full surface-soft border bd t-pri disabled:opacity-50`}>Limpiar rastro</button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
