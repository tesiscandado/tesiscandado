import { useEffect, useState } from 'react'
import api from '../api'
import { ConfirmModal } from '../components/Modal'

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 t-pri placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full'
const btnCls   = 'px-4 py-2 rounded-lg font-semibold text-sm transition'

const estadoToken = {
  activo:    'bg-green-900 text-green-300',
  pendiente: 'bg-yellow-900 text-yellow-300',
  programado:'bg-blue-900 text-blue-300',
  expirado:  'bg-gray-800 text-gray-400',
}

export default function Autorizaciones() {
  const [tab, setTab]           = useState('fisico')
  const [tokens, setTokens]     = useState([])
  const [candados, setCandados] = useState([])
  const [operadores, setOperadores] = useState([])
  const [msg, setMsg]           = useState('')
  const [confirmar, setConfirmar] = useState(null)

  // Forms
  const [formFisico, setFormFisico] = useState({ candado_id: '', etiqueta: '', token: '' })
  const [formApp, setFormApp]       = useState({ candado_id: '', operador_id: '', modo: 'inmediato', valido_desde: '', valido_hasta: '' })

  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  function generarToken() {
    let t = ''
    for (let i = 0; i < 7; i++) t += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
    setFormFisico(f => ({ ...f, token: t }))
  }

  useEffect(() => {
    cargarTokens()
    api.get('/candados/').then(r => setCandados(r.data))
    api.get('/autorizacion/operadores').then(r => setOperadores(r.data))
  }, [])

  async function cargarTokens() {
    const res = await api.get('/autorizacion/tokens')
    setTokens(res.data)
  }

  async function handleFisico(e) {
    e.preventDefault()
    try {
      await api.post('/autorizacion/tokens/fisico', {
        candado_id: parseInt(formFisico.candado_id),
        etiqueta:   formFisico.etiqueta,
        token:      formFisico.token,
      })
      setMsg('Token físico registrado')
      setFormFisico({ candado_id: '', etiqueta: '', token: '' })
      cargarTokens()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Error al registrar')
    }
  }

  async function handleApp(e) {
    e.preventDefault()
    try {
      const payload = {
        candado_id:  parseInt(formApp.candado_id),
        operador_id: parseInt(formApp.operador_id),
        modo:        formApp.modo,
      }
      if (formApp.modo === 'programado') {
        if (!formApp.valido_desde || !formApp.valido_hasta) {
          setMsg('Define la hora de inicio y de fin')
          return
        }
        // Convertir datetime-local a ISO UTC
        payload.valido_desde = new Date(formApp.valido_desde).toISOString()
        payload.valido_hasta = new Date(formApp.valido_hasta).toISOString()
      }
      await api.post('/autorizacion/tokens/app', payload)
      setMsg(formApp.modo === 'programado'
        ? 'Token programado. Se generará al llegar la hora de inicio.'
        : 'Token generado (válido 2 minutos). Operador debe grabarlo ya.')
      setFormApp({ candado_id: '', operador_id: '', modo: 'inmediato', valido_desde: '', valido_hasta: '' })
      cargarTokens()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Error al generar')
    }
  }

  async function cambiarEstado(id, estado) {
    await api.patch(`/autorizacion/tokens/${id}/estado?estado=${estado}`)
    cargarTokens()
  }

  function eliminarToken(id) {
    setConfirmar({
      title: 'Eliminar token',
      mensaje: '¿Seguro que deseas eliminar este token?',
      onConfirm: async () => {
        await api.delete(`/autorizacion/tokens/${id}`)
        cargarTokens()
      },
    })
  }

  const tabCls = (t) => `${btnCls} ${tab === t ? 'btn-accent' : 'bg-gray-800 text-gray-400 hover-pri'}`

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold t-pri">🔑 Autorizaciones y Tokens</h2>

      {/* Tabs para tipo de token */}
      <div className="flex gap-2">
        <button className={tabCls('fisico')} onClick={() => { setTab('fisico'); setMsg('') }}>
          📟 Tag RFID físico
        </button>
        <button className={tabCls('app')} onClick={() => { setTab('app'); setMsg('') }}>
          📱 App NFC
        </button>
      </div>

      {/* Form token físico */}
      {tab === 'fisico' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg">
          <h3 className="t-pri font-semibold mb-1">Registrar token de tarjeta física</h3>
          <p className="text-gray-500 text-xs mb-4">El token es el texto de 7 caracteres guardado en el bloque 4 del tag RFID</p>
          <form onSubmit={handleFisico} className="flex flex-col gap-3">
            <select value={formFisico.candado_id} onChange={e => setFormFisico({ ...formFisico, candado_id: e.target.value })} className={inputCls} required>
              <option value="">Seleccionar candado</option>
              {candados.map(c => <option key={c.id} value={c.id}>{c.descripcion || c.codigo_dispositivo}</option>)}
            </select>
            <input placeholder="Etiqueta (ej: Tarjeta Portón Principal)" value={formFisico.etiqueta} onChange={e => setFormFisico({ ...formFisico, etiqueta: e.target.value })} className={inputCls} required />
            <div className="flex gap-2">
              <input
                placeholder="Token (7 caracteres, ej: ABC1234)"
                value={formFisico.token}
                onChange={e => setFormFisico({ ...formFisico, token: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) })}
                className={`${inputCls} font-mono tracking-widest`}
                maxLength={7}
                required
              />
              <button type="button" onClick={generarToken} className={`${btnCls} bg-gray-700 hover:bg-gray-600 t-pri whitespace-nowrap`}>🎲 Generar</button>
            </div>
            {msg && <p className="text-sm text-blue-400">{msg}</p>}
            <button type="submit" className={`${btnCls} btn-accent`}>Registrar token físico</button>
          </form>
        </div>
      )}

      {/* Form token app */}
      {tab === 'app' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg">
          <h3 className="t-pri font-semibold mb-1">Generar token para operador</h3>
          <p className="text-gray-500 text-xs mb-4">Se genera un token de 7 caracteres y se asigna al operador. Desde su app, el operador lo graba en una tarjeta NFC en blanco para usarla en el lector.</p>
          <form onSubmit={handleApp} className="flex flex-col gap-3">
            <select value={formApp.candado_id} onChange={e => setFormApp({ ...formApp, candado_id: e.target.value })} className={inputCls} required>
              <option value="">Seleccionar candado</option>
              {candados.map(c => <option key={c.id} value={c.id}>{c.descripcion || c.codigo_dispositivo}</option>)}
            </select>
            <select value={formApp.operador_id} onChange={e => setFormApp({ ...formApp, operador_id: e.target.value })} className={inputCls} required>
              <option value="">Seleccionar operador</option>
              {operadores.map(op => <option key={op.id} value={op.id}>{op.nombre} ({op.usuario})</option>)}
            </select>

            {/* Modo de validez */}
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormApp({ ...formApp, modo: 'inmediato' })}
                className={`${btnCls} flex-1 ${formApp.modo === 'inmediato' ? 'btn-accent' : 'bg-gray-800 text-gray-400'}`}>
                ⚡ Inmediato (2 min)
              </button>
              <button type="button" onClick={() => setFormApp({ ...formApp, modo: 'programado' })}
                className={`${btnCls} flex-1 ${formApp.modo === 'programado' ? 'btn-accent' : 'bg-gray-800 text-gray-400'}`}>
                🕒 Programado
              </button>
            </div>

            {formApp.modo === 'programado' && (
              <div className="flex flex-col gap-2">
                <label className="text-gray-400 text-xs">Inicio de validez (se genera el token a esta hora)</label>
                <input type="datetime-local" value={formApp.valido_desde}
                  onChange={e => setFormApp({ ...formApp, valido_desde: e.target.value })} className={inputCls} required />
                <label className="text-gray-400 text-xs">Fin de validez</label>
                <input type="datetime-local" value={formApp.valido_hasta}
                  onChange={e => setFormApp({ ...formApp, valido_hasta: e.target.value })} className={inputCls} required />
              </div>
            )}

            {msg && <p className="text-sm text-blue-400">{msg}</p>}
            <button type="submit" className={`${btnCls} btn-accent`}>
              {formApp.modo === 'programado' ? 'Programar token' : 'Generar token'}
            </button>
          </form>
        </div>
      )}

      {/* Lista de tokens */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="t-pri font-semibold text-sm">Tokens registrados</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Etiqueta / Operador</th>
              <th className="text-left px-4 py-3">Token</th>
              <th className="text-left px-4 py-3">Candado</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map(t => (
              <tr key={t.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${t.tipo === 'rfid_fisico' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}`}>
                    {t.tipo === 'rfid_fisico' ? '📟 Físico' : '📱 App'}
                  </span>
                </td>
                <td className="px-4 py-3 t-pri">
                  {t.tipo === 'rfid_fisico' ? t.etiqueta : t.usuarios?.nombre ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-green-400 text-xs">
                  {t.token
                    ? t.token
                    : <span className="text-blue-400">⏳ {t.valido_desde ? new Date(t.valido_desde).toLocaleString() : 'programado'}</span>}
                </td>
                <td className="px-4 py-3 text-gray-400">{t.candados?.descripcion}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${estadoToken[t.estado] ?? estadoToken.pendiente}`}>
                    {t.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {t.estado !== 'activo' && (
                      <button onClick={() => cambiarEstado(t.id, 'activo')} className="text-xs text-green-400 hover:text-green-300">Activar</button>
                    )}
                    {t.estado === 'activo' && (
                      <button onClick={() => cambiarEstado(t.id, 'expirado')} className="text-xs text-yellow-400 hover:text-yellow-300">Expirar</button>
                    )}
                    <button onClick={() => eliminarToken(t.id)} className="text-xs text-red-400 hover:text-red-300">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {tokens.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Sin tokens registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!confirmar}
        title={confirmar?.title}
        mensaje={confirmar?.mensaje}
        confirmText="Eliminar"
        danger
        onConfirm={confirmar?.onConfirm || (() => {})}
        onClose={() => setConfirmar(null)}
      />
    </div>
  )
}
