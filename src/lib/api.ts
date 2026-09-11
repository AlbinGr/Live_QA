import { supabase } from './supabase'
import { withTimeout } from './errors'
import type {
  AnswerOption,
  ClassroomSession,
  Json,
  Question,
  QuestionStatistics,
  QuestionType,
  StudentState,
} from '../types/domain'

interface QuestionInput {
  questionType: QuestionType
  prompt: string
  options: AnswerOption[] | null
  correctAnswer: Json | null
}

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await withTimeout(supabase.rpc(name, params))
  if (error) throw error
  return data as T
}

export function createSession(title: string): Promise<ClassroomSession> {
  return rpc<ClassroomSession>('teacher_create_session', { p_title: title })
}

export function startSession(sessionId: string): Promise<ClassroomSession> {
  return rpc<ClassroomSession>('teacher_start_session', { p_session_id: sessionId })
}

export function endSession(sessionId: string): Promise<ClassroomSession> {
  return rpc<ClassroomSession>('teacher_end_session', { p_session_id: sessionId })
}

export function createQuestion(
  sessionId: string,
  input: QuestionInput,
  launch: boolean,
): Promise<Question> {
  return rpc<Question>('teacher_create_question', {
    p_session_id: sessionId,
    p_question_type: input.questionType,
    p_prompt: input.prompt,
    p_options: input.options,
    p_correct_answer: input.correctAnswer,
    p_launch: launch,
  })
}

export function updateQuestion(questionId: string, input: QuestionInput): Promise<Question> {
  return rpc<Question>('teacher_update_question', {
    p_question_id: questionId,
    p_question_type: input.questionType,
    p_prompt: input.prompt,
    p_options: input.options,
    p_correct_answer: input.correctAnswer,
  })
}

export function launchQuestion(questionId: string): Promise<Question> {
  return rpc<Question>('teacher_launch_question', { p_question_id: questionId })
}

export function closeQuestion(questionId: string): Promise<Question> {
  return rpc<Question>('teacher_close_question', { p_question_id: questionId })
}

export function revealAnswer(questionId: string): Promise<Question> {
  return rpc<Question>('teacher_reveal_answer', { p_question_id: questionId })
}

export function joinSession(joinCode: string, clientId: string, displayName: string | null): Promise<StudentState> {
  return rpc<StudentState>('student_join', {
    p_join_code: joinCode,
    p_client_id: clientId,
    p_display_name: displayName,
  })
}

export function getStudentState(joinCode: string): Promise<StudentState> {
  return rpc<StudentState>('student_get_state', { p_join_code: joinCode })
}

export function submitStudentResponse(questionId: string, answer: Json): Promise<{
  id: string
  question_id: string
  participant_id: string
  answer: Json
  submitted_at: string
  updated_at: string
  changed: boolean
}> {
  return rpc('student_submit_response', {
    p_question_id: questionId,
    p_answer: answer,
  })
}

export function getQuestionStatistics(questionId: string): Promise<QuestionStatistics> {
  return rpc<QuestionStatistics>('get_question_statistics', { p_question_id: questionId })
}
