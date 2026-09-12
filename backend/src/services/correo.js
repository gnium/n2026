/**
 * Envio de correos (recuperacion de contrasena). Si no hay SMTP configurado,
 * el enlace se imprime en el log del servidor para poder probar en local.
 */
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let transporte = null;
async function getTransporte() {
  if (transporte || !env.smtp.host) return transporte;
  const { default: nodemailer } = await import("nodemailer");
  transporte = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporte;
}

export async function enviarCorreo({ para, asunto, texto, html }) {
  const t = await getTransporte();
  if (!t) {
    logger.warn(`SMTP no configurado. Correo NO enviado a ${para}. Contenido:\n${texto}`);
    return { enviado: false };
  }
  await t.sendMail({ from: env.smtp.from, to: para, subject: asunto, text: texto, html });
  return { enviado: true };
}
