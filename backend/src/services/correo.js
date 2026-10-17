/**
 * Envio de correos (recuperacion de contrasena, invitaciones, avisos de la
 * prueba) por la API HTTP de Resend. Sin RESEND_API_KEY no se envia nada:
 * en desarrollo el contenido sale en el log.
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

async function enviarPorResend({ para, asunto, texto, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.correo.resendApiKey}`,
    },
    body: JSON.stringify({
      from: env.correo.from,
      to: Array.isArray(para) ? para : [para],
      subject: asunto,
      text: texto,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Resend API ${res.status}`);
  }
  return await res.json();
}

export async function enviarCorreo({ para, asunto, texto, html }) {
  if (env.correo.resendApiKey) {
    try {
      await enviarPorResend({ para, asunto, texto, html });
      return { enviado: true, via: "resend" };
    } catch (e) {
      logger.warn("Resend falló", { error: e.message, asunto: String(asunto).slice(0, 60) });
      return { enviado: false };
    }
  }

  if (process.env.NODE_ENV === "production") {
    logger.warn("No se pudo enviar el correo: falta RESEND_API_KEY.", { asunto: String(asunto).slice(0, 60) });
  } else {
    logger.warn(`Correo NO enviado a ${para}. Contenido:\n${texto}`);
  }
  return { enviado: false };
}
