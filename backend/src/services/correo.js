/**
 * Envio de correos (recuperacion de contrasena, invitaciones, avisos de la
 * prueba). Intenta SMTP directo; si falla o no esta configurado, usa el
 * relay HTTP (un script PHP alojado en el mismo servidor de correo).
 */
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export function escaparHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let transporte = null;
async function getTransporte() {
  if (transporte || !env.smtp.host) return transporte;
  const { default: nodemailer } = await import("nodemailer");
  transporte = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    requireTLS: env.smtp.port !== 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporte;
}

let relayDispatcher = null;
async function getRelayDispatcher() {
  if (relayDispatcher) return relayDispatcher;
  try {
    const { Agent } = await import("undici");
    relayDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  } catch {
    relayDispatcher = undefined;
  }
  return relayDispatcher;
}

async function enviarPorRelay({ para, asunto, texto, html }) {
  const { relayUrl, relayKey } = env.smtp;
  if (!relayUrl || !relayKey) return null;
  const dispatcher = await getRelayDispatcher();
  const opts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${relayKey}`,
    },
    body: JSON.stringify({ to: para, subject: asunto, text: texto, html }),
    signal: AbortSignal.timeout(15000),
  };
  if (dispatcher) opts.dispatcher = dispatcher;
  const res = await fetch(relayUrl, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Relay HTTP ${res.status}`);
  }
  return await res.json();
}

export async function enviarCorreo({ para, asunto, texto, html }) {
  // Intento 1: SMTP directo.
  const t = await getTransporte();
  if (t) {
    try {
      await t.sendMail({ from: env.smtp.from, to: para, subject: asunto, text: texto, html });
      return { enviado: true, via: "smtp" };
    } catch (e) {
      logger.warn("SMTP falló, intentando relay", { error: e.code || e.message });
      transporte = null;
    }
  }

  // Intento 2: relay HTTP.
  try {
    const r = await enviarPorRelay({ para, asunto, texto, html });
    if (r) {
      logger.info("Correo enviado vía relay", { para });
      return { enviado: true, via: "relay" };
    }
  } catch (e) {
    logger.warn("Relay falló", { error: e.message });
  }

  // Sin opciones.
  if (process.env.NODE_ENV === "production") {
    logger.warn("No se pudo enviar el correo. Configure SMTP o SMTP_RELAY_URL.", { asunto: String(asunto).slice(0, 60) });
  } else {
    logger.warn(`Correo NO enviado a ${para}. Contenido:\n${texto}`);
  }
  return { enviado: false };
}
