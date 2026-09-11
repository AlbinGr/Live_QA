const JOIN_PATH = '/join'

function configuredAppUrl(): string | undefined {
  const value = import.meta.env.VITE_PUBLIC_APP_URL?.trim()
  return value || undefined
}

function browserOrigin(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return window.location.origin
}

function asAbsoluteUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined

  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/**
 * Builds the canonical public URL students use to join a session.
 *
 * `baseUrl` is primarily useful for tests and non-browser rendering. In the
 * application, VITE_PUBLIC_APP_URL takes precedence over the current origin so
 * copied links keep working when the teacher is behind a local proxy or custom
 * deployment URL.
 */
export function buildJoinUrl(joinCode: string, baseUrl?: string): string {
  const base =
    asAbsoluteUrl(baseUrl) ??
    asAbsoluteUrl(configuredAppUrl()) ??
    asAbsoluteUrl(browserOrigin())

  if (!base) {
    throw new Error(
      'A public app URL is required to create the student join link.',
    )
  }

  const code = joinCode.trim().toUpperCase()
  const path = code ? `${JOIN_PATH}/${encodeURIComponent(code)}` : JOIN_PATH

  return new URL(path, base.origin).toString()
}

export const buildStudentJoinUrl = buildJoinUrl
