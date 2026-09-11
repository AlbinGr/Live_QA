import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-forest/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={`mx-auto my-4 rounded-3xl bg-cream shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-forest/10 bg-cream/95 px-5 py-4 backdrop-blur sm:px-6">
          <h2 id="modal-title" className="font-display text-xl font-bold text-forest">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl hover:bg-forest/5" aria-label="Close dialog">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}
