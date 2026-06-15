import { motion, useScroll, useTransform } from 'framer-motion'

export default function SciFiLock() {
  const { scrollY } = useScroll()
  const y      = useTransform(scrollY, [0, 700], [0, -120])
  const rotate = useTransform(scrollY, [0, 700], [0, 35])
  const scale  = useTransform(scrollY, [0, 700], [1, 0.82])

  const teal = 'var(--accent)'
  const cyan = '#22d3ee'

  return (
    <motion.div style={{ y, rotate, scale }} className="relative grid place-items-center">
      {/* halo difuso detras */}
      <div className="absolute w-72 h-72 rounded-full blur-3xl"
        style={{ background: 'var(--accent)', opacity: 0.25 }} />

      <motion.svg width="380" height="380" viewBox="0 0 380 380"
        className="relative" style={{ filter: 'drop-shadow(0 0 20px rgba(45,212,191,.35))' }}>

        {/* anillo exterior punteado (gira) */}
        <motion.circle cx="190" cy="190" r="160" fill="none" stroke={teal}
          strokeWidth="1.5" strokeDasharray="3 12" opacity="0.6"
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 40, ease: 'linear' }}
          style={{ transformOrigin: '190px 190px' }} />

        {/* anillo medio con segmentos (gira al reves) */}
        <motion.circle cx="190" cy="190" r="132" fill="none" stroke={cyan}
          strokeWidth="2" strokeDasharray="60 40" opacity="0.5"
          animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 28, ease: 'linear' }}
          style={{ transformOrigin: '190px 190px' }} />

        {/* particulas en orbita */}
        <motion.g animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 18, ease: 'linear' }}
          style={{ transformOrigin: '190px 190px' }}>
          <circle cx="190" cy="40" r="4" fill={teal} />
          <circle cx="340" cy="190" r="3" fill={cyan} />
          <circle cx="190" cy="340" r="3.5" fill={teal} />
          <circle cx="40" cy="190" r="2.5" fill={cyan} />
        </motion.g>

        {/* hexagono tech central (pulsa) */}
        <motion.polygon
          points="190,75 290,135 290,245 190,305 90,245 90,135"
          fill="none" stroke={teal} strokeWidth="2" opacity="0.7"
          animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 3 }}
          style={{ transformOrigin: '190px 190px' }} />
        <polygon points="190,100 268,147 268,233 190,280 112,233 112,147"
          fill="rgba(45,212,191,0.06)" stroke={cyan} strokeWidth="1" opacity="0.5" />

        {/* CANDADO */}
        {/* arco (shackle) */}
        <path d="M157 168 v-18 a33 33 0 0 1 66 0 v18" fill="none" stroke={teal} strokeWidth="9"
          strokeLinecap="round" />
        {/* cuerpo */}
        <rect x="148" y="168" width="84" height="74" rx="14"
          fill="rgba(45,212,191,0.10)" stroke={teal} strokeWidth="3" />
        {/* keyhole glow (pulsa) */}
        <motion.g animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.8 }}>
          <circle cx="190" cy="198" r="9" fill={cyan} />
          <rect x="186" y="202" width="8" height="20" rx="3" fill={cyan} />
        </motion.g>

        {/* linea de escaneo (sube y baja) */}
        <motion.rect x="150" y="170" width="80" height="2.5" rx="1.5" fill={cyan} opacity="0.85"
          animate={{ y: [0, 70, 0] }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }} />
      </motion.svg>
    </motion.div>
  )
}
