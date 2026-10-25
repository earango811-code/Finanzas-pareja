-- Fase 2: ingesta automática de alertas por correo.

-- Las compras con débito traen los 4 dígitos de la TARJETA (T.Deb *1234) y las
-- transferencias los de la CUENTA (*5678). Una cuenta puede tener ambos.
alter table public.accounts
  add column card_last4 char(4) check (card_last4 ~ '^[0-9]{4}$');

-- Últimos 4 que trajo la alerta, para enlazar la cuenta cuando la registren después.
alter table public.transactions
  add column account_last4 char(4);
create index on public.transactions (household_id, account_last4) where account_id is null;

-- Regla automática (se clasifica sola) o solo sugerencia.
alter table public.rules
  add column auto_apply boolean not null default true;

-- Bitácora de cada alerta recibida: evita reprocesar el mismo correo, sirve de
-- límite de solicitudes y deja ver qué formatos no se entendieron.
create table public.ingest_log (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  source          public.tx_source not null default 'email',
  message_id      text not null,
  status          text not null default 'recibido'
                  check (status in ('recibido','creado','duplicado','no_transaccional','formato_desconocido','remitente_no_permitido','error')),
  text            text,          -- frase de la alerta, con datos sensibles enmascarados
  transaction_id  uuid references public.transactions(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (member_id, message_id)
);
create index on public.ingest_log (member_id, created_at desc);
create index on public.ingest_log (household_id, created_at desc);

-- Solo lectura para el hogar; escribe únicamente el webhook (service role).
alter table public.ingest_log enable row level security;
create policy "hogar: leer bitácora" on public.ingest_log
  for select using (household_id in (select public.my_household_ids()));
