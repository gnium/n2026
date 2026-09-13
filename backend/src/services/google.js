/**
 * Integraciones con Google: Calendar (agenda), Gmail (envio de presupuestos y
 * comprobantes) y Drive (copia de los documentos generados).
 *
 * Viene apagado. Hacen falta dos pasos, y cada uno lo da una persona distinta:
 *   1. La titular carga el client_id y el client_secret de un proyecto de
 *      Google Cloud (Configuracion). Es la aplicacion de la escribania.
 *   2. Cada cuenta conecta SU cuenta de Google y elige que sincronizar. El
 *      refresh_token queda cifrado (contexto "google") en `google_cuentas`.
 *
 * Alcances minimos (ver docs/PRIVACIDAD.md):
 *   calendar.events -> crear y editar eventos; no lee el resto del calendario.
 *   gmail.send      -> enviar; NO permite leer la casilla.
 *   drive.file      -> solo los archivos que crea esta app; no ve el Drive.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const API_CALENDAR = "https://www.googleapis.com/calendar/v3";
const API_GMAIL = "https://gmail.googleapis.com/gmail/v1";
const API_DRIVE = "https://www.googleapis.com/drive/v3";
const SUBIDA_DRIVE = "https://www.googleapis.com/upload/drive/v3";
const TIMEOUT_MS = 20000;
const CARPETA_POR_DEFECTO = "Doy Fe";

export const ALCANCES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.file",
];

// ---------- configuracion de la instalacion ----------

async function leerConfig(claves) {
  const [rows] = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN (?)", [claves]);
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
}

/** client_id, redirect_uri y si hay secreto cargado. Nunca devuelve el secreto. */
export async function configuracionOAuth() {
  const c = await leerConfig(["google_client_id", "google_client_secret_cifrado", "google_redirect_uri"]);
  const redirectUri = c.google_redirect_uri || `${env.appUrl}/api/google/callback`;
  return {
    clientId: c.google_client_id || "",
    tieneSecreto: Boolean(c.google_client_secret_cifrado),
    redirectUri,
    configurado: Boolean(c.google_client_id && c.google_client_secret_cifrado),
  };
}

async function credenciales() {
  const c = await leerConfig(["google_client_id", "google_client_secret_cifrado", "google_redirect_uri"]);
  const secreto = c.google_client_secret_cifrado ? descifrar(c.google_client_secret_cifrado, "google") : null;
  if (!c.google_client_id || !secreto) {
    throw new AppError("GOOGLE_SIN_CONFIGURAR", "Las integraciones con Google no estan configuradas: la titular debe cargar el client_id y el client_secret en Configuracion.", 400);
  }
  return { clientId: c.google_client_id, clientSecret: secreto, redirectUri: c.google_redirect_uri || `${env.appUrl}/api/google/callback` };
}

/** Guarda las credenciales del proyecto de Google Cloud (solo la titular). */
export async function guardarConfiguracionOAuth({ clientId, clientSecret, redirectUri }) {
  const id = String(clientId ?? "").trim().slice(0, 300);
  const uri = String(redirectUri ?? "").trim().slice(0, 300);
  if (id && !/\.apps\.googleusercontent\.com$/.test(id)) {
    throw new AppError("DATOS_INVALIDOS", "El client_id de Google termina en .apps.googleusercontent.com.", 400);
  }
  if (uri && !/^https?:\/\//.test(uri)) throw new AppError("DATOS_INVALIDOS", "El redirect_uri debe ser una URL completa.", 400);
  const escribir = async (clave, valor) => pool.query("INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [clave, valor]);
  await escribir("google_client_id", id);
  await escribir("google_redirect_uri", uri);
  if (clientSecret === "") await escribir("google_client_secret_cifrado", "");
  else if (clientSecret) await escribir("google_client_secret_cifrado", cifrar(String(clientSecret).trim(), "google"));
  return configuracionOAuth();
}

// ---------- OAuth ----------

const firmarEstado = (usuarioId, nonce) => {
  const cuerpo = `${usuarioId}.${Date.now() + 10 * 60 * 1000}.${nonce}`;
  const firma = createHmac("sha256", env.auth.secreto).update(cuerpo).digest("base64url");
  return `${Buffer.from(cuerpo).toString("base64url")}.${firma}`;
};

/**
 * Devuelve { usuarioId, nonce } del estado firmado, o null si es invalido o
 * vencido. El `nonce` se compara contra una cookie httpOnly: el estado solo
 * vale en el navegador que inicio el flujo (si no, un enlace filtrado dejaria
 * conectar la cuenta de Google de otra persona).
 */
export function verificarEstado(state) {
  try {
    const [c64, firma] = String(state || "").split(".");
    const cuerpo = Buffer.from(c64, "base64url").toString();
    const esperada = createHmac("sha256", env.auth.secreto).update(cuerpo).digest("base64url");
    const a = Buffer.from(firma || "");
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const [usuarioId, vence, nonce] = cuerpo.split(".");
    if (Number(vence) < Date.now() || !nonce) return null;
    return { usuarioId: Number(usuarioId), nonce };
  } catch {
    return null;
  }
}

/** URL de consentimiento y el nonce que hay que guardar en una cookie del navegador. */
export async function urlAutorizacion(usuarioId) {
  const { clientId, redirectUri } = await credenciales();
  const nonce = randomBytes(16).toString("hex");
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ALCANCES.join(" "),
    access_type: "offline",
    prompt: "consent", // hace falta para que Google devuelva refresh_token
    include_granted_scopes: "true",
    state: firmarEstado(usuarioId, nonce),
  });
  return { url: `${AUTH_URL}?${p}`, nonce };
}

async function pedir(url, opciones = {}) {
  const controlador = new AbortController();
  const t = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opciones, signal: controlador.signal });
    const texto = await r.text();
    let cuerpo = null;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      cuerpo = { raw: texto };
    }
    return { ok: r.ok, estado: r.status, cuerpo };
  } catch (e) {
    throw new AppError("GOOGLE_CONEXION", `No se pudo conectar con Google: ${e.name === "AbortError" ? "tiempo de espera agotado" : "error de red"}.`, 502);
  } finally {
    clearTimeout(t);
  }
}

const mensajeGoogle = (cuerpo) => cuerpo?.error?.message || cuerpo?.error_description || cuerpo?.error || "error desconocido";

/** Intercambia el code por tokens y guarda la cuenta conectada. */
export async function conectar(usuarioId, code) {
  const { clientId, clientSecret, redirectUri } = await credenciales();
  const r = await pedir(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!r.ok) throw new AppError("GOOGLE_OAUTH", `Google rechazo la conexion: ${mensajeGoogle(r.cuerpo)}`, 502);
  const { access_token: acceso, refresh_token: refresco, expires_in: expira, scope } = r.cuerpo || {};
  if (!refresco) {
    throw new AppError("GOOGLE_SIN_REFRESH", "Google no devolvio un token de actualizacion. Quite el acceso de la app en la cuenta de Google y vuelva a conectarla.", 400);
  }
  let email = null;
  const info = await pedir(USERINFO_URL, { headers: { authorization: `Bearer ${acceso}` } });
  if (info.ok) email = info.cuerpo?.email || null;
  await pool.query(
    `INSERT INTO google_cuentas (usuario_id, email, refresh_cifrado, access_cifrado, access_expira_en, alcances)
     VALUES (:usuarioId, :email, :refresco, :acceso, DATE_ADD(NOW(), INTERVAL :segundos SECOND), :scope)
     ON DUPLICATE KEY UPDATE email = VALUES(email), refresh_cifrado = VALUES(refresh_cifrado), access_cifrado = VALUES(access_cifrado),
       access_expira_en = VALUES(access_expira_en), alcances = VALUES(alcances)`,
    { usuarioId, email, refresco: cifrar(refresco, "google"), acceso: cifrar(acceso, "google"), segundos: Number(expira) || 3600, scope: String(scope || "").slice(0, 600) },
  );
  logger.info(`google: cuenta conectada para el usuario ${usuarioId}`);
  return estado(usuarioId);
}

export async function desconectar(usuarioId) {
  const [[fila]] = await pool.query("SELECT refresh_cifrado FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (fila?.refresh_cifrado) {
    const token = descifrar(fila.refresh_cifrado, "google");
    if (token) await pedir(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
  }
  await pool.query("DELETE FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  await pool.query("UPDATE turnos SET google_evento_id = NULL, google_sincronizado_en = NULL WHERE usuario_id = ?", [usuarioId]);
  return estado(usuarioId);
}

/** Estado de la integracion para el frontend. Nunca incluye tokens. */
export async function estado(usuarioId) {
  const cfg = await configuracionOAuth();
  const [[r]] = await pool.query("SELECT * FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  return {
    configurado: cfg.configurado,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    conectado: Boolean(r),
    email: r?.email || null,
    conectadoEn: r?.conectado_en || null,
    calendarioId: r?.calendario_id || "primary",
    sincronizarAgenda: Boolean(r?.sincronizar_agenda),
    enviarPorGmail: Boolean(r?.enviar_por_gmail),
    subirEscrituras: Boolean(r?.subir_escrituras),
    subirComprobantes: Boolean(r?.subir_comprobantes),
    driveCarpetaNombre: r?.drive_carpeta_nombre || null,
    alcances: r?.alcances ? r.alcances.split(" ") : [],
  };
}

export async function guardarPreferencias(usuarioId, p) {
  const [[r]] = await pool.query("SELECT usuario_id FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (!r) throw new AppError("GOOGLE_NO_CONECTADO", "Conecte una cuenta de Google antes de elegir que sincronizar.", 400);
  await pool.query(
    `UPDATE google_cuentas SET sincronizar_agenda = :agenda, enviar_por_gmail = :gmail, subir_escrituras = :escrituras,
       subir_comprobantes = :comprobantes, calendario_id = :calendario WHERE usuario_id = :usuarioId`,
    {
      usuarioId,
      agenda: p.sincronizarAgenda ? 1 : 0,
      gmail: p.enviarPorGmail ? 1 : 0,
      escrituras: p.subirEscrituras ? 1 : 0,
      comprobantes: p.subirComprobantes ? 1 : 0,
      calendario: String(p.calendarioId || "primary").slice(0, 190),
    },
  );
  return estado(usuarioId);
}

/** Token de acceso vigente (lo renueva con el refresh_token si hace falta). */
async function accessToken(usuarioId) {
  const [[r]] = await pool.query("SELECT * FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (!r) throw new AppError("GOOGLE_NO_CONECTADO", "Esta cuenta no tiene Google conectado.", 400);
  if (r.access_cifrado && r.access_expira_en && new Date(r.access_expira_en).getTime() - Date.now() > 60_000) {
    const t = descifrar(r.access_cifrado, "google");
    if (t) return t;
  }
  const refresco = descifrar(r.refresh_cifrado, "google");
  if (!refresco) throw new AppError("GOOGLE_CREDENCIALES_ILEGIBLES", "No se pudieron leer las credenciales de Google (¿cambio JWT_SECRET?). Vuelva a conectar la cuenta.", 410);
  const { clientId, clientSecret } = await credenciales();
  const resp = await pedir(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresco, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  if (!resp.ok) {
    // invalid_grant = la persona revoco el acceso desde su cuenta de Google, o el token ya no sirve.
    if (resp.cuerpo?.error === "invalid_grant") {
      await pool.query("UPDATE google_cuentas SET access_cifrado = NULL, access_expira_en = NULL WHERE usuario_id = ?", [usuarioId]);
      throw new AppError("GOOGLE_ACCESO_REVOCADO", "Google ya no acepta las credenciales de esta cuenta (se revoco el acceso). Vuelva a conectarla en Integraciones.", 410);
    }
    throw new AppError("GOOGLE_OAUTH", `Google rechazo el token: ${mensajeGoogle(resp.cuerpo)}. Vuelva a conectar la cuenta.`, 502);
  }
  const acceso = resp.cuerpo?.access_token;
  // Sin esto se cachearia "undefined" por una hora y toda llamada saldria con Bearer undefined.
  if (!acceso) throw new AppError("GOOGLE_OAUTH", "Google no devolvio un token de acceso. Vuelva a conectar la cuenta.", 502);
  await pool.query("UPDATE google_cuentas SET access_cifrado = ?, access_expira_en = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE usuario_id = ?", [
    cifrar(acceso, "google"),
    Number(resp.cuerpo?.expires_in) || 3600,
    usuarioId,
  ]);
  return acceso;
}

async function api(usuarioId, url, opciones = {}) {
  const token = await accessToken(usuarioId);
  const r = await pedir(url, { ...opciones, headers: { authorization: `Bearer ${token}`, ...(opciones.headers || {}) } });
  if (!r.ok) throw new AppError("GOOGLE_API", `Google respondio ${r.estado}: ${mensajeGoogle(r.cuerpo)}`, r.estado === 403 ? 403 : 502);
  return r.cuerpo;
}

// ---------- Calendar ----------

const evento = (t) => ({
  summary: t.titulo,
  description: [t.notas, "Agendado desde Doy Fe."].filter(Boolean).join("\n\n"),
  start: { dateTime: new Date(t.fechaHora).toISOString() },
  end: { dateTime: new Date(new Date(t.fechaHora).getTime() + (t.duracionMin || 30) * 60000).toISOString() },
  status: t.estado === "cancelado" ? "cancelled" : "confirmed",
});

/**
 * Crea o actualiza el evento del turno en Google Calendar. Silencioso: si la
 * cuenta no tiene Google o la sincronizacion apagada, no hace nada.
 * Devuelve el id del evento o null.
 */
export async function sincronizarTurno(usuarioId, turno) {
  const [[c]] = await pool.query("SELECT sincronizar_agenda, calendario_id FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (!c?.sincronizar_agenda) return null;
  const cal = encodeURIComponent(c.calendario_id || "primary");
  const cuerpo = JSON.stringify(evento(turno));
  const cabeceras = { "content-type": "application/json" };
  if (turno.googleEventoId) {
    const r = await api(usuarioId, `${API_CALENDAR}/calendars/${cal}/events/${encodeURIComponent(turno.googleEventoId)}`, { method: "PATCH", headers: cabeceras, body: cuerpo });
    await pool.query("UPDATE turnos SET google_sincronizado_en = NOW() WHERE id = ?", [turno.id]);
    return r?.id || turno.googleEventoId;
  }
  const r = await api(usuarioId, `${API_CALENDAR}/calendars/${cal}/events`, { method: "POST", headers: cabeceras, body: cuerpo });
  if (r?.id) await pool.query("UPDATE turnos SET google_evento_id = ?, google_sincronizado_en = NOW() WHERE id = ?", [r.id, turno.id]);
  return r?.id || null;
}

export async function borrarEventoDeTurno(usuarioId, googleEventoId) {
  if (!googleEventoId) return;
  const [[c]] = await pool.query("SELECT sincronizar_agenda, calendario_id FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (!c) return;
  const cal = encodeURIComponent(c.calendario_id || "primary");
  await api(usuarioId, `${API_CALENDAR}/calendars/${cal}/events/${encodeURIComponent(googleEventoId)}`, { method: "DELETE" }).catch(() => {});
}

/** Trae los eventos del rango que la app no conoce, para mostrarlos en la agenda. */
export async function eventosDeGoogle(usuarioId, desde, hasta) {
  const [[c]] = await pool.query("SELECT sincronizar_agenda, calendario_id FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (!c?.sincronizar_agenda) return [];
  const cal = encodeURIComponent(c.calendario_id || "primary");
  const p = new URLSearchParams({ timeMin: new Date(desde).toISOString(), timeMax: new Date(hasta).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const r = await api(usuarioId, `${API_CALENDAR}/calendars/${cal}/events?${p}`);
  return (r?.items || [])
    .filter((e) => e.status !== "cancelled" && e.start?.dateTime)
    .map((e) => ({ googleEventoId: e.id, titulo: e.summary || "(sin titulo)", fechaHora: e.start.dateTime, fin: e.end?.dateTime || null, enlace: e.htmlLink || null }));
}

// ---------- Gmail ----------

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Envia un correo desde la cuenta de Google del usuario, con un adjunto opcional. */
export async function enviarPorGmail(usuarioId, { para, asunto, texto, adjunto = null, tipo = "otro", referenciaId = null }) {
  const [[c]] = await pool.query("SELECT enviar_por_gmail, email FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (!c) throw new AppError("GOOGLE_NO_CONECTADO", "Conecte su cuenta de Google para enviar desde Gmail.", 400);
  if (!c.enviar_por_gmail) throw new AppError("GMAIL_APAGADO", "El envio por Gmail esta apagado en Integraciones.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(para || ""))) throw new AppError("DATOS_INVALIDOS", "El destinatario no es un correo valido.", 400);
  const limite = "=_doyfe_" + randomBytes(12).toString("hex");
  const asuntoCodificado = `=?UTF-8?B?${Buffer.from(String(asunto || "")).toString("base64")}?=`;
  // El nombre del adjunto va entre comillas en dos cabeceras: sin sanear, unas comillas o un CRLF inyectan cabeceras.
  const nombreAdjunto = adjunto ? String(adjunto.nombre || "documento.pdf").replace(/[\r\n"\\]/g, "").slice(0, 120) || "documento.pdf" : null;
  let mensaje;
  if (adjunto) {
    mensaje =
      `From: ${c.email}\r\nTo: ${para}\r\nSubject: ${asuntoCodificado}\r\nMIME-Version: 1.0\r\n` +
      `Content-Type: multipart/mixed; boundary="${limite}"\r\n\r\n` +
      `--${limite}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(texto || "").toString("base64")}\r\n` +
      `--${limite}\r\nContent-Type: ${adjunto.tipo || "application/pdf"}; name="${nombreAdjunto}"\r\n` +
      `Content-Disposition: attachment; filename="${nombreAdjunto}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${adjunto.contenido.toString("base64")}\r\n` +
      `--${limite}--`;
  } else {
    mensaje = `From: ${c.email}\r\nTo: ${para}\r\nSubject: ${asuntoCodificado}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(texto || "").toString("base64")}`;
  }
  const r = await api(usuarioId, `${API_GMAIL}/users/me/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: b64url(mensaje) }),
  });
  await pool.query("INSERT INTO google_envios (usuario_id, tipo, referencia_id, gmail_id) VALUES (?, ?, ?, ?)", [usuarioId, tipo, referenciaId, r?.id || null]);
  return { enviado: true, gmailId: r?.id || null, desde: c.email };
}

// ---------- Drive ----------

/** Carpeta "Doy Fe" del usuario (la crea la primera vez). */
export async function carpetaDoyFe(usuarioId) {
  const [[c]] = await pool.query("SELECT drive_carpeta_id FROM google_cuentas WHERE usuario_id = ?", [usuarioId]);
  if (c?.drive_carpeta_id) return c.drive_carpeta_id;
  const r = await api(usuarioId, `${API_DRIVE}/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: CARPETA_POR_DEFECTO, mimeType: "application/vnd.google-apps.folder" }),
  });
  await pool.query("UPDATE google_cuentas SET drive_carpeta_id = ?, drive_carpeta_nombre = ? WHERE usuario_id = ?", [r.id, CARPETA_POR_DEFECTO, usuarioId]);
  return r.id;
}

/** Sube un archivo a la carpeta de la escribania en Drive. Devuelve { id, enlace }. */
export async function subirADrive(usuarioId, { nombre, tipo, contenido }) {
  const carpeta = await carpetaDoyFe(usuarioId);
  const limite = "=_doyfe_" + randomBytes(12).toString("hex");
  const meta = JSON.stringify({ name: nombre, parents: [carpeta] });
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`),
    Buffer.from(contenido),
    Buffer.from(`\r\n--${limite}--`),
  ]);
  const r = await api(usuarioId, `${SUBIDA_DRIVE}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${limite}` },
    body: cuerpo,
  });
  return { id: r?.id || null, enlace: r?.webViewLink || null };
}

const CAMPO_DRIVE = { escrituras: "subir_escrituras", comprobantes: "subir_comprobantes" };

/** true si esta cuenta tiene activada la subida de ese tipo de documento. */
export async function subeADrive(usuarioId, que) {
  const campo = CAMPO_DRIVE[que];
  if (!campo) return false;
  const [[c]] = await pool.query(`SELECT ${campo} AS activo FROM google_cuentas WHERE usuario_id = ?`, [usuarioId]);
  return Boolean(c?.activo);
}
