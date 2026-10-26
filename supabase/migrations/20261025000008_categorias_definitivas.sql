-- Categorías definitivas: exactamente las de la app que usaban antes.
-- El presupuesto se define en la categoría principal; las subcategorías son solo detalle.
--
--   Comida y bebida : Alimentos, Bebidas, Café, Caramelos, Comida
--   Gastos de casa  : Agua, Electricidad, Internet, TV, Teléfono
--   Ingresos        : Prestaciones, Salario
--   Salidas         : Cine, Restaurante v2, Rumba
--   Ahorros         : Ahorros para emergencias, Ahorros para vacaciones, Inversiones
--   Transporte      : Combustible, Gasolina, Parking, Reparar, Seguros de coche, Uber
--
-- Para hogares existentes: las categorías anteriores que tienen equivalente se pasan a
-- la nueva; las que no, se eliminan y sus movimientos vuelven a Pendientes sin categoría.

create or replace function public.seed_categories_v3(hid uuid, reset_budgets boolean default true) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  pid uuid;
  pgroup budget_group;
  pincome boolean;
  pord int;
  target uuid;
begin
  -- 1) Categorías principales
  for r in
    select * from (values
      ('Comida y bebida', 'necesidades', false, 1),
      ('Gastos de casa',  'necesidades', false, 2),
      ('Ingresos',        null,          true,  3),
      ('Salidas',         'deseos',      false, 4),
      ('Ahorros',         'ahorro',      false, 5),
      ('Transporte',      'necesidades', false, 6)
    ) as v(name, grp, income, ord)
  loop
    insert into categories (household_id, name, scope, budget_group, is_income, sort_order, parent_id, is_active, aliases)
    values (hid, r.name, 'ambas', r.grp::budget_group, r.income, r.ord, null, true, '{}')
    on conflict (household_id, name) do update
      set parent_id = null, scope = 'ambas', budget_group = excluded.budget_group,
          is_income = excluded.is_income, sort_order = excluded.sort_order, is_active = true, aliases = '{}';
  end loop;

  -- "Restaurante" de la versión anterior pasa a llamarse como en la imagen
  update categories set name = 'Restaurante v2'
   where household_id = hid and name = 'Restaurante'
     and not exists (select 1 from categories where household_id = hid and name = 'Restaurante v2');

  -- 2) Subcategorías (heredan ámbito, grupo y tipo de su principal)
  for r in
    select * from (values
      ('Comida y bebida', 'Alimentos',               array['d1','ara','exito','carulla','pricesmart','olimpica','jumbo','mercado','supermercado'], 1),
      ('Comida y bebida', 'Bebidas',                 array['bebidas','licor','licores','cerveza','trago'], 2),
      ('Comida y bebida', 'Café',                    array['cafe','juan valdez','tostao'], 3),
      ('Comida y bebida', 'Caramelos',               array['dulces','caramelos','percimon'], 4),
      ('Comida y bebida', 'Comida',                  array['comida','domicilio','rappi'], 5),
      ('Gastos de casa',  'Agua',                    array['agua','acueducto'], 1),
      ('Gastos de casa',  'Electricidad',            array['luz','energia','electricidad','epm'], 2),
      ('Gastos de casa',  'Internet',                array['internet','fibra'], 3),
      ('Gastos de casa',  'TV',                      array['tv','television','directv'], 4),
      ('Gastos de casa',  'Teléfono',                array['celular','telefono','plan','claro','tigo','movistar'], 5),
      ('Ingresos',        'Prestaciones',            array['prima','cesantias'], 1),
      ('Ingresos',        'Salario',                 array['salario','nomina','sueldo','pago proveedor'], 2),
      ('Salidas',         'Cine',                    array['cine','cinecolombia','procinal','cinemark'], 1),
      ('Salidas',         'Restaurante v2',          array['restaurante','almuerzo','cena'], 2),
      ('Salidas',         'Rumba',                   array['rumba','discoteca','bar'], 3),
      ('Ahorros',         'Ahorros para emergencias', array['emergencia','emergencias'], 1),
      ('Ahorros',         'Ahorros para vacaciones', array['vacaciones'], 2),
      ('Ahorros',         'Inversiones',             array['inversion','acciones','fondo','cdt'], 3),
      ('Transporte',      'Combustible',             array['combustible','acpm'], 1),
      ('Transporte',      'Gasolina',                array['gasolina','terpel','primax','texaco'], 2),
      ('Transporte',      'Parking',                 array['parqueadero','parking','peaje'], 3),
      ('Transporte',      'Reparar',                 array['taller','mecanico','reparacion','llantas'], 4),
      ('Transporte',      'Seguros de coche',        array['soat','seguro'], 5),
      ('Transporte',      'Uber',                    array['uber','didi','taxi','cabify','indrive'], 6)
    ) as v(parent, name, aliases, ord)
  loop
    select id, budget_group, is_income, sort_order into pid, pgroup, pincome, pord
      from categories where household_id = hid and name = r.parent and parent_id is null;
    insert into categories (household_id, parent_id, name, scope, budget_group, is_income, aliases, sort_order, is_active)
    values (hid, pid, r.name, 'ambas', pgroup, pincome, r.aliases, pord * 100 + r.ord, true)
    on conflict (household_id, name) do update
      set parent_id = pid, scope = 'ambas', budget_group = pgroup, is_income = pincome,
          aliases = excluded.aliases, sort_order = excluded.sort_order, is_active = true;
  end loop;

  -- 3) Categorías anteriores con equivalente: pasar sus movimientos, reglas y recurrentes
  for r in
    select * from (values
      ('Mercado', 'Comida y bebida'),
      ('Licor y chasers', 'Bebidas'),
      ('Servicios públicos', 'Gastos de casa'),
      ('Internet y celular', 'Gastos de casa'),
      ('Transporte / gasolina', 'Transporte'),
      ('Ahorro / inversión de pareja', 'Ahorros'),
      ('Ahorro / inversión individual', 'Ahorros')
    ) as v(old_name, new_name)
  loop
    select id into target from categories where household_id = hid and name = r.new_name;
    update transactions set category_id = target
     where category_id in (select id from categories where household_id = hid and name = r.old_name);
    update recurring_transactions set category_id = target
     where category_id in (select id from categories where household_id = hid and name = r.old_name);
    update rules set category_id = target
     where category_id in (select id from categories where household_id = hid and name = r.old_name)
       and not exists (select 1 from rules r2 where r2.household_id = hid and r2.category_id = target and r2.pattern = rules.pattern);
  end loop;

  -- 4) Las demás categorías anteriores no existen en la lista: sus movimientos vuelven a
  --    Pendientes sin categoría (y sin regla/recurrente que apunte a ellas).
  create temp table if not exists _final_cats (name text primary key) on commit drop;
  delete from _final_cats;
  insert into _final_cats values
    ('Comida y bebida'),('Alimentos'),('Bebidas'),('Café'),('Caramelos'),('Comida'),
    ('Gastos de casa'),('Agua'),('Electricidad'),('Internet'),('TV'),('Teléfono'),
    ('Ingresos'),('Prestaciones'),('Salario'),
    ('Salidas'),('Cine'),('Restaurante v2'),('Rumba'),
    ('Ahorros'),('Ahorros para emergencias'),('Ahorros para vacaciones'),('Inversiones'),
    ('Transporte'),('Combustible'),('Gasolina'),('Parking'),('Reparar'),('Seguros de coche'),('Uber');

  update transactions t
     set category_id = null,
         status = case when t.status = 'identificado' and t.kind in ('gasto', 'ingreso') then 'pendiente'::tx_status else t.status end
   where t.household_id = hid
     and t.category_id in (select id from categories c where c.household_id = hid and c.name not in (select name from _final_cats));

  -- Primero las subcategorías y luego las principales (las hijas se borran en cascada igual)
  delete from categories c
   where c.household_id = hid and c.name not in (select name from _final_cats);

  -- 5) Presupuesto inicial a nivel de categoría (editable en Ajustes → Presupuesto)
  if reset_budgets then
    delete from budgets where household_id = hid and member_id is null;
    insert into budgets (household_id, category_id, member_id, mode, amount, remainder_share)
    select hid, c.id, null, v.mode::budget_mode, v.amount, v.share
      from (values
        ('Comida y bebida', 'fijo',  1750000, 0),
        ('Gastos de casa',  'fijo',  480000,  0),
        ('Salidas',         'fijo',  1500000, 0),
        ('Transporte',      'fijo',  400000,  0),
        ('Ahorros',         'resto', 0,       1)
      ) as v(name, mode, amount, share)
      join categories c on c.household_id = hid and c.name = v.name and c.parent_id is null;
  end if;
end $$;

revoke execute on function public.seed_categories_v3(uuid, boolean) from public, anon, authenticated;

-- Los hogares nuevos reciben estas categorías
create or replace function public.seed_household_defaults_v2(hid uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_categories_v3(hid, true);
end $$;

-- Hogares existentes
select public.seed_categories_v3(id, true) from public.households;
