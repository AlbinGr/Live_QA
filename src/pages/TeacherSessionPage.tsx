import { ArrowLeft, ChevronRight, CircleStop, Clock3, Edit3, Eye, History, Laptop, Play, Plus, Power, QrCode, RefreshCw, Rocket, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConnectionBadge, ErrorBanner, PageLoader, StatusPill } from '../components/Feedback'
import { Modal } from '../components/Modal'
import { QuestionForm, type QuestionDraft } from '../components/QuestionForm'
import { SharePanel } from '../components/SharePanel'
import { StatisticsView } from '../components/StatisticsView'
import { closeQuestion, createQuestion, endSession, launchQuestion, revealAnswer, startSession, updateQuestion } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { useQuestionStatistics } from '../hooks/useQuestionStatistics'
import { useTeacherSession } from '../hooks/useTeacherSession'
import type { Question } from '../types/domain'

function typeLabel(type: Question['question_type']) {
  return { multiple_choice: 'Multiple choice', true_false: 'True / false', numeric: 'Numeric', open_text: 'Open text' }[type]
}

export function TeacherSessionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { session, questions, participants, loading, refreshing, connected, error: loadError, refresh } = useTeacherSession(sessionId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [busyAction, setBusyAction] = useState('')
  const [actionError, setActionError] = useState('')

  const liveQuestion = useMemo(() => questions.find((question) => question.status === 'live') ?? null, [questions])
  const selectedQuestion = questions.find((question) => question.id === selectedId) ?? liveQuestion ?? questions.at(-1) ?? null
  const { statistics, loading: statsLoading, error: statsError, refresh: refreshStats } = useQuestionStatistics(selectedQuestion?.id ?? null, sessionId)

  useEffect(() => {
    if (liveQuestion) setSelectedId(liveQuestion.id)
    else if (!selectedId && questions.length) setSelectedId(questions.at(-1)?.id ?? null)
  }, [liveQuestion, questions, selectedId])

  async function runAction(label: string, action: () => Promise<unknown>, after?: () => void) {
    setBusyAction(label)
    setActionError('')
    try {
      await action()
      await refresh()
      await refreshStats()
      after?.()
    } catch (caught) {
      setActionError(getErrorMessage(caught))
    } finally {
      setBusyAction('')
    }
  }

  async function saveQuestion(draft: QuestionDraft, launch: boolean) {
    if (editingQuestion) {
      const updated = await updateQuestion(editingQuestion.id, draft)
      if (launch) await launchQuestion(updated.id)
      setSelectedId(updated.id)
    } else {
      const created = await createQuestion(sessionId, draft, launch)
      setSelectedId(created.id)
    }
    setEditorOpen(false)
    setEditingQuestion(null)
    await refresh()
  }

  function openNewQuestion() {
    setEditingQuestion(null)
    setEditorOpen(true)
  }

  function openEdit(question: Question) {
    setEditingQuestion(question)
    setEditorOpen(true)
  }

  function launchNext() {
    const next = questions.find((question) => question.status === 'draft')
    if (next) {
      void runAction('next', () => launchQuestion(next.id), () => setSelectedId(next.id))
    } else {
      openNewQuestion()
    }
  }

  async function finishSession() {
    if (!session || !window.confirm('End this session? Students will no longer be able to answer. All results will remain saved.')) return
    await runAction('end', () => endSession(session.id), () => navigate(`/teacher/session/${session.id}/history`))
  }

  if (loading) return <PageLoader label="Opening the control room…" />
  if (!session) {
    return <main className="mx-auto max-w-3xl px-4 py-12"><ErrorBanner message={loadError || 'This session could not be found.'} onRetry={() => void refresh()} /><Link to="/teacher" className="btn-secondary mt-5"><ArrowLeft className="size-4" /> Dashboard</Link></main>
  }

  const controlsDisabled = Boolean(busyAction) || session.status === 'ended'

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/teacher" className="grid size-11 place-items-center rounded-xl border border-forest/10 bg-white hover:bg-mint/40" aria-label="Back to dashboard"><ArrowLeft className="size-5" /></Link>
          <div><div className="flex items-center gap-2"><StatusPill status={session.status} /><ConnectionBadge connected={connected} />{refreshing ? <RefreshCw className="size-3.5 animate-spin text-ink/30" aria-label="Refreshing" /> : null}</div><h1 className="mt-1 max-w-2xl truncate font-display text-2xl font-extrabold text-forest sm:text-3xl">{session.title}</h1></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setShareOpen(true)}><QrCode className="size-4" /> Share / QR</button>
          <Link to={`/teacher/session/${session.id}/present`} target="_blank" className="btn-secondary"><Laptop className="size-4" /> Present</Link>
          <Link to={`/teacher/session/${session.id}/history`} className="btn-secondary"><History className="size-4" /> History</Link>
          {session.status !== 'ended' ? <button type="button" className="btn-danger" onClick={() => void finishSession()} disabled={Boolean(busyAction)}><Power className="size-4" /> End</button> : null}
        </div>
      </div>

      {(loadError || actionError) ? <div className="mt-5"><ErrorBanner message={actionError || loadError} onRetry={() => { setActionError(''); void refresh() }} /></div> : null}

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <div className="card overflow-hidden">
            {selectedQuestion ? (
              <>
                <div className="bg-forest px-5 py-6 text-white sm:px-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm"><span className="rounded-full bg-white/10 px-2.5 py-1 font-bold">Question {selectedQuestion.question_order}</span><span className="text-white/55">{typeLabel(selectedQuestion.question_type)}</span></div>
                    <StatusPill status={selectedQuestion.status} />
                  </div>
                  <h2 className="mt-5 max-w-4xl font-display text-2xl font-bold leading-tight sm:text-4xl">{selectedQuestion.prompt}</h2>
                </div>

                <div className="p-5 sm:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/10 pb-5">
                    <div className="flex items-center gap-2 text-sm text-ink/55"><Users className="size-4 text-pine" /><strong className="text-ink">{statistics?.total_responses ?? 0}</strong> of {participants.length} answered</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedQuestion.status === 'draft' ? <button type="button" className="btn-secondary" onClick={() => openEdit(selectedQuestion)} disabled={controlsDisabled}><Edit3 className="size-4" /> Edit</button> : null}
                      {selectedQuestion.status === 'draft' ? <button type="button" className="btn-primary" onClick={() => void runAction('launch', () => launchQuestion(selectedQuestion.id), () => setSelectedId(selectedQuestion.id))} disabled={controlsDisabled}><Rocket className="size-4" /> {busyAction === 'launch' ? 'Launching…' : 'Launch'}</button> : null}
                      {selectedQuestion.status === 'live' ? <button type="button" className="btn-danger" onClick={() => void runAction('close', () => closeQuestion(selectedQuestion.id))} disabled={controlsDisabled}><CircleStop className="size-4" /> {busyAction === 'close' ? 'Closing…' : 'Close voting'}</button> : null}
                      {selectedQuestion.status === 'closed' ? <button type="button" className="btn-primary" onClick={() => void runAction('reveal', () => revealAnswer(selectedQuestion.id))} disabled={controlsDisabled}><Eye className="size-4" /> {busyAction === 'reveal' ? 'Revealing…' : 'Reveal answer'}</button> : null}
                      {(selectedQuestion.status === 'closed' || selectedQuestion.status === 'revealed') && !liveQuestion ? <button type="button" className="btn-secondary" onClick={launchNext} disabled={controlsDisabled}>Next question <ChevronRight className="size-4" /></button> : null}
                    </div>
                  </div>
                  {statsError ? <div className="mb-4 mt-5"><ErrorBanner message={statsError} onRetry={() => void refreshStats()} /></div> : null}
                  <div className="mt-5"><StatisticsView question={selectedQuestion} statistics={statistics} loading={statsLoading} /></div>
                </div>
              </>
            ) : (
              <div className="grid min-h-[28rem] place-items-center p-7 text-center">
                <div>
                  <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-mint text-pine"><Plus className="size-8" /></div>
                  <h2 className="mt-5 font-display text-3xl font-extrabold text-forest">Ask your first question</h2>
                  <p className="mx-auto mt-2 max-w-lg text-ink/55">Create it now and launch immediately, or save a few drafts before class.</p>
                  <button type="button" className="btn-primary mt-6 px-6 py-3" onClick={openNewQuestion} disabled={session.status === 'ended'}><Plus className="size-5" /> Quick question</button>
                </div>
              </div>
            )}
          </div>

          <section className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Question queue</p><h2 className="mt-1 font-display text-xl font-bold">{questions.length} {questions.length === 1 ? 'question' : 'questions'}</h2></div><button type="button" className="btn-primary" onClick={openNewQuestion} disabled={session.status === 'ended'}><Plus className="size-5" /> Quick question</button></div>
            {questions.length ? (
              <div className="mt-5 space-y-2">
                {questions.map((question) => (
                  <button type="button" key={question.id} onClick={() => setSelectedId(question.id)} className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedQuestion?.id === question.id ? 'border-pine bg-mint/55' : 'border-forest/8 bg-white hover:border-forest/20'}`}>
                    <span className="grid size-9 place-items-center rounded-xl bg-forest/5 text-sm font-bold text-ink/55">{question.question_order}</span>
                    <span className="min-w-0"><span className="block truncate font-semibold">{question.prompt}</span><span className="text-xs text-ink/45">{typeLabel(question.question_type)}</span></span>
                    <StatusPill status={question.status} />
                  </button>
                ))}
              </div>
            ) : <p className="mt-5 rounded-2xl bg-cream p-5 text-center text-ink/50">No questions yet.</p>}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <SharePanel joinCode={session.join_code} compact />
          <section className="card p-5">
            <div className="flex items-center justify-between"><div><p className="eyebrow">Participants</p><p className="mt-1 font-display text-3xl font-extrabold text-forest">{participants.length}</p></div><div className="grid size-12 place-items-center rounded-2xl bg-mint text-pine"><Users className="size-6" /></div></div>
            <div className="mt-4 max-h-52 space-y-1.5 overflow-y-auto">
              {participants.length ? participants.map((participant, index) => <div key={participant.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-forest/8 text-[10px] font-bold">{index + 1}</span><span className="truncate">{participant.display_name || `Student ${index + 1}`}</span></div>) : <p className="text-sm text-ink/45">Waiting for students to join…</p>}
            </div>
          </section>
          {session.status === 'draft' ? <button type="button" className="btn-secondary w-full" disabled={Boolean(busyAction)} onClick={() => void runAction('start', () => startSession(session.id))}><Play className="size-4" /> {busyAction === 'start' ? 'Starting…' : 'Start session without a question'}</button> : null}
          {session.status === 'live' && !liveQuestion ? <div className="flex gap-3 rounded-2xl border border-gold/30 bg-gold/15 p-4 text-sm text-[#6d5414]"><Clock3 className="size-5 shrink-0" /><span>Students are in the waiting room. Launch a question when you’re ready.</span></div> : null}
        </aside>
      </section>

      {editorOpen ? <Modal title={editingQuestion ? 'Edit question' : 'Quick question'} onClose={() => { setEditorOpen(false); setEditingQuestion(null) }}><QuestionForm initialQuestion={editingQuestion} onSubmit={saveQuestion} onCancel={() => { setEditorOpen(false); setEditingQuestion(null) }} canLaunch={session.status !== 'ended'} /></Modal> : null}
      {shareOpen ? <Modal title={`Share · ${session.title}`} onClose={() => setShareOpen(false)}><SharePanel joinCode={session.join_code} /></Modal> : null}
    </main>
  )
}
