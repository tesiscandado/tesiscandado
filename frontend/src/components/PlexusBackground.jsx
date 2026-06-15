import { useEffect, useRef } from 'react'

export default function PlexusBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf, w, h
    const puntos = []
    const N = 70
    const DIST = 130

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2dd4bf'

    function hexToRgb(hex) {
      const m = hex.replace('#', '')
      const v = m.length === 3 ? m.split('').map(c => c + c).join('') : m
      const n = parseInt(v, 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }

    let rgb = hexToRgb(accent())

    function resize() {
      w = canvas.width = canvas.offsetWidth
      h = canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < N; i++) {
      puntos.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      })
    }

    function tick() {
      rgb = hexToRgb(accent())
      ctx.clearRect(0, 0, w, h)
      const [r, g, b] = rgb

      for (const p of puntos) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
      }

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = puntos[i], c = puntos[j]
          const dx = a.x - c.x, dy = a.y - c.y
          const d = Math.hypot(dx, dy)
          if (d < DIST) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - d / DIST) * 0.35})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke()
          }
        }
      }

      for (const p of puntos) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }} />
  )
}
