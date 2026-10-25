-- Mentora : appli mobile (jetons de notification) et suppression de compte.

create table public.device_tokens (
  token text primary key check (char_length(token) between 10 and 4096),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Chaque utilisateur ne voit et ne gère que les jetons de ses propres appareils.
-- L'envoi des notifications se fait côté serveur avec la clé secrète.
create policy "device_tokens: lecture de ses jetons"
  on public.device_tokens for select to authenticated
  using (user_id = auth.uid());
create policy "device_tokens: suppression de ses jetons"
  on public.device_tokens for delete to authenticated
  using (user_id = auth.uid());

revoke insert, update on public.device_tokens from authenticated, anon;

-- Enregistre le jeton de l'appareil pour l'utilisateur courant. Un même téléphone
-- peut changer de compte : le jeton est alors réattribué.
create or replace function public.register_device(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  insert into public.device_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke execute on function public.register_device(text, text) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;

-- Suppression définitive du compte courant (exigée par l'App Store et Google Play).
-- La cascade supprime profil, demandes, messages, cours, avis et jetons.
create or replace function public.delete_own_account()
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Signalement et blocage (exigés pour les applis avec messagerie entre utilisateurs)
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid references public.match_requests (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  created_at timestamptz not null default now()
);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy "blocks: lecture de ses blocages"
  on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks: bloquer un contact"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid() and public.are_connected(blocker_id, blocked_id));
create policy "blocks: débloquer"
  on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Les signalements sont lus par l'équipe de modération (tableau de bord Supabase).
create policy "reports: lecture de ses signalements"
  on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy "reports: signaler un contact"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.are_connected(reporter_id, reported_id));

revoke update on public.blocks, public.reports from authenticated, anon;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- État de blocage d'une conversation, vu par l'utilisateur courant : none | by_me | by_other.
create or replace function public.block_state(req uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.blocks b where b.blocker_id = auth.uid()
                 and b.blocked_id = case when auth.uid() = m.student_id then m.teacher_id else m.student_id end) then 'by_me'
    when public.is_blocked(m.student_id, m.teacher_id) then 'by_other'
    else 'none'
  end
  from public.match_requests m
  where m.id = req and auth.uid() in (m.student_id, m.teacher_id);
$$;

-- Écrire ou réserver : participant d'une demande acceptée, sans blocage entre les deux.
create or replace function public.can_interact(req uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.match_requests m
    where m.id = req and m.status = 'accepted' and auth.uid() in (m.student_id, m.teacher_id)
      and not public.is_blocked(m.student_id, m.teacher_id)
  );
$$;

drop policy "messages: envoi par un participant" on public.messages;
create policy "messages: envoi par un participant"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_interact(request_id));

drop policy "lessons: proposition par un participant" on public.lessons;
create policy "lessons: proposition par un participant"
  on public.lessons for insert to authenticated
  with check (public.can_interact(request_id));

drop policy "match_requests: créée par un élève" on public.match_requests;
create policy "match_requests: créée par un élève"
  on public.match_requests for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.app_role() = 'student'
    and status = 'pending'
    and exists (select 1 from public.teacher_profiles tp where tp.id = teacher_id and tp.is_published)
    and not public.is_blocked(student_id, teacher_id)
  );
