/**
 * Finanzas en pareja — lector de alertas de Bancolombia para Gmail.
 *
 * Cada uno lo instala en SU cuenta de Gmail (la que recibe sus alertas).
 * Cada 5 minutos busca las alertas nuevas y las envía firmadas a la app.
 * No lee ningún otro correo y no guarda nada fuera de esta cuenta.
 *
 * Configuración (Configuración del proyecto ⚙️ → Propiedades de la secuencia de comandos):
 *   WEBHOOK_URL  https://TU-APP.vercel.app/api/ingest/email
 *   MEMBER_ID    (sale en la app: Ajustes → Conectar mi Gmail)
 *   SECRET       (sale en la app: Ajustes → Conectar mi Gmail)
 *
 * Luego ejecuta una vez `instalar` (crea el disparador) y `probarConexion`.
 */

var QUERY = 'from:alertasynotificaciones@ayn.notificacionesbancolombia.com newer_than:3d';
var OVERLAP_MS = 15 * 60 * 1000; // vuelve a mirar 15 min hacia atrás; la app ignora duplicados
var BATCH = 25;

function config_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    url: p.getProperty('WEBHOOK_URL'),
    memberId: p.getProperty('MEMBER_ID'),
    secret: p.getProperty('SECRET'),
  };
  if (!cfg.url || !cfg.memberId || !cfg.secret) {
    throw new Error('Faltan propiedades: WEBHOOK_URL, MEMBER_ID y SECRET (ver instrucciones arriba).');
  }
  return cfg;
}

function hex_(bytes) {
  return bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

/** Envía un lote de mensajes firmado con HMAC-SHA256. Devuelve la respuesta parseada. */
function enviar_(cfg, messages) {
  var body = JSON.stringify({ messages: messages });
  var ts = String(Math.floor(Date.now() / 1000));
  var signature = hex_(Utilities.computeHmacSha256Signature(ts + '.' + body, cfg.secret, Utilities.Charset.UTF_8));
  var res = UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'X-Member-Id': cfg.memberId, 'X-Timestamp': ts, 'X-Signature': signature },
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('La app respondió ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

function aMensaje_(m) {
  var body = m.getPlainBody() || m.getBody();
  return {
    id: m.getId(),
    date: m.getDate().toISOString(),
    from: m.getFrom(),
    subject: m.getSubject(),
    body: body.slice(0, 300000),
  };
}

/** Alertas recibidas después de `desdeMs`, de la más vieja a la más nueva. */
function buscar_(desdeMs) {
  var out = [];
  var threads = GmailApp.search(QUERY, 0, 100);
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      if (m.getDate().getTime() > desdeMs) out.push(m);
    });
  });
  out.sort(function (a, b) {
    return a.getDate().getTime() - b.getDate().getTime();
  });
  return out;
}

/** Lo ejecuta el disparador cada 5 minutos. */
function procesarAlertas() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // otra ejecución sigue corriendo
  try {
    var cfg = config_();
    var props = PropertiesService.getScriptProperties();
    var last = Number(props.getProperty('ULTIMA_ALERTA_MS') || 0);
    // Primera vez: solo los últimos 3 días (lo que cubre la búsqueda)
    var mensajes = buscar_(Math.max(0, last - OVERLAP_MS));

    for (var i = 0; i < mensajes.length; i += BATCH) {
      var lote = mensajes.slice(i, i + BATCH);
      var r = enviar_(cfg, lote.map(aMensaje_));
      var nuevos = r.results.filter(function (x) { return x.status === 'creado'; }).length;
      var errores = r.results.filter(function (x) { return x.status === 'error'; }).length;
      if (nuevos || errores) console.log('Lote: ' + nuevos + ' nuevos, ' + errores + ' con error');
      if (errores) return; // no avanzar: se reintenta en la próxima ejecución
      props.setProperty('ULTIMA_ALERTA_MS', String(lote[lote.length - 1].getDate().getTime()));
    }
  } finally {
    lock.releaseLock();
  }
}

/** Crea (o recrea) el disparador cada 5 minutos. Ejecútalo una vez. */
function instalar() {
  config_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarAlertas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarAlertas').timeBased().everyMinutes(5).create();
  console.log('Listo: se revisarán las alertas cada 5 minutos.');
}

/** Envía las 3 alertas más recientes y muestra qué respondió la app. */
function probarConexion() {
  var cfg = config_();
  var mensajes = buscar_(0).slice(-3);
  if (!mensajes.length) {
    console.log('No encontré alertas de Bancolombia de los últimos 3 días. La conexión no se probó.');
    return;
  }
  var r = enviar_(cfg, mensajes.map(aMensaje_));
  r.results.forEach(function (x) {
    console.log(x.status + ' — ' + x.id);
  });
  console.log('Conexión OK. "creado" = entró a la app; "duplicado" = ya estaba.');
}

/** Detiene la sincronización (borra el disparador). */
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarAlertas') ScriptApp.deleteTrigger(t);
  });
  console.log('Sincronización detenida.');
}
