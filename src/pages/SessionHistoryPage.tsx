import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Download, FileText, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBanner, PageLoader, StatusPill } from '../components/Feedback'
import { StatisticsView } from '../components/StatisticsView'
import { getQuestionStatistics } from '../lib/api'
import { getErrorMessage, withTimeout } from '../lib/errors'
import { createCsv, downloadCsv, formatAnswer } from '../lib/quiz'
import { supabase } from '../lib/supabase'
import type { ClassroomResponse, ClassroomSession, Participant, Question, QuestionStatistics } from '../types/domain'

function dateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function fetchAllResponses(sessionId: string): Promise<ClassroomResponse[]> {
  const pageSize = 1_000
  const rows: ClassroomResponse[] = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await withTimeout(supabase
      .from('responses')
      .select('*')
      .eq('session_id', sessionId)
      .order('submitted_at')
      .order('id')
      .range(start, start + pageSize - 1))
    if (error) throw error
    const page = (data ?? []) as ClassroomResponse[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export function SessionHistoryPage() {
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<ClassroomSession | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [responses, setResponses] = useState<ClassroomResponse[]>([])
  const [statistics, setStatistics] = useState<Record<string, QuestionStatistics>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionResult, questionsResult, participantsResult, loadedResponses] = await withTimeout(Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase.from('questions').select('*').eq('session_id', sessionId).order('question_order'),
        supabase.from('participants').select('id, session_id, client_id, display_name, joined_at, last_seen_at').eq('session_id', sessionId),
        fetchAllResponses(sessionId),
      ]), 30_000)
      if (sessionResult.error) throw sessionResult.error
      if (questionsResult.error) throw questionsResult.error
      if (participantsResult.error) throw participantsResult.error
      const loadedQuestions = (questionsResult.data ?? []) as Question[]
      const statEntries = await Promise.all(loadedQuestions.map(async (question) => [question.id, await getQuestionStatistics(question.id)] as const))
      setSession(sessionResult.data as ClassroomSession)
      setQuestions(loadedQuestions)
      setParticipants((participantsResult.data ?? []) as Participant[])
      setResponses(loadedResponses)
      setStatistics(Object.fromEntries(statEntries))
      setError('')
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not load session history.'))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { void load() }, [load])

  const participantById = useMemo(() => new Map(participants.map((participant) => [participant.id, participant])), [participants])
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions])

  function toggleExpanded(questionId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  function exportResponses() {
    if (!session) return
    try {
      const rows = responses.map((response) => {
        const question = questionById.get(response.question_id)
        const participant = participantById.get(response.participant_id)
        const formatOptions = question?.options ? { options: question.options } : {}
        return {
          session_id: session.id,
          session_title: session.title,
          question_id: response.question_id,
          question_text: question?.prompt ?? '',
          question_type: question?.question_type ?? '',
          participant_id: response.participant_id,
          participant_name: participant?.display_name ?? '',
          answer: formatAnswer(response.answer, formatOptions),
          is_correct: response.is_correct ?? '',
          submitted_at: response.submitted_at,
          updated_at: response.updated_at,
        }
      })
      const csv = createCsv(rows, { includeBom: true })
      if (!downloadCsv(csv, `pulse-${session.join_code}-responses.csv`)) throw new Error('This browser could not start the download.')
      setNotice(`Exported ${rows.length} responses.`)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Could not export the responses.'))
    }
  }

  if (loading) return <PageLoader label="Building the session report…" />
  if (!session) return <main className="mx-auto max-w-4xl px-4 py-12"><ErrorBanner message={error || 'Session not found.'} onRetry={() => void load()} /></main>

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><Link to={session.status === 'ended' ? '/teacher' : `/teacher/session/${session.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink/50 hover:text-ink"><ArrowLeft className="size-4" /> {session.status === 'ended' ? 'Dashboard' : 'Control room'}</Link><div className="mt-5 flex items-center gap-2"><p className="eyebrow">Session history</p><StatusPill status={session.status} /></div><h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-forest sm:text-5xl">{session.title}</h1><p className="mt-2 text-ink/50">Created {dateTime(session.created_at)} · Code {session.join_code}</p></div>
        <button type="button" onClick={exportResponses} className="btn-primary" disabled={!responses.length}><Download className="size-4" /> Export CSV</button>
      </div>
      {error ? <div className="mt-5"><ErrorBanner message={error} onRetry={() => void load()} /></div> : null}
      <div className="mt-7 min-h-6 text-sm font-semibold text-pine" role="status">{notice}</div>

      <section className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Participants" value={participants.length} icon={Users} />
        <Summary label="Questions" value={questions.length} icon={FileText} />
        <Summary label="Answers" value={responses.length} icon={CheckCircle2} />
        <Summary label="Started" value={session.started_at ? new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(session.started_at)) : '—'} icon={CheckCircle2} />
      </section>

      <section className="mt-10 space-y-5">
        {questions.map((question) => {
          const questionResponses = responses.filter((response) => response.question_id === question.id)
          const isExpanded = expanded.has(question.id)
          const questionStats = statistics[question.id]
          const correctPercentage = question.question_type === 'numeric'
            ? questionStats?.numeric?.correct_percentage
            : question.correct_answer !== null
              ? questionStats?.answers?.find((item) => item.option_id === String(question.correct_answer))?.percentage
              : null
          return (
            <article className="card overflow-hidden" key={question.id}>
              <div className="border-b border-forest/10 bg-white p-5 sm:p-7">
                <div className="flex flex-wrap items-center gap-2"><span className="eyebrow">Question {question.question_order}</span><StatusPill status={question.status} /><span className="rounded-full bg-forest/5 px-2.5 py-1 text-xs font-semibold text-ink/50">{question.question_type.replace('_', ' ')}</span></div>
                <h2 className="mt-3 font-display text-2xl font-bold text-forest sm:text-3xl">{question.prompt}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink/45"><span>Launched: {dateTime(question.launched_at)}</span><span>Closed: {dateTime(question.closed_at)}</span>{correctPercentage !== null && correctPercentage !== undefined ? <span className="rounded-full bg-mint px-2.5 py-1 font-bold text-pine">{correctPercentage}% correct</span> : null}</div>
              </div>
              <div className="p-5 sm:p-7"><StatisticsView question={question.correct_answer !== null ? { ...question, status: 'revealed' } : question} statistics={questionStats ?? null} /></div>
              <button type="button" onClick={() => toggleExpanded(question.id)} className="flex min-h-14 w-full items-center justify-center gap-2 border-t border-forest/10 bg-cream/60 px-4 text-sm font-bold text-pine hover:bg-mint/50">{isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{isExpanded ? 'Hide' : 'Show'} individual responses ({questionResponses.length})</button>
              {isExpanded ? (
                <div className="overflow-x-auto border-t border-forest/10">
                  <table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-forest/5 text-xs uppercase tracking-wide text-ink/45"><tr><th className="px-5 py-3">Participant</th><th className="px-5 py-3">Answer</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Result</th></tr></thead><tbody>{questionResponses.length ? questionResponses.map((response, index) => { const participant = participantById.get(response.participant_id); return <tr key={response.id} className="border-t border-forest/8"><td className="px-5 py-3 font-medium">{participant?.display_name || `Anonymous ${index + 1}`}</td><td className="max-w-md break-words px-5 py-3">{formatAnswer(response.answer, question.options ? { options: question.options } : {})}</td><td className="px-5 py-3 text-ink/50">{dateTime(response.submitted_at)}</td><td className="px-5 py-3">{response.is_correct === null ? '—' : response.is_correct ? <span className="font-bold text-pine">Correct</span> : <span className="font-bold text-coral">Incorrect</span>}</td></tr> }) : <tr><td colSpan={4} className="px-5 py-8 text-center text-ink/45">No responses for this question.</td></tr>}</tbody></table>
                </div>
              ) : null}
            </article>
          )
        })}
        {!questions.length ? <div className="card p-10 text-center text-ink/50">No questions were created in this session.</div> : null}
      </section>
    </main>
  )
}

function Summary({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return <div className="card p-4 sm:p-5"><Icon className="size-5 text-pine" /><p className="mt-4 font-display text-3xl font-extrabold text-forest">{value}</p><p className="mt-1 text-sm text-ink/45">{label}</p></div>
}
