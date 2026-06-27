import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { to: '/panel',                label: 'Dashboard',     end: true },
  { to: '/panel/operadores',     label: 'Operadores' },
  { to: '/panel/autorizaciones', label: 'Autorizaciones' },
  { to: '/panel/candados',       label: 'Candados' },
  { to: '/panel/ruta',           label: 'Ruta' },
  { to: '/panel/registros',      label: 'Registros' },
]

export default function Layout() {
  const { nombre, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header className="sticky top-0 z-30 px-4 md:px-6 py-3 flex items-center justify-between border-b backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--surface) 85%, transparent)', borderColor: 'var(--line)' }}>
        <span className="font-display flex items-center gap-2 font-bold text-lg">
          <span className="w-8 h-8 rounded-lg grid place-items-center text-white text-sm"
            style={{ background: 'var(--accent-strong)' }}>🔒</span>
          <span className="hidden sm:inline">Candado Inteligente</span>
        </span>

        <nav className="flex gap-1 text-sm">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className="relative px-3 py-2 rounded-lg transition"
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 400,
              })}>
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive && (
                    <motion.span layoutId="navUnderline"
                      className="absolute left-2 right-2 -bottom-0.5 h-0.5 rounded-full"
                      style={{ background: 'var(--accent)' }} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          <span className="hidden md:inline" style={{ color: 'var(--muted)' }}>{nombre}</span>
          <button onClick={handleLogout}
            className="px-3 py-2 rounded-lg font-semibold transition hover:opacity-80"
            style={{ color: 'var(--danger)' }}>
            Salir
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
