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
  const timer = useRef(null)

  // Cargar candados
  useEffect(() => {
    api.get('/candados/').then(res => {
      setCandados(res.data)
      if (res.data.length) setCandadoId(res.data[0].id)
    }).catch(() => {})
  }, [])

  // Cargar ruta + refresco automatico cada 15s
  useEffect(() => {
    if (!candadoId) return
    cargarRuta()
    timer.current = setInterval(cargarRuta, 15000)
    return () => clearInterval(timer.current)
  }, [candadoId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarRuta() {
    if (!candadoId) return
    try {
      const res = await api.get(`/candados/${candadoId}/ruta`)
      setPuntos(res.data.puntos || [])
      setAlarmas(res.data.alarmas || [])
    } catch { /* noop */ }
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

  async function sembrarDemo() {
    setCargando(true)
    try { await api.post(`/candados/${candadoId}/ruta/demo`); await cargarRuta(); setMsg('Ruta de prueba sembrada') }
    catch { setMsg('No se pudo sembrar la ruta demo') }
    finally { setCargando(false) }
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
  const center = puntos.length ? [Number(puntos[0].latitud), Number(puntos[0].longitud)] : [4.711, -74.072]

  const candadoSel = candados.find(c => c.id === candadoId)

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
          <select value={candadoId} onChange={e => { setCandadoId(Number(e.target.value)); setSelA(null); setSelB(null) }}
            className="fld rounded-lg px-3 py-2 text-sm">
            {candados.map(c => <option key={c.id} value={c.id}>{c.descripcion || c.codigo_dispositivo}</option>)}
          </select>
          <span className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: '#ef4444' }} />
            En vivo · cada 15s
          </span>
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
            <p className="t-mut text-xs mb-2">Herramientas de prueba (mientras el prototipo no reporta GPS):</p>
            <div className="flex gap-2">
              <button onClick={sembrarDemo} disabled={cargando || !candadoId} className={`${btnCls} flex-1 btn-accent disabled:opacity-50`}>Sembrar ruta demo</button>
              <button onClick={limpiarRastro} disabled={cargando || !candadoId} className={`${btnCls} surface-soft border bd t-pri disabled:opacity-50`}>Limpiar</button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
