import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ThemeProvider } from './ThemeContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Operadores from './pages/Operadores'
import Autorizaciones from './pages/Autorizaciones'
import Candados from './pages/Candados'
import Ruta from './pages/Ruta'
import Registros from './pages/Registros'
import Layout from './components/Layout'

function RutaProtegida({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/panel" element={<RutaProtegida><Layout /></RutaProtegida>}>
              <Route index element={<Dashboard />} />
              <Route path="operadores" element={<Operadores />} />
              <Route path="autorizaciones" element={<Autorizaciones />} />
              <Route path="candados" element={<Candados />} />
              <Route path="ruta" element={<Ruta />} />
              <Route path="registros" element={<Registros />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
