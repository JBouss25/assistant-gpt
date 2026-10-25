-- Mentora : comptes parents et suivi de la progression.
--   - un parent relie le compte de son enfant grâce au code affiché sur le profil de l'élève
--   - après chaque cours, l'enseignant rédige un compte-rendu (note /20, implication, notions, devoirs)
--   - élève, parents et enseignants suivent la progression (graphiques)

-- ---------------------------------------------------------------------------
-- Inscription : le rôle parent est accepté
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r public.user_role;
begin
  r := case new.raw_user_meta_data ->> 'role'
         when 'teacher' then 'teacher'
         when 'parent' then 'parent'
         else 'student'
       end;
  insert into public.profiles (id, role, full_name)
  values (new.id, r, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liens parent ↔ enfant
-- ---------------------------------------------------------------------------
create or replace function public.new_parent_code()
returns text language sql volatile
as $$
  -- 8 caractères sans ambiguïté (pas de 0/O, 1/I/L)
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;

alter table public.student_profiles
  add column parent_code text not null unique default public.new_parent_code();

create table public.parent_links (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

create index parent_links_student_idx on public.parent_links (student_id);

alter table public.parent_links enable row level security;

create or replace function public.is_parent_of(student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.parent_links where parent_id = auth.uid() and student_id = student);
$$;

create or replace function public.is_child_of(parent uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.parent_links where parent_id = parent and student_id = auth.uid());
$$;

create policy "parent_links: parent ou enfant"
  on public.parent_links for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid());
-- L'un comme l'autre peut rompre le lien.
create policy "parent_links: suppression par le parent ou l'enfant"
  on public.parent_links for delete to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid());

revoke insert, update on public.parent_links from authenticated, anon;

-- Un parent relie un enfant avec son code ; renvoie l'identifiant de l'élève.
create or replace function public.link_child(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  child uuid;
begin
  if public.app_role() is distinct from 'parent' then
    raise exception 'Seul un compte parent peut ajouter un enfant';
  end if;
  select id into child from public.student_profiles where parent_code = upper(btrim(p_code));
  if child is null then
    raise exception 'Code inconnu. Vérifiez-le sur le profil de votre enfant';
  end if;
  insert into public.parent_links (parent_id, student_id) values (auth.uid(), child)
  on conflict do nothing;
  return child;
end;
$$;

-- L'élève peut changer son code (les liens existants sont conservés).
create or replace function public.regenerate_parent_code()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  code text;
begin
  update public.student_profiles set parent_code = public.new_parent_code()
  where id = auth.uid() returning parent_code into code;
  if code is null then
    raise exception 'Réservé aux élèves';
  end if;
  return code;
end;
$$;

revoke execute on function public.link_child(text), public.regenerate_parent_code() from public, anon;
grant execute on function public.link_child(text), public.regenerate_parent_code() to authenticated;

-- Le code n'est lisible que par l'élève (les enseignants contactés lisent student_profiles).
revoke select on public.student_profiles from authenticated, anon;
grant select (id, level, grade, subjects, goals, budget_max, mode, availability, updated_at)
  on public.student_profiles to authenticated;

create or replace function public.my_parent_code()
returns text
language sql stable security definer set search_path = public
as $$
  select parent_code from public.student_profiles where id = auth.uid();
$$;
revoke execute on function public.my_parent_code() from public, anon;
grant execute on function public.my_parent_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Ce que voit un parent : profil, scolarité et cours de son enfant ;
-- ce que voit un élève : le nom de ses parents.
-- ---------------------------------------------------------------------------
drop policy "profiles: enseignants publics, soi-même, contacts" on public.profiles;
create policy "profiles: enseignants publics, soi-même, contacts, famille"
  on public.profiles for select
  using (
    role = 'teacher' or id = auth.uid() or public.are_connected(id, auth.uid())
    or public.is_parent_of(id) or public.is_child_of(id)
  );

create policy "student_profiles: parents"
  on public.student_profiles for select to authenticated
  using (public.is_parent_of(id));

create policy "lessons: parents"
  on public.lessons for select to authenticated
  using (public.is_parent_of(student_id));

create policy "match_requests: parents"
  on public.match_requests for select to authenticated
  using (public.is_parent_of(student_id));

-- ---------------------------------------------------------------------------
-- Comptes-rendus de séance
-- ---------------------------------------------------------------------------
create table public.lesson_reports (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  lesson_date timestamptz not null,
  grade numeric(3, 1) not null check (grade between 0 and 20),
  engagement integer not null check (engagement between 1 and 5),
  topics text not null default '' check (char_length(topics) <= 500),
  homework text not null default '' check (char_length(homework) <= 500),
  comment text not null default '' check (char_length(comment) <= 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lesson_reports_student_idx on public.lesson_reports (student_id, lesson_date);
create index lesson_reports_teacher_idx on public.lesson_reports (teacher_id, lesson_date);

-- Le compte-rendu reprend les informations du cours : confirmé, terminé, et rédigé par son enseignant.
create or replace function public.prepare_lesson_report()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  l public.lessons;
begin
  select * into l from public.lessons where id = new.lesson_id;
  if l.id is null or l.status <> 'confirmed' then
    raise exception 'Seul un cours confirmé peut recevoir un compte-rendu';
  end if;
  if l.teacher_id <> auth.uid() then
    raise exception 'Seul l''enseignant du cours peut rédiger le compte-rendu';
  end if;
  if l.ends_at > now() then
    raise exception 'Le compte-rendu se rédige une fois le cours terminé';
  end if;
  new.teacher_id := l.teacher_id;
  new.student_id := l.student_id;
  new.subject := l.subject;
  new.lesson_date := l.starts_at;
  return new;
end;
$$;

create trigger lesson_reports_prepare before insert on public.lesson_reports
  for each row execute function public.prepare_lesson_report();
create trigger lesson_reports_touch before update on public.lesson_reports
  for each row execute function public.touch_updated_at();

alter table public.lesson_reports enable row level security;

-- Un enseignant voit ses propres comptes-rendus ; l'élève et ses parents les voient tous.
create policy "lesson_reports: lecture"
  on public.lesson_reports for select to authenticated
  using (teacher_id = auth.uid() or student_id = auth.uid() or public.is_parent_of(student_id));
create policy "lesson_reports: rédaction par l'enseignant"
  on public.lesson_reports for insert to authenticated
  with check (teacher_id = auth.uid()); -- teacher_id est fixé par le trigger prepare_lesson_report
create policy "lesson_reports: modification par l'enseignant"
  on public.lesson_reports for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

revoke insert, update, delete on public.lesson_reports from authenticated, anon;
grant insert (lesson_id, grade, engagement, topics, homework, comment) on public.lesson_reports to authenticated;
grant update (grade, engagement, topics, homework, comment) on public.lesson_reports to authenticated;
