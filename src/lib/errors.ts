export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof Error && error.message.trim()) return humanizeDatabaseError(error.message)
  if (typeof error === 'string' && error.trim()) return humanizeDatabaseError(error)
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return humanizeDatabaseError(message)
  }
  return fallback
}

function humanizeDatabaseError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid_join_code') || normalized.includes('session_not_found')) {
    return 'We could not find that room. Check the code and try again.'
  }
  if (normalized.includes('session_ended')) return 'This classroom session has ended.'
  if (normalized.includes('question_closed') || normalized.includes('question_not_live')) {
    return 'Voting just closed. Your latest answer was not saved.'
  }
  if (normalized.includes('not_authorized') || normalized.includes('permission denied')) {
    return 'You do not have permission to do that.'
  }
  if (normalized.includes('duplicate') || normalized.includes('unique constraint')) {
    return 'That item already exists. Refresh and try again.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'The connection was interrupted. Check your internet connection and retry.'
  }
  return message.replace(/^.*?error:\s*/i, '')
}

export function withTimeout<T>(promise: PromiseLike<T>, milliseconds = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('This is taking longer than expected. Please retry.')),
      milliseconds,
    )
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}
