-- Live Q&A / classroom response schema
--
-- Security model
-- --------------
-- * Teachers are normal (non-anonymous) Supabase Auth users with a row in
--   public.profiles. They may read only data belonging to their sessions.
-- * Students first call supabase.auth.signInAnonymously(). Their auth.uid() is
--   bound to a participant row by student_join; a browser-generated client_id
--   is a second, stable identifier and is never trusted on its own.
-- * Students have no privileges on the session/question/response base tables.
--   All student reads and writes go through the SECURITY DEFINER RPCs below.
-- * public.session_state is the sole student-readable realtime projection. It
--   contains no response data and includes correct_answer only after reveal.
-- * Mutations which also need an audit event are transactional RPCs. The base
--   tables intentionally have no direct INSERT/UPDATE/DELETE grants (apart
--   from a teacher managing their own profile).

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Validation helpers (created before the tables so they can be used by CHECKs)
-- ---------------------------------------------------------------------------

create or replace function public._valid_multiple_choice_options(p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_options is null
     or jsonb_typeof(p_options) <> 'array'
     or jsonb_array_length(p_options) < 2
     or jsonb_array_length(p_options) > 6 then
    return false;
  end if;

  if (select count(distinct option_item ->> 'id')
      from jsonb_array_elements(p_options) as option_rows(option_item))
     <> jsonb_array_length(p_options) then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(p_options) as option_rows(option_item)
    where jsonb_typeof(option_item) <> 'object'
       -- Strip/reject hidden metadata such as {"is_correct": true}; options
       -- are sent to students while voting is open and may contain only these
       -- two explicitly public fields.
       or option_item - 'id' - 'text' <> '{}'::jsonb
       or jsonb_typeof(option_item -> 'id') <> 'string'
       or jsonb_typeof(option_item -> 'text') <> 'string'
       or length(option_item ->> 'id') not between 1 and 64
       or btrim(option_item ->> 'id') <> option_item ->> 'id'
       or length(option_item ->> 'text') not between 1 and 500
       or btrim(option_item ->> 'text') = ''
  );
end;
$$;

create or replace function public._valid_question_definition(
  p_question_type text,
  p_options jsonb,
  p_correct_answer jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_question_type
    when 'multiple_choice' then
      return public._valid_multiple_choice_options(p_options)
        and (
          p_correct_answer is null
          or (
            jsonb_typeof(p_correct_answer) = 'string'
            and exists (
              select 1
              from jsonb_array_elements(p_options) as option_rows(option_item)
              where option_item ->> 'id' = p_correct_answer #>> '{}'
            )
          )
        );
    when 'true_false' then
      return p_options = '[{"id":"true","text":"True"},{"id":"false","text":"False"}]'::jsonb
        and (p_correct_answer is null or jsonb_typeof(p_correct_answer) = 'boolean');
    when 'numeric' then
      if p_options is not null
         or (p_correct_answer is not null and jsonb_typeof(p_correct_answer) <> 'number') then
        return false;
      end if;
      if p_correct_answer is not null then
        perform (p_correct_answer #>> '{}')::numeric;
      end if;
      return true;
    when 'open_text' then
      return p_options is null and p_correct_answer is null;
    else
      return false;
  end case;
exception
  when numeric_value_out_of_range or invalid_text_representation then
    return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core, durable data
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_check
    check (length(btrim(display_name)) between 1 and 120)
);

comment on table public.profiles is
  'Teacher profiles only. Anonymous student auth users must never receive a profile row.';

-- Auth signup in the browser only writes auth.users. Create the corresponding
-- teacher profile automatically, while explicitly excluding anonymous student
-- users. ON CONFLICT DO NOTHING preserves a display name edited later in-app.
create or replace function public._handle_auth_user_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(new.is_anonymous, false) then
    insert into public.profiles (id, display_name)
    values (
      new.id,
      left(coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Teacher'
      ), 120)
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists live_qa_create_teacher_profile on auth.users;
create trigger live_qa_create_teacher_profile
  after insert or update of is_anonymous, email, raw_user_meta_data
  on auth.users
  for each row execute function public._handle_auth_user_teacher_profile();

-- Also make the migration safe for a project where teacher accounts were
-- created before this schema was installed.
insert into public.profiles (id, display_name)
select
  u.id,
  left(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Teacher'
  ), 120)
from auth.users u
where not coalesce(u.is_anonymous, false)
on conflict (id) do nothing;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  join_code text not null unique,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  constraint sessions_title_check
    check (length(btrim(title)) between 1 and 160),
  constraint sessions_join_code_check
    check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint sessions_status_check
    check (status in ('draft', 'live', 'ended')),
  constraint sessions_timestamps_check check (
    (status = 'draft' and started_at is null and ended_at is null)
    or (status = 'live' and started_at is not null and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  )
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete restrict,
  question_order integer not null,
  question_type text not null,
  prompt text not null,
  options jsonb,
  correct_answer jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  closed_at timestamptz,
  revealed_at timestamptz,
  constraint questions_session_id_id_key unique (session_id, id),
  constraint questions_session_order_key unique (session_id, question_order),
  constraint questions_order_check check (question_order > 0),
  constraint questions_type_check
    check (question_type in ('multiple_choice', 'true_false', 'open_text', 'numeric')),
  constraint questions_prompt_check
    check (length(btrim(prompt)) between 1 and 4000),
  constraint questions_status_check
    check (status in ('draft', 'live', 'closed', 'revealed')),
  constraint questions_definition_check
    check (public._valid_question_definition(question_type, options, correct_answer)),
  constraint questions_timestamps_check check (
    (status = 'draft'
      and launched_at is null and closed_at is null and revealed_at is null)
    or (status = 'live'
      and launched_at is not null and closed_at is null and revealed_at is null)
    or (status = 'closed'
      and launched_at is not null and closed_at is not null and revealed_at is null)
    or (status = 'revealed'
      and launched_at is not null and closed_at is not null and revealed_at is not null)
  )
);

-- This is both a UX invariant and a race-condition guard. teacher_launch_question
-- closes an existing live question in the same transaction before launching one.
create unique index questions_one_live_per_session_idx
  on public.questions(session_id)
  where status = 'live';

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete set null,
  client_id text not null,
  display_name text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint participants_session_id_id_key unique (session_id, id),
  constraint participants_session_client_key unique (session_id, client_id),
  constraint participants_session_auth_user_key unique (session_id, auth_user_id),
  constraint participants_client_id_check
    check (client_id ~ '^[A-Za-z0-9._~-]{8,128}$'),
  constraint participants_display_name_check
    check (display_name is null or length(btrim(display_name)) between 1 and 80),
  constraint participants_seen_check check (last_seen_at >= joined_at)
);

comment on column public.participants.client_id is
  'Random browser identifier. Authorization always uses auth_user_id = auth.uid(); client_id alone grants nothing.';

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  question_id uuid not null,
  participant_id uuid not null,
  answer jsonb not null,
  is_correct boolean,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responses_question_participant_key unique (question_id, participant_id),
  constraint responses_question_session_fk
    foreign key (session_id, question_id)
    references public.questions(session_id, id) on delete restrict,
  constraint responses_participant_session_fk
    foreign key (session_id, participant_id)
    references public.participants(session_id, id) on delete restrict,
  constraint responses_answer_check check (answer <> 'null'::jsonb),
  constraint responses_timestamps_check check (updated_at >= submitted_at)
);

create table public.event_log (
  id bigint generated always as identity primary key,
  session_id uuid references public.sessions(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  participant_id uuid references public.participants(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint event_log_type_check
    check (length(btrim(event_type)) between 1 and 80),
  constraint event_log_payload_check check (jsonb_typeof(payload) = 'object')
);

comment on table public.event_log is
  'Append-only application audit trail. Client roles receive SELECT only; all writes happen inside transactional RPCs.';

-- Safe realtime projection. There is deliberately no participant response in
-- this table. public_state.question gains correct_answer only when revealed.
create table public.session_state (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  version bigint not null default 1,
  session_status text not null,
  current_question_id uuid,
  question_status text,
  public_state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint session_state_question_session_fk
    foreign key (session_id, current_question_id)
    references public.questions(session_id, id) on delete restrict,
  constraint session_state_version_check check (version > 0),
  constraint session_state_session_status_check
    check (session_status in ('draft', 'live', 'ended')),
  constraint session_state_question_status_check
    check (question_status is null or question_status in ('live', 'closed', 'revealed')),
  constraint session_state_public_state_check
    check (jsonb_typeof(public_state) = 'object')
);

-- Likely lookup and reporting paths. Unique constraints already index join_code,
-- per-session question order, and one-response-per-participant.
create index sessions_teacher_id_idx on public.sessions(teacher_id);
create index questions_session_id_idx on public.questions(session_id);
create index participants_session_id_idx on public.participants(session_id);
create index participants_auth_user_id_idx on public.participants(auth_user_id);
create index responses_question_id_idx on public.responses(question_id);
create index responses_participant_id_idx on public.responses(participant_id);
create index responses_session_id_idx on public.responses(session_id);
create index event_log_session_id_idx on public.event_log(session_id);
create index event_log_question_id_idx on public.event_log(question_id);
create index event_log_participant_id_idx on public.event_log(participant_id);
create index event_log_created_at_idx on public.event_log(created_at);

-- ---------------------------------------------------------------------------
-- Internal authorization, normalization, state projection, and audit helpers
-- ---------------------------------------------------------------------------

create or replace function public._require_teacher()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'A teacher account is required.';
  end if;

  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception using errcode = '42501', message = 'Teacher profile not found.';
  end if;

  return v_user_id;
end;
$$;

create or replace function public._teacher_owns_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.sessions s
       where s.id = p_session_id
         and s.teacher_id = auth.uid()
     );
$$;

create or replace function public._student_joined_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.participants p
       where p.session_id = p_session_id
         and p.auth_user_id = auth.uid()
     );
$$;

create or replace function public._generate_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
begin
  for v_i in 1..6 loop
    v_code := v_code || substr(
      v_alphabet,
      1 + floor(random() * length(v_alphabet))::integer,
      1
    );
  end loop;
  return v_code;
end;
$$;

create or replace function public._normalise_question_definition(
  p_question_type text,
  p_options jsonb,
  p_correct_answer jsonb,
  out options jsonb,
  out correct_answer jsonb
)
returns record
language plpgsql
immutable
set search_path = ''
as $$
begin
  p_question_type := lower(btrim(p_question_type));
  options := case when p_options = 'null'::jsonb then null else p_options end;
  correct_answer := case
    when p_correct_answer = 'null'::jsonb then null
    else p_correct_answer
  end;

  if p_question_type = 'true_false' then
    options := '[{"id":"true","text":"True"},{"id":"false","text":"False"}]'::jsonb;
  elsif p_question_type in ('numeric', 'open_text') then
    options := null;
  end if;

  if not public._valid_question_definition(
    p_question_type,
    options,
    correct_answer
  ) then
    raise exception using
      errcode = '22023',
      message = 'The question options or correct answer are invalid for this question type.';
  end if;
end;
$$;

create or replace function public._normalise_student_answer(
  p_question_type text,
  p_options jsonb,
  p_answer jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_answer is null or p_answer = 'null'::jsonb then
    raise exception using errcode = '22023', message = 'An answer is required.';
  end if;

  case p_question_type
    when 'multiple_choice' then
      if jsonb_typeof(p_answer) <> 'string' then
        raise exception using errcode = '22023', message = 'Select one of the available options.';
      end if;
      v_text := p_answer #>> '{}';
      if not exists (
        select 1
        from jsonb_array_elements(p_options) as option_rows(option_item)
        where option_item ->> 'id' = v_text
      ) then
        raise exception using errcode = '22023', message = 'The selected option does not exist.';
      end if;
      return to_jsonb(v_text);

    when 'true_false' then
      if jsonb_typeof(p_answer) <> 'boolean' then
        raise exception using errcode = '22023', message = 'Answer with true or false.';
      end if;
      return p_answer;

    when 'numeric' then
      if jsonb_typeof(p_answer) <> 'number' then
        raise exception using errcode = '22023', message = 'Enter a valid number.';
      end if;
      perform (p_answer #>> '{}')::numeric;
      return p_answer;

    when 'open_text' then
      if jsonb_typeof(p_answer) <> 'string' then
        raise exception using errcode = '22023', message = 'Enter a text answer.';
      end if;
      v_text := btrim(p_answer #>> '{}');
      if length(v_text) not between 1 and 2000 then
        raise exception using errcode = '22023', message = 'The answer must contain 1 to 2000 characters.';
      end if;
      return to_jsonb(v_text);

    else
      raise exception using errcode = '22023', message = 'Unsupported question type.';
  end case;
exception
  when numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode = '22023', message = 'Enter a valid number.';
end;
$$;

create or replace function public._write_event(
  p_event_type text,
  p_session_id uuid default null,
  p_question_id uuid default null,
  p_participant_id uuid default null,
  p_teacher_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_payload is not null and jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Audit payload must be a JSON object.';
  end if;

  insert into public.event_log (
    session_id, question_id, participant_id, teacher_id, event_type, payload
  ) values (
    p_session_id,
    p_question_id,
    p_participant_id,
    p_teacher_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public._refresh_session_state(p_session_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_question_json jsonb := null;
  v_public_state jsonb;
begin
  select * into strict v_session
  from public.sessions
  where id = p_session_id;

  select * into v_question
  from public.questions
  where session_id = p_session_id
    and status <> 'draft'
  order by launched_at desc nulls last, question_order desc
  limit 1;

  if found then
    v_question_json := jsonb_build_object(
      'id', v_question.id,
      'session_id', v_question.session_id,
      'question_order', v_question.question_order,
      'question_type', v_question.question_type,
      'prompt', v_question.prompt,
      'options', v_question.options,
      'status', v_question.status,
      'created_at', v_question.created_at,
      'launched_at', v_question.launched_at,
      'closed_at', v_question.closed_at,
      'revealed_at', v_question.revealed_at
    );

    -- This branch is the central non-leakage guarantee for realtime state.
    if v_question.status = 'revealed' then
      v_question_json := v_question_json || jsonb_build_object(
        'correct_answer', v_question.correct_answer
      );
    end if;
  end if;

  v_public_state := jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'title', v_session.title,
      'join_code', v_session.join_code,
      'status', v_session.status,
      'created_at', v_session.created_at,
      'started_at', v_session.started_at,
      'ended_at', v_session.ended_at
    ),
    'question', v_question_json
  );

  insert into public.session_state (
    session_id,
    version,
    session_status,
    current_question_id,
    question_status,
    public_state,
    updated_at
  ) values (
    v_session.id,
    1,
    v_session.status,
    v_question.id,
    v_question.status,
    v_public_state,
    clock_timestamp()
  )
  on conflict (session_id) do update
  set version = public.session_state.version + 1,
      session_status = excluded.session_status,
      current_question_id = excluded.current_question_id,
      question_status = excluded.question_status,
      public_state = excluded.public_state,
      updated_at = excluded.updated_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher RPCs. Each state transition and its audit record commit atomically.
-- ---------------------------------------------------------------------------

create or replace function public.teacher_create_session(p_title text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session public.sessions%rowtype;
begin
  v_teacher_id := public._require_teacher();
  p_title := btrim(p_title);
  if p_title is null or length(p_title) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'Session title must contain 1 to 160 characters.';
  end if;

  for v_attempt in 1..25 loop
    begin
      insert into public.sessions (teacher_id, title, join_code)
      values (v_teacher_id, p_title, public._generate_join_code())
      returning * into v_session;
      exit;
    exception
      when unique_violation then
        if v_attempt = 25 then
          raise exception using errcode = 'P0001', message = 'Could not allocate a unique join code. Please retry.';
        end if;
    end;
  end loop;

  perform public._write_event(
    'session_created',
    v_session.id,
    null,
    null,
    v_teacher_id,
    jsonb_build_object('title', v_session.title, 'join_code', v_session.join_code)
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_session);
end;
$$;

create or replace function public.teacher_start_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session public.sessions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_teacher_id := public._require_teacher();
  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Session not found or access denied.';
  end if;
  if v_session.status = 'ended' then
    raise exception using errcode = '55000', message = 'An ended session cannot be restarted.';
  end if;
  if v_session.status = 'live' then
    return to_jsonb(v_session);
  end if;

  update public.sessions
  set status = 'live', started_at = v_now
  where id = v_session.id
  returning * into v_session;

  perform public._write_event(
    'session_started', v_session.id, null, null, v_teacher_id,
    jsonb_build_object('started_at', v_session.started_at)
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_session);
end;
$$;

create or replace function public.teacher_end_session(p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session public.sessions%rowtype;
  v_closed_question public.questions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_teacher_id := public._require_teacher();
  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Session not found or access denied.';
  end if;
  if v_session.status = 'ended' then
    return to_jsonb(v_session);
  end if;

  for v_closed_question in
    update public.questions
    set status = 'closed', closed_at = v_now
    where session_id = v_session.id and status = 'live'
    returning *
  loop
    perform public._write_event(
      'question_closed',
      v_session.id,
      v_closed_question.id,
      null,
      v_teacher_id,
      jsonb_build_object('closed_at', v_now, 'reason', 'session_ended')
    );
  end loop;

  update public.sessions
  set status = 'ended', ended_at = v_now
  where id = v_session.id
  returning * into v_session;

  perform public._write_event(
    'session_ended', v_session.id, null, null, v_teacher_id,
    jsonb_build_object('ended_at', v_session.ended_at)
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_session);
end;
$$;

create or replace function public.teacher_launch_question(p_question_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session_id uuid;
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_closed_question public.questions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_teacher_id := public._require_teacher();
  select session_id into v_session_id from public.questions where id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;

  -- All transition functions lock session first and question second. The
  -- consistent order prevents launch/close/submit/end deadlocks.
  select * into strict v_session
  from public.sessions where id = v_session_id for update;
  select * into strict v_question
  from public.questions where id = p_question_id for update;

  if v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Question not found or access denied.';
  end if;
  if v_session.status = 'ended' then
    raise exception using errcode = '55000', message = 'Questions cannot be launched in an ended session.';
  end if;
  if v_question.status = 'live' then
    return to_jsonb(v_question);
  end if;
  if v_question.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only a draft question can be launched.';
  end if;

  if v_session.status = 'draft' then
    update public.sessions
    set status = 'live', started_at = v_now
    where id = v_session.id
    returning * into v_session;
    perform public._write_event(
      'session_started', v_session.id, null, null, v_teacher_id,
      jsonb_build_object('started_at', v_session.started_at, 'reason', 'question_launched')
    );
  end if;

  for v_closed_question in
    update public.questions
    set status = 'closed', closed_at = v_now
    where session_id = v_session.id
      and status = 'live'
      and id <> v_question.id
    returning *
  loop
    perform public._write_event(
      'question_closed',
      v_session.id,
      v_closed_question.id,
      null,
      v_teacher_id,
      jsonb_build_object('closed_at', v_now, 'reason', 'next_question_launched')
    );
  end loop;

  update public.questions
  set status = 'live', launched_at = v_now
  where id = v_question.id
  returning * into v_question;

  perform public._write_event(
    'question_launched',
    v_session.id,
    v_question.id,
    null,
    v_teacher_id,
    jsonb_build_object('launched_at', v_question.launched_at)
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_question);
end;
$$;

create or replace function public.teacher_create_question(
  p_session_id uuid,
  p_question_type text,
  p_prompt text,
  p_options jsonb default null,
  p_correct_answer jsonb default null,
  p_launch boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_options jsonb;
  v_correct_answer jsonb;
  v_order integer;
begin
  v_teacher_id := public._require_teacher();
  p_question_type := lower(btrim(p_question_type));
  p_prompt := btrim(p_prompt);
  if p_prompt is null or length(p_prompt) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'Question prompt must contain 1 to 4000 characters.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;
  if not found or v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Session not found or access denied.';
  end if;
  if v_session.status = 'ended' then
    raise exception using errcode = '55000', message = 'Questions cannot be added to an ended session.';
  end if;

  select n.options, n.correct_answer
  into v_options, v_correct_answer
  from public._normalise_question_definition(
    p_question_type, p_options, p_correct_answer
  ) as n;

  select coalesce(max(question_order), 0) + 1
  into v_order
  from public.questions
  where session_id = p_session_id;

  insert into public.questions (
    session_id, question_order, question_type, prompt, options, correct_answer
  ) values (
    p_session_id, v_order, p_question_type, p_prompt, v_options, v_correct_answer
  )
  returning * into v_question;

  perform public._write_event(
    'question_created',
    p_session_id,
    v_question.id,
    null,
    v_teacher_id,
    jsonb_build_object(
      'question_order', v_question.question_order,
      'question_type', v_question.question_type,
      'prompt', v_question.prompt,
      'options', v_question.options,
      'correct_answer', v_question.correct_answer
    )
  );
  perform public._refresh_session_state(p_session_id);

  if coalesce(p_launch, false) then
    return public.teacher_launch_question(v_question.id);
  end if;
  return to_jsonb(v_question);
end;
$$;

create or replace function public.teacher_update_question(
  p_question_id uuid,
  p_question_type text,
  p_prompt text,
  p_options jsonb default null,
  p_correct_answer jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session_id uuid;
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_old_question public.questions%rowtype;
  v_options jsonb;
  v_correct_answer jsonb;
begin
  v_teacher_id := public._require_teacher();
  p_question_type := lower(btrim(p_question_type));
  p_prompt := btrim(p_prompt);
  if p_prompt is null or length(p_prompt) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'Question prompt must contain 1 to 4000 characters.';
  end if;

  select session_id into v_session_id from public.questions where id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;
  select * into strict v_session
  from public.sessions where id = v_session_id for update;
  select * into strict v_question
  from public.questions where id = p_question_id for update;

  if v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Question not found or access denied.';
  end if;
  if v_session.status = 'ended' then
    raise exception using errcode = '55000', message = 'Questions in an ended session cannot be edited.';
  end if;
  if v_question.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft questions can be edited.';
  end if;
  v_old_question := v_question;

  select n.options, n.correct_answer
  into v_options, v_correct_answer
  from public._normalise_question_definition(
    p_question_type, p_options, p_correct_answer
  ) as n;

  update public.questions
  set question_type = p_question_type,
      prompt = p_prompt,
      options = v_options,
      correct_answer = v_correct_answer
  where id = p_question_id
  returning * into v_question;

  perform public._write_event(
    'question_updated',
    v_session.id,
    v_question.id,
    null,
    v_teacher_id,
    jsonb_build_object(
      'old', jsonb_build_object(
        'question_type', v_old_question.question_type,
        'prompt', v_old_question.prompt,
        'options', v_old_question.options,
        'correct_answer', v_old_question.correct_answer
      ),
      'new', jsonb_build_object(
        'question_type', v_question.question_type,
        'prompt', v_question.prompt,
        'options', v_question.options,
        'correct_answer', v_question.correct_answer
      )
    )
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_question);
end;
$$;

create or replace function public.teacher_close_question(p_question_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session_id uuid;
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_teacher_id := public._require_teacher();
  select session_id into v_session_id from public.questions where id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;
  select * into strict v_session
  from public.sessions where id = v_session_id for update;
  select * into strict v_question
  from public.questions where id = p_question_id for update;

  if v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Question not found or access denied.';
  end if;
  if v_question.status in ('closed', 'revealed') then
    return to_jsonb(v_question);
  end if;
  if v_question.status <> 'live' then
    raise exception using errcode = '55000', message = 'Only a live question can be closed.';
  end if;

  update public.questions
  set status = 'closed', closed_at = v_now
  where id = v_question.id
  returning * into v_question;

  perform public._write_event(
    'question_closed', v_session.id, v_question.id, null, v_teacher_id,
    jsonb_build_object('closed_at', v_question.closed_at)
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_question);
end;
$$;

create or replace function public.teacher_reveal_answer(p_question_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_session_id uuid;
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  v_teacher_id := public._require_teacher();
  select session_id into v_session_id from public.questions where id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;
  select * into strict v_session
  from public.sessions where id = v_session_id for update;
  select * into strict v_question
  from public.questions where id = p_question_id for update;

  if v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Question not found or access denied.';
  end if;
  if v_session.status = 'ended' then
    raise exception using errcode = '55000', message = 'Answers in an ended session cannot be revealed.';
  end if;
  if v_question.status = 'revealed' then
    return to_jsonb(v_question);
  end if;
  if v_question.status <> 'closed' then
    raise exception using errcode = '55000', message = 'Close voting before revealing the answer.';
  end if;

  update public.questions
  set status = 'revealed', revealed_at = v_now
  where id = v_question.id
  returning * into v_question;

  perform public._write_event(
    'answer_revealed', v_session.id, v_question.id, null, v_teacher_id,
    jsonb_build_object(
      'revealed_at', v_question.revealed_at,
      'correct_answer', v_question.correct_answer
    )
  );
  perform public._refresh_session_state(v_session.id);
  return to_jsonb(v_question);
end;
$$;

-- ---------------------------------------------------------------------------
-- Student RPCs. auth.uid(), never caller-supplied participant IDs, authorizes.
-- ---------------------------------------------------------------------------

create or replace function public.student_get_state(p_join_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(p_join_code));
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_state public.session_state%rowtype;
  v_response public.responses%rowtype;
  v_own_response jsonb := null;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required before joining.';
  end if;

  select * into v_session
  from public.sessions
  where join_code = v_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'Session code not found.';
  end if;

  select * into v_participant
  from public.participants
  where session_id = v_session.id and auth_user_id = v_user_id;
  if not found then
    raise exception using errcode = '42501', message = 'Join this session before requesting its state.';
  end if;

  -- Student pages poll as a fallback for realtime. Throttling this heartbeat
  -- prevents every 10-second poll from causing participant Realtime events and
  -- cascading teacher-side statistics refreshes in a large class.
  if v_participant.last_seen_at < clock_timestamp() - interval '30 seconds' then
    update public.participants
    set last_seen_at = greatest(clock_timestamp(), joined_at)
    where id = v_participant.id
    returning * into v_participant;
  end if;

  select * into v_state
  from public.session_state
  where session_id = v_session.id;
  if not found then
    perform public._refresh_session_state(v_session.id);
    select * into strict v_state
    from public.session_state
    where session_id = v_session.id;
  end if;

  if v_state.current_question_id is not null then
    select * into v_response
    from public.responses
    where question_id = v_state.current_question_id
      and participant_id = v_participant.id;

    if found then
      v_own_response := jsonb_build_object(
        'id', v_response.id,
        'question_id', v_response.question_id,
        'answer', v_response.answer,
        'submitted_at', v_response.submitted_at,
        'updated_at', v_response.updated_at
      );

      -- Returning is_correct before reveal would form a correctness oracle: a
      -- student could try choices one by one. Keep it absent, not merely null.
      if v_state.question_status = 'revealed' then
        v_own_response := v_own_response || jsonb_build_object(
          'is_correct', v_response.is_correct
        );
      end if;
    end if;
  end if;

  return v_state.public_state || jsonb_build_object(
    'participant', jsonb_build_object(
      'id', v_participant.id,
      'session_id', v_participant.session_id,
      'display_name', v_participant.display_name,
      'joined_at', v_participant.joined_at,
      'last_seen_at', v_participant.last_seen_at
    ),
    'own_response', v_own_response,
    'state_version', v_state.version,
    'state_updated_at', v_state.updated_at
  );
end;
$$;

create or replace function public.student_join(
  p_join_code text,
  p_client_id text,
  p_display_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(p_join_code));
  v_name text := nullif(btrim(p_display_name), '');
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required before joining.';
  end if;
  if p_client_id is null or p_client_id !~ '^[A-Za-z0-9._~-]{8,128}$' then
    raise exception using errcode = '22023', message = 'Invalid browser participant identifier.';
  end if;
  if v_name is not null and length(v_name) > 80 then
    raise exception using errcode = '22023', message = 'Display name must be 80 characters or fewer.';
  end if;

  select * into v_session
  from public.sessions
  where join_code = v_code
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Session code not found.';
  end if;
  if v_session.status = 'ended' then
    raise exception using errcode = '55000', message = 'This session has ended.';
  end if;

  select * into v_participant
  from public.participants
  where session_id = v_session.id and auth_user_id = v_user_id
  for update;

  if found then
    if v_participant.client_id <> p_client_id then
      raise exception using
        errcode = '42501',
        message = 'This authenticated participant is already bound to a different browser identifier.';
    end if;
    update public.participants
    set display_name = coalesce(v_name, display_name),
        last_seen_at = greatest(clock_timestamp(), joined_at)
    where id = v_participant.id
    returning * into v_participant;
  else
    begin
      insert into public.participants (
        session_id, auth_user_id, client_id, display_name
      ) values (
        v_session.id, v_user_id, p_client_id, v_name
      )
      returning * into v_participant;
    exception
      when unique_violation then
        raise exception using
          errcode = '23505',
          message = 'This browser identifier is already registered in the session.';
    end;

    perform public._write_event(
      'participant_joined',
      v_session.id,
      null,
      v_participant.id,
      null,
      jsonb_build_object('joined_at', v_participant.joined_at)
    );
  end if;

  return public.student_get_state(v_code);
end;
$$;

create or replace function public.student_submit_response(
  p_question_id uuid,
  p_answer jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_session public.sessions%rowtype;
  v_question public.questions%rowtype;
  v_participant public.participants%rowtype;
  v_response public.responses%rowtype;
  v_old_answer jsonb;
  v_answer jsonb;
  v_is_correct boolean;
  v_changed boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required before answering.';
  end if;

  select session_id into v_session_id
  from public.questions
  where id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;

  -- Shared locks let the whole class submit concurrently while still
  -- serializing against a teacher closing the question or ending the session.
  -- A transition that wins the lock makes this call fail cleanly; a submission
  -- that wins is committed before the transition.
  select * into strict v_session
  from public.sessions where id = v_session_id for share;
  select * into strict v_question
  from public.questions where id = p_question_id for share;

  if v_session.status <> 'live' or v_question.status <> 'live' then
    raise exception using errcode = '55000', message = 'Voting is closed for this question.';
  end if;

  select * into v_participant
  from public.participants
  where session_id = v_session.id and auth_user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Join this session before answering.';
  end if;

  v_answer := public._normalise_student_answer(
    v_question.question_type, v_question.options, p_answer
  );
  v_is_correct := case
    when v_question.correct_answer is null then null
    else v_answer = v_question.correct_answer
  end;

  select * into v_response
  from public.responses
  where question_id = v_question.id and participant_id = v_participant.id
  for update;

  if found then
    if v_response.answer = v_answer then
      update public.participants
      set last_seen_at = greatest(v_now, joined_at)
      where id = v_participant.id;
      return jsonb_build_object(
        'id', v_response.id,
        'question_id', v_response.question_id,
        'participant_id', v_response.participant_id,
        'answer', v_response.answer,
        'submitted_at', v_response.submitted_at,
        'updated_at', v_response.updated_at,
        'changed', false
      );
    end if;

    v_old_answer := v_response.answer;
    update public.responses
    set answer = v_answer,
        is_correct = v_is_correct,
        updated_at = v_now
    where id = v_response.id
    returning * into v_response;
    v_changed := true;

    perform public._write_event(
      'response_changed',
      v_session.id,
      v_question.id,
      v_participant.id,
      null,
      jsonb_build_object('old_answer', v_old_answer, 'new_answer', v_answer)
    );
  else
    insert into public.responses (
      session_id, question_id, participant_id, answer, is_correct,
      submitted_at, updated_at
    ) values (
      v_session.id, v_question.id, v_participant.id, v_answer, v_is_correct,
      v_now, v_now
    )
    returning * into v_response;

    perform public._write_event(
      'response_submitted',
      v_session.id,
      v_question.id,
      v_participant.id,
      null,
      jsonb_build_object('answer', v_answer)
    );
  end if;

  update public.participants
  set last_seen_at = greatest(v_now, joined_at)
  where id = v_participant.id;

  -- is_correct is intentionally omitted. Returning it while voting is open
  -- would reveal the answer through repeated submissions.
  return jsonb_build_object(
    'id', v_response.id,
    'question_id', v_response.question_id,
    'participant_id', v_response.participant_id,
    'answer', v_response.answer,
    'submitted_at', v_response.submitted_at,
    'updated_at', v_response.updated_at,
    'changed', v_changed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher-only aggregate statistics RPC
-- ---------------------------------------------------------------------------

create or replace function public.get_question_statistics(p_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_question public.questions%rowtype;
  v_session public.sessions%rowtype;
  v_total integer;
  v_participant_count integer;
  v_answers jsonb;
  v_numeric jsonb;
  v_text_answers jsonb;
begin
  v_teacher_id := public._require_teacher();
  select * into v_question
  from public.questions
  where id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;
  select * into strict v_session
  from public.sessions
  where id = v_question.session_id;
  if v_session.teacher_id <> v_teacher_id then
    raise exception using errcode = '42501', message = 'Question not found or access denied.';
  end if;

  select count(*)::integer into v_total
  from public.responses
  where question_id = v_question.id;
  select count(*)::integer into v_participant_count
  from public.participants
  where session_id = v_session.id;

  if v_question.question_type = 'multiple_choice' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'option_id', option_item ->> 'id',
        'label', option_item ->> 'text',
        'count', response_count,
        'percentage', case
          when v_total = 0 then 0
          else round(response_count::numeric * 100 / v_total, 1)
        end
      ) order by option_order
    ), '[]'::jsonb)
    into v_answers
    from (
      select option_item, option_order,
             (select count(*)::integer
              from public.responses r
              where r.question_id = v_question.id
                and r.answer = to_jsonb(option_item ->> 'id')) as response_count
      from jsonb_array_elements(v_question.options) with ordinality
        as option_rows(option_item, option_order)
    ) option_counts;

  elsif v_question.question_type = 'true_false' then
    select jsonb_agg(
      jsonb_build_object(
        'option_id', option_id,
        'label', label,
        'count', response_count,
        'percentage', case
          when v_total = 0 then 0
          else round(response_count::numeric * 100 / v_total, 1)
        end
      ) order by option_order
    )
    into v_answers
    from (
      select option_id, label, option_order,
             (select count(*)::integer
              from public.responses r
              where r.question_id = v_question.id
                and r.answer = answer_value) as response_count
      from (values
        ('true'::text, 'True'::text, 1, 'true'::jsonb),
        ('false'::text, 'False'::text, 2, 'false'::jsonb)
      ) as tf(option_id, label, option_order, answer_value)
    ) option_counts;

  elsif v_question.question_type = 'numeric' then
    select jsonb_build_object(
      'mean', avg(answer_number),
      'median', percentile_cont(0.5) within group (order by answer_number::double precision),
      'minimum', min(answer_number),
      'maximum', max(answer_number),
      'correct_count', case
        when v_question.correct_answer is null then null
        else count(*) filter (where is_correct is true)::integer
      end,
      'correct_percentage', case
        when v_question.correct_answer is null then null
        when count(*) = 0 then 0
        else round(
          (count(*) filter (where is_correct is true))::numeric * 100 / count(*),
          1
        )
      end
    )
    into v_numeric
    from (
      select (answer #>> '{}')::numeric as answer_number, is_correct
      from public.responses
      where question_id = v_question.id
    ) numeric_responses;

  elsif v_question.question_type = 'open_text' then
    select coalesce(jsonb_agg(
      jsonb_build_object('answer', answer_text, 'count', answer_count)
      order by answer_count desc, answer_text
    ), '[]'::jsonb)
    into v_text_answers
    from (
      select answer #>> '{}' as answer_text, count(*)::integer as answer_count
      from public.responses
      where question_id = v_question.id
      group by answer #>> '{}'
    ) grouped_answers;
  end if;

  return jsonb_build_object(
    'question_id', v_question.id,
    'question_type', v_question.question_type,
    'total_responses', v_total,
    'participant_count', v_participant_count,
    'unanswered', greatest(v_participant_count - v_total, 0)
  ) || case
    when v_question.question_type in ('multiple_choice', 'true_false')
      then jsonb_build_object('answers', v_answers)
    when v_question.question_type = 'numeric'
      then jsonb_build_object('numeric', v_numeric)
    when v_question.question_type = 'open_text'
      then jsonb_build_object('text_answers', v_text_answers)
    else '{}'::jsonb
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.event_log enable row level security;
alter table public.session_state enable row level security;

create policy profiles_teacher_select
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_teacher_insert
  on public.profiles for insert to authenticated
  with check (
    id = auth.uid()
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy profiles_teacher_update
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy sessions_teacher_select
  on public.sessions for select to authenticated
  using (teacher_id = auth.uid());

create policy questions_teacher_select
  on public.questions for select to authenticated
  using (public._teacher_owns_session(session_id));

create policy participants_teacher_select
  on public.participants for select to authenticated
  using (public._teacher_owns_session(session_id));

create policy responses_teacher_select
  on public.responses for select to authenticated
  using (public._teacher_owns_session(session_id));

create policy event_log_teacher_select
  on public.event_log for select to authenticated
  using (
    (session_id is not null and public._teacher_owns_session(session_id))
    or (session_id is null and teacher_id = auth.uid())
  );

create policy session_state_teacher_or_joined_student_select
  on public.session_state for select to authenticated
  using (
    public._teacher_owns_session(session_id)
    or public._student_joined_session(session_id)
  );

-- Remove Supabase's broad default API privileges, then add the precise reads
-- used by teacher pages and the sanitized student realtime subscription.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.questions from anon, authenticated;
revoke all on table public.participants from anon, authenticated;
revoke all on table public.responses from anon, authenticated;
revoke all on table public.event_log from anon, authenticated;
revoke all on table public.session_state from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.sessions to authenticated;
grant select on table public.questions to authenticated;
grant select on table public.participants to authenticated;
grant select on table public.responses to authenticated;
grant select on table public.event_log to authenticated;
grant select on table public.session_state to authenticated;

-- Internal helpers are not an API. _teacher_owns_session needs EXECUTE because
-- RLS evaluates it as the caller; exposing only a boolean leaks no session data.
revoke execute on function public._valid_multiple_choice_options(jsonb) from public, anon, authenticated;
revoke execute on function public._valid_question_definition(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public._handle_auth_user_teacher_profile() from public, anon, authenticated;
revoke execute on function public._require_teacher() from public, anon, authenticated;
revoke execute on function public._generate_join_code() from public, anon, authenticated;
revoke execute on function public._normalise_question_definition(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public._normalise_student_answer(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public._write_event(text, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._refresh_session_state(uuid) from public, anon, authenticated;
revoke execute on function public._teacher_owns_session(uuid) from public, anon, authenticated;
revoke execute on function public._student_joined_session(uuid) from public, anon, authenticated;
grant execute on function public._teacher_owns_session(uuid) to authenticated;
grant execute on function public._student_joined_session(uuid) to authenticated;

revoke execute on function public.teacher_create_session(text) from public, anon;
revoke execute on function public.teacher_start_session(uuid) from public, anon;
revoke execute on function public.teacher_end_session(uuid) from public, anon;
revoke execute on function public.teacher_create_question(uuid, text, text, jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.teacher_update_question(uuid, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.teacher_launch_question(uuid) from public, anon;
revoke execute on function public.teacher_close_question(uuid) from public, anon;
revoke execute on function public.teacher_reveal_answer(uuid) from public, anon;
revoke execute on function public.student_join(text, text, text) from public, anon;
revoke execute on function public.student_get_state(text) from public, anon;
revoke execute on function public.student_submit_response(uuid, jsonb) from public, anon;
revoke execute on function public.get_question_statistics(uuid) from public, anon;

grant execute on function public.teacher_create_session(text) to authenticated;
grant execute on function public.teacher_start_session(uuid) to authenticated;
grant execute on function public.teacher_end_session(uuid) to authenticated;
grant execute on function public.teacher_create_question(uuid, text, text, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.teacher_update_question(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.teacher_launch_question(uuid) to authenticated;
grant execute on function public.teacher_close_question(uuid) to authenticated;
grant execute on function public.teacher_reveal_answer(uuid) to authenticated;
grant execute on function public.student_join(text, text, text) to authenticated;
grant execute on function public.student_get_state(text) to authenticated;
grant execute on function public.student_submit_response(uuid, jsonb) to authenticated;
grant execute on function public.get_question_statistics(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime registration. The catalog guards make this safe in hosted Supabase
-- and in tools which create the publication before or after project migrations.
-- ---------------------------------------------------------------------------

alter table public.sessions replica identity full;
alter table public.questions replica identity full;
alter table public.participants replica identity full;
alter table public.responses replica identity full;
alter table public.session_state replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
    ) then
      alter publication supabase_realtime add table public.sessions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'questions'
    ) then
      alter publication supabase_realtime add table public.questions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants'
    ) then
      alter publication supabase_realtime add table public.participants;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'responses'
    ) then
      alter publication supabase_realtime add table public.responses;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_state'
    ) then
      alter publication supabase_realtime add table public.session_state;
    end if;
end;
$$;

commit;
