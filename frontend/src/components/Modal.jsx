// Modal genérico con estilo propio (reemplaza alert/confirm del navegador)
import { useState } from 'react'

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
            Puede tardar hasta 2–3 minutos.
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

// Modal con el historial de últimas ubicaciones: LISTA (fecha + coordenadas)
// y, al elegir una, un mini-mapa con el punto de esas coordenadas.
export function HistorialModal({ open, onClose, titulo, puntos = [], cargando = false }) {
  const [sel, setSel] = useState(null)   // punto seleccionado para ver en el mapa
  const [pag, setPag] = useState(0)      // pagina actual de la lista

  const POR_PAGINA = 6
  const totalPag = Math.ceil(puntos.length / POR_PAGINA)
  const pagAct = Math.min(pag, Math.max(0, totalPag - 1))
  const visibles = puntos.slice(pagAct * POR_PAGINA, pagAct * POR_PAGINA + POR_PAGINA)

  // Reiniciar la selección y la página al cerrar
  const cerrar = () => { setSel(null); setPag(0); onClose() }

  const delta = 0.004
  const mapSrc = sel
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${(Number(sel.longitud) - delta).toFixed(6)},${(Number(sel.latitud) - delta).toFixed(6)},${(Number(sel.longitud) + delta).toFixed(6)},${(Number(sel.latitud) + delta).toFixed(6)}&layer=mapnik&marker=${sel.latitud},${sel.longitud}`
    : ''

  return (
    <Modal open={open} onClose={cerrar} title={titulo} maxWidth="max-w-2xl">
      {cargando ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3 animate-pulse">🗺️</p>
          <p className="t-pri font-medium">Cargando historial de ubicaciones…</p>
        </div>
      ) : puntos.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📭</p>
          <p className="t-pri font-medium">Sin ubicaciones registradas</p>
          <p className="t-mut text-sm mt-1">
            Este candado todavía no ha reportado posiciones GPS.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto pr-1">
          {/* Mini-mapa del punto seleccionado */}
          {sel && (
            <div className="flex flex-col gap-1.5">
              <div className="rounded-xl overflow-hidden border bd">
                <iframe title="mapa-punto" width="100%" height="240" style={{ border: 0 }} src={mapSrc} />
              </div>
              <div className="flex items-center justify-between">
                <p className="t-mut text-xs font-mono">
                  📍 {Number(sel.latitud).toFixed(6)}, {Number(sel.longitud).toFixed(6)}
                </p>
                <a href={`https://www.google.com/maps?q=${sel.latitud},${sel.longitud}`}
                  target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs">
                  Abrir en Google Maps ↗
                </a>
              </div>
            </div>
          )}

          {/* Lista de ubicaciones (más reciente primero) */}
          <div className="flex flex-col gap-2">
            {visibles.map((p, i) => {
              const idx = pagAct * POR_PAGINA + i   // índice global
              return (
                <div key={p.id ?? idx}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border bd surface-soft">
                  <div className="min-w-0">
                    <p className="t-pri text-sm font-medium">
                      {idx === 0 ? '📍 Más reciente' : `Ubicación #${puntos.length - idx}`}
                    </p>
                    <p className="t-mut text-xs">
                      {p.capturado_en ? new Date(p.capturado_en).toLocaleString() : 'Sin fecha'}
                    </p>
                    <p className="t-mut text-xs font-mono truncate">
                      {Number(p.latitud).toFixed(6)}, {Number(p.longitud).toFixed(6)}
                    </p>
                  </div>
                  <button onClick={() => setSel(p)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={sel === p
                      ? { background: 'var(--accent)', color: '#fff' }
                      : { background: 'rgba(59,130,246,.15)', color: '#60a5fa' }}>
                    🗺️ Ver mapa
                  </button>
                </div>
              )
            })}
          </div>

          {/* Paginación */}
          {totalPag > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPag(p => Math.max(0, p - 1))} disabled={pagAct === 0}
                className="px-3 py-1.5 rounded-lg text-xs surface-soft border bd t-pri disabled:opacity-40">← Anterior</button>
              {Array.from({ length: totalPag }, (_, n) => (
                <button key={n} onClick={() => setPag(n)}
                  className="w-8 h-8 rounded-lg text-xs font-semibold border bd"
                  style={n === pagAct
                    ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                    : { background: 'var(--card)', color: 'var(--muted)' }}>{n + 1}</button>
              ))}
              <button onClick={() => setPag(p => Math.min(totalPag - 1, p + 1))} disabled={pagAct === totalPag - 1}
                className="px-3 py-1.5 rounded-lg text-xs surface-soft border bd t-pri disabled:opacity-40">Siguiente →</button>
            </div>
          )}
          <p className="t-mut text-xs text-center">{puntos.length} ubicaciones guardadas (una cada ~5 min mientras el candado está activo)</p>
        </div>
      )}
    </Modal>
  )
}
