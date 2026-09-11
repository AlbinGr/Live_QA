import { Check, CircleHelp, Hash, ListChecks, MessageSquareText, Plus, Rocket, Save, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { AnswerOption, Json, Question, QuestionType } from '../types/domain'
import { getErrorMessage } from '../lib/errors'

export interface QuestionDraft {
  questionType: QuestionType
  prompt: string
  options: AnswerOption[] | null
  correctAnswer: Json | null
}

interface QuestionFormProps {
  initialQuestion?: Question | null
  onSubmit: (draft: QuestionDraft, launch: boolean) => Promise<void>
  onCancel: () => void
  canLaunch?: boolean
}

const typeChoices: Array<{ value: QuestionType; label: string; description: string; icon: typeof ListChecks }> = [
  { value: 'multiple_choice', label: 'Choice', description: '2–6 options', icon: ListChecks },
  { value: 'true_false', label: 'True / false', description: 'Quick check', icon: Check },
  { value: 'numeric', label: 'Number', description: 'Numeric answer', icon: Hash },
  { value: 'open_text', label: 'Open text', description: 'Written response', icon: MessageSquareText },
]

function freshOptions(): AnswerOption[] {
  return [
    { id: 'a', text: '' },
    { id: 'b', text: '' },
  ]
}

function nextOptionId(options: AnswerOption[]): string {
  const preferred = ['a', 'b', 'c', 'd', 'e', 'f'].find((id) => !options.some((option) => option.id === id))
  return preferred ?? crypto.randomUUID().slice(0, 8)
}

export function QuestionForm({ initialQuestion, onSubmit, onCancel, canLaunch = true }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initialQuestion?.question_type ?? 'multiple_choice')
  const [prompt, setPrompt] = useState(initialQuestion?.prompt ?? '')
  const [options, setOptions] = useState<AnswerOption[]>(
    initialQuestion?.question_type === 'multiple_choice' && initialQuestion.options ? initialQuestion.options : freshOptions(),
  )
  const [choiceAnswer, setChoiceAnswer] = useState(
    initialQuestion?.question_type === 'multiple_choice' && typeof initialQuestion.correct_answer === 'string'
      ? initialQuestion.correct_answer
      : '',
  )
  const [trueFalseAnswer, setTrueFalseAnswer] = useState(
    initialQuestion?.question_type === 'true_false' && typeof initialQuestion.correct_answer === 'boolean'
      ? String(initialQuestion.correct_answer)
      : '',
  )
  const [numericAnswer, setNumericAnswer] = useState(
    initialQuestion?.question_type === 'numeric' && typeof initialQuestion.correct_answer === 'number'
      ? String(initialQuestion.correct_answer)
      : '',
  )
  const [busy, setBusy] = useState<'draft' | 'launch' | null>(null)
  const [submitError, setSubmitError] = useState('')

  const validationError = useMemo(() => {
    if (!prompt.trim()) return 'Add a question prompt.'
    if (type === 'multiple_choice') {
      if (options.length < 2 || options.length > 6) return 'Multiple choice needs 2–6 options.'
      if (options.some((option) => !option.text.trim())) return 'Fill in every answer option.'
      const unique = new Set(options.map((option) => option.text.trim().toLocaleLowerCase()))
      if (unique.size !== options.length) return 'Answer options must be different.'
      if (choiceAnswer && !options.some((option) => option.id === choiceAnswer)) return 'Choose a valid correct answer.'
    }
    if (type === 'numeric' && numericAnswer.trim() && !Number.isFinite(Number(numericAnswer))) {
      return 'The correct numeric answer is not valid.'
    }
    return ''
  }, [choiceAnswer, numericAnswer, options, prompt, type])

  function changeType(nextType: QuestionType) {
    setType(nextType)
    setSubmitError('')
  }

  function removeOption(id: string) {
    if (options.length <= 2) return
    setOptions((current) => current.filter((option) => option.id !== id))
    if (choiceAnswer === id) setChoiceAnswer('')
  }

  function buildDraft(): QuestionDraft {
    if (type === 'multiple_choice') {
      return {
        questionType: type,
        prompt: prompt.trim(),
        options: options.map((option) => ({ ...option, text: option.text.trim() })),
        correctAnswer: choiceAnswer || null,
      }
    }
    if (type === 'true_false') {
      return {
        questionType: type,
        prompt: prompt.trim(),
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correctAnswer: trueFalseAnswer ? trueFalseAnswer === 'true' : null,
      }
    }
    if (type === 'numeric') {
      return {
        questionType: type,
        prompt: prompt.trim(),
        options: null,
        correctAnswer: numericAnswer.trim() ? Number(numericAnswer) : null,
      }
    }
    return { questionType: type, prompt: prompt.trim(), options: null, correctAnswer: null }
  }

  async function save(event: FormEvent, launch: boolean) {
    event.preventDefault()
    setSubmitError('')
    if (validationError) {
      setSubmitError(validationError)
      return
    }
    setBusy(launch ? 'launch' : 'draft')
    try {
      await onSubmit(buildDraft(), launch)
    } catch (error) {
      setSubmitError(getErrorMessage(error))
      setBusy(null)
    }
  }

  return (
    <form onSubmit={(event) => void save(event, false)}>
      <fieldset disabled={busy !== null}>
        <legend className="label">Question type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {typeChoices.map((choice) => {
            const Icon = choice.icon
            const active = type === choice.value
            return (
              <button
                type="button"
                key={choice.value}
                onClick={() => changeType(choice.value)}
                className={`min-h-24 rounded-2xl border p-3 text-left transition ${
                  active ? 'border-pine bg-mint/70 ring-2 ring-pine/10' : 'border-forest/10 bg-white hover:border-forest/25'
                }`}
                aria-pressed={active}
              >
                <Icon className={`size-5 ${active ? 'text-pine' : 'text-ink/45'}`} aria-hidden="true" />
                <span className="mt-2 block text-sm font-bold">{choice.label}</span>
                <span className="block text-xs text-ink/50">{choice.description}</span>
              </button>
            )
          })}
        </div>

        <label className="mt-6 block">
          <span className="label">Question</span>
          <textarea
            className="field min-h-28 resize-y text-lg"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What would you like to ask?"
            maxLength={1000}
            autoFocus
          />
        </label>

        {type === 'multiple_choice' ? (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Answer options</span>
              <span className="text-xs text-ink/45">Select the circle to mark correct</span>
            </div>
            <div className="space-y-2.5">
              {options.map((option, index) => (
                <div key={option.id} className="flex items-center gap-2">
                  <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-forest/15 bg-white" title="Mark as correct">
                    <input
                      type="radio"
                      name="correct-choice"
                      value={option.id}
                      checked={choiceAnswer === option.id}
                      onChange={() => setChoiceAnswer(option.id)}
                      className="size-4 accent-[#1c5c4f]"
                      aria-label={`Mark option ${index + 1} as correct`}
                    />
                  </label>
                  <input
                    className="field"
                    value={option.text}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item) => (item.id === option.id ? { ...item, text: event.target.value } : item)),
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                    maxLength={300}
                    aria-label={`Option ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(option.id)}
                    disabled={options.length <= 2}
                    className="grid size-11 shrink-0 place-items-center rounded-xl text-ink/45 hover:bg-coral/10 hover:text-coral disabled:invisible"
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            {options.length < 6 ? (
              <button
                type="button"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-pine hover:bg-mint/50"
                onClick={() => setOptions((current) => [...current, { id: nextOptionId(current), text: '' }])}
              >
                <Plus className="size-4" aria-hidden="true" /> Add option
              </button>
            ) : null}
          </div>
        ) : null}

        {type === 'true_false' ? (
          <fieldset className="mt-6">
            <legend className="label">Correct answer <span className="font-normal text-ink/45">(optional)</span></legend>
            <div className="grid grid-cols-2 gap-3">
              {['true', 'false'].map((value) => (
                <label key={value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 ${trueFalseAnswer === value ? 'border-pine bg-mint/70' : 'border-forest/15 bg-white'}`}>
                  <input type="radio" name="true-false-answer" checked={trueFalseAnswer === value} onChange={() => setTrueFalseAnswer(value)} className="size-4 accent-[#1c5c4f]" />
                  <span className="font-semibold capitalize">{value}</span>
                </label>
              ))}
            </div>
            {trueFalseAnswer ? <button type="button" className="mt-2 text-sm text-ink/50 underline" onClick={() => setTrueFalseAnswer('')}>Clear correct answer</button> : null}
          </fieldset>
        ) : null}

        {type === 'numeric' ? (
          <label className="mt-6 block">
            <span className="label">Correct number <span className="font-normal text-ink/45">(optional)</span></span>
            <input type="number" step="any" className="field" value={numericAnswer} onChange={(event) => setNumericAnswer(event.target.value)} placeholder="e.g. 42" />
          </label>
        ) : null}

        {type === 'open_text' ? (
          <div className="mt-6 flex gap-3 rounded-2xl bg-mint/55 p-4 text-sm leading-6 text-pine">
            <CircleHelp className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            Students can submit a short written answer. There is no automatic correct answer for this type.
          </div>
        ) : null}
      </fieldset>

      <div aria-live="polite" className="mt-4 min-h-6 text-sm font-medium text-coral">{submitError}</div>

      <div className="mt-3 flex flex-col-reverse gap-2 border-t border-forest/10 pt-5 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy !== null}>Cancel</button>
        <button type="submit" className="btn-secondary" disabled={busy !== null}>
          <Save className="size-4" aria-hidden="true" /> {busy === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
        {canLaunch ? (
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={(event) => void save(event, true)}>
            <Rocket className="size-4" aria-hidden="true" /> {busy === 'launch' ? 'Launching…' : 'Save & launch'}
          </button>
        ) : null}
      </div>
    </form>
  )
}
