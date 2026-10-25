-- Mentora : messagerie et réservation de cours (1 h 30 à 2 h).
-- Une conversation et des réservations ne sont possibles qu'une fois la demande acceptée.

create type public.lesson_status as enum ('proposed', 'confirmed', 'cancelled');

-- Vrai si l'utilisateur courant participe à cette demande acceptée.
create or replace function public.is_accepted_participant(req uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.match_requests
    where id = req and status = 'accepted' and auth.uid() in (student_id, teacher_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.match_requests (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_request_idx on public.messages (request_id, created_at);

alter table public.messages enable row level security;

create policy "messages: lecture par les participants"
  on public.messages for select to authenticated
  using (public.is_accepted_participant(request_id));
create policy "messages: envoi par un participant"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_accepted_participant(request_id));

-- Les messages ne sont ni modifiables ni supprimables.
revoke update, delete on public.messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Cours réservés
-- ---------------------------------------------------------------------------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.match_requests (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null
    check (duration_minutes between 90 and 120 and duration_minutes % 15 = 0),
  ends_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 500),
  status public.lesson_status not null default 'proposed',
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lessons_teacher_idx on public.lessons (teacher_id, starts_at);
create index lessons_student_idx on public.lessons (student_id, starts_at);

-- À la création : participants et matière recopiés depuis la demande, fin calculée,
-- date future, et pas de chevauchement avec un autre cours de l'enseignant ou de l'élève.
create or replace function public.prepare_lesson()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  req public.match_requests;
begin
  select * into req from public.match_requests where id = new.request_id;
  if req.id is null or req.status <> 'accepted' then
    raise exception 'La demande doit être acceptée pour réserver un cours';
  end if;

  new.teacher_id := req.teacher_id;
  new.student_id := req.student_id;
  new.subject := req.subject;
  new.proposed_by := auth.uid();
  new.status := 'proposed';
  new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);

  if new.starts_at <= now() then
    raise exception 'Le cours doit être programmé dans le futur';
  end if;

  -- Sérialise les réservations d'un même enseignant pour éviter les doublons concurrents.
  perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));

  if exists (
    select 1 from public.lessons l
    where l.status in ('proposed', 'confirmed')
      and (l.teacher_id = new.teacher_id or l.student_id = new.student_id)
      and tstzrange(l.starts_at, l.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'Ce créneau chevauche un autre cours';
  end if;

  return new;
end;
$$;

create trigger lessons_prepare before insert on public.lessons
  for each row execute function public.prepare_lesson();

-- Transitions autorisées :
--   proposed  -> confirmed  : par l'autre participant (pas celui qui a proposé)
--   proposed | confirmed -> cancelled : par l'un ou l'autre, avant le début du cours
create or replace function public.guard_lesson_update()
returns trigger language plpgsql as $$
begin
  if new.request_id <> old.request_id or new.teacher_id <> old.teacher_id
     or new.student_id <> old.student_id or new.starts_at <> old.starts_at
     or new.duration_minutes <> old.duration_minutes or new.ends_at <> old.ends_at
     or new.proposed_by <> old.proposed_by or new.subject <> old.subject or new.note <> old.note then
    raise exception 'Seul le statut d''un cours peut être modifié';
  end if;
  if auth.uid() not in (old.teacher_id, old.student_id) then
    raise exception 'Action non autorisée';
  end if;
  if old.status = 'proposed' and new.status = 'confirmed' and auth.uid() <> old.proposed_by then
    if old.starts_at <= now() then
      raise exception 'Ce créneau est passé';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if old.status in ('proposed', 'confirmed') and new.status = 'cancelled' and old.starts_at > now() then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Changement de statut non autorisé';
end;
$$;

create trigger lessons_guard before update on public.lessons
  for each row execute function public.guard_lesson_update();

alter table public.lessons enable row level security;

create policy "lessons: lecture par les participants"
  on public.lessons for select to authenticated
  using (auth.uid() in (teacher_id, student_id));
create policy "lessons: proposition par un participant"
  on public.lessons for insert to authenticated
  with check (public.is_accepted_participant(request_id));
create policy "lessons: mise à jour par les participants"
  on public.lessons for update to authenticated
  using (auth.uid() in (teacher_id, student_id))
  with check (auth.uid() in (teacher_id, student_id));

revoke insert, update, delete on public.lessons from authenticated, anon;
grant insert (request_id, starts_at, duration_minutes, note) on public.lessons to authenticated;
grant update (status) on public.lessons to authenticated;

-- ---------------------------------------------------------------------------
-- Temps réel (messages et cours) si la publication Supabase existe.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.lessons;
  end if;
end;
$$;
