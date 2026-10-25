-- Transacciones recurrentes programadas.
-- La app genera las ocurrencias vencidas cada vez que alguien la abre; la llave
-- de deduplicación 'rec:<id>:<fecha>' evita duplicados aunque los dos la abran a la vez.

alter type public.tx_source add value if not exists 'recurrente';

-- Restricción única normal (los NULL no chocan entre sí) para poder usar upsert desde la app.
drop index if exists public.transactions_dedupe;
alter table public.transactions
  add constraint transactions_dedupe unique (household_id, dedupe_hash);

create table public.recurring_transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  name               text not null,                -- se usa como comercio/descripción
  amount             bigint not null check (amount > 0),
  kind               public.tx_kind not null default 'gasto' check (kind in ('gasto', 'ingreso')),
  scope              public.tx_scope,
  category_id        uuid references public.categories(id) on delete set null,
  account_id         uuid references public.accounts(id) on delete set null,
  paid_by_member_id  uuid not null references public.members(id) on delete cascade,
  -- semanal | cada_2_semanas | quincenal (15 y último día) | mensual | bimestral | trimestral | anual
  frequency          text not null check (frequency in ('semanal','cada_2_semanas','quincenal','mensual','bimestral','trimestral','anual')),
  start_date         date not null,
  end_date           date,
  next_date          date not null,                -- próxima ocurrencia por generar
  -- true: entra como identificado (si tiene ámbito y categoría); false: entra a Pendientes
  auto_identify      boolean not null default true,
  is_active          boolean not null default true,
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on public.recurring_transactions (household_id, is_active, next_date);

alter table public.transactions
  add column recurring_id uuid references public.recurring_transactions(id) on delete set null;

alter table public.recurring_transactions enable row level security;
create policy "hogar: todo" on public.recurring_transactions for all
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));
