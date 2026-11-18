-- Schéma Supabase (PostgreSQL) de l'assistant IA.
-- À exécuter une fois dans Supabase : SQL Editor > New query.
-- L'API utilise la clé service_role, qui contourne RLS ; RLS est activé ici
-- pour bloquer tout accès direct par la clé anon.

create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,            -- claim `sub` du JWT Moodle
  created_at  timestamptz not null default now()
);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         text not null,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_conversations_user on conversations(user_id);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

alter table conversations enable row level security;
alter table messages enable row level security;
