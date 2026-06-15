import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import SciFiLock from '../components/SciFiLock'

const fade = {
  hidden: { opacity: 0, y: 30 },
  show:   (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.12 } }),
}

const features = [
  { icon: '📶', t: 'Conectividad GSM', d: 'El candado reporta por red celular (SIM808), sin depender de WiFi.' },
  { icon: '📍', t: 'Ubicación GPS', d: 'Sigue la posición del candado en tiempo real sobre el mapa.' },
  { icon: '🪪', t: 'Acceso RFID / NFC', d: 'Tarjetas y tokens de un solo uso con validación segura.' },
  { icon: '🚨', t: 'Alarmas en vivo', d: 'Impacto, forcejeo, puerta abierta y fallos de hardware al instante.' },
]

const pasos = [
  { n: '01', t: 'El candado detecta', d: 'Sensores de impacto, magnético y reed vigilan 24/7.' },
  { n: '02', t: 'Reporta por GSM', d: 'Envía eventos y ubicación a la nube por red celular.' },
  { n: '03', t: 'Tú controlas', d: 'Ves todo desde el panel web y autorizas accesos.' },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
          className="font-display flex items-center gap-2 font-semibold text-lg">
          <span className="w-9 h-9 rounded-xl grid place-items-center text-white"
            style={{ background: 'var(--accent-strong)' }}>🔒</span>
          Candado Inteligente
        </motion.div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={() => navigate('/login')}
            className="px-5 py-2 rounded-xl font-semibold text-white text-sm transition hover:opacity-90"
            style={{ background: 'var(--accent-strong)' }}>
            Ingresar
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-6 md:px-12 pt-10 pb-24 max-w-6xl mx-auto">
        {/* blobs de fondo */}
        <div className="pointer-events-none absolute inset-0 -z-0 opacity-60">
          <div className="animate-blob absolute -top-10 -left-10 w-72 h-72 rounded-full blur-3xl"
            style={{ background: 'var(--accent)' , opacity: .25 }} />
          <div className="animate-blob absolute top-20 right-0 w-80 h-80 rounded-full blur-3xl"
            style={{ background: '#22d3ee', opacity: .18, animationDelay: '3s' }} />
        </div>

        <div className="relative grid md:grid-cols-2 gap-10 items-center">
          <div>
            <motion.span variants={fade} initial="hidden" animate="show"
              className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-5"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
              Seguridad IoT · Tesis 2026
            </motion.span>
            <motion.h1 variants={fade} initial="hidden" animate="show" custom={1}
              className="font-display text-4xl md:text-6xl font-bold leading-tight mb-5">
              Protege lo que importa,<br />
              <span style={{ color: 'var(--accent)' }}>desde cualquier lugar</span>
            </motion.h1>
            <motion.p variants={fade} initial="hidden" animate="show" custom={2}
              className="text-lg mb-8 max-w-md" style={{ color: 'var(--muted)' }}>
              Candado inteligente con GPS, acceso por RFID y alarmas en tiempo real,
              monitoreado por red celular y un panel web en vivo.
            </motion.p>
            <motion.div variants={fade} initial="hidden" animate="show" custom={3} className="flex gap-3">
              <button onClick={() => navigate('/login')}
                className="px-6 py-3 rounded-xl font-semibold text-white transition hover:opacity-90"
                style={{ background: 'var(--accent-strong)' }}>
                Entrar al panel →
              </button>
              <a href="#features"
                className="px-6 py-3 rounded-xl font-semibold border transition"
                style={{ borderColor: 'var(--line)', color: 'var(--text)' }}>
                Conocer más
              </a>
            </motion.div>
          </div>

          {/* candado sci-fi animado (con parallax al hacer scroll) */}
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.2 }} className="relative grid place-items-center">
            <SciFiLock />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 md:px-12 py-20" style={{ background: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto">
          <motion.h2 variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }}
            className="font-display text-3xl md:text-4xl font-bold text-center mb-3">
            Todo en un solo sistema
          </motion.h2>
          <motion.p variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }} custom={1}
            className="text-center mb-14" style={{ color: 'var(--muted)' }}>
            Hardware + nube + web trabajando juntos.
          </motion.p>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Video vertical (izquierda) */}
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="relative flex justify-center">
              <div className="absolute w-56 h-72 rounded-full blur-3xl"
                style={{ background: 'var(--accent)', opacity: 0.22 }} />
              <video
                src="/candadoabriendo.mp4"
                autoPlay loop muted playsInline
                className="relative rounded-3xl border w-full max-w-[300px] object-cover"
                style={{ borderColor: 'var(--line)', boxShadow: '0 0 40px rgba(45,212,191,.18)' }}
              />
            </motion.div>

            {/* Features apiladas (derecha) */}
            <div className="flex flex-col gap-4">
              {features.map((f, i) => (
                <motion.div key={f.t} variants={fade} initial="hidden" whileInView="show"
                  viewport={{ once: true }} custom={i}
                  whileHover={{ x: 6 }}
                  className="flex items-start gap-4 rounded-2xl border p-5 transition"
                  style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
                  <div className="w-11 h-11 rounded-xl grid place-items-center text-xl shrink-0"
                    style={{ background: 'var(--accent-soft)' }}>{f.icon}</div>
                  <div>
                    <h3 className="font-semibold mb-1">{f.t}</h3>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>{f.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-6 md:px-12 py-20 max-w-6xl mx-auto">
        <motion.h2 variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="font-display text-3xl md:text-4xl font-bold text-center mb-14">
          ¿Cómo funciona?
        </motion.h2>
        <div className="grid md:grid-cols-3 gap-6">
          {pasos.map((p, i) => (
            <motion.div key={p.n} variants={fade} initial="hidden" whileInView="show"
              viewport={{ once: true }} custom={i}
              className="relative rounded-2xl border p-7"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
              <div className="text-5xl font-bold mb-4" style={{ color: 'var(--accent)', opacity: .5 }}>{p.n}</div>
              <h3 className="font-semibold text-lg mb-2">{p.t}</h3>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{p.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 pb-24">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto rounded-3xl p-12 text-center text-white"
          style={{ background: 'var(--accent-strong)' }}>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Empieza a monitorear ahora</h2>
          <p className="mb-8 opacity-90">Entra al panel y controla tus candados en tiempo real.</p>
          <button onClick={() => navigate('/login')}
            className="px-8 py-3 rounded-xl font-semibold bg-white transition hover:opacity-90"
            style={{ color: 'var(--accent-strong)' }}>
            Ingresar al panel →
          </button>
        </motion.div>
      </section>

      <footer className="px-6 md:px-12 py-8 text-center text-sm border-t"
        style={{ color: 'var(--muted)', borderColor: 'var(--line)' }}>
        Candado Inteligente · Proyecto de tesis 2026
      </footer>
    </div>
  )
}
