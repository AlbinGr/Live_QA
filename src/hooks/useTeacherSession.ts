import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getErrorMessage, withTimeout } from '../lib/errors'
import type { ClassroomSession, Participant, Question } from '../types/domain'

interface TeacherSessionState {
  session: ClassroomSession | null
  questions: Question[]
  participants: Participant[]
  loading: boolean
  refreshing: boolean
  connected: boolean
  error: string
  refresh: () => Promise<void>
}

export function useTeacherSession(sessionId: string): TeacherSessionState {
  const [session, setSession] = useState<ClassroomSession | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connected, setConnected] = useState(true)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [sessionResult, questionResult, participantResult] = await withTimeout(Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase.from('questions').select('*').eq('session_id', sessionId).order('question_order'),
        supabase.from('participants').select('id, session_id, client_id, display_name, joined_at, last_seen_at').eq('session_id', sessionId).order('joined_at'),
      ]))
      if (sessionResult.error) throw sessionResult.error
      if (questionResult.error) throw questionResult.error
      if (participantResult.error) throw participantResult.error
      if (!mounted.current) return
      setSession(sessionResult.data as ClassroomSession)
      setQuestions((questionResult.data ?? []) as Question[])
      setParticipants((participantResult.data ?? []) as Participant[])
      setError('')
    } catch (caught) {
      if (mounted.current) setError(getErrorMessage(caught, 'Could not load this session.'))
    } finally {
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [sessionId])

  useEffect(() => {
    mounted.current = true
    void refresh()

    const channel = supabase
      .channel(`teacher-session-${sessionId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions', filter: `session_id=eq.${sessionId}` }, () => void refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` }, () => void refresh())
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))

    const poll = window.setInterval(() => void refresh(), 30_000)
    return () => {
      mounted.current = false
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [refresh, sessionId])

  return { session, questions, participants, loading, refreshing, connected, error, refresh }
}
