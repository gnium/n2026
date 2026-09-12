/**
 * Presupuestos por cliente/expediente. Los items son montos (no PII); el
 * nombre del cliente no se copia: se lee del cliente al listar o al generar el PDF.
 */
import { pool } from "../config/db.js";
import { descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";

const MONEDAS = new Set(["ARS", "USD"]);
const ESTADOS = new Set(["borrador", "enviado", "aceptado", "rechazado"]);

function filaAVista(r) {
  return {
    id: r.id,
    numero: r.numero,
    expedienteId: r.expediente_id,
    clienteId: r.cliente_id,
    clienteNombre: r.cliente_nombre ?? null,
    expedienteCaratula: r.expediente_caratula ?? null,
    fecha: r.fecha,
    moneda: r.moneda,
    items: typeof r.items === "string" ? JSON.parse(r.items) : r.items,
    total: Number(r.total),
    validezDias: r.validez_dias,
    notas: r.notas,
    estado: r.estado,
    creadoEn: r.creado_en,
  };
}

const SELECT = `SELECT p.*, c.nombre AS cliente_nombre, e.caratula AS expediente_caratula
                  FROM presupuestos p
                  LEFT JOIN clientes c ON c.id = p.cliente_id
                  LEFT JOIN expedientes e ON e.id = p.expediente_id`;

function normalizarItems(items) {
  if (!Array.isArray(items) || !items.length) throw new AppError("DATOS_INVALIDOS", "El presupuesto necesita al menos un item.", 400);
  const limpios = items.map((it) => ({ concepto: String(it?.concepto || "").trim().slice(0, 200), monto: Number(it?.monto) }));
  for (const it of limpios) {
    if (!it.concepto) throw new AppError("DATOS_INVALIDOS", "Cada item necesita un concepto.", 400);
    if (!Number.isFinite(it.monto) || it.monto < 0) throw new AppError("DATOS_INVALIDOS", `Monto invalido en "${it.concepto}".`, 400);
  }
  return limpios;
}

async function validarVinculos(usuarioId, datos) {
  const out = { expedienteId: null, clienteId: null };
  if (datos.expedienteId) {
    const [[e]] = await pool.query("SELECT id FROM expedientes WHERE id = ? AND usuario_id = ?", [datos.expedienteId, usuarioId]);
    if (!e) throw new AppError("EXPEDIENTE_INVALIDO", "El expediente no existe o no pertenece a esta cuenta.", 400);
    out.expedienteId = e.id;
  }
  if (datos.clienteId) {
    const [[c]] = await pool.query("SELECT id FROM clientes WHERE id = ? AND usuario_id = ?", [datos.clienteId, usuarioId]);
    if (!c) throw new AppError("CLIENTE_INVALIDO", "El cliente no existe o no pertenece a esta cuenta.", 400);
    out.clienteId = c.id;
  }
  return out;
}

function validarComunes(datos) {
  if (datos.moneda !== undefined && !MONEDAS.has(datos.moneda)) throw new AppError("DATOS_INVALIDOS", "moneda debe ser ARS o USD.", 400);
  if (datos.fecha && Number.isNaN(Date.parse(datos.fecha))) throw new AppError("DATOS_INVALIDOS", "fecha invalida.", 400);
  if (datos.validezDias !== undefined && !(Number.isInteger(datos.validezDias) && datos.validezDias >= 0)) throw new AppError("DATOS_INVALIDOS", "validezDias debe ser un entero.", 400);
}

export async function listar(usuarioId, { expedienteId, clienteId } = {}) {
  const [rows] = await pool.query(
    `${SELECT} WHERE p.usuario_id = :usuarioId AND (:expedienteId IS NULL OR p.expediente_id = :expedienteId) AND (:clienteId IS NULL OR p.cliente_id = :clienteId)
     ORDER BY p.numero DESC LIMIT 300`,
    { usuarioId, expedienteId: expedienteId || null, clienteId: clienteId || null },
  );
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[fila]] = await pool.query(`${SELECT} WHERE p.id = ? AND p.usuario_id = ?`, [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "El presupuesto no existe.", 404);
  return filaAVista(fila);
}

export async function crear(usuarioId, datos) {
  validarComunes(datos);
  const items = normalizarItems(datos.items);
  const vinculos = await validarVinculos(usuarioId, datos);
  const total = items.reduce((s, it) => s + it.monto, 0);
  const base = {
    usuarioId,
    ...vinculos,
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    moneda: datos.moneda || "ARS",
    items: JSON.stringify(items),
    total: total.toFixed(2),
    validezDias: datos.validezDias ?? 15,
    notas: datos.notas?.trim().slice(0, 500) || null,
  };
  // El numero es correlativo por cuenta; si dos altas simultaneas chocan, se reintenta.
  for (let intento = 0; intento < 3; intento++) {
    const [[n]] = await pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM presupuestos WHERE usuario_id = ?", [usuarioId]);
    try {
      const [r] = await pool.query(
        `INSERT INTO presupuestos (usuario_id, numero, expediente_id, cliente_id, fecha, moneda, items, total, validez_dias, notas)
         VALUES (:usuarioId, :numero, :expedienteId, :clienteId, :fecha, :moneda, :items, :total, :validezDias, :notas)`,
        { ...base, numero: n.numero },
      );
      return obtener(usuarioId, r.insertId);
    } catch (e) {
      if (e.code !== "ER_DUP_ENTRY" || intento === 2) throw e;
    }
  }
}

export async function actualizar(usuarioId, id, datos) {
  validarComunes(datos);
  const items = normalizarItems(datos.items);
  const vinculos = await validarVinculos(usuarioId, datos);
  const total = items.reduce((s, it) => s + it.monto, 0);
  const [r] = await pool.query(
    `UPDATE presupuestos SET expediente_id = :expedienteId, cliente_id = :clienteId, fecha = :fecha, moneda = :moneda, items = :items, total = :total, validez_dias = :validezDias, notas = :notas
      WHERE id = :id AND usuario_id = :usuarioId`,
    { id, usuarioId, ...vinculos, fecha: datos.fecha || new Date().toISOString().slice(0, 10), moneda: datos.moneda || "ARS", items: JSON.stringify(items), total: total.toFixed(2), validezDias: datos.validezDias ?? 15, notas: datos.notas?.trim().slice(0, 500) || null },
  );
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El presupuesto no existe.", 404);
  return obtener(usuarioId, id);
}

export async function actualizarEstado(usuarioId, id, estado) {
  if (!ESTADOS.has(estado)) throw new AppError("DATOS_INVALIDOS", `estado debe ser: ${[...ESTADOS].join(", ")}.`, 400);
  const [r] = await pool.query("UPDATE presupuestos SET estado = ? WHERE id = ? AND usuario_id = ?", [estado, id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El presupuesto no existe.", 404);
  return obtener(usuarioId, id);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM presupuestos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El presupuesto no existe.", 404);
}

/** Datos completos para el PDF: presupuesto + cliente (descifrado) + emisor. */
export async function obtenerParaPdf(usuarioId, id) {
  const presupuesto = await obtener(usuarioId, id);
  const [[emisor]] = await pool.query("SELECT nombre, email FROM usuarios WHERE id = ?", [usuarioId]);
  let cliente = null;
  if (presupuesto.clienteId) {
    const [[c]] = await pool.query("SELECT nombre, tipo, datos_cifrado FROM clientes WHERE id = ?", [presupuesto.clienteId]);
    if (c) {
      let datos = {};
      const texto = c.datos_cifrado ? descifrar(c.datos_cifrado, "cliente") : null;
      if (texto) {
        try {
          datos = JSON.parse(texto);
        } catch {
          datos = {};
        }
      }
      cliente = { nombre: c.nombre, tipo: c.tipo, ...datos };
    }
  }
  return { presupuesto, cliente, emisor: emisor || {} };
}
