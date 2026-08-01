import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { useAuth } from '../AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import PlexusBackground from '../components/PlexusBackground'
import api from '../api'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()
  const controls  = useAnimationControls()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(false)
    try {
      const res = await api.post('/auth/login', { usuario, password })
      login(res.data.token, res.data.nombre)
      // Credenciales correctas -> entrar directo al panel
      navigate('/panel')
    } catch {
      // Credenciales incorrectas -> vibrar + bordes rojos
      setError(true)
      setLoading(false)
      controls.start({ x: [0, -12, 12, -10, 10, -6, 6, 0], transition: { duration: 0.5 } })
    }
  }

  const inputCls = 'w-full rounded-xl px-4 py-3 outline-none transition border'
  const inputStyle = {
    background: 'var(--bg)',
    borderColor: error ? '#ef4444' : 'var(--line)',
    color: 'var(--text)',
  }

  return (
    <div className="cyber min-h-screen flex items-center justify-center relative overflow-hidden px-4"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <PlexusBackground />
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="animate-blob absolute -top-20 -left-20 w-80 h-80 rounded-full blur-3xl"
          style={{ background: 'var(--accent)', opacity: .18 }} />
        <div className="animate-blob absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl"
          style={{ background: '#22d3ee', opacity: .12, animationDelay: '4s' }} />
      </div>

      <div className="absolute top-5 right-5 flex items-center gap-3">
        <ThemeToggle />
        <Link to="/" className="text-sm" style={{ color: 'var(--muted)' }}>← Inicio</Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{ borderColor: error ? '#ef4444' : 'var(--line)', background: 'var(--card)' }}
        className="relative w-full max-w-sm rounded-3xl border p-8 backdrop-blur">
        <motion.div animate={controls}>
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
              onChange={e => { setUsuario(e.target.value); setError(false) }}
              className={inputCls} style={inputStyle} required />
            <input type="password" placeholder="Contraseña" value={password}
              onChange={e => { setPassword(e.target.value); setError(false) }}
              className={inputCls} style={inputStyle} required />
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-sm font-medium" style={{ color: '#ef4444' }}>
                Usuario o contraseña incorrectos
              </motion.p>
            )}
            <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
              className="rounded-xl py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-strong)' }}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  )
}
