import { BarChart3, CheckCircle2, Clock3, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Json, Question, QuestionStatistics } from '../types/domain'

interface StatisticsViewProps {
  question: Pick<Question, 'question_type' | 'status' | 'correct_answer' | 'options'>
  statistics: QuestionStatistics | null
  loading?: boolean
  large?: boolean
}

function answersMatch(left: Json | null, right: string): boolean {
  if (typeof left === 'boolean') return String(left) === right
  if (typeof left === 'number') return String(left) === right
  return left === right
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-forest/10 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink/50"><Icon className="size-4" aria-hidden="true" /> {label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-forest">{value}</div>
    </div>
  )
}

export function StatisticsView({ question, statistics, loading = false, large = false }: StatisticsViewProps) {
  if (loading && !statistics) {
    return <div className="grid min-h-52 place-items-center text-ink/50" role="status">Updating results…</div>
  }

  if (!statistics) {
    return (
      <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-forest/20 bg-cream/45 p-6 text-center">
        <div>
          <BarChart3 className="mx-auto size-8 text-ink/30" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink/60">Results will appear here as students answer.</p>
        </div>
      </div>
    )
  }

  const responseRate = statistics.participant_count > 0
    ? Math.round((statistics.total_responses / statistics.participant_count) * 100)
    : 0

  return (
    <div className="space-y-5" aria-live="polite" aria-busy={loading}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Responses" value={statistics.total_responses} icon={Users} />
        <StatTile label="Response rate" value={`${responseRate}%`} icon={BarChart3} />
        <StatTile label="Not answered" value={statistics.unanswered} icon={Clock3} />
        <StatTile label="In room" value={statistics.participant_count} icon={Users} />
      </div>

      {(question.question_type === 'multiple_choice' || question.question_type === 'true_false') && statistics.answers ? (
        <div>
          <div className={large ? 'h-[25rem]' : 'h-72'} aria-label="Answer distribution bar chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statistics.answers} margin={{ top: 12, right: 12, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dce5e1" />
                <XAxis dataKey="label" tick={{ fill: '#17302b', fontSize: large ? 16 : 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#58706a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(223,242,233,.45)' }}
                  formatter={(value, _name, item) => [
                    `${String(value ?? 0)} (${(item.payload as { percentage?: number } | undefined)?.percentage ?? 0}%)`,
                    'Responses',
                  ]}
                  contentStyle={{ borderRadius: 14, borderColor: '#dce5e1' }}
                />
                <Bar dataKey="count" name="Responses" radius={[9, 9, 0, 0]} maxBarSize={large ? 120 : 90}>
                  {statistics.answers.map((answer) => {
                    const isCorrect = question.status === 'revealed' && answersMatch(question.correct_answer, answer.option_id)
                    return <Cell key={answer.option_id} fill={isCorrect ? '#1c8c6f' : '#e7684f'} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {statistics.answers.map((answer) => {
              const isCorrect = question.status === 'revealed' && answersMatch(question.correct_answer, answer.option_id)
              return (
                <div key={answer.option_id} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-3 py-2.5 ${isCorrect ? 'bg-mint text-pine' : 'bg-forest/[0.035]'}`}>
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {isCorrect ? <CheckCircle2 className="size-4 shrink-0" aria-label="Correct answer" /> : null}
                    <span className="truncate">{answer.label}</span>
                  </span>
                  <span className="tabular-nums">{answer.count}</span>
                  <span className="w-16 text-right font-bold tabular-nums">{answer.percentage}%</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {question.question_type === 'numeric' && statistics.numeric ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Mean" value={statistics.numeric.mean ?? '—'} icon={BarChart3} />
          <StatTile label="Median" value={statistics.numeric.median ?? '—'} icon={BarChart3} />
          <StatTile label="Minimum" value={statistics.numeric.minimum ?? '—'} icon={BarChart3} />
          <StatTile label="Maximum" value={statistics.numeric.maximum ?? '—'} icon={BarChart3} />
          {statistics.numeric.correct_count !== null ? (
            <div className="col-span-2 rounded-2xl bg-mint p-5 text-pine sm:col-span-4">
              <span className="font-display text-3xl font-extrabold">{statistics.numeric.correct_percentage ?? 0}%</span>
              <span className="ml-2 font-semibold">correct ({statistics.numeric.correct_count} students)</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {question.question_type === 'open_text' ? (
        statistics.text_answers?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {statistics.text_answers.map((entry, index) => (
              <div key={`${entry.answer}-${index}`} className="flex min-h-14 items-start justify-between gap-3 rounded-2xl border border-forest/10 bg-white px-4 py-3">
                <span className="break-words">{entry.answer}</span>
                {entry.count > 1 ? <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-pine">×{entry.count}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream p-6 text-center text-ink/55">No written responses yet.</p>
        )
      ) : null}
    </div>
  )
}
