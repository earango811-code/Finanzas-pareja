"use client";

import { useState } from "react";

/** Campo de pesos que muestra "1.234.567" mientras escribes y envía el número limpio. */
export function MoneyInput({
  name,
  defaultValue,
  value: controlled,
  onValueChange,
  placeholder,
  required,
  autoFocus,
  className = "",
}: {
  name?: string;
  defaultValue?: number;
  value?: number | null;
  onValueChange?: (n: number | null) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState<number | null>(defaultValue ?? null);
  const value = controlled !== undefined ? controlled : inner;
  const shown = value === null ? "" : value.toLocaleString("es-CO");

  return (
    <div className={`relative ${className}`}>
      <span className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">$</span>
      <input
        className="input tabular pl-7"
        inputMode="numeric"
        placeholder={placeholder}
        value={shown}
        required={required}
        autoFocus={autoFocus}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          const n = digits ? Number(digits) : null;
          setInner(n);
          onValueChange?.(n);
        }}
      />
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </div>
  );
}
