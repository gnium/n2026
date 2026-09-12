/** ABM de planes de suscripcion. Solo administradora (montado con requerirAdmin en server.js). */
import { Router } from "express";
import { pool } from "../config/db.js";
import { guardarParametrosFacturacion, parametrosFacturacion } from "../services/facturacion.js";
import { AppError } from "../utils/errores.js";

export const rutasPlanes = Router();

function normalizarPlan(r) {
  return { ...r, precioMensualArs: Number(r.precioMensualArs) };
}

rutasPlanes.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, clave, nombre, precio_mensual_ars AS precioMensualArs, descripcion, activo FROM planes ORDER BY precio_mensual_ars");
    res.json(rows.map(normalizarPlan));
  } catch (e) {
    next(e);
  }
});

rutasPlanes.put("/", async (req, res, next) => {
  try {
    const { clave, nombre, precioMensualArs, descripcion, activo } = req.body || {};
    if (!clave || !/^[a-z0-9_-]{2,40}$/.test(clave)) throw new AppError("CLAVE_INVALIDA", "La clave del plan debe ser minuscula, sin espacios (letras, numeros, - o _).", 400);
    if (!nombre || String(nombre).trim().length < 2) throw new AppError("NOMBRE_INVALIDO", "Indique un nombre para el plan.", 400);
    const precio = Number(precioMensualArs);
    if (!Number.isFinite(precio) || precio < 0) throw new AppError("PRECIO_INVALIDO", "El precio mensual debe ser un numero mayor o igual a 0.", 400);
    await pool.query(
      `INSERT INTO planes (clave, nombre, precio_mensual_ars, descripcion, activo) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), precio_mensual_ars = VALUES(precio_mensual_ars), descripcion = VALUES(descripcion), activo = VALUES(activo)`,
      [clave, nombre.trim(), precio, descripcion ? String(descripcion).slice(0, 300) : null, activo === false ? 0 : 1],
    );
    const [rows] = await pool.query("SELECT id, clave, nombre, precio_mensual_ars AS precioMensualArs, descripcion, activo FROM planes ORDER BY precio_mensual_ars");
    res.json(rows.map(normalizarPlan));
  } catch (e) {
    next(e);
  }
});

rutasPlanes.get("/facturacion", async (_req, res, next) => {
  try {
    res.json(await parametrosFacturacion());
  } catch (e) {
    next(e);
  }
});

rutasPlanes.put("/facturacion", async (req, res, next) => {
  try {
    const { feeFijoArs, margenPct, tipoCambio, suscripcionRequerida } = req.body || {};
    for (const [nombre, v] of [["feeFijoArs", feeFijoArs], ["margenPct", margenPct], ["tipoCambio", tipoCambio]]) {
      if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) throw new AppError("VALOR_INVALIDO", `${nombre} debe ser un numero mayor o igual a 0.`, 400);
    }
    await guardarParametrosFacturacion({ feeFijoArs, margenPct, tipoCambio, suscripcionRequerida });
    res.json(await parametrosFacturacion());
  } catch (e) {
    next(e);
  }
});
