/**
 * Integracion con Mercado Pago (SDK oficial `mercadopago`, v3.x, ARS).
 *
 * Se usa el flujo de suscripcion SIN card_token_id ("standalone
 * preapproval"): el backend nunca toca un numero de tarjeta. Mercado Pago
 * devuelve `init_point`, una URL de pago alojada por ellos donde la
 * escribana o el escribano autoriza el debito recurrente. El monto de cada ciclo se puede
 * actualizar con `actualizarMonto` para volcar el fee por uso acumulado en
 * el proximo cobro (ver `services/facturacion.js`).
 */
import { MercadoPagoConfig, PreApproval, WebhookSignatureValidator, InvalidWebhookSignatureError } from "mercadopago";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";

let cliente = null;
function getCliente() {
  if (!env.mercadopago.accessToken) throw new AppError("SIN_CREDENCIALES_MP", "Falta MP_ACCESS_TOKEN en el .env del backend.", 500);
  if (!cliente) cliente = new MercadoPagoConfig({ accessToken: env.mercadopago.accessToken, options: { timeout: 15000 } });
  return cliente;
}

function traducirError(e) {
  if (e instanceof AppError) return e; // ya clasificado (p. ej. SIN_CREDENCIALES_MP antes de llamar a la red): no reenvolver
  const msg = e?.message || "Error desconocido de Mercado Pago.";
  logger.error("Error de Mercado Pago", { codigo: e?.status || e?.name });
  return new AppError("ERROR_MERCADOPAGO", `Mercado Pago: ${msg}`, e?.status && e.status < 500 ? 400 : 502);
}

/**
 * Crea una suscripcion nueva para una escribana o un escribano y devuelve la URL de pago
 * alojada (`init_point`) a la que hay que redirigirla para que la autorice.
 */
export async function crearSuscripcion({ email, montoArs, motivo, referencia }) {
  try {
    const preApproval = new PreApproval(getCliente());
    const r = await preApproval.create({
      body: {
        reason: motivo,
        external_reference: referencia,
        payer_email: email,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Number(montoArs), currency_id: "ARS" },
        back_url: `${env.appUrl}/suscripcion`,
        status: "pending",
      },
    });
    return { id: r.id, initPoint: r.init_point, estado: r.status };
  } catch (e) {
    throw traducirError(e);
  }
}

export async function obtenerSuscripcion(id) {
  try {
    const preApproval = new PreApproval(getCliente());
    const r = await preApproval.get({ id });
    return { id: r.id, estado: r.status, monto: r.auto_recurring?.transaction_amount, proximoCobro: r.next_payment_date, resumen: r.summarized };
  } catch (e) {
    throw traducirError(e);
  }
}

/** Cambia el estado (pausar/reactivar/cancelar) de una suscripcion existente. */
export async function cambiarEstadoSuscripcion(id, estado) {
  try {
    const preApproval = new PreApproval(getCliente());
    const r = await preApproval.update({ id, body: { status: estado } });
    return { id: r.id, estado: r.status };
  } catch (e) {
    throw traducirError(e);
  }
}

/** Actualiza el monto que se cobrara en el PROXIMO ciclo (no reintenta el ciclo actual). */
export async function actualizarMonto(id, montoArs) {
  try {
    const preApproval = new PreApproval(getCliente());
    const r = await preApproval.update({ id, body: { auto_recurring: { transaction_amount: Number(montoArs), currency_id: "ARS" } } });
    return { id: r.id, estado: r.status };
  } catch (e) {
    throw traducirError(e);
  }
}

/**
 * Valida la firma de una notificacion webhook. Lanza AppError(401) si no es
 * autentica. `req` es el request de Express tal cual llega a la ruta.
 */
export function validarFirmaWebhook(req) {
  if (!env.mercadopago.webhookSecret) {
    logger.warn("MP_WEBHOOK_SECRET no configurado: no se puede validar la notificacion.");
    throw new AppError("SIN_SECRETO_WEBHOOK", "El servidor no tiene configurado el secreto de webhooks de Mercado Pago.", 500);
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers["x-signature"],
      xRequestId: req.headers["x-request-id"],
      dataId: req.query["data.id"],
      secret: env.mercadopago.webhookSecret,
      toleranceSeconds: 300,
    });
  } catch (e) {
    if (e instanceof InvalidWebhookSignatureError) throw new AppError("FIRMA_INVALIDA", `Notificacion de Mercado Pago con firma invalida (${e.reason}).`, 401);
    throw e;
  }
}
