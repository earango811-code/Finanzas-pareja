-- Cierre de mes: conciliación con el extracto de cada cuenta, paso de saldos a bolsillos y
-- el ingreso final de cada uno. Un registro por hogar y mes.
create table if not exists public.month_closes (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  month            text not null check (month ~ '^\d{4}-\d{2}$'),
  -- { "<account_id>": { "at": ..., "lines": n, "matched": n, "added": n, "removed": n } }
  reconciliations  jsonb not null default '{}'::jsonb,
  closed_at        timestamptz,
  closed_by        uuid references auth.users(id),
  summary          jsonb,           -- ingreso final de cada uno al cerrar
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, month)
);

create trigger month_closes_touch before update on public.month_closes
  for each row execute function public.touch_updated_at();

alter table public.month_closes enable row level security;
create policy "hogar: todo" on public.month_closes for all
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));
