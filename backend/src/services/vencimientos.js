import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { sumarDiasHabiles, contarDiasHabiles } from "./feriados.js";
import { contexto } from "./equipo.js";

const SELECT = `SELECT v.*, e.caratula AS expediente_caratula
                  FROM vencimientos v
                  LEFT JOIN expedientes e ON e.id = v.expediente_id`;

function filaAVista(r) {
  return {
    id: r.id,
    usuarioId: r.usuario_id,
    tipo: r.tipo,
    descripcion: r.descripcion,
    fechaOrigen: r.fecha_origen,
    fechaVencimiento: r.fecha_vencimiento,
    estado: r.estado,
    expedienteId: r.expediente_id,
    presupuestoId: r.presupuesto_id,
    ddjjId: r.ddjj_id,
    expedienteCaratula: r.expediente_caratula ?? null,
    googleEventoId: r.google_evento_id || null,
    googleSincronizadoEn: r.google_sincronizado_en,
    notificado: Boolean(r.notificado),
    completadoEn: r.completado_en,
    creadoEn: r.creado_en,
  };
}

async function aGoogle(usuarioId, venc) {
  try {
    const { sincronizarVencimiento } = await import("./google.js");
    if (sincronizarVencimiento) await sincronizarVencimiento(usuarioId, venc);
  } catch { /* Google Calendar no configurado */ }
}

async function borrarDeGoogle(usuarioId, googleEventoId) {
  try {
    const { borrarEventoDeVencimiento } = await import("./google.js");
    if (borrarEventoDeVencimiento) await borrarEventoDeVencimiento(usuarioId, googleEventoId);
  } catch { /* Google Calendar no configurado */ }
}

export async function listar(usuarioId, { expedienteId, estado, desde, hasta } = {}) {
  const where = ["v.usuario_id = ?"];
  const params = [usuarioId];
  if (expedienteId) {
    where.push("v.expediente_id = ?");
    params.push(expedienteId);
  }
  if (estado) {
    where.push("v.estado = ?");
    params.push(estado);
  }
  if (desde) {
    where.push("v.fecha_vencimiento >= ?");
    params.push(desde);
  }
  if (hasta) {
    where.push("v.fecha_vencimiento <= ?");
    params.push(hasta);
  }
  const [rows] = await pool.query(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY v.fecha_vencimiento LIMIT 300`,
    params,
  );
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[fila]] = await pool.query(`${SELECT} WHERE v.id = ? AND v.usuario_id = ?`, [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "El vencimiento no existe.", 404);
  return filaAVista(fila);
}

export async function crear(usuarioId, datos) {
  if (!datos.tipo || !datos.descripcion || !datos.fechaOrigen || !datos.fechaVencimiento) {
    throw new AppError("DATOS_INVALIDOS", "tipo, descripcion, fechaOrigen y fechaVencimiento son obligatorios.", 400);
  }
  const [r] = await pool.query(
    `INSERT INTO vencimientos (usuario_id, tipo, descripcion, fecha_origen, fecha_vencimiento, expediente_id, presupuesto_id, ddjj_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuarioId, datos.tipo, datos.descripcion.trim(), datos.fechaOrigen, datos.fechaVencimiento, datos.expedienteId || null, datos.presupuestoId || null, datos.ddjjId || null],
  );
  const venc = await obtener(usuarioId, r.insertId);
  aGoogle(usuarioId, venc).catch(() => {});
  return venc;
}

export async function completar(usuarioId, id) {
  const [[previo]] = await pool.query("SELECT google_evento_id FROM vencimientos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (!previo) throw new AppError("NO_ENCONTRADO", "El vencimiento no existe.", 404);
  await pool.query("UPDATE vencimientos SET estado = 'completado', completado_en = NOW() WHERE id = ?", [id]);
  if (previo.google_evento_id) {
    borrarDeGoogle(usuarioId, previo.google_evento_id).catch(() => {});
  }
  return obtener(usuarioId, id);
}

export async function borrar(usuarioId, id) {
  const [[previo]] = await pool.query("SELECT google_evento_id FROM vencimientos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  const [r] = await pool.query("DELETE FROM vencimientos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El vencimiento no existe.", 404);
  if (previo?.google_evento_id) {
    borrarDeGoogle(usuarioId, previo.google_evento_id).catch(() => {});
  }
}

export async function listarRango(usuarioId, desde, hasta) {
  const [rows] = await pool.query(
    `${SELECT} WHERE v.usuario_id = ? AND v.fecha_vencimiento BETWEEN ? AND ? ORDER BY v.fecha_vencimiento`,
    [usuarioId, desde, hasta],
  );
  const ctx = await contexto(usuarioId);
  const jur = ctx.jurisdiccion || "salta";
  const hoy = new Date().toISOString().slice(0, 10);
  const vistas = rows.map(filaAVista);
  await Promise.all(vistas.map(async (v) => {
    if (v.estado === "completado") { v.diasHabilesRestantes = null; return; }
    const fv = String(v.fechaVencimiento).slice(0, 10);
    if (fv <= hoy) { v.diasHabilesRestantes = 0; return; }
    v.diasHabilesRestantes = await contarDiasHabiles(hoy, fv, jur);
  }));
  return vistas;
}

const ACTOS_CON_CERTIFICADOS = new Set(["compraventa", "donacion", "hipoteca"]);

export async function crearDesdePresupuesto(usuarioId, presupuesto) {
  const ctx = await contexto(usuarioId);
  const jur = ctx.jurisdiccion || "salta";
  const fechaOrigen = presupuesto.fecha || new Date().toISOString().slice(0, 10);
  const creados = [];

  if (ACTOS_CON_CERTIFICADOS.has(presupuesto.tipoActo)) {
    const [[existeDom]] = await pool.query(
      "SELECT 1 FROM vencimientos WHERE presupuesto_id = ? AND tipo = 'certificado_dominio'",
      [presupuesto.id],
    );
    if (!existeDom) {
      const fv = await sumarDiasHabiles(fechaOrigen, 15, jur);
      creados.push(await crear(usuarioId, {
        tipo: "certificado_dominio",
        descripcion: "Certificado de dominio",
        fechaOrigen,
        fechaVencimiento: fv,
        expedienteId: presupuesto.expedienteId,
        presupuestoId: presupuesto.id,
      }));
    }

    const [[existeInh]] = await pool.query(
      "SELECT 1 FROM vencimientos WHERE presupuesto_id = ? AND tipo = 'certificado_inhibiciones'",
      [presupuesto.id],
    );
    if (!existeInh) {
      const fv = await sumarDiasHabiles(fechaOrigen, 15, jur);
      creados.push(await crear(usuarioId, {
        tipo: "certificado_inhibiciones",
        descripcion: "Certificado de inhibiciones",
        fechaOrigen,
        fechaVencimiento: fv,
        expedienteId: presupuesto.expedienteId,
        presupuestoId: presupuesto.id,
      }));
    }
  }

  const tieneDgi = (presupuesto.items || []).some((it) => it.categoria === "inscripcion_dgi" || /inscripci[oó]n.*dgi/i.test(it.concepto));
  if (tieneDgi) {
    const [[existeDgi]] = await pool.query(
      "SELECT 1 FROM vencimientos WHERE presupuesto_id = ? AND tipo = 'inscripcion_dgi'",
      [presupuesto.id],
    );
    if (!existeDgi) {
      const fv = await sumarDiasHabiles(fechaOrigen, 30, jur);
      creados.push(await crear(usuarioId, {
        tipo: "inscripcion_dgi",
        descripcion: "Inscripción DGI (Inmuebles)",
        fechaOrigen,
        fechaVencimiento: fv,
        expedienteId: presupuesto.expedienteId,
        presupuestoId: presupuesto.id,
      }));
    }
  }

  return creados;
}

export async function crearDesdeDdjj(usuarioId, ddjj) {
  const [[existe]] = await pool.query(
    "SELECT 1 FROM vencimientos WHERE ddjj_id = ? AND tipo = 'ddjj_sellos'",
    [ddjj.id],
  );
  if (existe) return null;

  const ctx = await contexto(usuarioId);
  const jur = ctx.jurisdiccion || ddjj.jurisdiccion || "salta";
  const fechaOrigen = ddjj.fechaActo || new Date().toISOString().slice(0, 10);
  const fv = await sumarDiasHabiles(fechaOrigen, 15, jur);

  return crear(usuarioId, {
    tipo: "ddjj_sellos",
    descripcion: `DDJJ Sellos - ${ddjj.formulario || "F06W"}`,
    fechaOrigen,
    fechaVencimiento: fv,
    expedienteId: ddjj.expedienteId || null,
    ddjjId: ddjj.id,
  });
}

async function actualizarEstados() {
  await pool.query(
    `UPDATE vencimientos SET estado = 'vencido'
      WHERE estado IN ('vigente','por_vencer') AND fecha_vencimiento < CURDATE()`,
  );
  await pool.query(
    `UPDATE vencimientos SET estado = 'por_vencer'
      WHERE estado = 'vigente' AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
  );
}

export function programarActualizacionEstados() {
  setTimeout(() => {
    actualizarEstados().catch((e) => logger.warn("Fallo la actualización inicial de estados de vencimientos", { codigo: e.code }));
    const intervalo = setInterval(() => {
      actualizarEstados().catch((e) => logger.warn("Fallo la actualización de estados de vencimientos (ignorado)", { codigo: e.code }));
    }, 60 * 60 * 1000);
    intervalo.unref();
  }, 30_000).unref();
}
