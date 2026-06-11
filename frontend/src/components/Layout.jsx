import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const navItems = [
  { to: '/',              label: 'Dashboard',     end: true },
  { to: '/operadores',    label: 'Operadores' },
  { to: '/autorizaciones',label: 'Autorizaciones' },
  { to: '/candados',      label: 'Candados' },
  { to: '/registros',     label: 'Registros' },
]

export default function Layout() {
  const { nombre, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-blue-400">🔒 Candado Inteligente</span>
        <nav className="flex gap-5 text-sm">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'text-blue-400 font-semibold' : 'text-gray-400 hover:text-white transition'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400">{nombre}</span>
          <button onClick={handleLogout} className="text-red-400 hover:text-red-300 transition">
            Salir
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
