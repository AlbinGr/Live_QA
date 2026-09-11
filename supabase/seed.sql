-- Optional local-development data for `supabase db reset`.
--
-- Demo teacher credentials:
--   email:    teacher@example.com
--   password: classroom-demo
--
-- The application never depends on these rows. Fixed UUIDs and ON CONFLICT
-- clauses make the seed reasonably safe to run more than once locally.

begin;

-- A real email/password Auth user is useful for exercising the teacher UI.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'teacher@example.com',
  extensions.crypt('classroom-demo', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Demo Teacher"}'::jsonb,
  now() - interval '8 days',
  now() - interval '8 days',
  '',
  '',
  '',
  '',
  false
)
on conflict do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  '11111111-1111-4111-9111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"teacher@example.com"}'::jsonb,
  'email',
  now() - interval '8 days',
  now() - interval '8 days',
  now() - interval '8 days'
)
on conflict do nothing;

insert into public.profiles (id, display_name, created_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'Demo Teacher',
  now() - interval '8 days'
)
on conflict (id) do nothing;

-- Anonymous Auth rows represent three sample student devices. They do not have
-- profile rows and therefore cannot use any teacher RPC.
insert into auth.users (
  instance_id, id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', '',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now() - interval '7 days 55 minutes', now() - interval '7 days 55 minutes', true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', '',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now() - interval '7 days 54 minutes', now() - interval '7 days 54 minutes', true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a3333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated', '',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now() - interval '7 days 53 minutes', now() - interval '7 days 53 minutes', true
  )
on conflict do nothing;

insert into public.sessions (
  id, teacher_id, title, join_code, status, created_at, started_at, ended_at
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Demo: European Geography',
  'CLASS2',
  'ended',
  now() - interval '8 days',
  now() - interval '7 days 1 hour',
  now() - interval '7 days'
)
on conflict do nothing;

insert into public.questions (
  id, session_id, question_order, question_type, prompt, options,
  correct_answer, status, created_at, launched_at, closed_at, revealed_at
) values
  (
    '33333333-3333-4333-8333-333333333331',
    '22222222-2222-4222-8222-222222222222',
    1,
    'multiple_choice',
    'What is the capital of Switzerland?',
    '[{"id":"a","text":"Zurich"},{"id":"b","text":"Bern"},{"id":"c","text":"Geneva"}]'::jsonb,
    '"b"'::jsonb,
    'revealed',
    now() - interval '7 days 59 minutes',
    now() - interval '7 days 50 minutes',
    now() - interval '7 days 47 minutes',
    now() - interval '7 days 46 minutes'
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    '22222222-2222-4222-8222-222222222222',
    2,
    'true_false',
    'The Rhine flows through Basel.',
    '[{"id":"true","text":"True"},{"id":"false","text":"False"}]'::jsonb,
    'true'::jsonb,
    'revealed',
    now() - interval '7 days 45 minutes',
    now() - interval '7 days 40 minutes',
    now() - interval '7 days 37 minutes',
    now() - interval '7 days 36 minutes'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    3,
    'numeric',
    'How many official languages does Switzerland have?',
    null,
    '4'::jsonb,
    'revealed',
    now() - interval '7 days 35 minutes',
    now() - interval '7 days 30 minutes',
    now() - interval '7 days 27 minutes',
    now() - interval '7 days 26 minutes'
  ),
  (
    '33333333-3333-4333-8333-333333333334',
    '22222222-2222-4222-8222-222222222222',
    4,
    'open_text',
    'Name one thing you learned today.',
    null,
    null,
    'revealed',
    now() - interval '7 days 25 minutes',
    now() - interval '7 days 20 minutes',
    now() - interval '7 days 17 minutes',
    now() - interval '7 days 16 minutes'
  )
on conflict do nothing;

insert into public.participants (
  id, session_id, auth_user_id, client_id, display_name, joined_at, last_seen_at
) values
  (
    'b1111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'a1111111-1111-4111-8111-111111111111',
    'demo-device-alex', 'Alex',
    now() - interval '7 days 55 minutes', now() - interval '7 days 15 minutes'
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'a2222222-2222-4222-8222-222222222222',
    'demo-device-sam', 'Sam',
    now() - interval '7 days 54 minutes', now() - interval '7 days 15 minutes'
  ),
  (
    'b3333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'a3333333-3333-4333-8333-333333333333',
    'demo-device-noa', null,
    now() - interval '7 days 53 minutes', now() - interval '7 days 15 minutes'
  )
on conflict do nothing;

insert into public.responses (
  id, session_id, question_id, participant_id, answer, is_correct,
  submitted_at, updated_at
) values
  ('c1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 'b1111111-1111-4111-8111-111111111111', '"b"'::jsonb, true,  now() - interval '7 days 49 minutes', now() - interval '7 days 49 minutes'),
  ('c1111111-1111-4111-8111-111111111112', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 'b2222222-2222-4222-8222-222222222222', '"a"'::jsonb, false, now() - interval '7 days 49 minutes', now() - interval '7 days 48 minutes'),
  ('c1111111-1111-4111-8111-111111111113', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 'b3333333-3333-4333-8333-333333333333', '"b"'::jsonb, true,  now() - interval '7 days 48 minutes', now() - interval '7 days 48 minutes'),
  ('c2222222-2222-4222-8222-222222222221', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 'b1111111-1111-4111-8111-111111111111', 'true'::jsonb,  true,  now() - interval '7 days 39 minutes', now() - interval '7 days 39 minutes'),
  ('c2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 'b2222222-2222-4222-8222-222222222222', 'false'::jsonb, false, now() - interval '7 days 39 minutes', now() - interval '7 days 39 minutes'),
  ('c2222222-2222-4222-8222-222222222223', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 'b3333333-3333-4333-8333-333333333333', 'true'::jsonb,  true,  now() - interval '7 days 38 minutes', now() - interval '7 days 38 minutes'),
  ('c3333333-3333-4333-8333-333333333331', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'b1111111-1111-4111-8111-111111111111', '4'::jsonb, true,  now() - interval '7 days 29 minutes', now() - interval '7 days 29 minutes'),
  ('c3333333-3333-4333-8333-333333333332', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'b2222222-2222-4222-8222-222222222222', '3'::jsonb, false, now() - interval '7 days 29 minutes', now() - interval '7 days 29 minutes'),
  ('c3333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'b3333333-3333-4333-8333-333333333333', '4'::jsonb, true,  now() - interval '7 days 28 minutes', now() - interval '7 days 28 minutes'),
  ('c4444444-4444-4444-8444-444444444441', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333334', 'b1111111-1111-4111-8111-111111111111', '"Bern is the federal city."'::jsonb, null, now() - interval '7 days 19 minutes', now() - interval '7 days 19 minutes'),
  ('c4444444-4444-4444-8444-444444444442', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333334', 'b2222222-2222-4222-8222-222222222222', '"Bern is the federal city."'::jsonb, null, now() - interval '7 days 19 minutes', now() - interval '7 days 19 minutes'),
  ('c4444444-4444-4444-8444-444444444443', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333334', 'b3333333-3333-4333-8333-333333333333', '"There are four official languages."'::jsonb, null, now() - interval '7 days 18 minutes', now() - interval '7 days 18 minutes')
on conflict do nothing;

-- A compact but representative audit history. Runtime changes are logged by the
-- RPCs; these records simply make the history view useful immediately.
do $$
begin
  if not exists (
    select 1
    from public.event_log
    where session_id = '22222222-2222-4222-8222-222222222222'
      and event_type = 'session_created'
      and payload @> '{"seed":true}'::jsonb
  ) then
    insert into public.event_log (
      session_id, question_id, participant_id, teacher_id, event_type, payload, created_at
    ) values
      ('22222222-2222-4222-8222-222222222222', null, null, '11111111-1111-4111-8111-111111111111', 'session_created', '{"seed":true}'::jsonb, now() - interval '8 days'),
      ('22222222-2222-4222-8222-222222222222', null, null, '11111111-1111-4111-8111-111111111111', 'session_started', '{"seed":true}'::jsonb, now() - interval '7 days 1 hour'),
      ('22222222-2222-4222-8222-222222222222', null, 'b1111111-1111-4111-8111-111111111111', null, 'participant_joined', '{"seed":true}'::jsonb, now() - interval '7 days 55 minutes'),
      ('22222222-2222-4222-8222-222222222222', null, 'b2222222-2222-4222-8222-222222222222', null, 'participant_joined', '{"seed":true}'::jsonb, now() - interval '7 days 54 minutes'),
      ('22222222-2222-4222-8222-222222222222', null, 'b3333333-3333-4333-8333-333333333333', null, 'participant_joined', '{"seed":true}'::jsonb, now() - interval '7 days 53 minutes'),
      ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', null, '11111111-1111-4111-8111-111111111111', 'question_launched', '{"seed":true}'::jsonb, now() - interval '7 days 50 minutes'),
      ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', null, '11111111-1111-4111-8111-111111111111', 'answer_revealed', '{"seed":true}'::jsonb, now() - interval '7 days 46 minutes'),
      ('22222222-2222-4222-8222-222222222222', null, null, '11111111-1111-4111-8111-111111111111', 'session_ended', '{"seed":true}'::jsonb, now() - interval '7 days');
  end if;
end;
$$;

select public._refresh_session_state('22222222-2222-4222-8222-222222222222');

commit;
