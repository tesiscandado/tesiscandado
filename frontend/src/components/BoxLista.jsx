import { useState } from 'react'
import { motion } from 'framer-motion'

const POR_PAGINA = 5

export default function BoxLista({ titulo, icon, color = 'var(--accent)', items = [], render, vacio = 'Sin registros' }) {
  const [pag, setPag] = useState(0)

  const totalPag = Math.max(1, Math.ceil(items.length / POR_PAGINA))
  const p = Math.min(pag, totalPag - 1)
  const visibles = items.slice(p * POR_PAGINA, p * POR_PAGINA + POR_PAGINA)
  const btn = 'text-xs px-3 py-1.5 rounded-lg font-semibold surface-soft border bd t-pri transition disabled:opacity-40'

  return (
    <div className="surface-card rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bd">
        <h3 className="font-display font-semibold flex items-center gap-2 text-sm" style={{ color }}>
          <span>{icon}</span>{titulo}
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'var(--accent-soft)', color }}>{items.length}</span>
        </h3>
      </div>

      <div>
        {visibles.map((it, i) => (
          <motion.div key={it.id ?? i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i * 0.03, 0.2) }}
            className="px-4 py-3 border-b bd last:border-0 hover:bg-gray-800/40 transition">
            {render(it)}
          </motion.div>
        ))}
        {items.length === 0 && <p className="t-mut text-sm px-4 py-6 text-center">{vacio}</p>}
      </div>

      {items.length > POR_PAGINA && (
        <div className="flex items-center justify-center gap-3 py-2.5 border-t bd">
          <button className={btn} disabled={p === 0} onClick={() => setPag(p - 1)}>‹ Anterior</button>
          <span className="t-mut text-xs">Página {p + 1} de {totalPag}</span>
          <button className={btn} disabled={p >= totalPag - 1} onClick={() => setPag(p + 1)}>Siguiente ›</button>
        </div>
      )}
    </div>
  )
}
