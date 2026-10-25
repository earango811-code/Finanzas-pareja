// Firma de las solicitudes del Apps Script.
//
// Cada miembro tiene su propia clave, derivada del secreto maestro (INGEST_HMAC_SECRET)
// y de su id: así no hay claves guardadas en la base, y si se filtra la de uno no
// sirve para hacerse pasar por el otro. Cambiar el secreto maestro rota las dos.
//
// Firma = hex(HMAC-SHA256(claveMiembro, `${timestamp}.${cuerpo}`))
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_SECONDS = 300;

export function deriveMemberKey(masterSecret: string, memberId: string): string {
  return createHmac("sha256", masterSecret).update(`ingest:${memberId}`).digest("base64url");
}

export function sign(key: string, timestamp: string, body: string): string {
  return createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "firma_invalida" | "fuera_de_tiempo" | "sin_firma" };

export function verifySignature(params: {
  key: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): VerifyResult {
  const { key, timestamp, signature, body } = params;
  if (!timestamp || !signature) return { ok: false, reason: "sin_firma" };
  const ts = Number(timestamp);
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "fuera_de_tiempo" };
  const expected = Buffer.from(sign(key, timestamp, body), "hex");
  const given = Buffer.from(signature.toLowerCase(), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "firma_invalida" };
  return { ok: true };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
