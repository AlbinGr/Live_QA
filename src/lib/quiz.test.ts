import { describe, expect, it } from 'vitest'

import {
  JOIN_CODE_ALPHABET,
  areAnswersEqual,
  calculateCategoricalStatistics,
  calculateNumericStatistics,
  calculateOpenTextStatistics,
  createCsv,
  downloadCsv,
  escapeCsvCell,
  formatAnswer,
  generateJoinCode,
  isValidJoinCode,
  normalizeJoinCode,
  parseNumericAnswer,
} from './quiz'

describe('join codes', () => {
  it('normalises casing, full-width characters, spaces, and visual separators', () => {
    expect(normalizeJoinCode('  ａｂｃ - 2 3  ')).toBe('ABC23')
    expect(isValidJoinCode(' abc-23 ', 5)).toBe(true)
  })

  it('rejects ambiguous and unsupported characters', () => {
    expect(isValidJoinCode('ABOI23', 6)).toBe(false)
    expect(isValidJoinCode('ABC!23', 6)).toBe(false)
  })

  it('uses only the unambiguous alphabet and supports deterministic generation', () => {
    const samples = [0, 0.999_999, 0.5, 0.25, 0.75, 0]
    let index = 0
    const code = generateJoinCode(6, () => samples[index++] ?? 0)

    expect(code).toBe(
      `${JOIN_CODE_ALPHABET[0]}${JOIN_CODE_ALPHABET.at(-1)}${JOIN_CODE_ALPHABET[Math.floor(JOIN_CODE_ALPHABET.length / 2)]}${JOIN_CODE_ALPHABET[Math.floor(JOIN_CODE_ALPHABET.length / 4)]}${JOIN_CODE_ALPHABET[Math.floor(JOIN_CODE_ALPHABET.length * 0.75)]}${JOIN_CODE_ALPHABET[0]}`,
    )
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })

  it('guards invalid lengths and random sources', () => {
    expect(() => generateJoinCode(3)).toThrow(RangeError)
    expect(() => generateJoinCode(6, () => 1)).toThrow(RangeError)
    expect(() => generateJoinCode(6, () => Number.NaN)).toThrow(RangeError)
  })
})

describe('answer helpers', () => {
  it('unwraps, labels, and formats common JSON answer shapes', () => {
    const options = [{ id: 'a', text: 'Paris' }]
    expect(formatAnswer({ option_id: 'a' }, { options })).toBe('Paris')
    expect(formatAnswer({ text: ' A written answer ' })).toBe('A written answer')
    expect(formatAnswer(false)).toBe('False')
    expect(formatAnswer(null)).toBe('—')
  })

  it('compares wrapper shapes, numeric values, booleans, arrays, and object key order', () => {
    expect(areAnswersEqual({ option_id: 'A' }, ' a ')).toBe(true)
    expect(areAnswersEqual({ value: '12.50' }, 12.5)).toBe(true)
    expect(areAnswersEqual('TRUE', true)).toBe(true)
    expect(areAnswersEqual(['A', 2], ['a', '2'])).toBe(true)
    expect(areAnswersEqual({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true)
    expect(areAnswersEqual(10, 10.1, { numericTolerance: 0.05 })).toBe(false)
    expect(parseNumericAnswer(' 1.2e2 ')).toBe(120)
    expect(parseNumericAnswer('12 students')).toBeNull()
  })
})

describe('statistics', () => {
  it('calculates categorical counts, zero-count options, percentages, and participation', () => {
    const stats = calculateCategoricalStatistics(
      [
        { answer: { option_id: 'a' } },
        { answer: 'a' },
        { answer: 'b' },
        { answer: 'unexpected' },
        { answer: '' },
      ],
      {
        options: [
          { id: 'a', text: 'Paris' },
          { id: 'b', text: 'London' },
          { id: 'c', text: 'Bern' },
        ],
        participantCount: 6,
      },
    )

    expect(stats).toMatchObject({
      totalResponses: 5,
      invalidResponses: 1,
      participantCount: 6,
      unanswered: 1,
      responseRate: 83.3,
    })
    expect(stats.answers).toEqual([
      { optionId: 'a', label: 'Paris', count: 2, percentage: 50 },
      { optionId: 'b', label: 'London', count: 1, percentage: 25 },
      { optionId: 'c', label: 'Bern', count: 0, percentage: 0 },
      { optionId: 'unexpected', label: 'unexpected', count: 1, percentage: 25 },
    ])
  })

  it('calculates numeric summaries and correctness while ignoring invalid values', () => {
    const stats = calculateNumericStatistics(
      [
        { answer: '10' },
        { answer: { value: 12 } },
        { answer: '14.0004' },
        { answer: 'not a number' },
      ],
      { correctAnswer: 14, tolerance: 0.001, participantCount: 5 },
    )

    expect(stats).toMatchObject({
      totalResponses: 4,
      participantCount: 5,
      unanswered: 1,
      responseRate: 80,
      invalidResponses: 1,
      median: 12,
      minimum: 10,
      maximum: 14.0004,
      correctCount: 1,
      correctPercentage: 33.3,
    })
    expect(stats.mean).toBeCloseTo(12.000_133_333_333_334)
  })

  it('returns null numeric aggregates when no submitted value is usable', () => {
    expect(calculateNumericStatistics([{ answer: '' }, { answer: null }])).toMatchObject({
      totalResponses: 2,
      invalidResponses: 2,
      mean: null,
      median: null,
      minimum: null,
      maximum: null,
      correctCount: null,
      correctPercentage: null,
    })
  })

  it('groups trimmed open text without leaking participant information', () => {
    const stats = calculateOpenTextStatistics(
      [
        { answer: ' Photosynthesis ' },
        { answer: { text: 'photosynthesis' } },
        { answer: 'Respiration' },
        { answer: '  ' },
      ],
      { participantCount: 5 },
    )

    expect(stats.answers).toEqual(['Photosynthesis', 'photosynthesis', 'Respiration'])
    expect(stats.frequencies).toEqual([
      { answer: 'Photosynthesis', count: 2, percentage: 66.7 },
      { answer: 'Respiration', count: 1, percentage: 33.3 },
    ])
    expect(stats.unanswered).toBe(1)
    expect(stats.invalidResponses).toBe(1)
  })
})

describe('CSV', () => {
  it('escapes RFC 4180 special characters', () => {
    expect(escapeCsvCell('plain')).toBe('plain')
    expect(escapeCsvCell('Ada, Lovelace')).toBe('"Ada, Lovelace"')
    expect(escapeCsvCell('He said "yes"')).toBe('"He said ""yes"""')
    expect(escapeCsvCell('line 1\r\nline 2')).toBe('"line 1\r\nline 2"')
  })

  it('neutralises user-controlled spreadsheet formulas but preserves numeric negatives', () => {
    expect(escapeCsvCell('=HYPERLINK("https://example.test")')).toBe(
      '"\'=HYPERLINK(""https://example.test"")"',
    )
    expect(escapeCsvCell('  +SUM(A1:A2)')).toBe("'  +SUM(A1:A2)")
    expect(escapeCsvCell(-42)).toBe('-42')
    expect(escapeCsvCell('-42')).toBe("'-42")
  })

  it('creates a deterministic CSV with custom headers, JSON, blanks, and CRLF rows', () => {
    const csv = createCsv(
      [
        { name: 'Ada, A.', answer: { option_id: 'a' }, correct: true },
        { name: '=cmd', answer: null, correct: false },
      ],
      {
        columns: [
          { key: 'name', header: 'Student name' },
          'answer',
          'correct',
        ],
      },
    )

    expect(csv).toBe([
      'Student name,answer,correct',
      '"Ada, A.","{""option_id"":""a""}",true',
      "'=cmd,,false",
    ].join('\r\n'))
  })

  it('infers the union of record columns and can add a UTF-8 BOM', () => {
    expect(createCsv([{ a: 1 }, { b: 2 }], { includeBom: true })).toBe(
      '\uFEFFa,b\r\n1,\r\n,2',
    )
  })

  it('does not attempt a download without a browser document', () => {
    expect(downloadCsv('a\r\n1')).toBe(false)
  })
})
