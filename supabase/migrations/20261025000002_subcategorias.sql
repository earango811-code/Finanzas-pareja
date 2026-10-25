-- Subcategorías (un nivel) y categorías de ingreso.
-- El presupuesto se define en la categoría padre; lo gastado en sus
-- subcategorías suma al padre.

alter table public.categories
  add column parent_id uuid references public.categories(id) on delete cascade,
  add column is_income boolean not null default false,
  alter column budget_group drop not null;

alter table public.categories
  add constraint expense_has_group check (is_income or budget_group is not null);

create index on public.categories (parent_id);

-- Solo un nivel: una subcategoría no puede tener hijas.
create function public.check_category_depth() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.categories where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'Solo se permite un nivel de subcategorías';
  end if;
  return new;
end $$;
create trigger categories_depth before insert or update of parent_id on public.categories
  for each row execute function public.check_category_depth();

-- Los presupuestos van solo en categorías principales de gasto.
create function public.check_budget_category() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.categories where id = new.category_id and (parent_id is not null or is_income)
  ) then
    raise exception 'El presupuesto se define en la categoría principal';
  end if;
  return new;
end $$;
create trigger budgets_category before insert or update of category_id on public.budgets
  for each row execute function public.check_budget_category();

-- Subcategorías iniciales (de la app que usaban antes) e Ingresos.
create function public.seed_subcategories(hid uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  pid uuid;
  income_id uuid;
begin
  for r in
    select * from (values
      -- padre, subcategoría, alias, orden
      ('Mercado',                      'Alimentos',               array['d1','ara','exito','carulla','pricesmart','olimpica','jumbo'], 1),
      ('Mercado',                      'Caramelos',               array['dulces','caramelos','percimon'], 2),
      ('Mercado',                      'Café',                    array['cafe','juan valdez','tostao'], 3),
      ('Licor y chasers',              'Bebidas',                 array['bebidas','licor','licores','cerveza','trago'], 1),
      ('Servicios públicos',           'Agua',                    array['agua','acueducto'], 1),
      ('Servicios públicos',           'Electricidad',            array['luz','energia','electricidad','epm'], 2),
      ('Internet y celular',           'Internet',                array['internet','fibra'], 1),
      ('Internet y celular',           'TV',                      array['tv','television','directv'], 2),
      ('Internet y celular',           'Teléfono',                array['celular','telefono','plan','claro','tigo','movistar'], 3),
      ('Transporte / gasolina',        'Gasolina',                array['gasolina','combustible','terpel','primax','texaco'], 1),
      ('Transporte / gasolina',        'Parking',                 array['parqueadero','parking','peaje'], 2),
      ('Transporte / gasolina',        'Uber',                    array['uber','didi','taxi','cabify','indrive'], 3),
      ('Transporte / gasolina',        'Reparar',                 array['taller','mecanico','reparacion','llantas'], 4),
      ('Transporte / gasolina',        'Seguros de coche',        array['soat','seguro'], 5),
      ('Salidas',                      'Cine',                    array['cine','cinecolombia','procinal','cinemark'], 1),
      ('Salidas',                      'Restaurante',             array['restaurante','almuerzo','cena'], 2),
      ('Salidas',                      'Rumba',                   array['rumba','discoteca','bar'], 3),
      ('Salidas',                      'Comida',                  array['comida','rappi','domicilio','hamburguesa'], 4),
      ('Ahorro / inversión de pareja', 'Ahorros para emergencias', array['emergencia','emergencias'], 1),
      ('Ahorro / inversión de pareja', 'Ahorros para vacaciones',  array['vacaciones'], 2),
      ('Ahorro / inversión de pareja', 'Inversiones',              array['inversion','acciones','fondo','cdt'], 3)
    ) as v(parent, name, aliases, ord)
  loop
    select id into pid from public.categories where household_id = hid and name = r.parent and parent_id is null;
    if pid is null then continue; end if;
    insert into public.categories (household_id, parent_id, name, scope, budget_group, aliases, sort_order)
    select hid, pid, r.name, c.scope, c.budget_group, r.aliases, c.sort_order * 100 + r.ord
      from public.categories c where c.id = pid
    on conflict (household_id, name) do nothing;
  end loop;

  -- Los alias quedan en la subcategoría para que el dictado elija la más específica.
  update public.categories p set aliases = '{}'
   where p.household_id = hid and p.parent_id is null
     and exists (select 1 from public.categories s where s.parent_id = p.id);

  insert into public.categories (household_id, name, scope, budget_group, is_income, sort_order)
  values (hid, 'Ingresos', 'ambas', null, true, 900)
  on conflict (household_id, name) do nothing
  returning id into income_id;
  if income_id is not null then
    insert into public.categories (household_id, parent_id, name, scope, budget_group, is_income, aliases, sort_order)
    values (hid, income_id, 'Salario', 'ambas', null, true, array['salario','nomina','sueldo','pago proveedor'], 901),
           (hid, income_id, 'Prestaciones', 'ambas', null, true, array['prima','cesantias','vacaciones pagas'], 902)
    on conflict (household_id, name) do nothing;
  end if;
end $$;

revoke execute on function public.seed_subcategories(uuid) from public, anon, authenticated;

-- Los hogares nuevos reciben categorías y subcategorías.
create or replace function public.seed_household_defaults_v2(hid uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_household_defaults(hid);
  perform public.seed_subcategories(hid);
end $$;
revoke execute on function public.seed_household_defaults_v2(uuid) from public, anon, authenticated;

create or replace function public.create_household(
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

  insert into public.accounts (household_id, owner_member_id, name, type)
  values (hid, me, 'Efectivo ' || my_name, 'efectivo'),
         (hid, partner, 'Efectivo ' || partner_name, 'efectivo');

  perform public.seed_household_defaults_v2(hid);
  return hid;
end $$;

-- Hogares que ya existían
select public.seed_subcategories(id) from public.households;
