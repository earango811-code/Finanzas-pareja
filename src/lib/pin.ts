// PIN de 4 dígitos para entrar.
//
// Supabase Auth nunca ve el PIN: el servidor lo convierte en una contraseña de 43
// caracteres con HMAC(secreto del servidor, correo + PIN). Como el secreto solo está
// en el servidor, nadie puede probar PINs directamente contra Supabase: todo intento
// pasa por /api/auth/pin, que aplica el bloqueo por intentos fallidos.
import { createHmac } from "node:crypto";

export const PIN_REGEX = /^\d{4}$/;
export const MAX_FAILURES = 5; // intentos antes de bloquear
export const BASE_LOCK_MINUTES = 15;
export const MAX_LOCK_MINUTES = 24 * 60;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Contraseña que guarda Supabase Auth para este correo + PIN. */
export function pinToPassword(serverSecret: string, email: string, pin: string): string {
  const pepper = createHmac("sha256", serverSecret).update("login-pin-v1").digest();
  return createHmac("sha256", pepper).update(`${normalizeEmail(email)}:${pin}`).digest("base64url");
}

/** PINs demasiado fáciles de adivinar. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true; // 0000, 1111…
  const asc = "0123456789012";
  const desc = "9876543210987";
  return asc.includes(pin) || desc.includes(pin) || ["1212", "6969", "2580", "1004"].includes(pin);
}

export interface AttemptState {
  failures: number;
  lockouts: number;
  locked_until: string | null;
}

/** ¿Está bloqueado ahora? Devuelve los minutos que faltan o 0. */
export function lockRemainingMinutes(s: AttemptState | null, now: Date = new Date()): number {
  if (!s?.locked_until) return 0;
  const ms = Date.parse(s.locked_until) - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/**
 * Estado después de un intento fallido. Al llegar a MAX_FAILURES se bloquea
 * 15 min, y cada bloqueo siguiente dura el doble (máximo 24 h).
 */
export function afterFailure(s: AttemptState | null, now: Date = new Date()): AttemptState {
  const failures = (s?.failures ?? 0) + 1;
  const lockouts = s?.lockouts ?? 0;
  if (failures < MAX_FAILURES) return { failures, lockouts, locked_until: null };
  const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** lockouts, MAX_LOCK_MINUTES);
  return { failures: 0, lockouts: lockouts + 1, locked_until: new Date(now.getTime() + minutes * 60000).toISOString() };
}
