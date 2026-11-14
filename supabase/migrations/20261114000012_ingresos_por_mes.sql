-- Ingresos por mes: el ingreso de cada uno puede cambiar mes a mes (ingresos variables).
-- Un mes sin registro propio usa el último mes anterior que sí tenga. De ahí sale el %
-- de reparto de los gastos compartidos de ESE mes.
create table if not exists public.member_incomes (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  member_id          uuid not null references public.members(id) on delete cascade,
  month              text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  monthly_income     bigint not null default 0 check (monthly_income >= 0),
  income_deductions  bigint not null default 0 check (income_deductions >= 0),
  deductions_note    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (member_id, month)
);
create index if not exists member_incomes_household_month on public.member_incomes (household_id, month);

create trigger member_incomes_touch before update on public.member_incomes
  for each row execute function public.touch_updated_at();

alter table public.member_incomes enable row level security;
create policy "hogar: todo" on public.member_incomes for all
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));

-- Punto de partida: los ingresos actuales valen desde el mes en que empezaron a usar la app
insert into public.member_incomes (household_id, member_id, month, monthly_income, income_deductions, deductions_note)
select m.household_id, m.id, coalesce(h.start_month, to_char(now() at time zone 'America/Bogota', 'YYYY-MM')),
       m.monthly_income, m.income_deductions, m.deductions_note
  from public.members m join public.households h on h.id = m.household_id
on conflict (member_id, month) do nothing;
