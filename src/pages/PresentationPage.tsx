import { CheckCircle2, Expand, EyeOff, Minimize, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBanner, PageLoader, StatusPill } from '../components/Feedback'
import { SharePanel } from '../components/SharePanel'
import { StatisticsView } from '../components/StatisticsView'
import { useQuestionStatistics } from '../hooks/useQuestionStatistics'
import { useTeacherSession } from '../hooks/useTeacherSession'
import { buildJoinUrl } from '../lib/share'

export function PresentationPage() {
  const { sessionId = '' } = useParams()
  const { session, questions, participants, loading, error, refresh } = useTeacherSession(sessionId)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const currentQuestion = useMemo(
    () => questions.find((question) => question.status === 'live') ?? [...questions].reverse().find((question) => question.status !== 'draft') ?? null,
    [questions],
  )
  const { statistics, loading: statsLoading } = useQuestionStatistics(currentQuestion?.id ?? null, sessionId)

  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  if (loading) return <div className="min-h-screen bg-forest text-white"><PageLoader label="Preparing presentation…" /></div>
  if (!session) return <main className="min-h-screen bg-cream p-8"><ErrorBanner message={error || 'Session not found.'} onRetry={() => void refresh()} /></main>

  let joinUrl = ''
  try { joinUrl = buildJoinUrl(session.join_code) } catch { /* textual code remains available */ }

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between gap-4 border-b border-forest/10 bg-white px-5 py-3 sm:px-8">
        <div className="min-w-0"><p className="eyebrow">Presentation mode</p><h1 className="truncate font-display text-xl font-extrabold text-forest sm:text-2xl">{session.title}</h1></div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-xl bg-mint px-3 py-2 font-bold text-pine sm:flex"><Users className="size-5" /> {participants.length} joined</span><button type="button" className="btn-secondary px-3" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize className="size-5" /> : <Expand className="size-5" />}<span className="hidden sm:inline">{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span></button><Link to={`/teacher/session/${session.id}`} className="grid size-11 place-items-center rounded-xl border border-forest/15 bg-white" aria-label="Close presentation"><X className="size-5" /></Link></div>
      </header>

      {session.status === 'ended' ? (
        <section className="grid flex-1 place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto size-20 text-pine" /><p className="eyebrow mt-8">Session complete</p><h2 className="mt-3 font-display text-6xl font-extrabold text-forest">Thank you.</h2><p className="mt-4 text-2xl text-ink/55">All responses have been saved.</p></div></section>
      ) : !currentQuestion ? (
        <section className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
          <div><p className="eyebrow">Join the room</p><h2 className="mt-3 font-display text-5xl font-extrabold leading-tight text-forest sm:text-7xl">Scan. Join.<br /><span className="text-coral">Have your say.</span></h2><p className="mt-6 max-w-xl text-xl leading-8 text-ink/55">Point your phone camera at the QR code. There’s no app to install and no student account to create.</p></div>
          <SharePanel joinCode={session.join_code} />
        </section>
      ) : (
        <section className="flex flex-1 flex-col p-5 sm:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-5xl"><div className="flex items-center gap-3"><span className="eyebrow">Question {currentQuestion.question_order}</span><StatusPill status={currentQuestion.status} /></div><h2 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight text-forest sm:text-6xl">{currentQuestion.prompt}</h2></div>
              <div className="rounded-2xl bg-white px-5 py-3 text-center shadow-card"><span className="block text-sm font-semibold text-ink/45">Responses</span><span className="font-display text-4xl font-extrabold text-coral">{statistics?.total_responses ?? 0}</span></div>
            </div>
            {currentQuestion.status === 'live' ? (
              <div className="card mt-7 grid min-h-[24rem] place-items-center p-8 text-center">
                <div>
                  <div className="mx-auto grid size-20 place-items-center rounded-full bg-mint text-pine"><EyeOff className="size-10" aria-hidden="true" /></div>
                  <p className="eyebrow mt-7">Voting in progress</p>
                  <p className="mt-3 font-display text-7xl font-extrabold text-coral">{statistics?.total_responses ?? 0}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink/55">responses received</p>
                  <p className="mt-5 text-lg text-ink/45">The distribution appears here after voting closes.</p>
                </div>
              </div>
            ) : (
              <div className="card mt-7 p-5 sm:p-8"><StatisticsView question={currentQuestion} statistics={statistics} loading={statsLoading} large /></div>
            )}
          </div>
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-center gap-4 border-t border-forest/10 bg-white px-5 py-2.5 sm:justify-between">
        <span className="font-display text-xl font-extrabold tracking-[.22em] text-forest">{session.join_code}</span>
        <span className="hidden truncate text-sm font-semibold text-ink/45 sm:block">{joinUrl}</span>
        {joinUrl ? <QRCodeSVG value={joinUrl} size={48} marginSize={1} fgColor="#12352f" aria-label="Join QR code" /> : null}
      </footer>
    </main>
  )
}
