/**
 * Pure quiz-domain helpers shared by the student, teacher, history, and export UI.
 * This module deliberately has no database or React dependencies.
 */

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' as const
export const DEFAULT_JOIN_CODE_LENGTH = 6
export const MIN_JOIN_CODE_LENGTH = 4
export const MAX_JOIN_CODE_LENGTH = 12

export type RandomSource = () => number

export interface ResponseLike {
  answer: unknown
  is_correct?: boolean | null
  isCorrect?: boolean | null
}

export interface QuizOption {
  id: string
  text: string
}

export interface ParticipationStatistics {
  totalResponses: number
  participantCount: number | null
  unanswered: number | null
  responseRate: number | null
  invalidResponses: number
}

export interface CategoricalAnswerStatistic {
  optionId: string
  label: string
  count: number
  percentage: number
}

export interface CategoricalStatistics extends ParticipationStatistics {
  answers: CategoricalAnswerStatistic[]
}

export interface CategoricalStatisticsOptions {
  options?: readonly QuizOption[]
  participantCount?: number
  percentageDigits?: number
}

export interface NumericStatistics extends ParticipationStatistics {
  mean: number | null
  median: number | null
  minimum: number | null
  maximum: number | null
  correctCount: number | null
  correctPercentage: number | null
}

export interface NumericStatisticsOptions {
  participantCount?: number
  correctAnswer?: unknown
  tolerance?: number
  percentageDigits?: number
}

export interface OpenTextFrequency {
  answer: string
  count: number
  percentage: number
}

export interface OpenTextStatistics extends ParticipationStatistics {
  /** Non-empty answers, kept in submission order and without participant names. */
  answers: string[]
  /** Identical, normalised answers grouped by frequency. */
  frequencies: OpenTextFrequency[]
}

export interface OpenTextStatisticsOptions {
  participantCount?: number
  caseSensitive?: boolean
  percentageDigits?: number
}

export interface AnswerEqualityOptions {
  trimStrings?: boolean
  caseSensitive?: boolean
  coerceNumericStrings?: boolean
  coerceBooleanStrings?: boolean
  numericTolerance?: number
}

export interface FormatAnswerOptions {
  options?: readonly QuizOption[] | Readonly<Record<string, string>>
  emptyText?: string
  arraySeparator?: string
}

export interface CsvColumn {
  key: string
  header?: string
}

export interface CsvOptions {
  columns?: readonly (string | CsvColumn)[]
  includeHeader?: boolean
  includeBom?: boolean
  mitigateFormulas?: boolean
  lineEnding?: '\r\n' | '\n'
}

export type CsvRecord = Readonly<Record<string, unknown>>

const JOIN_CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]+$`)
const NUMERIC_TEXT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const DANGEROUS_SPREADSHEET_PREFIX = /^\s*[=+\-@]/u
const WRAPPED_ANSWER_KEYS = [
  'option_id',
  'optionId',
  'selected_option_id',
  'selectedOptionId',
  'value',
  'answer',
  'id',
] as const

/** Normalise common human input without hiding unsupported characters. */
export function normalizeJoinCode(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase().replace(/[\s-]+/g, '')
}

export function isValidJoinCode(value: string, expectedLength?: number): boolean {
  const code = normalizeJoinCode(value)
  const validLength = expectedLength === undefined
    ? code.length >= MIN_JOIN_CODE_LENGTH && code.length <= MAX_JOIN_CODE_LENGTH
    : Number.isInteger(expectedLength) && code.length === expectedLength

  return validLength && JOIN_CODE_PATTERN.test(code)
}

function browserSafeRandom(): number {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const value = new Uint32Array(1)
    cryptoApi.getRandomValues(value)
    // Uint32Array indexing is safe here because the array always has one element.
    return (value[0] ?? 0) / 0x1_0000_0000
  }
  return Math.random()
}

/**
 * Generate an easy-to-read code. Supply a random source in tests or deterministic
 * demos; production callers get the browser's cryptographic random source.
 */
export function generateJoinCode(
  length = DEFAULT_JOIN_CODE_LENGTH,
  random: RandomSource = browserSafeRandom,
): string {
  if (!Number.isInteger(length) || length < MIN_JOIN_CODE_LENGTH || length > MAX_JOIN_CODE_LENGTH) {
    throw new RangeError(
      `Join code length must be an integer from ${MIN_JOIN_CODE_LENGTH} to ${MAX_JOIN_CODE_LENGTH}.`,
    )
  }

  let code = ''
  for (let index = 0; index < length; index += 1) {
    const sample = random()
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('The random source must return a finite number in the range [0, 1).')
    }
    code += JOIN_CODE_ALPHABET[Math.floor(sample * JOIN_CODE_ALPHABET.length)]
  }
  return code
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Unwrap the small JSON objects commonly used to persist an answer. */
export function unwrapAnswer(answer: unknown): unknown {
  let current = answer
  const visited = new Set<object>()

  for (let depth = 0; depth < 8 && isRecord(current); depth += 1) {
    if (visited.has(current)) return current
    visited.add(current)

    const key = WRAPPED_ANSWER_KEYS.find(
      (candidate) => Object.prototype.hasOwnProperty.call(current, candidate),
    )
    if (key === undefined) return current
    current = current[key]
  }

  return current
}

function numericValue(value: unknown): number | null {
  const unwrapped = unwrapAnswer(value)
  if (typeof unwrapped === 'number') return Number.isFinite(unwrapped) ? unwrapped : null
  if (typeof unwrapped !== 'string') return null

  const trimmed = unwrapped.trim()
  if (!NUMERIC_TEXT_PATTERN.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseNumericAnswer(answer: unknown): number | null {
  return numericValue(answer)
}

function categoryKey(answer: unknown): string | null {
  const value = unwrapAnswer(answer)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'boolean') return String(value)
  return null
}

function normaliseForStableJson(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
    return value
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.map((item) => normaliseForStableJson(item, seen))
    seen.delete(value)
    return result
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = normaliseForStableJson((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return result
}

function stableStringify(value: unknown): string {
  try {
    const serialised = JSON.stringify(normaliseForStableJson(value, new Set<object>()))
    return serialised ?? String(value)
  } catch {
    return String(value)
  }
}

function optionLabel(
  key: string,
  options: readonly QuizOption[] | Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (options === undefined) return undefined
  if (Array.isArray(options)) return options.find((option) => option.id === key)?.text
  return (options as Readonly<Record<string, string>>)[key]
}

export function formatAnswer(answer: unknown, options: FormatAnswerOptions = {}): string {
  const emptyText = options.emptyText ?? '—'
  if (answer === null || answer === undefined) return emptyText

  if (Array.isArray(answer)) {
    return answer
      .map((item) => formatAnswer(item, options))
      .join(options.arraySeparator ?? ', ')
  }

  if (isRecord(answer)) {
    const text = answer.text ?? answer.label
    if (typeof text === 'string' && text.trim().length > 0) return text.trim()
  }

  const value = unwrapAnswer(answer)
  if (value !== answer) return formatAnswer(value, options)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return emptyText
    return optionLabel(trimmed, options.options) ?? trimmed
  }
  if (typeof value === 'boolean') {
    const key = String(value)
    return optionLabel(key, options.options) ?? (value ? 'True' : 'False')
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : emptyText
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? emptyText : value.toISOString()
  if (typeof value === 'object') return stableStringify(value)
  return String(value)
}

function booleanValue(value: unknown): boolean | null {
  const unwrapped = unwrapAnswer(value)
  if (typeof unwrapped === 'boolean') return unwrapped
  if (typeof unwrapped !== 'string') return null
  const normalised = unwrapped.trim().toLowerCase()
  if (normalised === 'true') return true
  if (normalised === 'false') return false
  return null
}

/** Compare persisted JSON answers while tolerating their common wrapper shapes. */
export function areAnswersEqual(
  first: unknown,
  second: unknown,
  options: AnswerEqualityOptions = {},
): boolean {
  const left = unwrapAnswer(first)
  const right = unwrapAnswer(second)

  if (Object.is(left, right)) return true
  if (left === null || left === undefined || right === null || right === undefined) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => areAnswersEqual(item, right[index], options))
  }

  if (options.coerceBooleanStrings ?? true) {
    const leftBoolean = booleanValue(left)
    const rightBoolean = booleanValue(right)
    if (leftBoolean !== null && rightBoolean !== null) return leftBoolean === rightBoolean
  }

  if (options.coerceNumericStrings ?? true) {
    const leftNumber = numericValue(left)
    const rightNumber = numericValue(right)
    if (leftNumber !== null && rightNumber !== null) {
      const tolerance = Math.max(0, options.numericTolerance ?? 0)
      return Math.abs(leftNumber - rightNumber) <= tolerance
    }
  }

  if (typeof left === 'string' && typeof right === 'string') {
    let normalisedLeft = options.trimStrings ?? true ? left.trim() : left
    let normalisedRight = options.trimStrings ?? true ? right.trim() : right
    if (!(options.caseSensitive ?? false)) {
      normalisedLeft = normalisedLeft.toLocaleLowerCase()
      normalisedRight = normalisedRight.toLocaleLowerCase()
    }
    return normalisedLeft === normalisedRight
  }

  if (typeof left === 'object' && typeof right === 'object') {
    return stableStringify(left) === stableStringify(right)
  }
  return false
}

export function roundPercentage(part: number, total: number, digits = 1): number {
  if (total <= 0 || part <= 0) return 0
  const safeDigits = Math.min(6, Math.max(0, Math.trunc(digits)))
  const factor = 10 ** safeDigits
  return Math.round((part / total) * 100 * factor) / factor
}

function participationStatistics(
  totalResponses: number,
  invalidResponses: number,
  participantCount: number | undefined,
  percentageDigits: number,
): ParticipationStatistics {
  if (participantCount === undefined || !Number.isFinite(participantCount)) {
    return {
      totalResponses,
      participantCount: null,
      unanswered: null,
      responseRate: null,
      invalidResponses,
    }
  }

  const count = Math.max(0, Math.trunc(participantCount))
  return {
    totalResponses,
    participantCount: count,
    unanswered: Math.max(0, count - totalResponses),
    responseRate: count === 0
      ? 0
      : Math.min(100, roundPercentage(totalResponses, count, percentageDigits)),
    invalidResponses,
  }
}

export function calculateCategoricalStatistics(
  responses: readonly ResponseLike[],
  options: CategoricalStatisticsOptions = {},
): CategoricalStatistics {
  const digits = options.percentageDigits ?? 1
  const counts = new Map<string, number>()
  const labels = new Map<string, string>()

  for (const option of options.options ?? []) {
    if (!counts.has(option.id)) {
      counts.set(option.id, 0)
      labels.set(option.id, option.text)
    }
  }

  let invalidResponses = 0
  for (const response of responses) {
    const key = categoryKey(response.answer)
    if (key === null) {
      invalidResponses += 1
      continue
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!labels.has(key)) labels.set(key, formatAnswer(response.answer, { emptyText: key }))
  }

  const validResponses = responses.length - invalidResponses
  const answers = Array.from(counts, ([optionId, count]) => ({
    optionId,
    label: labels.get(optionId) ?? optionId,
    count,
    percentage: roundPercentage(count, validResponses, digits),
  }))

  return {
    ...participationStatistics(
      responses.length,
      invalidResponses,
      options.participantCount,
      digits,
    ),
    answers,
  }
}

function responseCorrectness(response: ResponseLike): boolean | null {
  if (typeof response.is_correct === 'boolean') return response.is_correct
  if (typeof response.isCorrect === 'boolean') return response.isCorrect
  return null
}

export function calculateNumericStatistics(
  responses: readonly ResponseLike[],
  options: NumericStatisticsOptions = {},
): NumericStatistics {
  const digits = options.percentageDigits ?? 1
  const values: Array<{ value: number; response: ResponseLike }> = []
  for (const response of responses) {
    const value = numericValue(response.answer)
    if (value !== null) values.push({ value, response })
  }

  const sorted = values.map(({ value }) => value).sort((first, second) => first - second)
  const validResponses = sorted.length
  const middle = Math.floor(validResponses / 2)
  const mean = validResponses === 0
    ? null
    : sorted.reduce((sum, value) => sum + value, 0) / validResponses
  const median = validResponses === 0
    ? null
    : validResponses % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? null)

  const correctAnswer = numericValue(options.correctAnswer)
  const hasCorrectAnswer = options.correctAnswer !== undefined
    && options.correctAnswer !== null
    && correctAnswer !== null
  const hasStoredCorrectness = values.some(({ response }) => responseCorrectness(response) !== null)
  const canCalculateCorrectness = hasCorrectAnswer || hasStoredCorrectness
  const tolerance = Math.max(0, options.tolerance ?? 0)
  const correctCount = canCalculateCorrectness
    ? values.reduce((count, entry) => {
        const correct = hasCorrectAnswer
          ? Math.abs(entry.value - (correctAnswer ?? 0)) <= tolerance
          : responseCorrectness(entry.response) === true
        return count + (correct ? 1 : 0)
      }, 0)
    : null

  return {
    ...participationStatistics(
      responses.length,
      responses.length - validResponses,
      options.participantCount,
      digits,
    ),
    mean,
    median,
    minimum: sorted[0] ?? null,
    maximum: sorted[sorted.length - 1] ?? null,
    correctCount,
    correctPercentage: correctCount === null
      ? null
      : roundPercentage(correctCount, validResponses, digits),
  }
}

function textAnswer(answer: unknown): string | null {
  if (isRecord(answer)) {
    const text = answer.text ?? answer.value ?? answer.answer
    if (typeof text === 'string') {
      const trimmed = text.trim()
      return trimmed.length > 0 ? trimmed : null
    }
  }

  const value = unwrapAnswer(answer)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return null
}

export function calculateOpenTextStatistics(
  responses: readonly ResponseLike[],
  options: OpenTextStatisticsOptions = {},
): OpenTextStatistics {
  const digits = options.percentageDigits ?? 1
  const answers: string[] = []
  const grouped = new Map<string, { answer: string; count: number; firstSeen: number }>()

  for (const response of responses) {
    const answer = textAnswer(response.answer)
    if (answer === null) continue
    answers.push(answer)
    const key = options.caseSensitive ?? false ? answer : answer.toLocaleLowerCase()
    const existing = grouped.get(key)
    if (existing) existing.count += 1
    else grouped.set(key, { answer, count: 1, firstSeen: answers.length - 1 })
  }

  const validResponses = answers.length
  const frequencies = Array.from(grouped.values())
    .sort((first, second) => second.count - first.count || first.firstSeen - second.firstSeen)
    .map(({ answer, count }) => ({
      answer,
      count,
      percentage: roundPercentage(count, validResponses, digits),
    }))

  return {
    ...participationStatistics(
      responses.length,
      responses.length - validResponses,
      options.participantCount,
      digits,
    ),
    answers,
    frequencies,
  }
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (typeof value === 'object') return stableStringify(value)
  return String(value)
}

/** RFC 4180 cell escaping plus optional protection against spreadsheet formulas. */
export function escapeCsvCell(value: unknown, mitigateFormulas = true): string {
  let text = csvValue(value)
  // Keep actual negative numbers numeric, but neutralise user-provided strings such as "-1+2".
  if (mitigateFormulas && typeof value === 'string' && DANGEROUS_SPREADSHEET_PREFIX.test(text)) {
    text = `'${text}`
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function inferCsvColumns(rows: readonly object[]): CsvColumn[] {
  const seen = new Set<string>()
  const columns: CsvColumn[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push({ key })
      }
    }
  }
  return columns
}

/**
 * Build an RFC 4180 CSV document. A columns array may be passed directly as a
 * convenience, or configured through CsvOptions for custom headers.
 */
export function createCsv<Row extends object>(
  rows: readonly Row[],
  columnsOrOptions: readonly (string | CsvColumn)[] | CsvOptions = {},
): string {
  const options: CsvOptions = Array.isArray(columnsOrOptions)
    ? { columns: columnsOrOptions }
    : columnsOrOptions as CsvOptions
  const columns = options.columns?.map((column) => (
    typeof column === 'string' ? { key: column } : column
  )) ?? inferCsvColumns(rows)
  const mitigateFormulas = options.mitigateFormulas ?? true
  const lineEnding = options.lineEnding ?? '\r\n'
  const lines: string[] = []

  if (options.includeHeader ?? true) {
    if (columns.length > 0) {
      lines.push(columns
        .map((column) => escapeCsvCell(column.header ?? column.key, mitigateFormulas))
        .join(','))
    }
  }

  for (const row of rows) {
    const record = row as Readonly<Record<string, unknown>>
    lines.push(columns
      .map((column) => escapeCsvCell(record[column.key], mitigateFormulas))
      .join(','))
  }

  const csv = lines.join(lineEnding)
  return options.includeBom ? `\uFEFF${csv}` : csv
}

/** Trigger a browser download. Returns false during SSR/tests where no DOM exists. */
export function downloadCsv(csv: string, filename = 'responses.csv'): boolean {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return false
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false

  const finalFilename = filename.toLocaleLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = finalFilename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return true
}
