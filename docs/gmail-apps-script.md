# Conectar las alertas de Bancolombia (Gmail + Apps Script)

Cada uno hace esto **una vez, en su propia cuenta de Gmail** (la que recibe sus alertas de
Bancolombia). Toma unos 10 minutos.

## Cómo funciona

```
Bancolombia ──correo──▶ tu Gmail ──cada 5 min──▶ Apps Script ──POST firmado──▶ la app ──▶ Pendientes
```

- El script corre en **tu** cuenta de Google y solo busca correos de
  `alertasynotificaciones@ayn.notificacionesbancolombia.com`. No lee ni envía nada más.
- Cada envío va firmado con tu clave personal (HMAC-SHA256) y con la hora: si alguien copia la
  solicitud no puede reenviarla después de 5 minutos, y sin tu clave no puede inventar movimientos.
- Reenviar el mismo correo no crea duplicados.
- La app guarda solo la frase de la alerta con números largos enmascarados (`******4522`), nunca
  el correo completo.

## Antes de empezar (una sola vez, lo hace quien administra la app)

En **Vercel → Settings → Environment Variables** deben estar, además de las de Supabase:

| Variable | Dónde sale |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (secreta) |
| `ALERTS_HMAC_SECRET` | Inventa una frase larga y aleatoria (mínimo 32 caracteres). Por ejemplo, genera una en una terminal con `openssl rand -base64 48` |

Después de agregarlas, vuelve a desplegar (Deployments → ⋯ → Redeploy). Cambiar
`ALERTS_HMAC_SECRET` más adelante invalida las claves de los dos (tendrían que copiarlas de nuevo al script).

## Paso a paso

1. En la app, ve a **⚙️ Ajustes → Alertas del banco por correo → Conectar mi Gmail**. Ahí están tus
   tres valores: `WEBHOOK_URL`, `MEMBER_ID` y `SECRET`.
2. Abre <https://script.google.com> con **tu** cuenta de Gmail → **Nuevo proyecto**.
   Ponle nombre: *Finanzas en pareja*.
3. Borra lo que trae el editor y pega todo el contenido de `integrations/apps-script/Code.gs`.
4. (Recomendado) ⚙️ **Configuración del proyecto** → marca *Mostrar el archivo de manifiesto
   "appsscript.json"*. Vuelve al editor, abre `appsscript.json` y reemplázalo con el del repositorio:
   así el script pide permiso **solo de lectura** sobre Gmail.
5. ⚙️ **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**,
   tres veces:
   - `WEBHOOK_URL` → el valor de la app
   - `MEMBER_ID` → el valor de la app
   - `SECRET` → el valor de la app (toca **Ver** y **Copiar**)
6. Vuelve al editor. Arriba, en el selector de funciones, elige **instalar** y dale ▶ **Ejecutar**.
   Google pide autorización: *Revisar permisos* → tu cuenta → *Configuración avanzada* →
   *Ir a Finanzas en pareja (no seguro)* → *Permitir*. (Dice "no seguro" porque el script es tuyo y
   no está publicado; es normal.)
7. Elige **probarConexion** y ▶ **Ejecutar**. En el registro debe salir `creado` o `duplicado` por
   cada alerta y al final `Conexión OK`.
8. En la app, la alerta aparece en **Pendientes** y en Ajustes verás "Última alerta hace X min".

## Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| `Faltan propiedades` | Revisa el paso 5: los nombres van en mayúsculas, sin espacios. |
| `La app respondió 401` | El `SECRET` o el `MEMBER_ID` no coinciden. Cópialos otra vez desde la app. Si el reloj dice `fuera_de_tiempo`, vuelve a ejecutar. |
| `La app respondió 500 ... INGEST_HMAC_SECRET` | Falta configurar las variables en Vercel (ver "Antes de empezar"). |
| `La app respondió 429` | Muchas alertas a la vez; el script reintenta solo en 5 minutos. |
| Error de permisos de Gmail | Si cambiaste `appsscript.json` y falla, bórrale la sección `oauthScopes` y vuelve a autorizar. |
| Una alerta no aparece | En Ajustes → *Alertas que la app no entendió* sale el texto. Comparte ese texto para agregar el formato. |

## Detener

En el editor del script, ejecuta **desinstalar**. O en *Activadores* (⏰) borra el de
`procesarAlertas`.

## Para tener en cuenta

- Las cuentas se reconocen por los **últimos 4 dígitos**. Registra en Ajustes → Cuentas cada tarjeta de
  crédito y cada cuenta de ahorros con su tarjeta débito asociada. Las alertas que llegan antes de
  registrar la cuenta se enlazan solas cuando la registras.
- Si una regla está en **Automática**, las alertas de ese comercio entran ya clasificadas (se ven en
  Movimientos con la nota "Clasificado por regla").
- Si programaste una recurrente en modo **Entra a Pendientes** y llega la alerta del mismo valor
  (±3 días), la app las concilia: queda la del banco, con la categoría de la recurrente.
