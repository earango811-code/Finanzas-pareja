-- Datos de ejemplo FICTICIOS para probar la app.
-- Úsalo solo en un proyecto de pruebas: después de crear el hogar desde la app,
-- pega esto en Supabase → SQL Editor y ejecútalo. Carga movimientos del mes actual
-- en el primer hogar que encuentre (la mitad pendientes, la mitad identificados).

do $$
declare
  hid uuid := (select id from public.households order by created_at limit 1);
  m1 uuid := (select id from public.members where household_id = hid order by created_at limit 1);
  m2 uuid := (select id from public.members where household_id = hid order by created_at offset 1 limit 1);
  a1 uuid;
  a2 uuid;
  mes date := date_trunc('month', (now() at time zone 'America/Bogota'))::date;
  cat_id uuid;
begin
  if hid is null then raise exception 'Primero crea el hogar desde la app'; end if;

  insert into public.accounts (household_id, owner_member_id, name, type, last4)
  values (hid, m1, 'TC Bancolombia', 'credito', '1111') returning id into a1;
  insert into public.accounts (household_id, owner_member_id, name, type, last4)
  values (hid, m2, 'Débito Bancolombia', 'debito', '2222') returning id into a2;

  -- Pendientes (como si hubieran llegado por correo)
  insert into public.transactions (household_id, occurred_on, amount, merchant, account_id, paid_by_member_id, source, status, kind)
  values
    (hid, mes + 1,  187450, 'TIENDAS D1 LAURELES',   a1, m1, 'email', 'pendiente', 'gasto'),
    (hid, mes + 2,   36150, 'RAPPI COLOMBIA*DL',     a1, m1, 'email', 'pendiente', 'gasto'),
    (hid, mes + 3,   52820, 'UBER BV USD-USD COLO',  a2, m2, 'email', 'pendiente', 'gasto'),
    (hid, mes + 4,  245000, 'EPM SERVICIOS',         a2, m2, 'email', 'pendiente', 'gasto'),
    (hid, mes + 5,   45000, 'LICORERA LA ESQUINA',   a1, m1, 'email', 'pendiente', 'gasto'),
    (hid, mes + 6,   89900, 'ALMACEN DE ROPA XYZ',   a2, m2, 'email', 'pendiente', 'gasto'),
    (hid, mes + 6, 1200000, 'PAGO TC BANCOLOMBIA',   a2, m2, 'email', 'pendiente', 'gasto');

  -- Identificados
  select id into cat_id from public.categories where household_id = hid and name = 'Mercado';
  insert into public.transactions (household_id, occurred_on, amount, merchant, account_id, paid_by_member_id, source, status, scope, category_id, kind)
  values (hid, mes, 412300, 'PRICESMART', a1, m1, 'email', 'identificado', 'compartido', cat_id, 'gasto'),
         (hid, mes + 2, 98700, 'TIENDAS ARA', a2, m2, 'email', 'identificado', 'compartido', cat_id, 'gasto');

  select id into cat_id from public.categories where household_id = hid and name = 'Salidas';
  insert into public.transactions (household_id, occurred_on, amount, merchant, account_id, paid_by_member_id, source, status, scope, category_id, kind)
  values (hid, mes + 1, 217500, 'LOCAL BURGUER', a1, m1, 'email', 'identificado', 'compartido', cat_id, 'gasto'),
         (hid, mes + 3, 61300, 'PERCIMON', a2, m2, 'email', 'identificado', 'personal', cat_id, 'gasto');

  select id into cat_id from public.categories where household_id = hid and name = 'Empleada de servicio';
  insert into public.transactions (household_id, occurred_on, amount, merchant, paid_by_member_id, source, status, scope, category_id, kind)
  values (hid, mes + 4, 400000, 'Pago empleada', m1, 'manual', 'identificado', 'compartido', cat_id, 'gasto');

  select id into cat_id from public.categories where household_id = hid and name = 'Internet y celular';
  insert into public.transactions (household_id, occurred_on, amount, merchant, account_id, paid_by_member_id, source, status, scope, category_id, kind)
  values (hid, mes + 5, 165000, 'CLARO HOGAR', a2, m2, 'email', 'identificado', 'compartido', cat_id, 'gasto');

  insert into public.rules (household_id, pattern, scope, category_id, kind)
  select hid, 'd1', 'compartido', id, 'gasto' from public.categories where household_id = hid and name = 'Mercado';
end $$;
