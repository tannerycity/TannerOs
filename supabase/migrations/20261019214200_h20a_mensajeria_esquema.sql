-- h20 · Mensajería pro (19/10/2026). Pedido de Presidencia: "dale a todos".
-- Lo que un WhatsApp Business serio trae y al vestidor le faltaba:
--   1. Avisos con "Enterado" y la lista de quién falta (visto no es enterado).
--   2. Responder citando un mensaje.
--   3. Fotos y archivos en los chats (bucket privado, sólo los del chat).
--   4. Respuestas rápidas guardadas por persona.
--   5. @mencionar en los chats de área (le llega aunque tenga el chat en silencio).
--   6. Programar un aviso (sale a su hora; el push lo manda el reloj del club).
--   7. Fijar un mensaje en el chat o un aviso arriba de la lista.
--   8. Silenciar un chat, buscar dentro, editar (15 min) y borrar lo propio.
-- Todo sigue pasando por funciones con candado: nadie toca filas directo.

/* ---------- Esquema ---------- */
alter table app.chat_messages
  add column if not exists reply_to uuid references app.chat_messages(id) on delete set null,
  add column if not exists attachment jsonb,
  add column if not exists mentions uuid[] not null default '{}',
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;
-- Un mensaje puede ser sólo una foto, y uno borrado ya no guarda el texto.
alter table app.chat_messages drop constraint if exists chat_messages_body_check;
alter table app.chat_messages add constraint chat_messages_body_check
  check (length(btrim(body)) <= 4000 and (length(btrim(body)) >= 1 or attachment is not null or deleted_at is not null));

alter table app.chat_threads
  add column if not exists pinned_message_id uuid references app.chat_messages(id) on delete set null,
  add column if not exists pinned_by uuid,
  add column if not exists pinned_at timestamptz;

alter table app.chat_members add column if not exists muted_until timestamptz;

alter table app.announcements
  add column if not exists pinned_at timestamptz,
  add column if not exists push_pending boolean not null default false;
create index if not exists announcements_push_pending on app.announcements (starts_at) where push_pending;

create table if not exists app.announcement_acks (
  announcement_id uuid not null references app.announcements(id) on delete cascade,
  user_id uuid not null,
  acked_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table app.announcement_acks enable row level security;

create table if not exists app.chat_quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  shortcut text not null check (shortcut ~ '^[a-z0-9_-]{1,24}$'),
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, shortcut)
);
alter table app.chat_quick_replies enable row level security;
revoke all on app.announcement_acks, app.chat_quick_replies from public, anon, authenticated;
