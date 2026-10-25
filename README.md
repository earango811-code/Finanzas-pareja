# Finanzas en pareja

App para llevar el presupuesto **compartido** del hogar y los gastos **personales** de cada uno,
con una bandeja de "Pendientes por identificar" y el cálculo de **quién le debe a quién**.

- Next.js + TypeScript + Tailwind, instalable como app (PWA) en iPhone y Android.
- Supabase (base de datos Postgres + inicio de sesión + seguridad por filas).
- Español de Colombia, pesos sin decimales (`$ 1.234.567`), hora de Bogotá.

## Estado

| Fase | Qué incluye | Estado |
|---|---|---|
| 1. MVP | Login de los 2, categorías y presupuesto del Excel, registro manual con dictado, Pendientes, presupuesto vs real, 50/30/20, quién le debe a quién | ✅ Hecho |
| 2. Correo Bancolombia | Lector de alertas probado con los formatos reales, webhook firmado (HMAC), Apps Script para Gmail, reglas automáticas, conciliación con recurrentes. Guía Android (opcional) | ✅ Hecho |
| 3. Extractos y cierre | Importar CSV/Excel, conciliación por cuenta, cierre de mes congelado, exportar a Excel | ⏳ |
| 4. Notificaciones y gráficos | Push al entrar un pendiente, alertas al 80 %, gráficos | ⏳ |

---

## Instalación paso a paso (sin ser programador)

Necesitas: una cuenta gratis en **GitHub**, **Supabase** y **Vercel** (puedes entrar a las tres con
la misma cuenta de GitHub). Toma unos 20 minutos.

### 1. Subir el código a GitHub

1. Entra a <https://github.com/new>, nombre `finanzas-pareja`, marca **Private** y crea el repositorio.
2. En la carpeta del proyecto, en una terminal:

   ```bash
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/finanzas-pareja.git
   git push -u origin main
   ```

### 2. Crear la base de datos en Supabase

1. Entra a <https://supabase.com/dashboard> → **New project**. Región: *East US* (la más cercana a
   Colombia). Guarda la contraseña de la base en un lugar seguro.
2. Cuando termine de crearse, ve a **SQL Editor** → **New query** y ejecuta, **en orden**, cada
   archivo de `supabase/migrations/` (pega TODO el contenido y dale **Run**; debe decir *Success*):
   1. `20261025000001_esquema_inicial.sql`
   2. `20261025000002_subcategorias.sql`
   3. `20261025000003_recurrentes.sql`
   4. `20261025000004_ingesta_correo.sql`
   5. `20261025000005_pin.sql`
   6. `20261025000006_bolsillos.sql`
3. **Authentication → Sign In / Providers → Email**: déjalo activado.
4. **Project Settings → API Keys**: copia la **Project URL**, la llave pública (*publishable* o
   *anon*) y la secreta (*secret* o *service_role*). Las usarás en el paso 3.

### 3. Publicar la app en Vercel

1. Entra a <https://vercel.com/new> → importa el repositorio `finanzas-pareja`.
2. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la llave anon public
   - `SUPABASE_SERVICE_ROLE_KEY` = la llave **service_role** (secreta; solo la usa el servidor para
     recibir las alertas)
   - `INGEST_HMAC_SECRET` = una frase larga y aleatoria, mínimo 32 caracteres (por ejemplo, la salida
     de `openssl rand -base64 48`). Protege los PIN de entrada.
   - `ALERTS_HMAC_SECRET` = **otra** frase larga y aleatoria. Con ella se firman las alertas del
     Apps Script. Se puede cambiar sin afectar los PIN (pero hay que actualizar el `SECRET` de cada script).
3. **Deploy**. Al terminar te da una dirección tipo `https://finanzas-pareja.vercel.app`.
4. De vuelta en Supabase: **Authentication → URL Configuration**:
   - **Site URL** = esa dirección.
   - **Redirect URLs → Add URL** = esa dirección seguida de `/**` (ej. `https://finanzas-pareja.vercel.app/**`).

### 4. Primer uso

1. Uno de los dos abre la dirección en el computador → *¿Primera vez…? Entrar con enlace al correo*
   → abre el correo de Supabase **en ese mismo navegador** y toca *Sign in*.
2. Llena el formulario de bienvenida: su nombre, ingreso, el nombre, **correo** e ingreso de la pareja,
   y los descuentos fijos si hay (ej. cuota de especialización). Se cargan las categorías y montos
   del Excel.
3. En **⚙️ Ajustes → Acceso con PIN**: crea tu PIN de 4 números y, abajo, *Crear el acceso* de tu
   pareja con un PIN inicial (se lo pasas en persona; ella lo puede cambiar).
4. Desde ahí, los dos entran con **correo + PIN** en el computador y en el celular. Tras 5 intentos
   fallidos se bloquea 15 minutos. Si alguien olvida el PIN: el otro se lo restablece en Ajustes, o entra
   con el enlace al correo y crea uno nuevo.

> El PIN no se guarda: el servidor lo convierte en una contraseña larga con `INGEST_HMAC_SECRET`.
> Si algún día cambian ese secreto, los dos tendrán que entrar con el enlace y crear el PIN otra vez.
5. En **⚙️ Ajustes → Cuentas** agreguen sus cuentas con los **últimos 4 dígitos** tal como aparecen
   en las alertas (ej. `TC Bancolombia *1234`). En la cuenta de ahorros pongan también los 4 de la
   tarjeta débito (las compras con débito traen los de la tarjeta). Nunca escriban el número completo.
6. Cada uno conecta su Gmail para que las alertas entren solas: sigan
   [docs/gmail-apps-script.md](docs/gmail-apps-script.md) (10 minutos).

> ¿Quieren ver la app con datos de prueba? En un proyecto de Supabase **de pruebas**, después del
> paso 4.2, pega `supabase/demo-data.sql` en el SQL Editor. Todo es ficticio.

### 5. Instalar la app en el celular

**iPhone (Safari, obligatorio en iOS):**
1. Abre la dirección de la app en **Safari**.
2. Toca el botón **Compartir** (cuadro con flecha hacia arriba).
3. **Agregar a inicio** → **Agregar**. Aparece el ícono como una app más.

**Android (Chrome):**
1. Abre la dirección en **Chrome**.
2. Menú **⋮** → **Instalar app** (o *Agregar a pantalla principal*).

---

## Cómo se usa

- **Pendientes** (pantalla principal): cada movimiento muestra valor, comercio, fecha, cuenta y quién
  pagó. Toca uno → **Compartido / Personal** → categoría. Si la app tiene una sugerencia (por una
  regla o por cómo clasificaron ese comercio antes), basta con **✓ Aceptar**.
  - *Transferencia interna* y *Pago de tarjeta* no cuentan como gasto (el gasto de la tarjeta ya se
    contó el día de la compra).
  - *Recordar para este comercio* crea una regla y la próxima vez se sugiere sola.
  - *Seleccionar varios* clasifica muchos a la vez.
- **Registrar**: para efectivo. Escribe “45 mil mercado D1 compartido” y la app llena el formulario.
- **Presupuesto**: presupuestado vs real por categoría, con alerta al 80 % (🟠) y 100 % (🔴),
  vista Compartido y Personal de cada uno, y el resumen 50/30/20 calculado con lo real.
- **Balance**: total compartido × % de cada uno vs lo que pagó cada uno → “X le debe $N a Y”.
  Cuando le transfieras, toca **registrar liquidación** y el saldo queda en cero.
- **Ajustes**: ingresos (el % se recalcula solo), cuentas, montos del presupuesto, categorías y reglas.

### Categorías y subcategorías

El presupuesto se define en las categorías principales (las del Excel). Debajo hay subcategorías
para clasificar más fino; lo gastado en ellas suma a su principal:

| Principal (con presupuesto) | Subcategorías |
|---|---|
| Mercado | Alimentos · Caramelos · Café |
| Licor y chasers | Bebidas |
| Servicios públicos | Agua · Electricidad |
| Internet y celular | Internet · TV · Teléfono |
| Transporte / gasolina | Gasolina · Parking · Uber · Reparar · Seguros de coche |
| Salidas | Cine · Restaurante · Rumba · Comida |
| Ahorro / inversión de pareja | Ahorros para emergencias · Ahorros para vacaciones · Inversiones |
| Ingresos (no es gasto) | Salario · Prestaciones |

Empleada de servicio, Aseo de casa, Suscripciones, Cuidado personal, Imprevistos, Viajes y Ahorro
individual no tienen subcategorías.

En **⚙️ Ajustes → 🏷️ Categorías** pueden crear categorías y subcategorías, renombrarlas, moverlas
de una principal a otra, cambiar sus palabras clave del dictado, desactivarlas (dejan de salir al
clasificar pero el historial se conserva) o eliminarlas. Si una categoría ya tiene movimientos, para
eliminarla hay que elegir a qué categoría pasarlos.

### Transacciones recurrentes

En **⚙️ Ajustes → 🔁 Recurrentes** se programan los movimientos que se repiten (arriendo, empleada,
suscripciones, salario): valor, categoría, quién paga, frecuencia (semanal, cada 2 semanas,
quincenal 15 y último día, mensual, bimestral, trimestral o anual), desde y hasta cuándo.

- La app crea cada movimiento en su fecha, la primera vez que alguno de los dos la abre ese día.
- **Se registra sola**: entra ya identificada. Ideal para efectivo o pagos sin alerta del banco.
- **Entra a Pendientes**: sirve de recordatorio. Úsenla si ese pago también llega por alerta del
  banco, para no contarlo dos veces.
- Si el mes no tiene el día (ej. 31), se usa el último día del mes.
- Pausar, editar o eliminar una recurrente no toca los movimientos que ya se crearon.

### Bolsillos

En **Presupuesto → 🐷 Bolsillos** (o Ajustes) crean bolsillos para apartar plata: Viaje, Imprevistos…
Cada uno puede ser compartido o personal y tener una meta.

- **Se llenan** pasando el sobrante del mes (la app muestra cuánto sobró del presupuesto el mes anterior y
  ustedes deciden a qué bolsillo pasarlo) o con aportes a mano.
- **Se gastan** marcando un gasto como *Pagado desde el bolsillo* (al clasificarlo en Pendientes, al
  registrarlo, o desde el menú ⋯ en Movimientos). Ese gasto no se come el presupuesto del mes y se
  descuenta del bolsillo.
- En **quién le debe a quién** un gasto compartido pagado desde un bolsillo sigue contando y se reparte
  por %: el bolsillo es plata apartada en papel, pero el pago salió de la cuenta de uno de los dos.

### Reglas de cálculo

- % de reparto = (ingreso − descuentos fijos) de cada uno ÷ total. Es fijo hasta que lo editen.
- El ahorro funciona como en el Excel: “% del resto” = (ingreso total − presupuestos fijos) × 50 %.
- Solo cuentan los movimientos **identificados**. Los reembolsos compartidos (ingreso compartido) restan.
- Compras diferidas: se registran **completas** en la fecha de compra.
- Compras con tarjeta de crédito cuentan en la fecha de **compra**; el pago de la tarjeta no es gasto.

---

## Seguridad y privacidad

- La app **nunca** pide ni guarda usuario o clave del banco. Solo leerá alertas y extractos.
- Cada tabla tiene **Row Level Security**: solo los dos miembros del hogar ven sus datos.
- Solo se guardan los **últimos 4 dígitos** de cuentas y tarjetas; las llaves, celulares y números
  largos que vienen en las alertas se enmascaran (`******4522`).
- Las llaves van solo en variables de entorno (`.env.local` / Vercel). Ver `.env.example`.
- El repositorio no tiene datos reales: los correos de ejemplo de los tests están anonimizados.

---

## Para desarrolladores

```bash
npm install
cp .env.example .env.local   # y llena las variables
npm run dev                  # http://localhost:3000
npm test                     # tests de Vitest
npm run lint                 # chequeo de tipos
```

```
src/
  app/(app)/         pantallas: pendientes, movimientos, nuevo, presupuesto, balance, ajustes
  app/(app)/actions.ts   acciones del servidor (validadas con Zod)
  domain/            lógica pura y testeada: money, dates, split, budget, rules, quick-entry
  domain/parsers/    parser de alertas por correo de Bancolombia
  lib/               clientes de Supabase y carga de datos del hogar
supabase/migrations/ esquema + RLS + categorías iniciales
tests/               Vitest + fixtures/emails (anonimizados)
```

**Agregar un formato de alerta nuevo:** copia el texto del correo, tacha los datos personales,
guárdalo en `tests/fixtures/emails/` y agrega el caso en `tests/bancolombia-email.test.ts`.
