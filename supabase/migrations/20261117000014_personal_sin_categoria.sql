-- Lo personal no lleva categorías: un gasto personal queda identificado con solo saber que es
-- personal (la descripción va en la nota). Lo compartido sigue necesitando grupo.
alter table public.transactions drop constraint if exists identified_complete;
alter table public.transactions add constraint identified_complete check (
  status <> 'identificado'
  or kind not in ('gasto', 'ingreso')
  or (scope is not null and (category_id is not null or kind = 'ingreso' or scope = 'personal'))
);
