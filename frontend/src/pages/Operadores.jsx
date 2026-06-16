import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../api'
import { ConfirmModal } from '../components/Modal'

const btnCls = 'px-4 py-2 rounded-lg font-semibold text-sm transition'

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }

function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

export default function Operadores() {
  const [operadores, setOperadores] = useState([])
  const [form, setForm] = useState({ usuario: '', password: '', nombre: '', telefono: '', cargo: '' })
  const [editId, setEditId] = useState(null)
  const [msg, setMsg] = useState('')
  const [confirmar, setConfirmar] = useState(null)
  const [limite, setLimite] = useState(5)
  const [q, setQ] = useState('')

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
        await api.put(`/autorizacion/operadores/${editId}`, { nombre: form.nombre, telefono: form.telefono, cargo: form.cargo })
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
      onConfirm: async () => { await api.delete(`/autorizacion/operadores/${id}`); cargar() },
    })
  }

  const fld = 'fld rounded-lg px-4 py-2.5 w-full'
  const activos = operadores.filter(o => o.activo).length
  const inactivos = operadores.length - activos

  const filtrados = [...operadores]
    .filter(o => `${o.nombre} ${o.usuario} ${o.cargo ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.id - a.id)
  const visibles = limite === 'todos' ? filtrados : filtrados.slice(0, Number(limite))

  return (
    <div className="flex flex-col gap-7 max-w-7xl mx-auto">
      <h2 className="font-display text-2xl font-bold t-pri">Operadores</h2>

      {/* Form + panel resumen */}
      <div className="grid lg:grid-cols-[minmax(0,460px)_1fr] gap-6 items-stretch">
        {/* Formulario */}
        <div className="surface-card rounded-2xl p-6">
          <h3 className="font-display t-pri font-semibold mb-4">{editId ? 'Editar operador' : 'Registrar operador'}</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {!editId && (
              <>
                <input placeholder="Usuario (para login en app)" value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value })} className={fld} required />
                <input type="password" placeholder="Contraseña" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={fld} required />
              </>
            )}
            <input placeholder="Nombre completo" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={fld} required />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Cargo" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} className={fld} />
              <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={fld} />
            </div>
            {msg && <p className="text-sm" style={{ color: 'var(--accent)' }}>{msg}</p>}
            <div className="flex gap-2 mt-1">
              <button type="submit" className={`${btnCls} flex-1 btn-accent`}>{editId ? 'Guardar cambios' : 'Registrar'}</button>
              {editId && <button type="button" onClick={limpiar} className={`${btnCls} surface-soft border bd t-pri`}>Cancelar</button>}
            </div>
          </form>
        </div>

        {/* Panel resumen del equipo */}
        <div className="surface-card rounded-2xl p-6 flex flex-col">
          <h3 className="font-display t-pri font-semibold mb-4">Resumen del equipo</h3>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { l: 'Total', v: operadores.length, c: 'var(--accent)', i: '👥' },
              { l: 'Activos', v: activos, c: '#10b981', i: '✅' },
              { l: 'Inactivos', v: inactivos, c: '#f59e0b', i: '🚫' },
            ].map(s => (
              <div key={s.l} className="rounded-xl p-4 text-center" style={{ background: 'var(--bg)' }}>
                <div className="text-xl mb-1">{s.i}</div>
                <div className="font-display text-2xl font-bold" style={{ color: s.c }}>{s.v}</div>
                <div className="t-mut text-xs mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          <p className="t-mut text-xs uppercase tracking-wider mb-2 font-semibold">Equipo reciente</p>
          <div className="flex -space-x-2 mb-4">
            {filtrados.slice(0, 6).map(o => (
              <div key={o.id} title={o.nombre}
                className="w-9 h-9 rounded-full grid place-items-center text-xs font-semibold border-2"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--card)' }}>
                {iniciales(o.nombre)}
              </div>
            ))}
            {filtrados.length === 0 && <span className="t-mut text-sm">Aún no hay operadores</span>}
          </div>

          <div className="mt-auto rounded-xl p-3 text-xs flex items-start gap-2"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <span>💡</span>
            <span>Los operadores usan su usuario y contraseña para entrar a la app móvil y grabar sus tokens NFC.</span>
          </div>
        </div>
      </div>

      {/* Lista de operadores */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="font-display t-pri font-semibold flex items-center gap-2">
            Operadores registrados
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{operadores.length}</span>
          </h3>
          <div className="flex items-center gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..."
              className="fld rounded-lg px-3 py-1.5 text-sm w-40" />
            <label className="flex items-center gap-2 text-xs t-mut">
              Mostrar
              <select value={limite} onChange={e => setLimite(e.target.value)} className="fld rounded-lg px-2 py-1.5 text-xs">
                {[5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                <option value="todos">Todos</option>
              </select>
            </label>
          </div>
        </div>

        <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-3">
          {visibles.map(op => (
            <motion.div key={op.id} variants={item}
              className="surface-card glow-card rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full grid place-items-center text-sm font-semibold shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{iniciales(op.nombre)}</div>
                <div>
                  <p className="t-pri font-semibold leading-tight">{op.nombre}</p>
                  <p className="t-mut text-xs mt-0.5">@{op.usuario}{op.cargo ? ` · ${op.cargo}` : ''}{op.telefono ? ` · ${op.telefono}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={op.activo ? { background: 'rgba(16,185,129,.15)', color: '#34d399' } : { background: 'rgba(239,68,68,.15)', color: '#f87171' }}>
                  {op.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => { setEditId(op.id); setForm({ usuario: '', password: '', nombre: op.nombre, telefono: op.telefono ?? '', cargo: op.cargo ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className={`${btnCls} surface-soft border bd t-pri text-xs`}>Editar</button>
                <button onClick={() => toggleEstado(op)} className={`${btnCls} text-xs`}
                  style={op.activo ? { background: 'rgba(245,158,11,.15)', color: '#fbbf24' } : { background: 'rgba(16,185,129,.15)', color: '#34d399' }}>
                  {op.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => eliminar(op.id)} className={`${btnCls} text-xs`}
                  style={{ background: 'rgba(239,68,68,.15)', color: '#f87171' }}>Eliminar</button>
              </div>
            </motion.div>
          ))}
          {visibles.length === 0 && <p className="t-mut text-sm">No se encontraron operadores</p>}
        </motion.div>

        {limite !== 'todos' && filtrados.length > Number(limite) && (
          <p className="t-mut text-xs text-center mt-3">Mostrando {Number(limite)} de {filtrados.length} operadores</p>
        )}
      </section>

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
