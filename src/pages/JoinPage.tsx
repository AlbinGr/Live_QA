import { ArrowLeft, ArrowRight, LoaderCircle, ScanLine, UserRound } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { joinSession } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { generateJoinCode, isValidJoinCode, normalizeJoinCode } from '../lib/quiz'
import { ensureStudentAuth } from '../lib/supabase'

function getClientId() {
  const key = 'pulse.student.client-id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const value = crypto.randomUUID ? crypto.randomUUID() : `${generateJoinCode(6)}-${Date.now()}`
  window.localStorage.setItem(key, value)
  return value
}

export function JoinPage() {
  const params = useParams()
  const navigate = useNavigate()
  const routeCode = useMemo(() => normalizeJoinCode(params.code ?? ''), [params.code])
  const [code, setCode] = useState(routeCode)
  const [displayName, setDisplayName] = useState(() => routeCode ? window.localStorage.getItem(`pulse.student.name.${routeCode}`) ?? '' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function join(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeJoinCode(code)
    setError('')
    if (!isValidJoinCode(normalized)) {
      setError('Enter the 5 or 6 character room code shown by your teacher.')
      return
    }
    setBusy(true)
    try {
      await ensureStudentAuth()
      await joinSession(normalized, getClientId(), displayName.trim() || null)
      window.localStorage.setItem(`pulse.student.name.${normalized}`, displayName.trim())
      window.localStorage.setItem('pulse.student.last-room', normalized)
      navigate(`/session/${normalized}`, { replace: true })
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not join this room.'))
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center"><Brand /><p className="eyebrow mt-10">Student join</p><h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-forest">{routeCode ? 'You’re one tap away.' : 'Join the room.'}</h1><p className="mt-3 text-ink/55">No email, password, or student account needed.</p></div>
        <section className="card mt-8 p-5 sm:p-8">
          <form onSubmit={(event) => void join(event)} className="space-y-5">
            <label className="block">
              <span className="label">Room code</span>
              <div className="relative"><ScanLine className="pointer-events-none absolute left-4 top-4 size-5 text-ink/35" /><input className="field min-h-14 pl-12 font-display text-xl font-extrabold uppercase tracking-[.22em]" required value={code} onChange={(event) => setCode(normalizeJoinCode(event.target.value).slice(0, 6))} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="K7M4Q" readOnly={Boolean(routeCode)} /></div>
              {routeCode ? <button type="button" onClick={() => navigate('/join', { replace: true })} className="mt-2 text-xs font-semibold text-pine underline underline-offset-2">Use a different code</button> : null}
            </label>
            <label className="block">
              <span className="label">Your name <span className="font-normal text-ink/40">(optional)</span></span>
              <div className="relative"><UserRound className="pointer-events-none absolute left-4 top-4 size-5 text-ink/35" /><input className="field min-h-14 pl-12 text-base" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" placeholder="How should we call you?" /></div>
            </label>
            {error ? <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-[#983523]" role="alert">{error}</p> : null}
            <button type="submit" className="btn-primary min-h-14 w-full text-base" disabled={busy}>{busy ? <LoaderCircle className="size-5 animate-spin" /> : null}{busy ? 'Joining…' : 'Join room'}{!busy ? <ArrowRight className="size-5" /> : null}</button>
          </form>
        </section>
        <Link to="/" className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-ink"><ArrowLeft className="size-4" /> Back home</Link>
      </div>
    </main>
  )
}
