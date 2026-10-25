# Fixtures de alertas Bancolombia

Correos de ejemplo **anonimizados**: tienen la estructura y la redacción exacta de
alertas reales (oct-2026), pero nombres, llaves, cuentas y últimos 4 dígitos son ficticios.

- `retiro-SUPUESTO.txt` es un formato **inventado**: no teníamos una alerta real de retiro.
  Cuando llegue una, reemplázala aquí y ajusta el test.
- Para agregar un formato nuevo: copia el texto del correo, tacha datos personales,
  guárdalo aquí y agrega el caso en `tests/bancolombia-email.test.ts`.
