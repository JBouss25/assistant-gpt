-- Mentora : schéma initial
-- Rôles, profils enseignants / élèves, demandes de mise en relation et avis.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'teacher');
create type public.edu_level as enum ('college', 'lycee', 'cpge', 'universite');
create type public.teaching_mode as enum ('online', 'in_person', 'both');
create type public.request_status as enum ('pending', 'accepted', 'declined', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null default '',
  city text,
  avatar_url text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.teacher_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  headline text not null default '',
  bio text not null default '',
  subjects text[] not null default '{}',
  levels public.edu_level[] not null default '{}',
  hourly_rate integer not null default 30 check (hourly_rate between 5 and 500),
  mode public.teaching_mode not null default 'both',
  years_experience integer not null default 0 check (years_experience between 0 and 60),
  diplomas text not null default '',
  availability text[] not null default '{}',
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.student_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  level public.edu_level not null default 'lycee',
  grade text not null default '',
  subjects text[] not null default '{}',
  goals text not null default '',
  budget_max integer not null default 40 check (budget_max between 5 and 500),
  mode public.teaching_mode not null default 'both',
  availability text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.match_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  message text not null default '' check (char_length(message) <= 2000),
  score integer not null default 0 check (score between 0 and 100),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (student_id <> teacher_id)
);

-- Une seule demande en attente par élève / enseignant / matière.
create unique index match_requests_one_pending
  on public.match_requests (student_id, teacher_id, subject)
  where status = 'pending';
create index match_requests_teacher_idx on public.match_requests (teacher_id, status);
create index match_requests_student_idx on public.match_requests (student_id, status);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (teacher_id, student_id)
);

create index teacher_profiles_subjects_idx on public.teacher_profiles using gin (subjects);
create index teacher_profiles_levels_idx on public.teacher_profiles using gin (levels);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Vrai si les deux utilisateurs ont une demande de mise en relation commune.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.match_requests
    where (student_id = a and teacher_id = b) or (student_id = b and teacher_id = a)
  );
$$;

-- Création automatique du profil à l'inscription (métadonnées : role, full_name).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r public.user_role;
begin
  r := case when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end;
  insert into public.profiles (id, role, full_name)
  values (new.id, r, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger teacher_profiles_touch before update on public.teacher_profiles
  for each row execute function public.touch_updated_at();
create trigger student_profiles_touch before update on public.student_profiles
  for each row execute function public.touch_updated_at();
create trigger match_requests_touch before update on public.match_requests
  for each row execute function public.touch_updated_at();

-- Transitions de statut autorisées :
--   enseignant : pending -> accepted | declined
--   élève      : pending -> cancelled
create or replace function public.guard_request_update()
returns trigger language plpgsql as $$
begin
  if new.student_id <> old.student_id or new.teacher_id <> old.teacher_id
     or new.subject <> old.subject or new.message <> old.message or new.score <> old.score then
    raise exception 'Seul le statut peut être modifié';
  end if;
  if old.status <> 'pending' then
    raise exception 'Cette demande a déjà été traitée';
  end if;
  if auth.uid() = old.teacher_id and new.status in ('accepted', 'declined') then
    return new;
  end if;
  if auth.uid() = old.student_id and new.status = 'cancelled' then
    return new;
  end if;
  raise exception 'Transition de statut non autorisée';
end;
$$;

create trigger match_requests_guard before update on public.match_requests
  for each row execute function public.guard_request_update();

-- Recalcul de la note moyenne d'un enseignant.
create or replace function public.refresh_teacher_rating()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  t uuid := coalesce(new.teacher_id, old.teacher_id);
begin
  update public.teacher_profiles tp
  set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where teacher_id = t), 0),
      rating_count = (select count(*) from public.reviews where teacher_id = t)
  where tp.id = t;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_teacher_rating();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.match_requests enable row level security;
alter table public.reviews enable row level security;

-- profiles
create policy "profiles: enseignants publics, soi-même, contacts"
  on public.profiles for select
  using (role = 'teacher' or id = auth.uid() or public.are_connected(id, auth.uid()));
create policy "profiles: mise à jour de son profil"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Le rôle ne peut pas être modifié par l'utilisateur.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, city, avatar_url, onboarded) on public.profiles to authenticated;

-- teacher_profiles
create policy "teacher_profiles: lecture publique"
  on public.teacher_profiles for select
  using (is_published or id = auth.uid());
create policy "teacher_profiles: création par l'enseignant"
  on public.teacher_profiles for insert to authenticated
  with check (id = auth.uid() and public.app_role() = 'teacher');
create policy "teacher_profiles: mise à jour par l'enseignant"
  on public.teacher_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- La note est calculée par trigger, jamais par le client.
revoke insert, update on public.teacher_profiles from authenticated, anon;
grant insert (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability, is_published)
  on public.teacher_profiles to authenticated;
-- "id" est inclus pour permettre l'upsert, la policy impose id = auth.uid().
grant update (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability, is_published)
  on public.teacher_profiles to authenticated;

-- student_profiles
create policy "student_profiles: soi-même et enseignants contactés"
  on public.student_profiles for select to authenticated
  using (id = auth.uid() or public.are_connected(id, auth.uid()));
create policy "student_profiles: création par l'élève"
  on public.student_profiles for insert to authenticated
  with check (id = auth.uid() and public.app_role() = 'student');
create policy "student_profiles: mise à jour par l'élève"
  on public.student_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- match_requests
create policy "match_requests: participants"
  on public.match_requests for select to authenticated
  using (auth.uid() in (student_id, teacher_id));
create policy "match_requests: créée par un élève"
  on public.match_requests for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.app_role() = 'student'
    and status = 'pending'
    and exists (select 1 from public.teacher_profiles tp where tp.id = teacher_id and tp.is_published)
  );
create policy "match_requests: réponse des participants"
  on public.match_requests for update to authenticated
  using (auth.uid() in (student_id, teacher_id))
  with check (auth.uid() in (student_id, teacher_id));

-- reviews
create policy "reviews: lecture publique"
  on public.reviews for select using (true);
create policy "reviews: élève ayant suivi un cours"
  on public.reviews for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.match_requests m
      where m.student_id = auth.uid() and m.teacher_id = reviews.teacher_id and m.status = 'accepted'
    )
  );
create policy "reviews: modification de son avis"
  on public.reviews for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
revoke update on public.reviews from authenticated, anon;
grant update (rating, comment) on public.reviews to authenticated;

create policy "reviews: suppression de son avis"
  on public.reviews for delete to authenticated
  using (student_id = auth.uid());
