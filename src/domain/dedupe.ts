// Llave de deduplicación. El hash (SHA-256) se calcula en el servidor sobre esta llave.
import { normalizeMerchant } from "./text";

export interface DedupeInput {
  householdId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  accountLast4: string | null;
  merchant: string;
  occurredAt?: string | null; // incluye la hora: dos compras iguales el mismo día no se fusionan
}

export function dedupeKey(i: DedupeInput): string {
  const time = i.occurredAt ? i.occurredAt.slice(11, 16) : "";
  return [i.householdId, i.date, time, i.amount, i.accountLast4 ?? "", normalizeMerchant(i.merchant)].join("|");
}
