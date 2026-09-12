/**
 * Webhook publico de Mercado Pago (sin cookie de sesion: la autenticacion es
 * la firma HMAC de la notificacion). Nunca confiar en el cuerpo de la
 * notificacion para el estado: siempre se vuelve a consultar el recurso.
 */
import { Router } from "express";
import { pool } from "../config/db.js";
import { validarFirmaWebhook, obtenerSuscripcion } from "../services/mercadopago.js";
import { buscarPorPreapprovalId, actualizarSuscripcion } from "../auth/repositorio.js";
import { logger } from "../utils/logger.js";

export const rutasWebhookMercadoPago = Router();

const ESTADO_MP_A_INTERNO = { authorized: "activa", paused: "pausada", cancelled: "cancelada", pending: "pendiente" };

rutasWebhookMercadoPago.post("/mercadopago", async (req, res, next) => {
  try {
    validarFirmaWebhook(req);
    const tipo = req.body?.type || req.query?.topic || "desconocido";
    const dataId = req.body?.data?.id || req.query["data.id"] || req.query.id || null;
    await pool.query("INSERT INTO mp_eventos (tipo, mp_id) VALUES (?, ?)", [tipo, dataId]).catch(() => {});

    if (tipo === "subscription_preapproval" && dataId) {
      const sub = await obtenerSuscripcion(dataId);
      const usuario = await buscarPorPreapprovalId(dataId);
      if (usuario) {
        await actualizarSuscripcion(usuario.id, {
          estadoSuscripcion: ESTADO_MP_A_INTERNO[sub.estado] || null,
          proximoCobroEn: sub.proximoCobro ? new Date(sub.proximoCobro).toISOString().slice(0, 10) : null,
        });
        logger.info("Suscripcion actualizada por webhook", { codigo: sub.estado });
      } else {
        logger.warn("Webhook de una suscripcion sin cuenta asociada (ignorado)");
      }
    }
    // Otros tipos (subscription_authorized_payment, payment) solo quedan
    // registrados en mp_eventos por ahora; el estado igual se refresca en
    // cada subscription_preapproval que Mercado Pago emite tras cada cobro.
    res.status(200).end();
  } catch (e) {
    next(e);
  }
});
