/**
 * Cuenta corriente por cliente: cargos (desde presupuestos aceptados,
 * comprobantes emitidos o a mano) y pagos (siempre a mano). Texto plano:
 * montos y conceptos, sin identificadores (docs/PRIVACIDAD.md).
 */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";
import { hoyLocal, esFechaValida, texto } from "../utils/fechas.js";

const MONEDAS = new Set(["ARS", "USD"]);
const MEDIOS = new Set(["efectivo", "transferencia", "mercadopago", "cheque", "otro"]);

function filaAVista(r) {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    clienteNombre: r.cliente_nombre ?? null,
    expedienteId: r.expediente_id,
    expedienteCaratula: r.expediente_caratula ?? null,
    tipo: r.tipo,
    origen: r.origen,
    origenId: r.origen_id,
    fecha: r.fecha,
    concepto: r.concepto,
    monto: Number(r.monto),
    moneda: r.moneda,
    medioPago: r.medio_pago,
    referencia: r.referencia,
    creadoEn: r.creado_en,
  };
}

const SELECT = `SELECT m.*, c.nombre AS cliente_nombre, e.caratula AS expediente_caratula
                  FROM movimientos m
                  LEFT JOIN clientes c ON c.id = m.cliente_id
                  LEFT JOIN expedientes e ON e.id = m.expediente_id`;

function validarFecha(f) {
  if (f && !esFechaValida(String(f))) throw new AppError("DATOS_INVALIDOS", "fecha invalida (AAAA-MM-DD).", 400);
}

async function exigirCliente(usuarioId, clienteId) {
  const [[c]] = await pool.query("SELECT id FROM clientes WHERE id = ? AND usuario_id = ?", [clienteId, usuarioId]);
  if (!c) throw new AppError("CLIENTE_INVALIDO", "El cliente no existe o no pertenece a esta cuenta.", 400);
}

async function exigirExpediente(usuarioId, expedienteId) {
  if (!expedienteId) return null;
  const [[e]] = await pool.query("SELECT id FROM expedientes WHERE id = ? AND usuario_id = ?", [expedienteId, usuarioId]);
  if (!e) throw new AppError("EXPEDIENTE_INVALIDO", "El expediente no existe o no pertenece a esta cuenta.", 400);
  return e.id;
}

export async function listar(usuarioId, { clienteId, desde, hasta } = {}) {
  validarFecha(desde);
  validarFecha(hasta);
  const [rows] = await pool.query(
    `${SELECT} WHERE m.usuario_id = :usuarioId
        AND (:clienteId IS NULL OR m.cliente_id = :clienteId)
        AND (:desde IS NULL OR m.fecha >= :desde) AND (:hasta IS NULL OR m.fecha <= :hasta)
      ORDER BY m.fecha, m.id LIMIT 2000`,
    { usuarioId, clienteId: clienteId || null, desde: desde || null, hasta: hasta || null },
  );
  return rows.map(filaAVista);
}

/** Cargos y pagos del periodo, y pendiente acumulado (de siempre), por moneda. */
export async function resumen(usuarioId, { desde, hasta } = {}) {
  validarFecha(desde);
  validarFecha(hasta);
  const [periodo] = await pool.query(
    `SELECT moneda, tipo, SUM(monto) AS total, COUNT(*) AS cantidad FROM movimientos
      WHERE usuario_id = :usuarioId AND (:desde IS NULL OR fecha >= :desde) AND (:hasta IS NULL OR fecha <= :hasta)
      GROUP BY moneda, tipo`,
    { usuarioId, desde: desde || null, hasta: hasta || null },
  );
  const [acumulado] = await pool.query("SELECT moneda, tipo, SUM(monto) AS total FROM movimientos WHERE usuario_id = ? GROUP BY moneda, tipo", [usuarioId]);
  const out = {};
  const base = (m) => (out[m] ||= { moneda: m, cargosPeriodo: 0, pagosPeriodo: 0, cantidadPagos: 0, pendiente: 0 });
  for (const r of periodo) {
    const b = base(r.moneda);
    if (r.tipo === "cargo") b.cargosPeriodo = Number(r.total);
    else {
      b.pagosPeriodo = Number(r.total);
      b.cantidadPagos = Number(r.cantidad);
    }
  }
  for (const r of acumulado) {
    const b = base(r.moneda);
    b.pendiente += (r.tipo === "cargo" ? 1 : -1) * Number(r.total);
  }
  return Object.values(out).map((b) => ({ ...b, pendiente: Number(b.pendiente.toFixed(2)) }));
}

export async function saldoCliente(usuarioId, clienteId) {
  const [rows] = await pool.query("SELECT moneda, tipo, SUM(monto) AS total FROM movimientos WHERE usuario_id = ? AND cliente_id = ? GROUP BY moneda, tipo", [usuarioId, clienteId]);
  const saldos = {};
  for (const r of rows) saldos[r.moneda] = (saldos[r.moneda] || 0) + (r.tipo === "cargo" ? 1 : -1) * Number(r.total);
  return Object.entries(saldos).map(([moneda, saldo]) => ({ moneda, saldo: Number(saldo.toFixed(2)) }));
}

function validarMonto(monto) {
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) throw new AppError("DATOS_INVALIDOS", "El monto debe ser mayor que cero.", 400);
  return n.toFixed(2);
}

async function insertar(datos, db = pool) {
  const [r] = await db.query(
    `INSERT INTO movimientos (usuario_id, cliente_id, expediente_id, tipo, origen, origen_id, fecha, concepto, monto, moneda, medio_pago, referencia)
     VALUES (:usuarioId, :clienteId, :expedienteId, :tipo, :origen, :origenId, :fecha, :concepto, :monto, :moneda, :medioPago, :referencia)`,
    datos,
  );
  const [[fila]] = await db.query(`${SELECT} WHERE m.id = ?`, [r.insertId]);
  return filaAVista(fila);
}

export async function registrarPago(usuarioId, datos) {
  await exigirCliente(usuarioId, datos.clienteId);
  const expedienteId = await exigirExpediente(usuarioId, datos.expedienteId);
  validarFecha(datos.fecha);
  if (datos.medioPago && !MEDIOS.has(datos.medioPago)) throw new AppError("DATOS_INVALIDOS", `medioPago debe ser: ${[...MEDIOS].join(", ")}.`, 400);
  if (datos.moneda && !MONEDAS.has(datos.moneda)) throw new AppError("DATOS_INVALIDOS", "moneda debe ser ARS o USD.", 400);
  return insertar({
    usuarioId,
    clienteId: datos.clienteId,
    expedienteId,
    tipo: "pago",
    origen: "manual",
    origenId: null,
    fecha: datos.fecha || hoyLocal(),
    concepto: texto(datos.concepto, 200) || "Pago",
    monto: validarMonto(datos.monto),
    moneda: datos.moneda || "ARS",
    medioPago: datos.medioPago || "efectivo",
    referencia: texto(datos.referencia, 120) || null,
  });
}

export async function crearCargoManual(usuarioId, datos) {
  await exigirCliente(usuarioId, datos.clienteId);
  const expedienteId = await exigirExpediente(usuarioId, datos.expedienteId);
  validarFecha(datos.fecha);
  if (datos.moneda && !MONEDAS.has(datos.moneda)) throw new AppError("DATOS_INVALIDOS", "moneda debe ser ARS o USD.", 400);
  if (!String(datos.concepto || "").trim()) throw new AppError("DATOS_INVALIDOS", "El cargo necesita un concepto.", 400);
  return insertar({
    usuarioId,
    clienteId: datos.clienteId,
    expedienteId,
    tipo: "cargo",
    origen: "manual",
    origenId: null,
    fecha: datos.fecha || hoyLocal(),
    concepto: String(datos.concepto).trim().slice(0, 200),
    monto: validarMonto(datos.monto),
    moneda: datos.moneda || "ARS",
    medioPago: null,
    referencia: texto(datos.referencia, 120) || null,
  });
}

/** Solo se borran movimientos manuales; los que nacen de un presupuesto o comprobante se gestionan desde su origen. */
export async function borrar(usuarioId, id) {
  const [[m]] = await pool.query("SELECT origen FROM movimientos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (!m) throw new AppError("NO_ENCONTRADO", "El movimiento no existe.", 404);
  if (m.origen !== "manual") throw new AppError("MOVIMIENTO_AUTOMATICO", "Este movimiento nace de un presupuesto o comprobante: cambie el estado del origen en lugar de borrarlo.", 409);
  await pool.query("DELETE FROM movimientos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
}

// ---------- cargos automaticos ----------

/** Crea el cargo de un presupuesto aceptado (idempotente). Sin cliente no hay cuenta corriente: devuelve null. */
export async function cargoDesdePresupuesto(usuarioId, p, db = pool) {
  if (!p.clienteId) return null;
  const [[existe]] = await db.query("SELECT id FROM movimientos WHERE usuario_id = ? AND origen = 'presupuesto' AND origen_id = ?", [usuarioId, p.id]);
  if (existe) return existe.id;
  const [[reemplazado]] = await db.query("SELECT m.id FROM movimientos m JOIN comprobantes c ON c.id = m.origen_id WHERE m.usuario_id = ? AND m.origen = 'comprobante' AND c.presupuesto_id = ? AND c.estado = 'emitido'", [usuarioId, p.id]);
  if (reemplazado) return reemplazado.id; // ya hay un comprobante emitido sobre este presupuesto
  const mov = await insertar({
    usuarioId,
    clienteId: p.clienteId,
    expedienteId: p.expedienteId || null,
    tipo: "cargo",
    origen: "presupuesto",
    origenId: p.id,
    fecha: String(p.fecha).slice(0, 10),
    concepto: `Presupuesto N° ${p.numero}`,
    monto: Number(p.total).toFixed(2),
    moneda: p.moneda,
    medioPago: null,
    referencia: null,
  }, db);
  return mov.id;
}

export async function quitarCargoDePresupuesto(usuarioId, presupuestoId) {
  await pool.query("DELETE FROM movimientos WHERE usuario_id = ? AND origen = 'presupuesto' AND origen_id = ?", [usuarioId, presupuestoId]);
}

/** Cargo de un comprobante emitido; si venia de un presupuesto ya cargado, ese cargo pasa a apuntar al comprobante. */
export async function cargoDesdeComprobante(usuarioId, c, db = pool) {
  if (!c.clienteId) return null;
  const [[existe]] = await db.query("SELECT id FROM movimientos WHERE usuario_id = ? AND origen = 'comprobante' AND origen_id = ?", [usuarioId, c.id]);
  if (existe) return existe.id;
  if (c.presupuestoId) {
    const [r] = await db.query(
      "UPDATE movimientos SET origen = 'comprobante', origen_id = :id, cliente_id = :clienteId, expediente_id = :expedienteId, concepto = :concepto, monto = :monto, moneda = :moneda, fecha = :fecha WHERE usuario_id = :usuarioId AND origen = 'presupuesto' AND origen_id = :presupuestoId",
      { id: c.id, clienteId: c.clienteId, expedienteId: c.expedienteId || null, concepto: c.descripcion, monto: Number(c.total).toFixed(2), moneda: c.moneda, fecha: String(c.fecha).slice(0, 10), usuarioId, presupuestoId: c.presupuestoId },
    );
    if (r.affectedRows) return true;
  }
  const mov = await insertar({
    usuarioId,
    clienteId: c.clienteId,
    expedienteId: c.expedienteId || null,
    tipo: "cargo",
    origen: "comprobante",
    origenId: c.id,
    fecha: String(c.fecha).slice(0, 10),
    concepto: c.descripcion,
    monto: Number(c.total).toFixed(2),
    moneda: c.moneda,
    medioPago: null,
    referencia: null,
  }, db);
  return mov.id;
}

export async function quitarCargoDeComprobante(usuarioId, comprobanteId, db = pool) {
  await db.query("DELETE FROM movimientos WHERE usuario_id = ? AND origen = 'comprobante' AND origen_id = ?", [usuarioId, comprobanteId]);
}

/** CSV con separador ";" (Excel en es-AR) y BOM para acentos. */
export function csv(filas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["fecha", "cliente", "expediente", "tipo", "origen", "concepto", "moneda", "cargo", "pago", "medio_pago", "referencia"];
  const lineas = filas.map((m) => [m.fecha, m.clienteNombre, m.expedienteCaratula, m.tipo, m.origen, m.concepto, m.moneda, m.tipo === "cargo" ? m.monto.toFixed(2).replace(".", ",") : "", m.tipo === "pago" ? m.monto.toFixed(2).replace(".", ",") : "", m.medioPago, m.referencia].map(esc).join(";"));
  return "﻿" + [cab.join(";"), ...lineas].join("\r\n");
}
