-- Esquema inicial: hogar, miembros, cuentas, categorías, presupuestos,
-- transacciones y reglas. Todo protegido con Row Level Security.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.category_scope as enum ('compartida', 'personal', 'ambas');
create type public.budget_group  as enum ('necesidades', 'deseos', 'ahorro');
create type public.budget_mode   as enum ('fijo', 'resto');
create type public.account_type  as enum ('debito', 'credito', 'efectivo', 'otro');
create type public.tx_status     as enum ('pendiente', 'identificado', 'ignorado');
create type public.tx_scope      as enum ('compartido', 'personal');
create type public.tx_kind       as enum ('gasto', 'ingreso', 'transferencia_interna', 'pago_tarjeta', 'liquidacion');
create type public.tx_source     as enum ('email', 'notificacion', 'csv', 'manual');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.households (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default 'Nuestro hogar',
  -- Compras diferidas: 'completa' (en la fecha de compra) o 'cuota' (fase 3)
  deferred_mode   text not null default 'completa' check (deferred_mode in ('completa', 'cuota')),
  target_needs    numeric(4,3) not null default 0.5,
  target_wants    numeric(4,3) not null default 0.3,
  target_savings  numeric(4,3) not null default 0.2,
  created_at      timestamptz not null default now()
);

create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  user_id            uuid unique references auth.users(id) on delete set null,
  email              text not null,
  display_name       text not null,
  -- Ingreso fijo mensual; se edita a mano cuando cambie.
  monthly_income     bigint not null default 0 check (monthly_income >= 0),
  -- Descuentos fijos que se restan antes de calcular el % (ej. cuota de especialización).
  income_deductions  bigint not null default 0 check (income_deductions >= 0),
  deductions_note    text,
  created_at         timestamptz not null default now(),
  unique (household_id, email)
);
create index on public.members (lower(email));

create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  owner_member_id  uuid not null references public.members(id) on delete cascade,
  name             text not null,
  type             public.account_type not null,
  -- Solo los últimos 4 dígitos. Nunca el número completo.
  last4            char(4) check (last4 ~ '^[0-9]{4}$'),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index on public.accounts (household_id);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null,
  scope         public.category_scope not null default 'ambas',
  budget_group  public.budget_group not null,
  -- Palabras alternativas para el dictado ("uber", "taxi" → Transporte)
  aliases       text[] not null default '{}',
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (household_id, name)
);

-- Presupuesto mensual por categoría. member_id null = presupuesto compartido;
-- con member_id = presupuesto personal de esa persona.
create table public.budgets (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  category_id      uuid not null references public.categories(id) on delete cascade,
  member_id        uuid references public.members(id) on delete cascade,
  mode             public.budget_mode not null default 'fijo',
  amount           bigint not null default 0 check (amount >= 0),
  remainder_share  numeric(4,3) not null default 0 check (remainder_share between 0 and 1),
  created_at       timestamptz not null default now()
);
create unique index budgets_unique on public.budgets (category_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households(id) on delete cascade,
  occurred_on             date not null,              -- fecha contable (Bogotá)
  occurred_at             timestamptz,                -- fecha y hora exacta si la conocemos
  amount                  bigint not null check (amount > 0),
  merchant                text,
  raw_description         text,
  account_id              uuid references public.accounts(id) on delete set null,
  paid_by_member_id       uuid not null references public.members(id),
  counterparty_member_id  uuid references public.members(id), -- solo para liquidaciones
  source                  public.tx_source not null default 'manual',
  status                  public.tx_status not null default 'pendiente',
  scope                   public.tx_scope,
  category_id             uuid references public.categories(id) on delete set null,
  kind                    public.tx_kind not null default 'gasto',
  installments            int check (installments > 0),
  dedupe_hash             text,
  raw_payload             jsonb,
  notes                   text,
  created_by              uuid references auth.users(id) default auth.uid(),
  identified_by           uuid references auth.users(id),
  identified_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- Un gasto identificado necesita ámbito y categoría
  constraint identified_complete check (
    status <> 'identificado'
    or kind not in ('gasto', 'ingreso')
    or (scope is not null and (category_id is not null or kind = 'ingreso'))
  ),
  constraint settlement_has_counterparty check (kind <> 'liquidacion' or counterparty_member_id is not null)
);
create unique index transactions_dedupe on public.transactions (household_id, dedupe_hash) where dedupe_hash is not null;
create index on public.transactions (household_id, status, occurred_on desc);
create index on public.transactions (household_id, occurred_on);

create table public.rules (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  pattern       text not null,              -- el comercio "contiene" este texto
  scope         public.tx_scope,
  category_id   uuid references public.categories(id) on delete cascade,
  kind          public.tx_kind,
  priority      int not null default 0,
  hits          int not null default 0,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (household_id, pattern)
);

-- updated_at automático
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Seguridad: solo los miembros del hogar ven y editan sus datos
-- ---------------------------------------------------------------------------
create function public.my_household_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid()
$$;

alter table public.households   enable row level security;
alter table public.members      enable row level security;
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.budgets      enable row level security;
alter table public.transactions enable row level security;
alter table public.rules        enable row level security;

create policy "miembros ven su hogar" on public.households
  for select using (id in (select public.my_household_ids()));
create policy "miembros editan su hogar" on public.households
  for update using (id in (select public.my_household_ids()));

create policy "miembros ven a su pareja" on public.members
  for select using (household_id in (select public.my_household_ids()));
create policy "miembros editan miembros del hogar" on public.members
  for update using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));

-- Mismo patrón para el resto de tablas del hogar
do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'budgets', 'transactions', 'rules'] loop
    execute format(
      'create policy "hogar: todo" on public.%I for all
         using (household_id in (select public.my_household_ids()))
         with check (household_id in (select public.my_household_ids()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Alta del hogar y vinculación de la pareja
-- ---------------------------------------------------------------------------

-- Cuando la pareja entra por primera vez con su correo, queda vinculada.
create function public.claim_membership() returns uuid
  language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  update public.members
     set user_id = auth.uid()
   where user_id is null
     and lower(email) = lower(auth.jwt() ->> 'email')
  returning id into mid;
  return mid;
end $$;

-- Categorías y presupuesto iniciales (tomados del Excel "Presupuesto mensual pareja").
create function public.seed_household_defaults(hid uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  cid uuid;
begin
  for r in
    select * from (values
      -- nombre, ámbito, grupo, modo, monto, %resto, alias, orden
      ('Servicios públicos',            'compartida', 'necesidades', 'fijo',  300000,  0,   array['servicios','luz','agua','gas','epm'], 1),
      ('Internet y celular',            'compartida', 'necesidades', 'fijo',  180000,  0,   array['internet','celular','claro','tigo','movistar'], 2),
      ('Mercado',                       'compartida', 'necesidades', 'fijo',  1500000, 0,   array['d1','ara','exito','carulla','pricesmart','supermercado'], 3),
      ('Licor y chasers',               'compartida', 'necesidades', 'fijo',  250000,  0,   array['licor','licores','trago','cerveza'], 4),
      ('Transporte / gasolina',         'compartida', 'necesidades', 'fijo',  400000,  0,   array['gasolina','uber','taxi','didi','parqueadero','peaje'], 5),
      ('Empleada de servicio',          'compartida', 'necesidades', 'fijo',  400000,  0,   array['empleada'], 6),
      ('Aseo de casa',                  'compartida', 'necesidades', 'fijo',  150000,  0,   array['aseo','limpieza'], 7),
      ('Salidas',                       'ambas',      'deseos',      'fijo',  1500000, 0,   array['restaurante','comida','rappi','cine','bar'], 8),
      ('Suscripciones',                 'ambas',      'deseos',      'fijo',  40000,   0,   array['netflix','spotify','suscripcion'], 9),
      ('Cuidado personal',              'ambas',      'deseos',      'fijo',  250000,  0,   array['peluqueria','spa','farmacia'], 10),
      ('Imprevistos',                   'ambas',      'deseos',      'fijo',  200000,  0,   array['imprevisto'], 11),
      ('Viajes',                        'ambas',      'deseos',      'fijo',  1000000, 0,   array['viaje','hotel','vuelo','tiquete'], 12),
      ('Ahorro / inversión de pareja',  'compartida', 'ahorro',      'resto', 0,       0.5, array['ahorro','inversion'], 13),
      ('Ahorro / inversión individual', 'compartida', 'ahorro',      'resto', 0,       0.5, array[]::text[], 14),
      -- Categorías personales (sin presupuesto inicial; cada uno define el suyo)
      ('Ropa y accesorios',             'personal',   'deseos',      null,    0,       0,   array['ropa','zapatos'], 20),
      ('Salud',                         'personal',   'necesidades', null,    0,       0,   array['medico','eps','droguería'], 21),
      ('Educación',                     'personal',   'necesidades', null,    0,       0,   array['curso','universidad','especializacion'], 22),
      ('Regalos',                       'personal',   'deseos',      null,    0,       0,   array['regalo'], 23),
      ('Otros personales',              'personal',   'deseos',      null,    0,       0,   array[]::text[], 24)
    ) as v(name, scope, grp, mode, amount, share, aliases, ord)
  loop
    insert into public.categories (household_id, name, scope, budget_group, aliases, sort_order)
    values (hid, r.name, r.scope::category_scope, r.grp::budget_group, r.aliases, r.ord)
    returning id into cid;
    if r.mode is not null then
      insert into public.budgets (household_id, category_id, member_id, mode, amount, remainder_share)
      values (hid, cid, null, r.mode::budget_mode, r.amount, r.share);
    end if;
  end loop;
end $$;

-- El primero en entrar crea el hogar e invita a su pareja por correo.
create function public.create_household(
  household_name     text,
  my_name            text,
  my_income          bigint,
  partner_name       text,
  partner_email      text,
  partner_income     bigint,
  partner_deductions bigint default 0
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  me uuid;
  partner uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a un hogar';
  end if;

  insert into public.households (name) values (coalesce(nullif(household_name, ''), 'Nuestro hogar'))
  returning id into hid;

  insert into public.members (household_id, user_id, email, display_name, monthly_income)
  values (hid, auth.uid(), auth.jwt() ->> 'email', my_name, my_income)
  returning id into me;

  insert into public.members (household_id, email, display_name, monthly_income, income_deductions)
  values (hid, lower(partner_email), partner_name, partner_income, partner_deductions)
  returning id into partner;

  -- Efectivo para cada uno; las cuentas bancarias se agregan en Ajustes.
  insert into public.accounts (household_id, owner_member_id, name, type)
  values (hid, me, 'Efectivo ' || my_name, 'efectivo'),
         (hid, partner, 'Efectivo ' || partner_name, 'efectivo');

  perform public.seed_household_defaults(hid);
  return hid;
end $$;

revoke execute on function public.seed_household_defaults(uuid) from public, anon, authenticated;
grant execute on function public.create_household(text, text, bigint, text, text, bigint, bigint) to authenticated;
grant execute on function public.claim_membership() to authenticated;
