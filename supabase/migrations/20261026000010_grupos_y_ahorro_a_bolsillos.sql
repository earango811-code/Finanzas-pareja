-- Grupos nuevos y ahorro dentro del presupuesto:
--   * Servicios (Agua, Luz, Internet, Gas, General) sale de Gastos de casa, con su presupuesto.
--   * Bebidas alcohólicas, Empleada de servicio, Suscripciones y Cuidado personal son grupos.
--   * Ahorro, Fondo de imprevistos y Viaje son grupos del presupuesto (al final). Lo que les
--     sobre al cerrar el mes se pasa a su bolsillo (categories.pocket_id).
--   * Una categoría puede llamarse igual en grupos distintos ("Otros", "General").

-- 1) Nombre único por grupo (antes era único en todo el hogar)
alter table public.categories drop constraint if exists categories_household_id_name_key;
create unique index if not exists categories_name_per_group
  on public.categories (household_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- 2) Grupo → bolsillo donde va su saldo a fin de mes; y de qué grupo vino cada sobrante
alter table public.categories add column if not exists pocket_id uuid references public.pockets(id) on delete set null;
alter table public.pocket_movements add column if not exists category_id uuid references public.categories(id) on delete set null;

-- 3) Crea o actualiza una categoría buscándola por (grupo, nombre)
create or replace function public.upsert_category(
  hid uuid, pid uuid, cname text, grp budget_group, income boolean, ord int, als text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from categories
   where household_id = hid and parent_id is not distinct from pid and name = cname;
  if cid is null then
    insert into categories (household_id, parent_id, name, scope, budget_group, is_income, sort_order, aliases, is_active)
    values (hid, pid, cname, 'ambas', grp, income, ord, als, true)
    returning id into cid;
  else
    update categories
       set scope = 'ambas', budget_group = grp, is_income = income, sort_order = ord, aliases = als, is_active = true
     where id = cid;
  end if;
  return cid;
end $$;
revoke execute on function public.upsert_category(uuid, uuid, text, budget_group, boolean, int, text[]) from public, anon, authenticated;

-- 4) Lista definitiva de grupos y categorías
create or replace function public.seed_categories_v3(hid uuid, reset_budgets boolean default true) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  g record;
  gid uuid;
  casa uuid;
  serv uuid;
  ahorro uuid;
  pk uuid;
begin
  -- a) Cambios de estructura que conservan ids (movimientos y presupuestos se quedan)
  update categories set name = 'Ahorro'
   where household_id = hid and parent_id is null and name = 'Ahorros'
     and not exists (select 1 from categories where household_id = hid and parent_id is null and name = 'Ahorro');
  update categories set parent_id = null, name = 'Fondo de imprevistos'
   where household_id = hid and parent_id is not null and name = 'Ahorros para imprevistos'
     and not exists (select 1 from categories where household_id = hid and parent_id is null and name = 'Fondo de imprevistos');
  update categories set parent_id = null, name = 'Viaje'
   where household_id = hid and parent_id is not null and name = 'Ahorros para vacaciones'
     and not exists (select 1 from categories where household_id = hid and parent_id is null and name = 'Viaje');

  select id into casa from categories where household_id = hid and parent_id is null and name = 'Gastos de casa';
  serv := upsert_category(hid, null, 'Servicios', 'necesidades', false, 2, '{}');
  if casa is not null then
    update categories set name = 'Luz' where parent_id = casa and name = 'Electricidad';
    update categories c set parent_id = serv
     where c.parent_id = casa and c.name in ('Agua', 'Luz', 'Internet')
       and not exists (select 1 from categories x where x.parent_id = serv and x.name = c.name);
    -- El presupuesto de Gastos de casa era el de servicios públicos: pasa a Servicios
    update budgets set category_id = serv
     where category_id = casa and member_id is null
       and not exists (select 1 from budgets b where b.category_id = serv and b.member_id is null);
  end if;

  -- b) Grupos (los de ahorro al final; Ingresos aparte)
  for g in
    select * from (values
      ('Mercado',              'necesidades', false, 1),
      ('Servicios',            'necesidades', false, 2),
      ('Gastos de casa',       'necesidades', false, 3),
      ('Transporte',           'necesidades', false, 4),
      ('Empleada de servicio', 'necesidades', false, 5),
      ('Cuidado personal',     'necesidades', false, 6),
      ('Salidas',              'deseos',      false, 7),
      ('Bebidas alcohólicas',  'deseos',      false, 8),
      ('Suscripciones',        'deseos',      false, 9),
      ('Ahorro',               'ahorro',      false, 20),
      ('Fondo de imprevistos', 'ahorro',      false, 21),
      ('Viaje',                'ahorro',      false, 22),
      ('Ingresos',             null,          true,  30)
    ) as v(name, grp, income, ord)
  loop
    perform upsert_category(hid, null, g.name, g.grp::budget_group, g.income, g.ord,
      case g.name
        when 'Empleada de servicio' then array['empleada','aseo casa','servicio domestico']
        when 'Fondo de imprevistos' then array['imprevisto','imprevistos','emergencia']
        when 'Viaje' then array['viaje','vacaciones','hotel','tiquetes','vuelo']
        when 'Ahorro' then array['ahorro']
        else '{}'::text[] end);
  end loop;

  -- c) Categorías de cada grupo (heredan su tipo)
  for r in
    select * from (values
      ('Mercado',              'Alimentos',       array['d1','ara','exito','carulla','pricesmart','olimpica','jumbo','mercado','supermercado'], 1),
      ('Mercado',              'Bebidas',         array['gaseosa','jugo','bebidas'], 2),
      ('Mercado',              'Café',            array['cafe','juan valdez','tostao'], 3),
      ('Mercado',              'Caramelos',       array['dulces','caramelos','percimon'], 4),
      ('Mercado',              'Comida',          array['comida','domicilio','rappi'], 5),
      ('Servicios',            'Agua',            array['agua','acueducto'], 1),
      ('Servicios',            'Luz',             array['luz','energia','electricidad','epm'], 2),
      ('Servicios',            'Internet',        array['internet','fibra'], 3),
      ('Servicios',            'Gas',             array['gas','vanti'], 4),
      ('Servicios',            'General',         array['servicios','servicios publicos'], 5),
      ('Gastos de casa',       'TV',              array['tv','television','directv'], 1),
      ('Gastos de casa',       'Teléfono',        array['celular','telefono','claro','tigo','movistar'], 2),
      ('Transporte',           'Combustible',     array['combustible','gasolina','acpm','terpel','primax','texaco'], 1),
      ('Transporte',           'Uber',            array['uber','didi','taxi','cabify','indrive'], 2),
      ('Transporte',           'Gastos de carro', array['parqueadero','parking','peaje','taller','mecanico','reparacion','llantas','soat','seguro','lavado'], 3),
      ('Empleada de servicio', 'General',         '{}'::text[], 1),
      ('Cuidado personal',     'Aseo personal',   array['shampoo','jabon','desodorante','aseo personal','farmacia'], 1),
      ('Cuidado personal',     'Skincare',        array['skincare','crema','bloqueador','dermatologo'], 2),
      ('Cuidado personal',     'Otros',           array['peluqueria','barberia','unas'], 3),
      ('Salidas',              'Cine',            array['cine','cinecolombia','procinal','cinemark'], 1),
      ('Salidas',              'Restaurante v2',  array['restaurante','almuerzo','cena'], 2),
      ('Salidas',              'Rumba',           array['rumba','discoteca','bar'], 3),
      ('Bebidas alcohólicas',  'Vino',            array['vino'], 1),
      ('Bebidas alcohólicas',  'Cerveza',         array['cerveza','pola'], 2),
      ('Bebidas alcohólicas',  'Tequila',         array['tequila'], 3),
      ('Bebidas alcohólicas',  'Whisky',          array['whisky','whisqui'], 4),
      ('Bebidas alcohólicas',  'Otros',           array['licor','licores','trago','ron','aguardiente','ginebra'], 5),
      ('Suscripciones',        'Streaming',       array['netflix','spotify','disney','hbo','max','prime video','youtube'], 1),
      ('Suscripciones',        'Almacenamiento',  array['icloud','google one','dropbox'], 2),
      ('Suscripciones',        'Otros',           array['suscripcion','chatgpt','claude'], 3),
      ('Ahorro',               'Inversiones',     array['inversion','acciones','fondo','cdt'], 1),
      ('Ingresos',             'Prestaciones',    array['prima','cesantias'], 1),
      ('Ingresos',             'Salario',         array['salario','nomina','sueldo','pago proveedor'], 2)
    ) as v(parent, name, aliases, ord)
  loop
    select id, budget_group, is_income, sort_order into g
      from categories where household_id = hid and parent_id is null and name = r.parent;
    perform upsert_category(hid, g.id, r.name, g.budget_group, g.is_income, g.sort_order * 100 + r.ord, r.aliases);
  end loop;

  -- d) Lo que no está en la lista: sus movimientos vuelven a Pendientes y se borra
  create temp table if not exists _final_cats (parent text, name text) on commit drop;
  delete from _final_cats;
  insert into _final_cats
  select null, name from (values ('Mercado'),('Servicios'),('Gastos de casa'),('Transporte'),('Empleada de servicio'),
    ('Cuidado personal'),('Salidas'),('Bebidas alcohólicas'),('Suscripciones'),('Ahorro'),('Fondo de imprevistos'),
    ('Viaje'),('Ingresos')) v(name)
  union all
  select p, n from (values
    ('Mercado','Alimentos'),('Mercado','Bebidas'),('Mercado','Café'),('Mercado','Caramelos'),('Mercado','Comida'),
    ('Servicios','Agua'),('Servicios','Luz'),('Servicios','Internet'),('Servicios','Gas'),('Servicios','General'),
    ('Gastos de casa','TV'),('Gastos de casa','Teléfono'),
    ('Transporte','Combustible'),('Transporte','Uber'),('Transporte','Gastos de carro'),
    ('Empleada de servicio','General'),
    ('Cuidado personal','Aseo personal'),('Cuidado personal','Skincare'),('Cuidado personal','Otros'),
    ('Salidas','Cine'),('Salidas','Restaurante v2'),('Salidas','Rumba'),
    ('Bebidas alcohólicas','Vino'),('Bebidas alcohólicas','Cerveza'),('Bebidas alcohólicas','Tequila'),
    ('Bebidas alcohólicas','Whisky'),('Bebidas alcohólicas','Otros'),
    ('Suscripciones','Streaming'),('Suscripciones','Almacenamiento'),('Suscripciones','Otros'),
    ('Ahorro','Inversiones'),
    ('Ingresos','Prestaciones'),('Ingresos','Salario')) v(p, n);

  create temp table if not exists _drop_cats (id uuid primary key) on commit drop;
  delete from _drop_cats;
  insert into _drop_cats
  select c.id from categories c left join categories p on p.id = c.parent_id
   where c.household_id = hid
     and not exists (select 1 from _final_cats f where f.name = c.name and f.parent is not distinct from p.name);

  update transactions t
     set category_id = null,
         status = case when t.status = 'identificado' and t.kind in ('gasto', 'ingreso') then 'pendiente'::tx_status else t.status end
   where t.household_id = hid and t.category_id in (select id from _drop_cats);
  delete from categories where id in (select id from _drop_cats);

  -- e) Bolsillo de cada grupo de ahorro (compartido); se reutiliza uno que ya exista
  for r in
    select * from (values
      ('Ahorro',               array['Ahorro','Ahorros'], 1),
      ('Fondo de imprevistos', array['Fondo de imprevistos','Imprevistos'], 2),
      ('Viaje',                array['Viaje','Vacaciones'], 3)
    ) as v(grp, names, ord)
  loop
    select id into gid from categories where household_id = hid and parent_id is null and name = r.grp;
    if (select pocket_id from categories where id = gid) is null then
      select p.id into pk from pockets p
       where p.household_id = hid and p.owner_member_id is null and p.name = any (r.names)
       order by array_position(r.names, p.name) limit 1;
      if pk is null then
        insert into pockets (household_id, name, owner_member_id, sort_order)
        values (hid, r.names[1], null, r.ord) returning id into pk;
      end if;
      update pockets set is_active = true where id = pk;
      update categories set pocket_id = pk where id = gid;
    end if;
  end loop;

  -- f) Presupuesto inicial por grupo (solo hogares nuevos). Ahorro se queda con lo que sobre
  --    del ingreso, así el presupuesto cubre el 100 %.
  if reset_budgets then
    delete from budgets where household_id = hid and member_id is null;
    insert into budgets (household_id, category_id, member_id, mode, amount, remainder_share)
    select hid, c.id, null, v.mode::budget_mode, v.amount, v.share
      from (values
        ('Mercado',    'fijo',  1750000, 0),
        ('Servicios',  'fijo',  480000,  0),
        ('Salidas',    'fijo',  1500000, 0),
        ('Transporte', 'fijo',  400000,  0),
        ('Ahorro',     'resto', 0,       1)
      ) as v(name, mode, amount, share)
      join categories c on c.household_id = hid and c.name = v.name and c.parent_id is null;
  end if;
end $$;
revoke execute on function public.seed_categories_v3(uuid, boolean) from public, anon, authenticated;

select public.seed_categories_v3(id, false) from public.households;
