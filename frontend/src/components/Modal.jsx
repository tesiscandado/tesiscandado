// Modal genérico con estilo propio (reemplaza alert/confirm del navegador)
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className={`surface-card rounded-2xl w-full ${maxWidth} shadow-2xl overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b bd">
          <h3 className="font-semibold t-pri">{title}</h3>
          <button onClick={onClose} className="t-mut hover:opacity-70 text-xl leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// Modal de confirmación (sustituye a window.confirm)
export function ConfirmModal({ open, title = 'Confirmar', mensaje, onConfirm, onClose, confirmText = 'Confirmar', danger = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="t-mut text-sm whitespace-pre-line mb-5">{mensaje}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-semibold surface-soft border bd t-pri hover:opacity-80"
        >
          Cancelar
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${danger ? 'btn-danger' : 'btn-accent'}`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}

// Modal con mapa (OpenStreetMap, sin API key) y marcador en las coordenadas
export function MapaModal({ open, onClose, titulo, lat, lon, en_linea = true, cargando = false }) {
  const tiene = lat != null && lon != null
  const delta = 0.005
  const bbox = tiene
    ? `${(lon - delta).toFixed(6)},${(lat - delta).toFixed(6)},${(lon + delta).toFixed(6)},${(lat + delta).toFixed(6)}`
    : ''
  const src = tiene
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
    : ''

  return (
    <Modal open={open} onClose={onClose} title={titulo} maxWidth="max-w-2xl">
      {cargando ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3 animate-pulse">📡</p>
          <p className="t-pri font-medium">Solicitando ubicación al candado…</p>
          <p className="t-mut text-sm mt-1">
            El candado enciende el GPS solo un momento para responder.
            Puede tardar hasta 4–5 minutos.
          </p>
        </div>
      ) : tiene && en_linea ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl overflow-hidden border bd">
            <iframe
              title="mapa"
              width="100%"
              height="340"
              style={{ border: 0 }}
              src={src}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="t-mut text-xs font-mono">
              📍 {Number(lat).toFixed(6)}, {Number(lon).toFixed(6)}
            </p>
            <a
              href={`https://www.google.com/maps?q=${lat},${lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              Abrir en Google Maps ↗
            </a>
          </div>
        </div>
      ) : !en_linea ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">🔴</p>
          <p className="t-pri font-medium">Candado desconectado</p>
          <p className="t-mut text-sm mt-1">
            No se pudo obtener la ubicación. El dispositivo no está respondiendo.
          </p>
        </div>
      ) : (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📡</p>
          <p className="t-pri font-medium">Sin ubicación todavía</p>
          <p className="t-mut text-sm mt-1">
            El candado aún no ha reportado coordenadas GPS desde el dispositivo.
          </p>
        </div>
      )}
    </Modal>
  )
}

// Ajusta el mapa para que se vean todos los puntos
function FitPuntos({ puntos }) {
  const map = useMap()
  useEffect(() => {
    if (puntos.length > 0) {
      const latlngs = puntos.map(p => [Number(p.latitud), Number(p.longitud)])
      try { map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 16 }) } catch { /* noop */ }
    }
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [puntos.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Modal con el historial de últimas ubicaciones (rastro GPS reciente)
export function HistorialModal({ open, onClose, titulo, puntos = [], cargando = false }) {
  // Los puntos vienen del más reciente al más antiguo; para dibujar el trazo
  // en orden cronológico los invertimos (viejo -> nuevo).
  const orden = [...puntos].reverse()
  const linea = orden.map(p => [Number(p.latitud), Number(p.longitud)])
  const centro = linea.length ? linea[linea.length - 1] : [-2.170998, -79.922359]

  return (
    <Modal open={open} onClose={onClose} title={titulo} maxWidth="max-w-3xl">
      {cargando ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3 animate-pulse">🗺️</p>
          <p className="t-pri font-medium">Cargando historial de ubicaciones…</p>
        </div>
      ) : orden.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📭</p>
          <p className="t-pri font-medium">Sin ubicaciones registradas</p>
          <p className="t-mut text-sm mt-1">
            Este candado todavía no ha reportado posiciones GPS.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl overflow-hidden border bd" style={{ height: 380 }}>
            <MapContainer center={centro} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
              <TileLayer attribution="&copy; OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitPuntos puntos={orden} />
              {linea.length > 1 && (
                <Polyline positions={linea} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }} />
              )}
              {orden.map((p, idx) => {
                const esUltimo = idx === orden.length - 1   // más reciente
                return (
                  <CircleMarker key={p.id ?? idx} center={[Number(p.latitud), Number(p.longitud)]}
                    radius={esUltimo ? 9 : 5}
                    pathOptions={{
                      color: esUltimo ? '#22c55e' : '#3b82f6',
                      weight: esUltimo ? 3 : 1,
                      fillColor: esUltimo ? '#22c55e' : '#3b82f6', fillOpacity: 1,
                    }}>
                    <Tooltip>
                      {`${esUltimo ? '📍 Más reciente' : `#${orden.length - idx}`} · ${p.capturado_en ? new Date(p.capturado_en).toLocaleString() : ''}`}
                    </Tooltip>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>
          <div className="flex items-center justify-between text-xs t-mut">
            <span>🟢 Más reciente · 🔵 Anteriores ({orden.length} ubicaciones)</span>
            {linea.length > 0 && (
              <a href={`https://www.google.com/maps?q=${linea[linea.length - 1][0]},${linea[linea.length - 1][1]}`}
                target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                Abrir última en Google Maps ↗
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
