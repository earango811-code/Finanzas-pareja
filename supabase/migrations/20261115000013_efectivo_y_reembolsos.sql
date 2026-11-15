-- Pagos por otros: cuando uno paga la cuenta de varios y los demás le devuelven su parte.
-- El movimiento conserva el valor completo (el que aparece en el banco y se concilia);
-- en el presupuesto, el reparto y el cierre solo cuenta amount − reimbursed_amount.
alter table public.transactions
  add column if not exists reimbursed_amount bigint not null default 0;
alter table public.transactions drop constraint if exists reimbursed_lt_amount;
alter table public.transactions
  add constraint reimbursed_lt_amount check (reimbursed_amount >= 0 and reimbursed_amount < amount);

-- Pagos en efectivo: cada uno tiene su cuenta "Efectivo" (no entra en la conciliación bancaria).
insert into public.accounts (household_id, owner_member_id, name, type)
select m.household_id, m.id, 'Efectivo ' || m.display_name, 'efectivo'
  from public.members m
 where not exists (select 1 from public.accounts a where a.owner_member_id = m.id and a.type = 'efectivo');
update public.accounts set is_active = true where type = 'efectivo';
