/**
 * Suscripcion de la cuenta que esta logueada (no de sus clientes: esto es
 * facturacion del servicio, la escribana o el escribano pagando a quien opera Doy Fe).
 */
import { Router } from "express";
import { pool } from "../config/db.js";
import { buscarPorId, actualizarSuscripcion } from "../auth/repositorio.js";
import { crearSuscripcion, cambiarEstadoSuscripcion } from "../services/mercadopago.js";
import { cargosPendientes } from "../services/facturacion.js";
import { AppError } from "../utils/errores.js";

export const rutasSuscripcion = Router();

const ESTADO_MP_A_INTERNO = { authorized: "activa", paused: "pausada", cancelled: "cancelada", pending: "pendiente" };

/** Planes activos, visibles para cualquier cuenta (para elegir uno). */
rutasSuscripcion.get("/planes", async (_req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, clave, nombre, precio_mensual_ars AS precioMensualArs, descripcion FROM planes WHERE activo = 1 ORDER BY precio_mensual_ars");
    res.json(rows.map((r) => ({ ...r, precioMensualArs: Number(r.precioMensualArs) })));
  } catch (e) {
    next(e);
  }
});

rutasSuscripcion.get("/", async (req, res, next) => {
  try {
    const u = await buscarPorId(req.usuario.id);
    const [[planCrudo]] = u.plan_id ? await pool.query("SELECT id, clave, nombre, precio_mensual_ars AS precioMensualArs FROM planes WHERE id = ?", [u.plan_id]) : [[null]];
    const plan = planCrudo ? { ...planCrudo, precioMensualArs: Number(planCrudo.precioMensualArs) } : null;
    const pendientes = await cargosPendientes(req.usuario.id);
    res.json({
      estado: u.estado_suscripcion,
      plan,
      proximoCobroEn: u.proximo_cobro_en,
      cargosPendientes: pendientes,
      totalPendienteArs: pendientes.reduce((s, r) => s + Number(r.montoArs), 0),
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/suscripcion  { planClave } -> crea la suscripcion en Mercado Pago y devuelve initPoint para redirigir a la escribana o al escribano. */
rutasSuscripcion.post("/", async (req, res, next) => {
  try {
    const u = await buscarPorId(req.usuario.id);
    const [[planCrudo]] = await pool.query("SELECT id, clave, nombre, precio_mensual_ars AS precioMensualArs FROM planes WHERE clave = ? AND activo = 1", [req.body?.planClave]);
    if (!planCrudo) throw new AppError("PLAN_INEXISTENTE", "El plan indicado no existe o no esta activo.", 400);
    const plan = { ...planCrudo, precioMensualArs: Number(planCrudo.precioMensualArs) };
    const r = await crearSuscripcion({
      email: u.email,
      montoArs: plan.precioMensualArs,
      motivo: `Doy Fe - Plan ${plan.nombre}`,
      referencia: `usuario_${u.id}`,
    });
    await actualizarSuscripcion(u.id, { planId: plan.id, mpPreapprovalId: r.id, estadoSuscripcion: ESTADO_MP_A_INTERNO[r.estado] || "pendiente" });
    res.status(201).json({ initPoint: r.initPoint, estado: ESTADO_MP_A_INTERNO[r.estado] || "pendiente" });
  } catch (e) {
    next(e);
  }
});

rutasSuscripcion.post("/cancelar", async (req, res, next) => {
  try {
    const u = await buscarPorId(req.usuario.id);
    if (!u.mp_preapproval_id) throw new AppError("SIN_SUSCRIPCION", "No tiene una suscripcion activa para cancelar.", 400);
    const r = await cambiarEstadoSuscripcion(u.mp_preapproval_id, "cancelled");
    await actualizarSuscripcion(u.id, { estadoSuscripcion: ESTADO_MP_A_INTERNO[r.estado] || "cancelada" });
    res.json({ estado: ESTADO_MP_A_INTERNO[r.estado] || "cancelada" });
  } catch (e) {
    next(e);
  }
});
