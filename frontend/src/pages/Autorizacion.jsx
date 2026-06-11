import { useEffect, useState } from 'react'
import api from '../api'

export default function Autorizacion() {
  const [operadores, setOperadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', telefono: '', email: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    cargarOperadores()
  }, [])

  async function cargarOperadores() {
    try {
      const res = await api.get('/autorizacion/operadores')
      setOperadores(res.data)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await api.post('/autorizacion/operadores', form)
      setMsg('Operador registrado correctamente')
      setForm({ nombre: '', telefono: '', email: '' })
      cargarOperadores()
    } catch {
      setMsg('Error al registrar operador')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-white">Autorización</h2>

      {/* Formulario nuevo operador */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md">
        <h3 className="text-white font-semibold mb-4">Registrar operador</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            placeholder="Nombre completo"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            required
          />
          <input
            placeholder="Teléfono"
            value={form.telefono}
            onChange={e => setForm({ ...form, telefono: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            placeholder="Email (opcional)"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {msg && <p className="text-sm text-blue-400">{msg}</p>}
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg py-2 transition">
            Registrar
          </button>
        </form>
      </div>

      {/* Lista de operadores */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Teléfono</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Registrado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Cargando...</td></tr>
            ) : operadores.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Sin operadores registrados</td></tr>
            ) : operadores.map(op => (
              <tr key={op.id} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-3 text-white">{op.nombre}</td>
                <td className="px-4 py-3 text-gray-400">{op.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${op.activo ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {op.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(op.creado_en).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
