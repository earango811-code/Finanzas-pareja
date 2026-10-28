// Cierre de mes: ingreso final de cada uno.
//
// El ingreso final personal es lo que le queda a cada uno después de su parte de lo
// compartido: el gasto compartido real del mes y lo que se pasó a los bolsillos (Ahorro,
// Fondo de imprevistos, Viaje). Las dos partes se reparten con el mismo % del ingreso
// disponible, así que el ahorro de los dos también queda repartido en esa proporción.
import { allocate } from "./money";
import { splitShares } from "./split";
import { netIncome, type Member, type TxKind, type TxScope, type TxStatus } from "./types";

export interface CloseTx {
  amount: number;
  kind: TxKind;
  scope: TxScope | null;
  status: TxStatus;
  paid_by_member_id: string;
  pocket_id?: string | null;
}

export interface MemberClose {
  memberId: string;
  ratio: number;
  available: number; // ingreso disponible (ingreso − descuentos fijos)
  sharedSpent: number; // su parte del gasto compartido
  toPockets: number; // su parte de lo que se pasó a los bolsillos
  finalIncome: number; // available − sharedSpent − toPockets
  personalSpent: number; // sus gastos personales del mes
  free: number; // finalIncome − personalSpent
}

export interface MonthCloseSummary {
  income: number;
  sharedSpent: number;
  toPockets: number;
  savedTotal: number; // income − sharedSpent − toPockets
  members: MemberClose[];
}

/** Efecto en el gasto: los gastos suman, los reembolsos restan. Lo pagado desde un bolsillo no sale del ingreso. */
function spendEffect(t: CloseTx): number {
  if (t.status !== "identificado" || t.pocket_id) return 0;
  if (t.kind === "gasto") return t.amount;
  if (t.kind === "ingreso") return -t.amount;
  return 0;
}

export function computeMonthClose(members: Member[], txs: CloseTx[], pocketTransfers: number): MonthCloseSummary {
  const shares = splitShares(members);
  const ratios = shares.map((s) => s.ratio);
  const sharedSpent = txs.filter((t) => t.scope === "compartido").reduce((a, t) => a + spendEffect(t), 0);
  const sharedParts = allocate(sharedSpent, ratios);
  const pocketParts = allocate(pocketTransfers, ratios);
  const income = members.reduce((a, m) => a + netIncome(m), 0);

  const rows = members.map((m, i) => {
    const available = netIncome(m);
    const personalSpent = txs
      .filter((t) => t.scope === "personal" && t.paid_by_member_id === m.id && t.kind !== "ingreso")
      .reduce((a, t) => a + spendEffect(t), 0);
    const finalIncome = available - sharedParts[i] - pocketParts[i];
    return {
      memberId: m.id,
      ratio: ratios[i],
      available,
      sharedSpent: sharedParts[i],
      toPockets: pocketParts[i],
      finalIncome,
      personalSpent,
      free: finalIncome - personalSpent,
    };
  });
  return { income, sharedSpent, toPockets: pocketTransfers, savedTotal: income - sharedSpent - pocketTransfers, members: rows };
}
