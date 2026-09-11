Build a complete, working repository for a small live classroom response / quiz application.

The application should be simple enough for one teacher to operate during class, similar to a minimal Wooclap/Socrative.

## Goal

A teacher can:

1. Create a classroom session.
2. Get a short join code and QR-code-compatible join URL.
3. Create questions before or during class.
4. Launch one question at a time.
5. Students join without creating accounts.
6. Students submit answers from their phones.
7. Answers are saved permanently.
8. Important actions are logged with timestamps.
9. The teacher sees responses appear live.
10. The teacher can close voting.
11. The teacher can reveal the correct answer.
12. The teacher can display answer statistics to the class.
13. Previous sessions, questions, answers, and statistics can be reopened later.

Build this as a real working application, not a prototype with mocked data.

---

# Technology

Use:

* React
* TypeScript
* Vite
* Supabase
* Supabase Postgres
* Supabase Realtime
* Supabase Auth for teacher authentication
* Tailwind CSS
* Recharts for statistics/charts
* qrcode or another lightweight QR code library

Keep dependencies minimal.

Do not introduce a custom backend server unless absolutely necessary.

Use Supabase migrations so the database can be recreated from the repository.

---

# Repository requirements

Create a complete repository including:

* source code
* package.json
* TypeScript configuration
* Vite configuration
* Tailwind configuration
* Supabase migrations
* `.env.example`
* `.gitignore`
* README.md
* setup instructions
* development scripts
* production build script

Running:

```bash
npm install
npm run dev
```

should start the frontend after the Supabase environment variables have been configured.

Running:

```bash
npm run build
```

must complete successfully.

Do not leave TODO placeholders for essential functionality.

---

# User roles

There are two user experiences.

## Teacher

Teachers authenticate using Supabase Auth.

Teacher routes should be protected.

Suggested routes:

```text
/login
/teacher
/teacher/session/:sessionId
/teacher/session/:sessionId/history
```

The teacher dashboard should show existing classroom sessions and allow creating a new one.

## Student

Students do NOT need accounts.

Suggested routes:

```text
/join
/join/:code
/session/:code
```

A student enters:

* room/session code
* optional display name

Then they join the active classroom session.

Generate a random anonymous participant identifier in the browser so that responses can be associated with one participant without requiring personal information.

Do not require email or account creation from students.

---

# Database model

Create proper Supabase migrations for the database.

At minimum create these tables.

## profiles

Teacher profile.

Fields:

```text
id uuid primary key references auth.users
display_name text
created_at timestamptz
```

## sessions

Fields:

```text
id uuid primary key
teacher_id uuid references profiles(id)
title text
join_code text unique
status text
created_at timestamptz
started_at timestamptz nullable
ended_at timestamptz nullable
```

Allowed session statuses:

```text
draft
live
ended
```

The join code should be easy to type, for example 5 or 6 uppercase characters.

Avoid confusing characters if practical, e.g. O/0 and I/1.

## questions

Fields:

```text
id uuid primary key
session_id uuid references sessions(id)
question_order integer
question_type text
prompt text
options jsonb nullable
correct_answer jsonb nullable
status text
created_at timestamptz
launched_at timestamptz nullable
closed_at timestamptz nullable
revealed_at timestamptz nullable
```

Initially support:

```text
multiple_choice
true_false
open_text
numeric
```

Allowed question statuses:

```text
draft
live
closed
revealed
```

For multiple choice questions, `options` should contain stable option IDs, not just array positions.

Example:

```json
[
  {"id":"a","text":"Paris"},
  {"id":"b","text":"London"},
  {"id":"c","text":"Berlin"}
]
```

For multiple choice and true/false questions, allow the teacher to specify the correct answer.

Correct answers must NOT be exposed to student clients while voting is open.

## participants

Fields:

```text
id uuid primary key
session_id uuid references sessions(id)
client_id text
display_name text nullable
joined_at timestamptz
last_seen_at timestamptz
```

Add a unique constraint preventing the same `client_id` from being registered more than once in the same session.

## responses

This table is critical.

Every submitted answer must be stored.

Fields:

```text
id uuid primary key
session_id uuid references sessions(id)
question_id uuid references questions(id)
participant_id uuid references participants(id)
answer jsonb
is_correct boolean nullable
submitted_at timestamptz
updated_at timestamptz
```

Add a unique constraint:

```text
(question_id, participant_id)
```

For version 1, one participant gets one current answer per question.

If a student changes their answer while voting remains open, update the response but preserve the history in the event log described below.

After a question is closed, answers may no longer be changed.

## event_log

Create an append-only audit/event table.

Fields:

```text
id bigint generated always as identity primary key
session_id uuid nullable
question_id uuid nullable
participant_id uuid nullable
teacher_id uuid nullable
event_type text
payload jsonb
created_at timestamptz default now()
```

Use this table to record important events including:

```text
session_created
session_started
session_ended

participant_joined

question_created
question_updated
question_launched
question_closed
answer_revealed

response_submitted
response_changed
```

Never update or delete event log entries from normal application functionality.

This table should make it possible to reconstruct what happened during a class.

Do NOT store passwords, auth tokens, or sensitive credentials in the log.

---

# Security

Implement Supabase Row Level Security.

This is important.

Teachers should only be able to:

* see their own sessions
* modify their own sessions
* see questions belonging to their sessions
* see responses belonging to their sessions
* see logs belonging to their sessions

Students should only be allowed to:

* find/join an active session using its join code
* see the currently active question
* submit/update their own response while the question is live

Students must NOT be able to:

* access the teacher dashboard
* modify questions
* close questions
* reveal answers
* see correct answers before reveal
* read other students' individual responses
* browse historical sessions

Use database policies/functions where appropriate rather than trusting frontend code for security.

If anonymous Supabase access makes a particular operation unsafe, implement a secure Supabase RPC/database function for it.

Never put the Supabase service role key in the frontend.

Only use public browser-safe environment variables in Vite.

---

# Teacher session screen

Design this screen for use while standing in front of a classroom.

It should be fast and uncluttered.

At the top display:

```text
Session title
Join code
Join URL
QR code
Number of connected/joined participants
```

Provide a large:

```text
+ Quick question
```

button.

The teacher should be able to create a question without leaving the live session screen.

For multiple choice:

* question prompt
* 2–6 answer options
* select correct option
* add/remove options

For true/false:

* prompt
* choose correct answer

For numeric:

* prompt
* optional correct numeric answer

For open text:

* prompt

Provide obvious teacher controls:

```text
Launch
Close voting
Reveal answer
Next question
```

Only show controls that make sense for the current question state.

---

# Live student screen

Optimize the student interface for phones.

The student should see:

```text
session title
current question
answer controls
Submit answer
```

After submitting:

```text
Answer received ✓
```

Allow changing the answer while the question remains open.

When the question closes:

```text
Voting closed
```

When the answer is revealed:

* show whether the student's answer was correct if applicable
* show the correct answer

Do not expose class-wide statistics unless the teacher has chosen to reveal them.

---

# Live updates

Use Supabase Realtime.

The teacher interface should update automatically when:

* participants join
* responses arrive
* responses change

The student interface should update automatically when:

* a question is launched
* voting closes
* the answer is revealed
* the next question begins

Do not require manual page refreshes.

Clean up realtime subscriptions when React components unmount.

---

# Answer statistics

This is one of the most important features.

Create a prominent teacher statistics/results view for the current question.

## Multiple choice / true-false

Show:

* total responses
* response rate if participant count is known
* count for each answer
* percentage for each answer
* bar chart
* correct answer after reveal

Example:

```text
24 responses

A  ███████████████     15   62.5%
B  ████                 4   16.7%
C  █████                5   20.8%
```

Display the number of students who have not yet answered.

When the correct answer is revealed, visually identify it.

## Numeric

Show:

* total responses
* mean
* median
* minimum
* maximum

If a correct answer exists, show:

* number correct
* percentage correct

## Open text

Show:

* total responses
* list of answers
* frequency of identical answers when useful

Do not expose student names in the projected statistics view by default.

---

# Projector mode

Add a simple:

```text
Projector / Presentation mode
```

for displaying results to the classroom.

Suggested route:

```text
/teacher/session/:sessionId/present
```

Make it visually clean and readable from a distance.

Display:

* current question
* number of responses
* answer statistics
* chart
* revealed correct answer

Avoid teacher editing controls on this page.

The projector view should update live.

---

# History

All questions and answers must remain saved after class.

Create a session history screen.

For each previous session show:

* title
* date
* number of participants
* number of questions
* total answers

Opening a session should show each question and its statistics.

The teacher should be able to inspect:

```text
Question
Answer distribution
Number of responses
Correct percentage
Timestamp launched
Timestamp closed
```

Also provide an optional expandable table containing individual responses:

```text
anonymous/display name
answer
submitted time
correct/incorrect
```

---

# Export

Add basic CSV export.

Allow exporting responses for a session with columns approximately:

```text
session_id
session_title
question_id
question_text
question_type
participant_id
participant_name
answer
is_correct
submitted_at
```

Export should work completely in the browser using data the authenticated teacher is allowed to access.

---

# Logging behaviour

Create a small reusable logging utility.

For important actions, write to `event_log`.

For example:

When a teacher launches a question:

1. update question status to `live`
2. set `launched_at`
3. log `question_launched`

When a student submits an answer for the first time:

1. save response
2. log `response_submitted`

When they change the answer:

1. update current response
2. log `response_changed`
3. include old and new answer in the event payload

When the teacher closes voting:

1. status becomes `closed`
2. set `closed_at`
3. log `question_closed`

When revealing:

1. status becomes `revealed`
2. set `revealed_at`
3. log `answer_revealed`

Prefer database functions/transactions where multiple database operations should happen atomically.

---

# Statistics implementation

Do not repeatedly download every answer from the database merely to calculate simple counts if a SQL query/RPC is more appropriate.

Create Supabase SQL functions/RPCs where useful, for example:

```text
get_question_statistics(question_id)
```

It should return safe aggregated results suitable for the teacher.

For a multiple choice question it could return:

```json
{
  "total_responses": 24,
  "participant_count": 28,
  "unanswered": 4,
  "answers": [
    {"option_id":"a","count":15,"percentage":62.5},
    {"option_id":"b","count":4,"percentage":16.7},
    {"option_id":"c","count":5,"percentage":20.8}
  ]
}
```

Make sure the teacher can display statistics live.

---

# Data integrity

Use:

* foreign keys
* appropriate indexes
* unique constraints
* timestamps
* database validation where practical

Indexes should include likely lookups such as:

```text
sessions(join_code)
sessions(teacher_id)
questions(session_id)
responses(question_id)
responses(participant_id)
event_log(session_id)
event_log(question_id)
```

Use cascading deletes cautiously.

Prefer preserving historical quiz data.

---

# UI expectations

Keep styling simple and professional.

Priorities:

1. extremely fast to use during class
2. clear status of current question
3. large touch-friendly controls
4. responsive student view
5. obvious live response count
6. readable charts
7. minimal navigation while teaching

Do not spend excessive time creating decorative visual effects.

---

# Error handling

Handle common failures gracefully:

* invalid room code
* ended session
* no active question
* disconnected realtime connection
* duplicate answer
* teacher refreshes browser
* student refreshes browser
* database request fails
* question closes while student is submitting

Display clear user-facing errors.

Never leave the interface stuck in a loading state indefinitely.

---

# Persistence after refresh

This is required.

Refreshing either teacher or student pages must NOT destroy the classroom state.

The application should reconstruct state from Supabase.

For example, after a teacher refreshes:

* current session remains available
* current live question remains live
* previous responses remain present
* statistics reload correctly

---

# Seed/demo data

Include an optional development seed script or SQL file that creates a sample classroom session with:

* several questions
* sample participants
* sample responses

This is only for development/testing.

Do not make the production app dependent on seed data.

---

# Testing

Add at least some useful tests around important pure logic such as:

* join-code generation
* answer-statistic calculations
* numeric statistics
* CSV formatting

If practical, add one simple end-to-end or integration test for:

```text
teacher creates session
→ question created
→ question launched
→ student submits
→ teacher sees response count
```

Do not let testing infrastructure overwhelm this small project.

---

# README

Write a clear README explaining:

## Prerequisites

* Node.js
* npm
* Supabase account/project

## Setup

Explain exactly how to:

1. clone repository
2. install dependencies
3. create/configure Supabase project
4. run migrations
5. configure environment variables
6. start locally
7. create teacher account
8. use teacher dashboard
9. join as student
10. deploy

Include the required `.env` variables.

For Vite they should use names such as:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never require a service-role key in the client environment.

---

# Code quality

Use strict TypeScript.

Prefer:

* small components
* reusable hooks
* reusable Supabase client module
* clear types for database entities
* meaningful function names

Avoid:

* giant components
* `any`
* duplicated Supabase logic
* hardcoded database IDs
* fake placeholder data in production views

Organize the project approximately as:

```text
src/
  components/
  pages/
  hooks/
  lib/
  types/
  features/
    auth/
    sessions/
    questions/
    responses/
    statistics/

supabase/
  migrations/
  seed.sql
```

Adjust the structure if a cleaner architecture makes sense.

---

# Development process

Work autonomously through the repository.

Do not stop after generating a scaffold.

After implementing:

1. install dependencies
2. run TypeScript checks
3. run tests
4. run `npm run build`
5. fix all errors
6. inspect the application for obvious broken imports/routes
7. verify database migration SQL is internally consistent

If commands fail, diagnose and fix them.

Continue until the repository builds successfully.

If something cannot be tested because Supabase credentials are unavailable, make everything else testable locally and clearly document the exact remaining setup step.

---

# Definition of done

I should be able to:

1. configure a Supabase project
2. run the included migrations
3. start the app
4. sign in as teacher
5. create a classroom session
6. see a join code and QR code
7. join from another browser as a student
8. create a multiple-choice question
9. launch it
10. answer from the student browser
11. see the response appear live on the teacher screen
12. see response counts and percentages
13. close voting
14. reveal the correct answer
15. refresh both browsers without losing state
16. create another question
17. end the session
18. reopen the session later
19. inspect the saved questions and answers
20. export responses as CSV
21. inspect the event log in Supabase

Questions, responses, timestamps, and important actions must be persisted in the database.
Do not consider the task finished until the application builds successfully and the repository contains enough documentation for me to run it myself.
Start by inspecting the current repository. If it is empty, initialize it. If files already exist, preserve useful existing work and adapt it rather than deleting everything unnecessarily.
Then implement the application end-to-end.
