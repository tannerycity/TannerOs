alter table app.chat_members add column if not exists muted_until timestamptz;
