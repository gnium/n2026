/**
 * Envio de correos (recuperacion de contrasena, invitaciones, avisos de la
 * prueba). Si no hay SMTP configurado, en desarrollo el contenido se imprime
 * en el log para poder probar; en produccion NO: esos correos llevan enlaces
 * con token de un solo uso y el log no es lugar para una credencial.
 */
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/** Escapa texto para interpolarlo en el HTML de un correo (nombres, correos, etc.). */
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
    requireTLS: env.smtp.port !== 465, // en el puerto 587 se exige STARTTLS: sin esto, una sesion sin cifrar pasa igual
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporte;
}

export async function enviarCorreo({ para, asunto, texto, html }) {
  const t = await getTransporte();
  if (!t) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("SMTP no configurado: no se envio un correo. Configure SMTP_* para las invitaciones y los avisos.", { asunto: String(asunto).slice(0, 60) });
    } else {
      logger.warn(`SMTP no configurado. Correo NO enviado a ${para}. Contenido:\n${texto}`);
    }
    return { enviado: false };
  }
  await t.sendMail({ from: env.smtp.from, to: para, subject: asunto, text: texto, html });
  return { enviado: true };
}
