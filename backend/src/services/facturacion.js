/**
 * Fee por uso: fee fijo (ARS) + costo real de la IA (USD, convertido a ARS
 * con un tipo de cambio que carga la administradora) + un margen sobre ese
 * costo. Una fila en `cargos_uso` por documento procesado (`ejecucion_id`
 * es unico): las iteraciones sobre el mismo documento actualizan el costo
 * de IA de esa misma fila, no agregan un fee fijo nuevo.
 *
 * El cobro en si se hace en Mercado Pago actualizando el monto del PROXIMO
 * ciclo de la suscripcion de cada cuenta (`cerrarCicloDeCuenta`), porque
 * Mercado Pago no ofrece un cargo "por evento" nativo sobre una suscripcion:
 * el fee por uso de un mes se factura junto con la cuota del mes siguiente.
 */
import { pool } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { actualizarMonto } from "./mercadopago.js";

const CLAVES = ["fee_fijo_ars_por_documento", "margen_ia_porcentaje", "tipo_cambio_usd_ars", "suscripcion_requerida"];

export async function parametrosFacturacion() {
  const [rows] = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN (?)", [CLAVES]);
  const m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  return {
    feeFijoArs: Number(m.fee_fijo_ars_por_documento || 0),
    margenPct: Number(m.margen_ia_porcentaje || 0),
    tipoCambio: Number(m.tipo_cambio_usd_ars || 0),
    suscripcionRequerida: m.suscripcion_requerida === "1",
  };
}

export async function guardarParametrosFacturacion({ feeFijoArs, margenPct, tipoCambio, suscripcionRequerida }) {
  const filas = [
    ["fee_fijo_ars_por_documento", feeFijoArs],
    ["margen_ia_porcentaje", margenPct],
    ["tipo_cambio_usd_ars", tipoCambio],
    ["suscripcion_requerida", suscripcionRequerida ? "1" : "0"],
  ].filter(([, v]) => v !== undefined);
  for (const [clave, valor] of filas) {
    await pool.query("INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [clave, String(valor)]);
  }
}

/**
 * Registra (o actualiza) el cargo de un documento procesado. `costoIaUsd`
 * puede ser null si algun modelo usado no tenia precio cargado: el cargo
 * igual se registra con el fee fijo, y el costo de IA se completa despues
 * si se vuelve a llamar (por ejemplo, tras una iteracion nueva).
 */
export async function registrarCargoUso({ usuarioId, ejecucionId, costoIaUsd }) {
  if (!usuarioId || !ejecucionId) return null;
  try {
    const { feeFijoArs, margenPct, tipoCambio } = await parametrosFacturacion();
    const costoIaArs = costoIaUsd != null && tipoCambio > 0 ? costoIaUsd * tipoCambio * (1 + margenPct / 100) : 0;
    const montoArs = Math.round((feeFijoArs + costoIaArs) * 100) / 100;
    await pool.query(
      `INSERT INTO cargos_uso (usuario_id, ejecucion_id, fee_fijo_ars, costo_ia_usd, tipo_cambio, margen_pct, monto_ars)
       VALUES (:usuarioId, :ejecucionId, :feeFijoArs, :costoIaUsd, :tipoCambio, :margenPct, :montoArs)
       ON DUPLICATE KEY UPDATE costo_ia_usd = VALUES(costo_ia_usd), tipo_cambio = VALUES(tipo_cambio), margen_pct = VALUES(margen_pct), monto_ars = VALUES(monto_ars)`,
      { usuarioId, ejecucionId, feeFijoArs, costoIaUsd: costoIaUsd ?? null, tipoCambio: tipoCambio || null, margenPct, montoArs },
    );
    return montoArs;
  } catch (e) {
    // La facturacion nunca debe interrumpir el pipeline: se registra el error y se sigue.
    logger.warn("No se pudo registrar el cargo de uso (ignorado)", { codigo: e.code || e.message?.slice(0, 60) });
    return null;
  }
}

/** Cargos de un usuario aun no volcados a un cobro, en el periodo indicado. */
export async function cargosPendientes(usuarioId, dias = 31) {
  const [rows] = await pool.query(
    `SELECT id, ejecucion_id AS ejecucionId, monto_ars AS montoArs, creado_en AS creadoEn
     FROM cargos_uso WHERE usuario_id = ? AND facturado_en IS NULL AND creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY creado_en DESC`,
    [usuarioId, dias],
  );
  return rows.map((r) => ({ ...r, montoArs: Number(r.montoArs) }));
}

/**
 * Suma los cargos pendientes de una cuenta, actualiza el monto del PROXIMO
 * ciclo de su suscripcion en Mercado Pago (cuota del plan + uso acumulado)
 * y marca esos cargos como facturados. Pensado para correrse una vez por
 * cuenta al cierre de cada ciclo (manualmente desde el panel de la
 * administradora por ahora; ver README para automatizarlo con un cron).
 */
export async function cerrarCicloDeCuenta(usuarioId, preapprovalId, precioPlanArs) {
  const [pendientes] = await pool.query("SELECT id, monto_ars AS montoArs FROM cargos_uso WHERE usuario_id = ? AND facturado_en IS NULL", [usuarioId]);
  const totalUso = pendientes.reduce((s, r) => s + Number(r.montoArs), 0);
  const montoProximoCiclo = Number(precioPlanArs || 0) + totalUso;
  if (preapprovalId) await actualizarMonto(preapprovalId, montoProximoCiclo);
  if (pendientes.length) {
    await pool.query("UPDATE cargos_uso SET facturado_en = NOW() WHERE id IN (?)", [pendientes.map((r) => r.id)]);
  }
  return { cantidadCargos: pendientes.length, totalUso, montoProximoCiclo };
}
