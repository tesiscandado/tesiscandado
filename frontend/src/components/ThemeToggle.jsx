import { motion } from 'framer-motion'
import { useTheme } from '../ThemeContext'

export default function ThemeToggle() {
  const { tema, toggle } = useTheme()
  const dark = tema === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label="Cambiar tema"
      className="relative w-10 h-10 rounded-xl grid place-items-center border transition-colors"
      style={{ borderColor: 'var(--line)', background: 'var(--card)', color: 'var(--text)' }}
    >
      <motion.span
        key={tema}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="text-lg"
      >
        {dark ? '🌙' : '☀️'}
      </motion.span>
    </button>
  )
}
