import { useEffect, useState } from 'react'
import api from '../api'
import { ConfirmModal } from '../components/Modal'

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full'
const btnCls   = 'px-4 py-2 rounded-lg font-semibold text-sm transition'

export default function Operadores() {
  const [operadores, setOperadores] = useState([])
  const [form, setForm] = useState({ usuario: '', password: '', nombre: '', telefono: '', cargo: '' })
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState('')
  const [confirmar, setConfirmar] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const res = await api.get('/autorizacion/operadores')
    setOperadores(res.data)
  }

  function limpiar() {
    setForm({ usuario: '', password: '', nombre: '', telefono: '', cargo: '' })
    setEditId(null)
    setMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editId) {
        await api.put(`/autorizacion/operadores/${editId}`, {
          nombre: form.nombre, telefono: form.telefono, cargo: form.cargo
        })
        setMsg('Operador actualizado')
      } else {
        await api.post('/autorizacion/operadores', form)
        setMsg('Operador registrado')
      }
      limpiar()
      cargar()
    } catch (err) {
      setMsg(err.response?.data?.detail || 'Error al guardar')
    }
  }

  async function toggleEstado(op) {
    await api.patch(`/autorizacion/operadores/${op.id}/estado?activo=${!op.activo}`)
    cargar()
  }

  function eliminar(id) {
    setConfirmar({
      title: 'Eliminar operador',
      mensaje: '¿Seguro que deseas eliminar este operador?\n\nSe borrará del sistema de forma permanente.',
      onConfirm: async () => {
        await api.delete(`/autorizacion/operadores/${id}`)
        cargar()
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-white">👷 Operadores</h2>

      {/* Formulario */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg">
        <h3 className="text-white font-semibold mb-4">{editId ? 'Editar operador' : 'Registrar operador'}</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {!editId && (
            <>
              <input placeholder="Usuario (para login en app)" value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })} className={inputCls} required />
              <input type="password" placeholder="Contraseña" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={inputCls} required />
            </>
          )}
          <input placeholder="Nombre completo" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} required />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Cargo" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} className={inputCls} />
            <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputCls} />
          </div>
          {msg && <p className="text-sm text-blue-400">{msg}</p>}
          <div className="flex gap-2">
            <button type="submit" className={`${btnCls} flex-1 bg-blue-600 hover:bg-blue-500 text-white`}>
              {editId ? 'Guardar cambios' : 'Registrar'}
            </button>
            {editId && (
              <button type="button" onClick={limpiar} className={`${btnCls} bg-gray-700 hover:bg-gray-600 text-white`}>Cancelar</button>
            )}
          </div>
        </form>
      </div>

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {operadores.map(op => (
          <div key={op.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-white font-semibold">{op.nombre}</p>
              <p className="text-gray-500 text-xs">
                @{op.usuario}
                {op.cargo ? ` · ${op.cargo}` : ''}
                {op.telefono ? ` · ${op.telefono}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-1 rounded-full ${op.activo ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                {op.activo ? 'Activo' : 'Inactivo'}
              </span>
              <button onClick={() => { setEditId(op.id); setForm({ usuario: '', password: '', nombre: op.nombre, telefono: op.telefono ?? '', cargo: op.cargo ?? '' }) }} className={`${btnCls} bg-gray-700 hover:bg-gray-600 text-white text-xs`}>
                Editar
              </button>
              <button onClick={() => toggleEstado(op)} className={`${btnCls} text-xs ${op.activo ? 'bg-yellow-900 hover:bg-yellow-800 text-yellow-300' : 'bg-green-900 hover:bg-green-800 text-green-300'}`}>
                {op.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => eliminar(op.id)} className={`${btnCls} bg-red-900 hover:bg-red-800 text-red-300 text-xs`}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {operadores.length === 0 && <p className="text-gray-500 text-sm">Sin operadores registrados</p>}
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
