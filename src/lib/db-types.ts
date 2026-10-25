// Filas de la base de datos tal como las usa la app.
import type {
  AccountType, BudgetGroup, BudgetMode, CategoryScope, TxKind, TxScope, TxSource, TxStatus,
} from "@/domain/types";

export interface HouseholdRow {
  id: string;
  name: string;
  deferred_mode: "completa" | "cuota";
  target_needs: number;
  target_wants: number;
  target_savings: number;
}

export interface MemberRow {
  id: string;
  household_id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  monthly_income: number;
  income_deductions: number;
  deductions_note: string | null;
  pin_set_at: string | null;
}

export interface AccountRow {
  id: string;
  owner_member_id: string;
  name: string;
  type: AccountType;
  last4: string | null;
  card_last4: string | null; // tarjeta débito asociada a la cuenta
  is_active: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  scope: CategoryScope;
  budget_group: BudgetGroup | null; // null solo en ingresos
  parent_id: string | null;
  is_income: boolean;
  aliases: string[];
  sort_order: number;
  is_active: boolean;
}

export interface BudgetRowDb {
  id: string;
  category_id: string;
  member_id: string | null;
  mode: BudgetMode;
  amount: number;
  remainder_share: number;
}

export interface TransactionRow {
  id: string;
  occurred_on: string;
  occurred_at: string | null;
  amount: number;
  merchant: string | null;
  raw_description: string | null;
  account_id: string | null;
  paid_by_member_id: string;
  counterparty_member_id: string | null;
  source: TxSource;
  status: TxStatus;
  scope: TxScope | null;
  category_id: string | null;
  kind: TxKind;
  notes: string | null;
  account_last4: string | null;
  pocket_id: string | null;
  created_at: string;
}

export interface RuleRow {
  id: string;
  pattern: string;
  scope: TxScope | null;
  category_id: string | null;
  kind: TxKind | null;
  priority: number;
  hits: number;
  auto_apply: boolean;
}

export const TX_COLUMNS =
  "id, occurred_on, occurred_at, amount, merchant, raw_description, account_id, paid_by_member_id, counterparty_member_id, source, status, scope, category_id, kind, notes, account_last4, pocket_id, created_at";

export interface PocketRow {
  id: string;
  name: string;
  owner_member_id: string | null; // null = compartido
  target_amount: number | null;
  opening_balance: number;
  is_active: boolean;
  sort_order: number;
}

export interface PocketMovementRow {
  id: string;
  pocket_id: string;
  occurred_on: string;
  kind: "aporte" | "sobrante" | "retiro";
  amount: number;
  month: string | null;
  note: string | null;
  created_at: string;
}
