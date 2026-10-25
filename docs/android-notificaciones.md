# Opcional (Android): leer las notificaciones del celular

**Recomendación: usen el correo** (ver `gmail-apps-script.md`). Funciona igual en iPhone y Android,
no depende de que el celular esté prendido y no requiere instalar nada en el teléfono. Esta guía
es solo por si en algún momento quieren que los movimientos entren *segundos* después del pago en
vez de hasta 5 minutos después.

## Opciones

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **Correo + Apps Script** (actual) | Gmail → script cada 5 min | iPhone y Android, gratis, sin batería, firmado con HMAC | Hasta 5 min de retraso; depende de que el banco mande el correo |
| **MacroDroid** | Disparador "Notificación recibida" de la app Bancolombia → acción "Solicitud HTTP" | Inmediato, sin programar | No calcula HMAC: habría que aceptar un token fijo (menos seguro). Hay que excluirlo del ahorro de batería. La versión gratis limita macros |
| **Tasker + JavaScriptlet** | Perfil de notificación → script que firma con HMAC y hace POST | Inmediato y firmado | Tasker es de pago y configurarlo es técnico |
| **App Android propia** (`NotificationListenerService`) | Una app mínima que escucha notificaciones de Bancolombia/Nu y firma el envío | Inmediato, firmado, a medida | Hay que compilarla, instalarla fuera de la Play Store y mantenerla; Android puede matarla en segundo plano |

Ninguna opción funciona en **iPhone**: iOS no deja que otras apps lean notificaciones.

## Riesgos de leer notificaciones

- El permiso de "acceso a notificaciones" deja leer **todas** las notificaciones del teléfono
  (WhatsApp, códigos de verificación…). Solo debe dárselo a una app de confianza y filtrar
  únicamente las notificaciones de la app de Bancolombia o Nu.
- Los textos de las notificaciones pueden venir recortados ("...") y faltar la fecha o la cuenta.

## Si deciden hacerlo

El lector de la app ya entiende el texto de las alertas ("Compraste COP… en … con tu T.Cred *1234,
el …"), que es el mismo de la notificación. Lo que falta es el endpoint `/api/ingest/notification`
y escoger la opción de firma (Tasker con HMAC o app propia). Se puede agregar en una fase posterior.
