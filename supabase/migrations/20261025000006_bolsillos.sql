-- Bolsillos: plata apartada para un fin (viaje, imprevistos…).
-- El saldo es: saldo inicial + aportes (manuales o sobrante del mes) − retiros
-- − gastos marcados como "pagado desde este bolsillo".

create table public.pockets (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  name             text not null,
  -- null = compartido (de los dos); con valor = personal de ese miembro
  owner_member_id  uuid references public.members(id) on delete cascade,
  target_amount    bigint check (target_amount is null or target_amount > 0),  -- meta opcional
  opening_balance  bigint not null default 0,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  unique (household_id, name)
);

create table public.pocket_movements (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  pocket_id     uuid not null references public.pockets(id) on delete cascade,
  occurred_on   date not null,
  -- aporte / sobrante: suma ; retiro: resta (amount siempre positivo)
  kind          text not null check (kind in ('aporte', 'sobrante', 'retiro')),
  amount        bigint not null check (amount > 0),
  month         text check (month ~ '^\d{4}-\d{2}$'),  -- mes del sobrante
  note          text,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index on public.pocket_movements (pocket_id, occurred_on);

-- Gasto pagado desde un bolsillo: no cuenta en el presupuesto del mes.
alter table public.transactions
  add column pocket_id uuid references public.pockets(id) on delete set null;
create index on public.transactions (pocket_id) where pocket_id is not null;

alter table public.pockets          enable row level security;
alter table public.pocket_movements enable row level security;

create policy "hogar: todo" on public.pockets for all
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));
create policy "hogar: todo" on public.pocket_movements for all
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));
