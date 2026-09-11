import { Archive, ArrowRight, CalendarDays, History, LoaderCircle, Plus, QrCode, Users } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorBanner, PageLoader, StatusPill } from '../components/Feedback'
import { Modal } from '../components/Modal'
import { SharePanel } from '../components/SharePanel'
import { createSession } from '../lib/api'
import { getErrorMessage, withTimeout } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { ClassroomSession, SessionSummary } from '../types/domain'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function TeacherDashboardPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [shareSession, setShareSession] = useState<ClassroomSession | null>(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error: sessionError } = await withTimeout(supabase.from('sessions').select('*').order('created_at', { ascending: false }))
      if (sessionError) throw sessionError
      const rows = (data ?? []) as ClassroomSession[]
      const summaries = await Promise.all(
        rows.map(async (session) => {
          const [participants, questions, responses] = await withTimeout(Promise.all([
            supabase.from('participants').select('id', { count: 'exact', head: true }).eq('session_id', session.id),
            supabase.from('questions').select('id', { count: 'exact', head: true }).eq('session_id', session.id),
            supabase.from('responses').select('id', { count: 'exact', head: true }).eq('session_id', session.id),
          ]))
          if (participants.error) throw participants.error
          if (questions.error) throw questions.error
          if (responses.error) throw responses.error
          return {
            ...session,
            participant_count: participants.count ?? 0,
            question_count: questions.count ?? 0,
            response_count: responses.count ?? 0,
          }
        }),
      )
      setSessions(summaries)
      setError('')
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not load your sessions.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError('')
    try {
      const session = await createSession(title.trim())
      navigate(`/teacher/session/${session.id}`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not create the session.'))
      setCreating(false)
      setShowCreate(false)
    }
  }

  const activeSessions = sessions.filter((session) => session.status !== 'ended')
  const pastSessions = sessions.filter((session) => session.status === 'ended')

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Teacher dashboard</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-forest sm:text-5xl">Your classrooms</h1>
          <p className="mt-2 text-ink/55">Start a room now or reopen everything from a previous class.</p>
        </div>
        <button type="button" className="btn-primary px-6 py-3" onClick={() => setShowCreate(true)}><Plus className="size-5" aria-hidden="true" /> New session</button>
      </div>

      {error ? <div className="mt-6"><ErrorBanner message={error} onRetry={() => void loadSessions()} /></div> : null}
      {loading ? <PageLoader label="Loading your classrooms…" /> : null}

      {!loading && sessions.length === 0 ? (
        <section className="card mt-10 grid min-h-80 place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-mint text-pine"><Users className="size-7" aria-hidden="true" /></div>
            <h2 className="mt-5 font-display text-2xl font-bold">Create your first live room</h2>
            <p className="mx-auto mt-2 max-w-md text-ink/55">You’ll immediately get a short code, share link, and downloadable QR code.</p>
            <button type="button" className="btn-primary mt-6" onClick={() => setShowCreate(true)}><Plus className="size-5" /> Create session</button>
          </div>
        </section>
      ) : null}

      {!loading && activeSessions.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-forest">Active &amp; ready</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {activeSessions.map((session) => (
              <article key={session.id} className="card p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0"><StatusPill status={session.status} /><h3 className="mt-3 truncate font-display text-2xl font-bold text-forest">{session.title}</h3><p className="mt-1 flex items-center gap-1.5 text-sm text-ink/45"><CalendarDays className="size-4" /> {formatDate(session.created_at)}</p></div>
                  <button type="button" onClick={() => setShareSession(session)} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-mint text-pine transition hover:bg-[#cce9dc]" aria-label={`Share ${session.title}`}><QrCode className="size-6" /></button>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 text-sm text-ink/55">
                  <span className="rounded-lg bg-forest/5 px-2.5 py-1.5"><strong className="text-ink">{session.participant_count}</strong> joined</span>
                  <span className="rounded-lg bg-forest/5 px-2.5 py-1.5"><strong className="text-ink">{session.question_count}</strong> questions</span>
                  <span className="rounded-lg bg-forest/5 px-2.5 py-1.5">Code <strong className="ml-1 tracking-widest text-ink">{session.join_code}</strong></span>
                </div>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/teacher/session/${session.id}`} className="btn-primary flex-1">Open control room <ArrowRight className="size-4" /></Link>
                  <Link to={`/teacher/session/${session.id}/history`} className="btn-secondary"><History className="size-4" /> History</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && pastSessions.length > 0 ? (
        <section className="mt-12">
          <div className="flex items-center gap-2"><Archive className="size-5 text-ink/40" /><h2 className="font-display text-xl font-bold text-forest">Past sessions</h2></div>
          <div className="mt-4 overflow-hidden rounded-3xl border border-forest/10 bg-white">
            {pastSessions.map((session) => (
              <Link key={session.id} to={`/teacher/session/${session.id}/history`} className="grid gap-3 border-b border-forest/8 px-5 py-4 last:border-0 hover:bg-mint/20 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                <div><h3 className="font-bold text-forest">{session.title}</h3><p className="mt-0.5 text-sm text-ink/45">{formatDate(session.ended_at ?? session.created_at)}</p></div>
                <span className="text-sm text-ink/55"><strong className="text-ink">{session.participant_count}</strong> students</span>
                <span className="text-sm text-ink/55"><strong className="text-ink">{session.question_count}</strong> questions</span>
                <span className="text-sm text-ink/55"><strong className="text-ink">{session.response_count}</strong> answers</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {showCreate ? (
        <Modal title="Create a classroom session" onClose={() => !creating && setShowCreate(false)}>
          <form onSubmit={(event) => void submitCreate(event)}>
            <label className="block"><span className="label">Session title</span><input className="field text-lg" required autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Biology · Friday morning" /></label>
            <p className="mt-3 text-sm leading-6 text-ink/50">A unique join code and QR code are created automatically.</p>
            <div className="mt-7 flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={creating} onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={creating || !title.trim()}>{creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{creating ? 'Creating…' : 'Create session'}</button></div>
          </form>
        </Modal>
      ) : null}

      {shareSession ? <Modal title={`Share · ${shareSession.title}`} onClose={() => setShareSession(null)}><SharePanel joinCode={shareSession.join_code} /></Modal> : null}
    </main>
  )
}
