-- Mes del presupuesto de cada movimiento.
-- Por defecto es el mes de su fecha; se puede mover a otro mes (budget_month)
-- sin cambiar la fecha real (que se usa para conciliar con el banco).

alter table public.transactions
  add column budget_month text check (budget_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Mes efectivo, calculado: budget_month si lo pusieron, si no el de occurred_on.
alter table public.transactions
  add column month text generated always as (
    coalesce(
      budget_month,
      extract(year from occurred_on)::int::text || '-' || lpad(extract(month from occurred_on)::int::text, 2, '0')
    )
  ) stored;

create index on public.transactions (household_id, month);

-- Primer mes en que el hogar usa la app (antes no se ofrecen sobrantes ni presupuesto).
alter table public.households
  add column start_month text check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$');
