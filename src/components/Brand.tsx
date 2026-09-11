import { Activity } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 font-display text-xl font-extrabold ${light ? 'text-white' : 'text-forest'}`}>
      <span className={`grid size-9 place-items-center rounded-xl ${light ? 'bg-white/15' : 'bg-forest text-white'}`}>
        <Activity className="size-5" strokeWidth={2.6} aria-hidden="true" />
      </span>
      Pulse
    </Link>
  )
}
