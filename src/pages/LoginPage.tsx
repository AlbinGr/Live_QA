import { ArrowLeft, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../features/auth/AuthContext'
import { getErrorMessage, withTimeout } from '../lib/errors'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const { isTeacher, loading: authLoading } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!authLoading && isTeacher) navigate('/teacher', { replace: true })
  }, [authLoading, isTeacher, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'login') {
        const { error: loginError } = await withTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password }))
        if (loginError) throw loginError
        navigate('/teacher', { replace: true })
      } else {
        const { data, error: signupError } = await withTimeout(supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || email.trim().split('@')[0] } },
        }))
        if (signupError) throw signupError
        if (data.session) navigate('/teacher', { replace: true })
        else setNotice('Check your email to confirm your teacher account, then sign in.')
      }
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not sign in.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[.85fr_1.15fr]">
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Brand />
          <Link to="/" className="mt-10 inline-flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink"><ArrowLeft className="size-4" /> Home</Link>
          <p className="eyebrow mt-9">For teachers</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-forest">{mode === 'login' ? 'Welcome back.' : 'Create your teacher account.'}</h1>
          <p className="mt-3 leading-7 text-ink/60">{mode === 'login' ? 'Your sessions, questions, and results are waiting.' : 'Students never need an account to join your rooms.'}</p>

          <div className="mt-7 grid grid-cols-2 rounded-xl bg-forest/5 p-1" role="tablist" aria-label="Authentication mode">
            {(['login', 'signup'] as const).map((value) => (
              <button type="button" key={value} onClick={() => { setMode(value); setError(''); setNotice('') }} className={`min-h-10 rounded-lg text-sm font-bold ${mode === value ? 'bg-white text-forest shadow-sm' : 'text-ink/50'}`} role="tab" aria-selected={mode === value}>{value === 'login' ? 'Sign in' : 'Create account'}</button>
            ))}
          </div>

          <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
            {mode === 'signup' ? (
              <label className="block"><span className="label">Display name</span><input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Dr. Rivera" /></label>
            ) : null}
            <label className="block"><span className="label">Email</span><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-ink/35" /><input className="field pl-10" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@school.edu" /></div></label>
            <label className="block"><span className="label">Password</span><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-ink/35" /><input className="field pl-10" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div></label>
            {error ? <p className="rounded-xl bg-coral/10 px-3 py-2.5 text-sm font-medium text-[#983523]" role="alert">{error}</p> : null}
            {notice ? <p className="rounded-xl bg-mint px-3 py-2.5 text-sm font-medium text-pine" role="status">{notice}</p> : null}
            <button type="submit" className="btn-primary w-full py-3" disabled={busy || !email.trim() || password.length < 6}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <p className="mt-5 text-center text-sm text-ink/45">Students: <Link className="font-bold text-pine underline underline-offset-2" to="/join">join with a room code</Link></p>
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full border-[70px] border-white/[.035]" />
        <p className="max-w-xl font-display text-5xl font-extrabold leading-[1.08] tracking-tight">Keep your class moving—and everyone participating.</p>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl bg-white/[.07] p-6"><p className="font-display text-4xl font-extrabold text-gold">10 sec</p><p className="mt-2 text-white/60">from QR scan to first answer</p></div>
          <div className="rounded-3xl bg-white/[.07] p-6"><p className="font-display text-4xl font-extrabold text-gold">4 types</p><p className="mt-2 text-white/60">for a question in the moment</p></div>
        </div>
      </section>
    </main>
  )
}
