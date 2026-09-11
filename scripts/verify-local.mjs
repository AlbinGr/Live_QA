import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.PULSE_TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.PULSE_TEST_SUPABASE_ANON_KEY
const teacherEmail = process.env.PULSE_TEST_TEACHER_EMAIL ?? 'teacher@example.com'
const teacherPassword = process.env.PULSE_TEST_TEACHER_PASSWORD ?? 'classroom-demo'

if (!key) {
  throw new Error(
    'Set PULSE_TEST_SUPABASE_ANON_KEY to the local ANON_KEY or PUBLISHABLE_KEY from `npx supabase status -o env`.',
  )
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}
const teacher = createClient(url, key, clientOptions)
const student = createClient(url, key, clientOptions)

async function rpc(client, name, parameters) {
  const { data, error } = await client.rpc(name, parameters)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

function passed(label) {
  process.stdout.write(`✓ ${label}\n`)
}

const { error: teacherLoginError } = await teacher.auth.signInWithPassword({
  email: teacherEmail,
  password: teacherPassword,
})
if (teacherLoginError) throw teacherLoginError
passed('seeded teacher signs in')

const session = await rpc(teacher, 'teacher_create_session', {
  p_title: `Integration check ${new Date().toISOString()}`,
})
assert.match(session.join_code, /^[A-HJ-NP-Z2-9]{6}$/)
passed('teacher creates a session with an unambiguous join code')

const { data: anonymousAuth, error: anonymousAuthError } = await student.auth.signInAnonymously()
if (anonymousAuthError) throw anonymousAuthError
assert.equal(anonymousAuth.user?.is_anonymous, true)

const joinedState = await rpc(student, 'student_join', {
  p_join_code: session.join_code,
  p_client_id: `integration-${randomUUID()}`,
  p_display_name: 'Integration student',
})
assert.equal(joinedState.session.status, 'draft')
assert.equal(joinedState.question, null)
passed('anonymous student joins the draft waiting room')

const question = await rpc(teacher, 'teacher_create_question', {
  p_session_id: session.id,
  p_question_type: 'multiple_choice',
  p_prompt: 'Which option verifies the live flow?',
  p_options: [
    { id: 'a', text: 'The persisted option' },
    { id: 'b', text: 'The other option' },
  ],
  p_correct_answer: 'a',
  p_launch: true,
})
assert.equal(question.status, 'live')
const liveState = await rpc(student, 'student_get_state', { p_join_code: session.join_code })
assert.equal(liveState.question.status, 'live')
assert.equal(Object.hasOwn(liveState.question, 'correct_answer'), false)
passed('question launch starts the session without leaking the answer')

const firstSubmission = await rpc(student, 'student_submit_response', {
  p_question_id: question.id,
  p_answer: 'b',
})
assert.equal(Object.hasOwn(firstSubmission, 'is_correct'), false)
const changedSubmission = await rpc(student, 'student_submit_response', {
  p_question_id: question.id,
  p_answer: 'a',
})
assert.equal(changedSubmission.changed, true)
assert.equal(Object.hasOwn(changedSubmission, 'is_correct'), false)
passed('student submits and changes an answer without a correctness oracle')

const stats = await rpc(teacher, 'get_question_statistics', { p_question_id: question.id })
assert.equal(stats.total_responses, 1)
assert.equal(stats.answers.find((item) => item.option_id === 'a')?.count, 1)
passed('teacher receives aggregate statistics')

const { data: hiddenQuestions, error: hiddenQuestionsError } = await student.from('questions').select('*')
if (hiddenQuestionsError) throw hiddenQuestionsError
const { data: hiddenResponses, error: hiddenResponsesError } = await student.from('responses').select('*')
if (hiddenResponsesError) throw hiddenResponsesError
const { data: safeStateRows, error: safeStateError } = await student.from('session_state').select('*')
if (safeStateError) throw safeStateError
const { error: studentStatsError } = await student.rpc('get_question_statistics', {
  p_question_id: question.id,
})
assert.equal(hiddenQuestions.length, 0)
assert.equal(hiddenResponses.length, 0)
assert.equal(safeStateRows.length, 1)
assert.equal(safeStateRows[0].session_id, session.id)
assert.ok(studentStatsError)
passed('student RLS exposes only its safe state row, not questions, peers, or teacher stats')

await rpc(teacher, 'teacher_close_question', { p_question_id: question.id })
const closedState = await rpc(student, 'student_get_state', { p_join_code: session.join_code })
assert.equal(closedState.question.status, 'closed')
assert.equal(Object.hasOwn(closedState.question, 'correct_answer'), false)

const { error: lateAnswerError } = await student.rpc('student_submit_response', {
  p_question_id: question.id,
  p_answer: 'b',
})
assert.ok(lateAnswerError)
passed('closing voting rejects later submissions and still hides the answer')

await rpc(teacher, 'teacher_reveal_answer', { p_question_id: question.id })
const revealedState = await rpc(student, 'student_get_state', { p_join_code: session.join_code })
assert.equal(revealedState.question.correct_answer, 'a')
assert.equal(revealedState.own_response.is_correct, true)
passed('reveal exposes the correct answer and only the student’s correctness')

const { data: events, error: eventError } = await teacher
  .from('event_log')
  .select('event_type')
  .eq('session_id', session.id)
if (eventError) throw eventError
const eventTypes = new Set(events.map((entry) => entry.event_type))
for (const required of [
  'session_created',
  'session_started',
  'question_created',
  'question_launched',
  'participant_joined',
  'response_submitted',
  'response_changed',
  'question_closed',
  'answer_revealed',
]) {
  assert.ok(eventTypes.has(required), `missing audit event ${required}`)
}
passed('all important events are recorded')

await rpc(teacher, 'teacher_end_session', { p_session_id: session.id })
passed('teacher ends the persisted session')

process.stdout.write('\nLocal Supabase classroom flow passed.\n')
