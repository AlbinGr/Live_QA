import { Check, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, WifiOff, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { getStudentState, submitStudentResponse } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { formatAnswer, normalizeJoinCode } from '../lib/quiz'
import { ensureStudentAuth, supabase } from '../lib/supabase'
import type { Json, StudentState } from '../types/domain'

export function StudentSessionPage() {
  const { code: routeCode = '' } = useParams()
  const code = normalizeJoinCode(routeCode)
  const navigate = useNavigate()
  const [state, setState] = useState<StudentState | null>(null)
  const [answer, setAnswer] = useState<Json | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitNotice, setSubmitNotice] = useState('')
  const [connected, setConnected] = useState(true)
  const mounted = useRef(true)
  const questionId = state?.question?.id

  const refresh = useCallback(async () => {
    try {
      await ensureStudentAuth()
      const next = await getStudentState(code)
      if (!mounted.current) return
      setState(next)
      setError('')
    } catch (caught) {
      if (!mounted.current) return
      const message = getErrorMessage(caught, 'Could not load the classroom.')
      if (message.toLowerCase().includes('participant') || message.toLowerCase().includes('permission')) {
        navigate(`/join/${code}`, { replace: true })
        return
      }
      setError(message)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [code, navigate])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const poll = window.setInterval(() => void refresh(), 10_000)
    return () => {
      mounted.current = false
      window.clearInterval(poll)
    }
  }, [refresh])

  useEffect(() => {
    if (!state?.session.id) return
    const channel = supabase
      .channel(`student-state-${state.session.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_state', filter: `session_id=eq.${state.session.id}` }, () => void refresh())
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    return () => { void supabase.removeChannel(channel) }
  }, [refresh, state?.session.id])

  useEffect(() => {
    setAnswer(state?.own_response?.answer ?? null)
    setSubmitNotice('')
  }, [questionId, state?.question?.status, state?.own_response?.answer])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!state?.question || answer === null || answer === '') return
    setSubmitting(true)
    setError('')
    setSubmitNotice('')
    try {
      const result = await submitStudentResponse(state.question.id, answer)
      setSubmitNotice(result.changed ? 'Answer updated ✓' : 'Answer received ✓')
      await refresh()
    } catch (caught) {
      setError(getErrorMessage(caught))
      await refresh()
    } finally {
      if (mounted.current) setSubmitting(false)
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center"><div className="flex items-center gap-2 text-ink/55" role="status"><LoaderCircle className="size-5 animate-spin" /> Joining the room…</div></main>
  }

  if (!state) {
    return <main className="grid min-h-screen place-items-center p-5"><section className="card max-w-md p-7 text-center"><XCircle className="mx-auto size-10 text-coral" /><h1 className="mt-4 font-display text-2xl font-bold">We lost the room</h1><p className="mt-2 text-ink/55">{error || 'Join again with the code from your teacher.'}</p><Link to={`/join/${code}`} className="btn-primary mt-6">Join again</Link></section></main>
  }

  const question = state.question
  const canSubmit = question?.status === 'live' && answer !== null && answer !== '' && !submitting

  return (
    <main className="min-h-screen pb-8">
      <header className="border-b border-forest/10 bg-cream/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3"><Brand /><div className="text-right"><p className="truncate text-sm font-bold text-forest">{state.session.title}</p><p className="text-xs tracking-widest text-ink/45">{state.session.join_code}</p></div></div>
      </header>
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {!connected ? <div className="mb-4 flex items-center gap-2 rounded-xl bg-gold/20 px-3 py-2 text-sm font-medium text-[#71580f]" role="status"><WifiOff className="size-4" /> Reconnecting… updates will retry automatically.</div> : null}
        {error ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-coral/10 px-3 py-2.5 text-sm text-[#923421]" role="alert"><span>{error}</span><button type="button" onClick={() => void refresh()} aria-label="Retry"><RefreshCw className="size-4" /></button></div> : null}

        {state.session.status === 'ended' ? (
          <section className="card grid min-h-96 place-items-center p-7 text-center"><div><CheckCircle2 className="mx-auto size-12 text-pine" /><h1 className="mt-5 font-display text-3xl font-extrabold text-forest">Classroom complete</h1><p className="mt-2 text-ink/55">Thanks for taking part. Your answers were saved.</p><Link to="/join" className="btn-secondary mt-6">Join another room</Link></div></section>
        ) : !question ? (
          <section className="card grid min-h-96 place-items-center p-7 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-full bg-mint text-pine"><Clock3 className="size-8" /></div><p className="eyebrow mt-6">You’re in</p><h1 className="mt-2 font-display text-3xl font-extrabold text-forest">Waiting for a question</h1><p className="mt-3 text-ink/55">Your teacher will start when the room is ready. This page updates automatically.</p><span className="mt-6 inline-flex items-center gap-2 rounded-full bg-forest/5 px-3 py-1.5 text-sm text-ink/50"><span className="size-2 animate-pulse rounded-full bg-pine" /> Connected</span></div></section>
        ) : (
          <section className="card overflow-hidden">
            <div className="bg-forest px-5 py-7 text-white sm:px-8"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-white/55">Question {question.question_order}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${question.status === 'live' ? 'bg-coral text-white' : question.status === 'revealed' ? 'bg-mint text-pine' : 'bg-white/10 text-white/70'}`}>{question.status === 'live' ? 'Voting open' : question.status}</span></div><h1 className="mt-4 font-display text-2xl font-bold leading-tight sm:text-3xl">{question.prompt}</h1></div>
            <form onSubmit={(event) => void submit(event)} className="p-5 sm:p-8">
              {question.question_type === 'multiple_choice' && question.options ? (
                <fieldset disabled={question.status !== 'live'} className="space-y-3"><legend className="sr-only">Choose an answer</legend>{question.options.map((option) => { const selected = answer === option.id; return <label key={option.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${selected ? 'border-pine bg-mint ring-2 ring-pine/10' : 'border-forest/15 bg-white'} ${question.status !== 'live' ? 'cursor-default opacity-80' : ''}`}><input type="radio" name="answer" value={option.id} checked={selected} onChange={() => setAnswer(option.id)} className="size-5 shrink-0 accent-[#1c5c4f]" /><span className="font-semibold">{option.text}</span>{selected ? <Check className="ml-auto size-5 text-pine" /> : null}</label> })}</fieldset>
              ) : null}
              {question.question_type === 'true_false' ? (
                <fieldset disabled={question.status !== 'live'} className="grid grid-cols-2 gap-3"><legend className="sr-only">Choose true or false</legend>{[true, false].map((value) => { const selected = answer === value; return <label key={String(value)} className={`grid min-h-24 cursor-pointer place-items-center rounded-2xl border text-lg font-bold ${selected ? 'border-pine bg-mint text-pine ring-2 ring-pine/10' : 'border-forest/15 bg-white'} ${question.status !== 'live' ? 'cursor-default opacity-80' : ''}`}><input type="radio" name="answer" className="sr-only" checked={selected} onChange={() => setAnswer(value)} /><span>{value ? 'True' : 'False'}</span></label> })}</fieldset>
              ) : null}
              {question.question_type === 'numeric' ? <label className="block"><span className="label">Your answer</span><input type="number" step="any" inputMode="decimal" className="field min-h-16 text-center font-display text-2xl font-bold" value={typeof answer === 'number' || typeof answer === 'string' ? answer : ''} onChange={(event) => setAnswer(event.target.value === '' ? null : Number(event.target.value))} disabled={question.status !== 'live'} placeholder="Enter a number" /></label> : null}
              {question.question_type === 'open_text' ? <label className="block"><span className="label">Your answer</span><textarea className="field min-h-36 resize-y text-base" maxLength={1000} value={typeof answer === 'string' ? answer : ''} onChange={(event) => setAnswer(event.target.value)} disabled={question.status !== 'live'} placeholder="Write a short response…" /></label> : null}

              {question.status === 'live' ? <button type="submit" className="btn-primary mt-6 min-h-14 w-full text-base" disabled={!canSubmit}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}{submitting ? 'Sending…' : state.own_response ? 'Update answer' : 'Submit answer'}</button> : null}
              <div className="mt-4 min-h-7 text-center text-sm font-bold text-pine" aria-live="polite">{submitNotice || (state.own_response && question.status === 'live' ? 'Answer received ✓ · You can change it while voting is open.' : '')}</div>

              {question.status === 'closed' ? <div className="mt-3 rounded-2xl bg-gold/20 p-5 text-center"><CircleStopIcon /><p className="mt-2 font-display text-xl font-bold text-[#71580f]">Voting closed</p><p className="mt-1 text-sm text-[#71580f]/75">Your teacher may reveal the answer next.</p></div> : null}
              {question.status === 'revealed' ? <RevealedAnswer state={state} /> : null}
            </form>
          </section>
        )}
      </div>
    </main>
  )
}

function CircleStopIcon() {
  return <div className="mx-auto grid size-10 place-items-center rounded-full bg-gold/30"><span className="size-4 rounded-sm bg-[#8a6b18]" /></div>
}

function RevealedAnswer({ state }: { state: StudentState }) {
  const question = state.question
  if (!question) return null
  const correctness = state.own_response?.is_correct
  return (
    <div className={`mt-3 rounded-2xl p-5 text-center ${correctness === true ? 'bg-mint text-pine' : correctness === false ? 'bg-coral/10 text-[#923421]' : 'bg-forest/5 text-ink'}`}>
      {correctness === true ? <CheckCircle2 className="mx-auto size-10" /> : correctness === false ? <XCircle className="mx-auto size-10" /> : <CheckCircle2 className="mx-auto size-10 text-pine" />}
      <p className="mt-2 font-display text-xl font-bold">{correctness === true ? 'Correct!' : correctness === false ? 'Not this time' : 'Answer revealed'}</p>
      {question.correct_answer !== null && question.correct_answer !== undefined ? <p className="mt-2 text-sm">Correct answer: <strong>{formatAnswer(question.correct_answer, question.options ? { options: question.options } : {})}</strong></p> : <p className="mt-2 text-sm opacity-70">Thanks for sharing your response.</p>}
    </div>
  )
}
