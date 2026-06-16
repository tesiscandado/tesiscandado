import { useState } from 'react'
import { motion } from 'framer-motion'

export default function BoxLista({ titulo, icon, color = 'var(--accent)', items = [], render, vacio = 'Sin registros' }) {
  const [todos, setTodos] = useState(false)
  const visibles = todos ? items : items.slice(0, 5)

  return (
    <div className="surface-card rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bd">
        <h3 className="font-display font-semibold flex items-center gap-2 text-sm" style={{ color }}>
          <span>{icon}</span>{titulo}
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'var(--accent-soft)', color }}>{items.length}</span>
        </h3>
        {items.length > 5 && (
          <button onClick={() => setTodos(t => !t)} className="text-xs t-mut hover-pri font-semibold">
            {todos ? 'Ver menos ▲' : 'Ver todos ▼'}
          </button>
        )}
      </div>
      <div>
        {visibles.map((it, i) => (
          <motion.div key={it.id ?? i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="px-4 py-3 border-b bd last:border-0 hover:bg-gray-800/40 transition">
            {render(it)}
          </motion.div>
        ))}
        {items.length === 0 && <p className="t-mut text-sm px-4 py-6 text-center">{vacio}</p>}
      </div>
      {items.length > 5 && !todos && (
        <p className="t-mut text-[11px] text-center py-2 border-t bd">Mostrando 5 de {items.length}</p>
      )}
    </div>
  )
}
