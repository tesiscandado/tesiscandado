import { createContext, useContext, useState } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [nombre, setNombre] = useState(localStorage.getItem('nombre'))

  function login(token, nombre) {
    localStorage.setItem('token', token)
    localStorage.setItem('nombre', nombre)
    setToken(token)
    setNombre(nombre)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('nombre')
    setToken(null)
    setNombre(null)
  }

  return (
    <AuthContext.Provider value={{ token, nombre, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
