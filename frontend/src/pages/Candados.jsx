import { useEffect, useState } from 'react'
import api from '../api'
import { ConfirmModal, MapaModal } from '../components/Modal'

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 t-pri placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full'
const btnCls   = 'px-4 py-2 rounded-lg font-semibold text-sm transition'

const estadoColor = {
  cerrado:     'bg-green-900 text-green-300',
  abierto:     'bg-yellow-900 text-yellow-300',
  alarma:      'bg-red-900 text-red-300',
  desconocido: 'bg-gray-800 text-gray-400',
}

export default function Candados() {
  const [candados, setCandados]       = useState([])
  const [form, setForm]               = useState({ codigo_dispositivo: '', descripcion: '', sim_numero: '' })
  const [editId, setEditId]           = useState(null)
  const [msg, setMsg]                 = useState('')
  const [expandido, setExpandido]     = useState(null)
  const [alertas, setAlertas]         = useState({})
  const [mapa, setMapa]               = useState(null)   // candado a localizar
  const [confirmar, setConfirmar]     = useState(null)   // { mensaje, onConfirm, ... }

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const res = await api.get('/candados/')
    setCandados(res.data)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editId) {
        await api.put(`/candados/${editId}`, form)
        setMsg('Candado actualizado')
      } else {
        await api.post('/candados/', form)
        setMsg('Candado registrado')
      }
      setForm({ codigo_dispositivo: '', descripcion: '', sim_numero: '' })
      setEditId(null)
      cargar()
    } catch {
      setMsg('Error al guardar')
    }
  }

  function eliminar(id) {
    setConfirmar({
      title: 'Eliminar candado',
      mensaje: '¿Seguro que deseas eliminar este candado?\n\nSe borrará del sistema de forma permanente.',
      confirmText: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        await api.delete(`/candados/${id}`)
        cargar()
      },
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
      title: 'Atender alerta',
      mensaje: '¿Marcar esta alerta como atendida?\n\nQuedará registrada como revisada con la fecha y hora actual.',
      confirmText: 'Atender',
      danger: false,
      onConfirm: async () => {
        try {
          await api.patch(`/candados/alarmas/${alarmaId}/atender`)
          const res = await api.get(`/candados/${candadoId}/alertas`)
          setAlertas(prev => ({ ...prev, [candadoId]: res.data }))
          cargar()
        } catch {
          setConfirmar({
            title: 'Error', mensaje: 'No se pudo atender la alerta. Intenta de nuevo.',
            confirmText: 'Entendido', onConfirm: () => {},
          })
        }
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold t-pri">🔒 Candados</h2>

      {/* Formulario */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg">
        <h3 className="t-pri font-semibold mb-4">{editId ? 'Editar candado' : 'Registrar candado'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input placeholder="Código dispositivo (ej: ESP32-001)" value={form.codigo_dispositivo} onChange={e => setForm({ ...form, codigo_dispositivo: e.target.value })} className={inputCls} required />
          <input placeholder="Descripción (ej: Portón Principal)" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputCls} />
          <input placeholder="Número SIM" value={form.sim_numero} onChange={e => setForm({ ...form, sim_numero: e.target.value })} className={inputCls} />
          {msg && <p className="text-sm text-blue-400">{msg}</p>}
          <div className="flex gap-2">
            <button type="submit" className={`${btnCls} flex-1 btn-accent`}>
              {editId ? 'Guardar' : 'Registrar'}
            </button>
            {editId && (
              <button type="button" onClick={() => { setEditId(null); setForm({ codigo_dispositivo: '', descripcion: '', sim_numero: '' }); setMsg('') }} className={`${btnCls} bg-gray-700 hover:bg-gray-600 t-pri`}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Lista de candados */}
      <div className="flex flex-col gap-4">
        {candados.map(c => (
          <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Cabecera del candado */}
            <div className="p-4 flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="t-pri font-semibold">{c.descripcion || c.codigo_dispositivo}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {c.codigo_dispositivo}
                  {c.sim_numero ? ` · SIM: ${c.sim_numero}` : ''}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  Última conexión: {c.ultima_conexion ? new Date(c.ultima_conexion).toLocaleString() : 'Nunca'}
                </p>
                {c.latitud != null && c.longitud != null && (
                  <a
                    href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs mt-1 inline-flex items-center gap-1"
                  >
                    📍 {Number(c.latitud).toFixed(5)}, {Number(c.longitud).toFixed(5)} — ver en mapa
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Estado */}
                <span className={`text-xs px-2 py-1 rounded-full capitalize ${estadoColor[c.estado] ?? estadoColor.desconocido}`}>
                  {c.estado}
                </span>
                {/* Batería */}
                {c.nivel_bateria !== null && c.nivel_bateria !== undefined && (
                  <span className={`text-xs px-2 py-1 rounded-full ${c.nivel_bateria < 20 ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400'}`}>
                    🔋 {c.nivel_bateria}%
                  </span>
                )}
                {/* Hardware */}
                {c.estado_solenoide && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">Solenoide: {c.estado_solenoide}</span>}
                {c.estado_rfid && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">RFID: {c.estado_rfid}</span>}
                {c.estado_gsm && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">GSM: {c.estado_gsm}</span>}
              </div>

              {/* Botones */}
              <div className="flex gap-2">
                <button onClick={() => { setEditId(c.id); setForm({ codigo_dispositivo: c.codigo_dispositivo, descripcion: c.descripcion ?? '', sim_numero: c.sim_numero ?? '' }); setMsg('') }} className={`${btnCls} bg-gray-700 hover:bg-gray-600 t-pri text-xs`}>
                  Editar
                </button>
                <button onClick={() => setMapa(c)} className={`${btnCls} bg-blue-900/50 hover:bg-blue-900 text-blue-300 text-xs`}>
                  📍 Localizar
                </button>
                <button onClick={() => verAlertas(c.id)} className={`${btnCls} text-xs ${expandido === c.id ? 'bg-red-800 text-red-200' : 'bg-red-900/50 hover:bg-red-900 text-red-300'}`}>
                  {expandido === c.id ? 'Ocultar alertas ▲' : '🔔 Ver alertas ▼'}
                </button>
                <button onClick={() => eliminar(c.id)} className={`${btnCls} bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 text-xs`}>
                  Eliminar
                </button>
              </div>
            </div>

            {/* Panel de alertas expandible */}
            {expandido === c.id && (
              <div className="border-t border-gray-800 bg-gray-950 p-4">
                <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Alertas de este candado</h4>
                {!alertas[c.id] ? (
                  <p className="text-gray-500 text-sm">Cargando...</p>
                ) : alertas[c.id].length === 0 ? (
                  <p className="text-gray-500 text-sm">Sin alertas registradas</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {alertas[c.id].map(a => (
                      <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border ${a.atendida ? 'border-gray-700 bg-gray-900' : 'border-red-800 bg-red-950'}`}>
                        <div>
                          <p className={`text-sm font-medium ${a.atendida ? 'text-gray-400' : 'text-red-300'}`}>
                            {a.eventos?.tipos_evento?.nombre}
                          </p>
                          <p className="text-gray-600 text-xs">
                            {new Date(a.eventos?.ocurrido_en).toLocaleString()}
                            {a.atendida && a.atendida_en ? ` · Atendida: ${new Date(a.atendida_en).toLocaleString()}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${a.nivel === 3 ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'}`}>
                            Nivel {a.nivel}
                          </span>
                          {!a.atendida && (
                            <button onClick={() => atender(a.id, c.id)} className={`${btnCls} bg-green-900 hover:bg-green-800 text-green-300 text-xs`}>
                              Atender
                            </button>
                          )}
                          {a.atendida && <span className="text-xs text-gray-500">✓ Atendida</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {candados.length === 0 && <p className="text-gray-500 text-sm">Sin candados registrados</p>}
      </div>

      {/* Modal de ubicación */}
      <MapaModal
        open={!!mapa}
        onClose={() => setMapa(null)}
        titulo={`Ubicación — ${mapa?.descripcion || mapa?.codigo_dispositivo || ''}`}
        lat={mapa?.latitud}
        lon={mapa?.longitud}
      />

      {/* Modal de confirmación */}
      <ConfirmModal
        open={!!confirmar}
        title={confirmar?.title}
        mensaje={confirmar?.mensaje}
        confirmText={confirmar?.confirmText}
        danger={confirmar?.danger}
        onConfirm={confirmar?.onConfirm || (() => {})}
        onClose={() => setConfirmar(null)}
      />
    </div>
  )
}
