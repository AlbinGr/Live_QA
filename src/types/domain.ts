export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type SessionStatus = 'draft' | 'live' | 'ended'
export type QuestionStatus = 'draft' | 'live' | 'closed' | 'revealed'
export type QuestionType = 'multiple_choice' | 'true_false' | 'open_text' | 'numeric'

export interface AnswerOption {
  id: string
  text: string
}

export interface ClassroomSession {
  id: string
  teacher_id: string
  title: string
  join_code: string
  status: SessionStatus
  created_at: string
  started_at: string | null
  ended_at: string | null
}

export interface SessionSummary extends ClassroomSession {
  participant_count: number
  question_count: number
  response_count: number
}

export interface Question {
  id: string
  session_id: string
  question_order: number
  question_type: QuestionType
  prompt: string
  options: AnswerOption[] | null
  correct_answer: Json | null
  status: QuestionStatus
  created_at: string
  launched_at: string | null
  closed_at: string | null
  revealed_at: string | null
}

export interface Participant {
  id: string
  session_id: string
  client_id: string
  display_name: string | null
  joined_at: string
  last_seen_at: string
}

export interface ClassroomResponse {
  id: string
  session_id: string
  question_id: string
  participant_id: string
  answer: Json
  is_correct: boolean | null
  submitted_at: string
  updated_at: string
}

export interface StudentQuestion {
  id: string
  question_order: number
  question_type: QuestionType
  prompt: string
  options: AnswerOption[] | null
  status: Exclude<QuestionStatus, 'draft'>
  correct_answer?: Json | null
  launched_at: string | null
  closed_at: string | null
  revealed_at: string | null
}

export interface StudentState {
  session: {
    id: string
    title: string
    join_code: string
    status: SessionStatus
  }
  participant: {
    id: string
    display_name: string | null
  }
  question: StudentQuestion | null
  own_response: {
    answer: Json
    is_correct?: boolean | null
    submitted_at: string
    updated_at: string
  } | null
}

export interface CategoricalStat {
  option_id: string
  label: string
  count: number
  percentage: number
}

export interface NumericStat {
  mean: number | null
  median: number | null
  minimum: number | null
  maximum: number | null
  correct_count: number | null
  correct_percentage: number | null
}

export interface TextStat {
  answer: string
  count: number
}

export interface QuestionStatistics {
  question_id: string
  question_type: QuestionType
  total_responses: number
  participant_count: number
  unanswered: number
  answers?: CategoricalStat[]
  numeric?: NumericStat
  text_answers?: TextStat[]
}

export interface EventLogEntry {
  id: number
  session_id: string | null
  question_id: string | null
  participant_id: string | null
  teacher_id: string | null
  event_type: string
  payload: Json
  created_at: string
}
