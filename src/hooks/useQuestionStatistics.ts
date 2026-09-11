import { useCallback, useEffect, useRef, useState } from 'react'
import { getQuestionStatistics } from '../lib/api'
import { getErrorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { QuestionStatistics } from '../types/domain'

export function useQuestionStatistics(questionId: string | null, sessionId: string | null) {
  const [statistics, setStatistics] = useState<QuestionStatistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    if (!questionId) {
      setStatistics(null)
      return
    }
    setLoading(true)
    try {
      const result = await getQuestionStatistics(questionId)
      if (mounted.current) {
        setStatistics(result)
        setError('')
      }
    } catch (caught) {
      if (mounted.current) setError(getErrorMessage(caught, 'Could not update the results.'))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [questionId])

  useEffect(() => {
    mounted.current = true
    setStatistics(null)
    void refresh()
    if (!questionId || !sessionId) return () => undefined

    let timer: number | undefined
    const scheduleRefresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 120)
    }
    const channel = supabase
      .channel(`question-statistics-${questionId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses', filter: `question_id=eq.${questionId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` }, scheduleRefresh)
      .subscribe()
    const poll = window.setInterval(scheduleRefresh, 10_000)

    return () => {
      mounted.current = false
      window.clearTimeout(timer)
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [questionId, refresh, sessionId])

  return { statistics, loading, error, refresh }
}
