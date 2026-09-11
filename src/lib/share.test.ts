import { describe, expect, it } from 'vitest'
import { buildJoinUrl } from './share'

describe('buildJoinUrl', () => {
  it('creates an absolute direct-join URL from the public origin', () => {
    expect(buildJoinUrl('  k7m4q ', 'https://class.example.edu/teacher/session/123')).toBe(
      'https://class.example.edu/join/K7M4Q',
    )
  })

  it('encodes unusual code input rather than creating a broken URL', () => {
    expect(buildJoinUrl('A B/C', 'https://class.example.edu')).toBe(
      'https://class.example.edu/join/A%20B%2FC',
    )
  })

  it('links to the generic join page when no code is supplied', () => {
    expect(buildJoinUrl('', 'https://class.example.edu')).toBe('https://class.example.edu/join')
  })
})
