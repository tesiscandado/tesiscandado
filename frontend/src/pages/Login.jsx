import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import api from '../api'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', { usuario, password })
      login(res.data.token, res.data.nombre)
      navigate('/panel')
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full rounded-xl px-4 py-3 outline-none transition border focus:border-[var(--accent)]'
  const inputStyle = { background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--text)' }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* blobs */}
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="animate-blob absolute -top-20 -left-20 w-80 h-80 rounded-full blur-3xl"
          style={{ background: 'var(--accent)', opacity: .22 }} />
        <div className="animate-blob absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl"
          style={{ background: '#22d3ee', opacity: .15, animationDelay: '4s' }} />
      </div>

      <div className="absolute top-5 right-5 flex items-center gap-3">
        <ThemeToggle />
        <Link to="/" className="text-sm" style={{ color: 'var(--muted)' }}>← Inicio</Link>
      </div>

      <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-sm rounded-3xl border p-8 backdrop-blur"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-3 mb-1">
          <span className="w-11 h-11 rounded-2xl grid place-items-center text-white text-xl"
            style={{ background: 'var(--accent-strong)' }}>🔒</span>
          <div>
            <h1 className="font-display text-xl font-bold leading-tight">Candado Inteligente</h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Panel de administración</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
          <input type="text" placeholder="Usuario" value={usuario}
            onChange={e => setUsuario(e.target.value)} className={inputCls} style={inputStyle} required />
          <input type="password" placeholder="Contraseña" value={password}
            onChange={e => setPassword(e.target.value)} className={inputCls} style={inputStyle} required />
          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm" style={{ color: 'var(--danger)' }}>{error}</motion.p>
          )}
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
            className="rounded-xl py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent-strong)' }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
