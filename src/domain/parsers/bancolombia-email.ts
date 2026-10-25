// Parser de alertas por correo de Bancolombia
// (remitente: alertasynotificaciones@ayn.notificacionesbancolombia.com).
//
// Formatos verificados contra correos reales (oct-2026):
//   Compraste COP52.819,86 en COMERCIO con tu T.Cred *1234, el 16/10/2026 a las 13:05.
//   Compraste COP52.819,86 en COMERCIO, el 16/10/2026 a las 13:05. Esta compra esta asociada a T.Cred *1234.
//   Compraste $59.500,00 en COMERCIO con tu T.Deb *1234, el 20/10/2026 a las 11:36.
//   Transferiste $20000.00 desde tu cuenta *1234 a la cuenta *5678 el 20/10/26 a las 10:30.
//   NOMBRE, transferiste $32,400.00 a la llave 300... desde tu cuenta *1234 a DESTINATARIO el 24/10/26 a las 09:54.
//   NOMBRE, recibiste una transferencia de REMITENTE por $512000.00 en tu cuenta *1234 conectada a la llave ... el 15/10/26 a las 10:00.
//   Recibiste un pago PROVEEDOR de EMPRESA por $3117459.00 en tu cuenta de Ahorros el 16/10/2026 a las 13:51.
//   Pagaste $116600.00 a ENTIDAD desde tu producto 1234 el 01/10/2026 12:31:42.
// Formato SUPUESTO (sin correo real todavía): Retiraste $X en CAJERO de tu cuenta/T.Deb *1234 el dd/mm/aaaa a las hh:mm.
import { parseBankDate } from "../dates";
import { parsePesos } from "../money";
import { redactSensitive } from "../text";
import type { AccountType, TxKind } from "../types";

export type EmailMovementType =
  | "compra_credito"
  | "compra_debito"
  | "transferencia_enviada"
  | "transferencia_recibida"
  | "pago_recibido"
  | "pago_factura"
  | "retiro";

export interface ParsedMovement {
  type: EmailMovementType;
  kind: TxKind; // tipo contable sugerido
  amount: number; // pesos enteros, positivo
  merchant: string;
  account: { type: AccountType; last4: string | null };
  date: string; // YYYY-MM-DD (Bogotá)
  occurredAt: string | null; // ISO con -05:00
  text: string; // frase de la alerta con datos sensibles enmascarados
}

export type ParseResult =
  | { ok: true; movement: ParsedMovement }
  | { ok: false; reason: "no_transaccional" | "formato_desconocido"; text: string };

/** Convierte HTML o el texto plano con tablas del correo a una sola línea legible. */
export function emailToText(body: string): string {
  return body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\[\]\([^)]*\)/g, " ") // enlaces vacíos de markdown
    .replace(/[|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrae la frase "Bancolombia: ..." hasta el texto de soporte. */
export function extractAlertSentence(text: string): string | null {
  const m = text.match(/Bancolombia:\s*(.+?)(?=\s*(?:Si tienes dudas|¿Dudas\?|Dudas al|Con Bre-b|Si no fuiste|Esto es un mensaje)|$)/i);
  return m ? m[1].trim() : null;
}

const AMOUNT = String.raw`(?:COP|USD|\$)\s?([\d.,]+)`;
const DATE = String.raw`(\d{1,2}\/\d{1,2}\/\d{2,4})`;
const TIME = String.raw`(\d{1,2}:\d{2}(?::\d{2})?)`;

interface Pattern {
  type: EmailMovementType;
  kind: TxKind;
  re: RegExp;
  pick: (m: RegExpMatchArray) => { amount: string; merchant: string; acct: AccountType; last4: string | null; date: string; time: string | undefined };
}

const PATTERNS: Pattern[] = [
  {
    // Compraste ... en X con tu T.Cred *1234, el dd/mm/aaaa a las hh:mm
    type: "compra_credito",
    kind: "gasto",
    re: new RegExp(String.raw`Compraste ${AMOUNT} en (.+?) con tu T\.?\s?Cred\.? \*(\d{4}),? el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[1], merchant: m[2], acct: "credito", last4: m[3], date: m[4], time: m[5] }),
  },
  {
    // Compraste ... en X, el dd/mm/aaaa a las hh:mm. Esta compra esta asociada a T.Cred *1234
    type: "compra_credito",
    kind: "gasto",
    re: new RegExp(String.raw`Compraste ${AMOUNT} en (.+?),? el ${DATE} a las ${TIME}\.? Esta compra est[aá] asociada a T\.?\s?Cred\.? \*(\d{4})`, "i"),
    pick: (m) => ({ amount: m[1], merchant: m[2], acct: "credito", last4: m[5], date: m[3], time: m[4] }),
  },
  {
    type: "compra_debito",
    kind: "gasto",
    re: new RegExp(String.raw`Compraste ${AMOUNT} en (.+?) con tu T\.?\s?Deb\.? \*(\d{4}),? el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[1], merchant: m[2], acct: "debito", last4: m[3], date: m[4], time: m[5] }),
  },
  {
    // transferiste $X a la llave N desde tu cuenta *1234 a NOMBRE el dd/mm/aa a las hh:mm
    type: "transferencia_enviada",
    kind: "gasto",
    re: new RegExp(String.raw`transferiste ${AMOUNT} a la llave \S+ desde tu cuenta \*(\d{4}) a (.+?) el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[1], merchant: m[3], acct: "debito", last4: m[2], date: m[4], time: m[5] }),
  },
  {
    // Transferiste $X desde tu cuenta *1234 a la cuenta *5678 el dd/mm/aa a las hh:mm
    type: "transferencia_enviada",
    kind: "gasto",
    re: new RegExp(String.raw`Transferiste ${AMOUNT} desde tu cuenta \*(\d{4}) a la cuenta \*?(\d+) el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[1], merchant: `Transferencia a cuenta *${m[3].slice(-4)}`, acct: "debito", last4: m[2], date: m[4], time: m[5] }),
  },
  {
    type: "transferencia_recibida",
    kind: "ingreso",
    re: new RegExp(String.raw`recibiste una transferencia de (.+?) por ${AMOUNT} en tu cuenta \*(\d{4}).*? el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[2], merchant: m[1], acct: "debito", last4: m[3], date: m[4], time: m[5] }),
  },
  {
    // Recibiste un pago PROVEEDOR de EMPRESA por $X en tu cuenta de Ahorros el ...
    type: "pago_recibido",
    kind: "ingreso",
    re: new RegExp(String.raw`Recibiste un pago (?:de )?(.+?) por ${AMOUNT} en tu cuenta(?: de \w+| \*(\d{4}))? el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[2], merchant: m[1].replace(/^(PROVEEDOR|NOMINA|NÓMINA)\s+de\s+/i, ""), acct: "debito", last4: m[3] ?? null, date: m[4], time: m[5] }),
  },
  {
    // Pagaste $X a ENTIDAD desde tu producto 1234 el dd/mm/aaaa hh:mm:ss
    type: "pago_factura",
    kind: "gasto",
    re: new RegExp(String.raw`Pagaste ${AMOUNT} a (.+?) desde tu (?:producto|cuenta) \*?(\d+) el ${DATE}(?: a las)? ${TIME}`, "i"),
    pick: (m) => ({ amount: m[1], merchant: m[2], acct: "debito", last4: m[3].slice(-4), date: m[4], time: m[5] }),
  },
  {
    // SUPUESTO: Retiraste $X en CAJERO de/desde tu cuenta|T.Deb *1234 el dd/mm/aaaa a las hh:mm
    type: "retiro",
    kind: "transferencia_interna", // el efectivo sigue siendo nuestro; se gasta después
    re: new RegExp(String.raw`Retiraste ${AMOUNT} en (.+?) (?:de|desde) tu (?:cuenta|T\.?\s?Deb\.?) \*(\d{4}),? el ${DATE} a las ${TIME}`, "i"),
    pick: (m) => ({ amount: m[1], merchant: `Retiro ${m[2]}`, acct: "debito", last4: m[3], date: m[4], time: m[5] }),
  },
];

const NON_TRANSACTIONAL = [
  /Apagaste tu tarjeta/i,
  /Encendiste tu tarjeta/i,
  /Inscribiste/i,
  /(cambiaste|asignaste) tu clave/i,
  /ingresaste a/i,
  /actualizaste/i,
  /c[oó]digo de verificaci[oó]n/i,
];

function cleanMerchant(s: string): string {
  return s.replace(/\s+/g, " ").replace(/[.,]\s*$/, "").trim();
}

export function parseBancolombiaEmail(body: string): ParseResult {
  const text = emailToText(body);
  const sentence = extractAlertSentence(text) ?? text;
  const safe = redactSensitive(sentence);

  for (const p of PATTERNS) {
    const m = sentence.match(p.re);
    if (!m) continue;
    const f = p.pick(m);
    const amount = parsePesos(f.amount);
    const d = parseBankDate(f.date, f.time);
    if (amount === null || amount <= 0 || !d) continue;
    return {
      ok: true,
      movement: {
        type: p.type,
        kind: p.kind,
        amount,
        merchant: cleanMerchant(f.merchant),
        account: { type: f.acct, last4: f.last4 },
        date: d.date,
        occurredAt: d.at,
        text: safe,
      },
    };
  }

  if (NON_TRANSACTIONAL.some((re) => re.test(sentence))) {
    return { ok: false, reason: "no_transaccional", text: safe };
  }
  return { ok: false, reason: "formato_desconocido", text: safe };
}
