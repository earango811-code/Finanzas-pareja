import { describe, expect, it } from "vitest";
import { afterFailure, isWeakPin, lockRemainingMinutes, MAX_FAILURES, pinToPassword } from "@/lib/pin";

describe("pinToPassword", () => {
  const secret = "secreto-de-prueba-con-mas-de-32-caracteres";
  it("es estable, larga y no contiene el PIN", () => {
    const p = pinToPassword(secret, "Ana@Test.co ", "4821");
    expect(p).toBe(pinToPassword(secret, "ana@test.co", "4821"));
    expect(p.length).toBeGreaterThanOrEqual(40);
    expect(p).not.toContain("4821");
  });
  it("cambia con el correo, el PIN o el secreto", () => {
    const base = pinToPassword(secret, "ana@test.co", "4821");
    expect(pinToPassword(secret, "luis@test.co", "4821")).not.toBe(base);
    expect(pinToPassword(secret, "ana@test.co", "4822")).not.toBe(base);
    expect(pinToPassword(secret + "x", "ana@test.co", "4821")).not.toBe(base);
  });
});

describe("isWeakPin", () => {
  it.each(["0000", "1111", "1234", "4321", "6789", "9876", "2580"])("%s es débil", (p) => expect(isWeakPin(p)).toBe(true));
  it.each(["4821", "7350", "1593"])("%s está bien", (p) => expect(isWeakPin(p)).toBe(false));
});

describe("bloqueo por intentos", () => {
  const now = new Date("2026-10-25T12:00:00Z");

  it("bloquea 15 min al quinto fallo", () => {
    let s = null as ReturnType<typeof afterFailure> | null;
    for (let i = 1; i < MAX_FAILURES; i++) {
      s = afterFailure(s, now);
      expect(lockRemainingMinutes(s, now)).toBe(0);
    }
    s = afterFailure(s, now);
    expect(lockRemainingMinutes(s, now)).toBe(15);
  });

  it("cada bloqueo siguiente dura el doble, hasta 24 h", () => {
    const lockedAfter = (lockouts: number) =>
      lockRemainingMinutes(afterFailure({ failures: MAX_FAILURES - 1, lockouts, locked_until: null }, now), now);
    expect(lockedAfter(1)).toBe(30);
    expect(lockedAfter(2)).toBe(60);
    expect(lockedAfter(10)).toBe(24 * 60);
  });

  it("un bloqueo vencido ya no bloquea", () => {
    expect(lockRemainingMinutes({ failures: 0, lockouts: 1, locked_until: "2026-10-25T11:59:00Z" }, now)).toBe(0);
  });
});
