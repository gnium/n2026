/**
 * Agenda de turnos. Tabla sin cifrar (ver docs/PRIVACIDAD.md, "Excepcion sin
 * cifrar: agenda, notas y biblioteca de modelos"): titulo y notas pueden
 * contener el nombre de un cliente, tipeado a mano por la escribana o el
 * escribano, no extraido de un documento por el pipeline de IA.
 */
import { pool } from "../config/db.js";
import { enviarCorreo } from "./correo.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";

const ESTADOS = new Set(["pendiente", "confirmado", "cancelado", "realizado"]);

function filaAVista(r) {
  return {
    id: r.id,
    titulo: r.titulo,
    notas: r.notas,
    fechaHora: r.fecha_hora,
    duracionMin: r.duracion_min,
    estado: r.estado,
    recordatorioMinutosAntes: r.recordatorio_minutos_antes,
    recordatorioEnviado: Boolean(r.recordatorio_enviado_en),
    ejecucionId: r.ejecucion_id,
    creadoEn: r.creado_en,
  };
}

function validarFecha(v) {
  if (!v || Number.isNaN(Date.parse(v))) throw new AppError("DATOS_INVALIDOS", "fechaHora invalida.", 400);
}

function validarDatos(datos, { completos }) {
  if (completos || datos.titulo !== undefined) {
    if (typeof datos.titulo !== "string" || !datos.titulo.trim()) throw new AppError("DATOS_INVALIDOS", "El turno necesita un titulo.", 400);
  }
  if (completos || datos.fechaHora !== undefined) validarFecha(datos.fechaHora);
  if (datos.duracionMin !== undefined && !(Number.isInteger(datos.duracionMin) && datos.duracionMin > 0)) {
    throw new AppError("DATOS_INVALIDOS", "duracionMin debe ser un entero positivo.", 400);
  }
  if (datos.recordatorioMinutosAntes !== undefined && !(Number.isInteger(datos.recordatorioMinutosAntes) && datos.recordatorioMinutosAntes >= 0)) {
    throw new AppError("DATOS_INVALIDOS", "recordatorioMinutosAntes debe ser un entero mayor o igual a 0.", 400);
  }
}

export async function listarRango(usuarioId, desde, hasta) {
  validarFecha(desde);
  validarFecha(hasta);
  const [rows] = await pool.query(
    "SELECT * FROM turnos WHERE usuario_id = ? AND fecha_hora >= ? AND fecha_hora < ? ORDER BY fecha_hora",
    [usuarioId, new Date(desde), new Date(hasta)],
  );
  return rows.map(filaAVista);
}

export async function crear(usuarioId, datos) {
  validarDatos(datos, { completos: true });
  const [r] = await pool.query(
    `INSERT INTO turnos (usuario_id, titulo, notas, fecha_hora, duracion_min, estado, recordatorio_minutos_antes, ejecucion_id)
     VALUES (:usuarioId, :titulo, :notas, :fechaHora, :duracionMin, :estado, :recordatorioMinutosAntes, :ejecucionId)`,
    {
      usuarioId,
      titulo: datos.titulo.trim(),
      notas: datos.notas?.trim() || null,
      fechaHora: new Date(datos.fechaHora),
      duracionMin: datos.duracionMin ?? 30,
      estado: ESTADOS.has(datos.estado) ? datos.estado : "pendiente",
      recordatorioMinutosAntes: datos.recordatorioMinutosAntes ?? 1440,
      ejecucionId: datos.ejecucionId ?? null,
    },
  );
  const [[fila]] = await pool.query("SELECT * FROM turnos WHERE id = ?", [r.insertId]);
  return filaAVista(fila);
}

const CAMPOS_EDITABLES = ["titulo", "notas", "fechaHora", "duracionMin", "recordatorioMinutosAntes"];

export async function actualizar(usuarioId, id, datos) {
  validarDatos(datos, { completos: false });
  const sets = [];
  const params = { id, usuarioId };
  if (datos.titulo !== undefined) {
    sets.push("titulo = :titulo");
    params.titulo = datos.titulo.trim();
  }
  if (datos.notas !== undefined) {
    sets.push("notas = :notas");
    params.notas = datos.notas?.trim() || null;
  }
  if (datos.fechaHora !== undefined) {
    sets.push("fecha_hora = :fechaHora, recordatorio_enviado_en = NULL");
    params.fechaHora = new Date(datos.fechaHora);
  }
  if (datos.duracionMin !== undefined) {
    sets.push("duracion_min = :duracionMin");
    params.duracionMin = datos.duracionMin;
  }
  if (datos.recordatorioMinutosAntes !== undefined) {
    sets.push("recordatorio_minutos_antes = :recordatorioMinutosAntes, recordatorio_enviado_en = NULL");
    params.recordatorioMinutosAntes = datos.recordatorioMinutosAntes;
  }
  if (!sets.length) throw new AppError("DATOS_INVALIDOS", `Solo se pueden editar: ${CAMPOS_EDITABLES.join(", ")}.`, 400);
  const [r] = await pool.query(`UPDATE turnos SET ${sets.join(", ")} WHERE id = :id AND usuario_id = :usuarioId`, params);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El turno no existe.", 404);
  const [[fila]] = await pool.query("SELECT * FROM turnos WHERE id = ?", [id]);
  return filaAVista(fila);
}

export async function actualizarEstado(usuarioId, id, estado) {
  if (!ESTADOS.has(estado)) throw new AppError("DATOS_INVALIDOS", `estado debe ser: ${[...ESTADOS].join(", ")}.`, 400);
  const [r] = await pool.query("UPDATE turnos SET estado = :estado WHERE id = :id AND usuario_id = :usuarioId", { id, usuarioId, estado });
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El turno no existe.", 404);
  const [[fila]] = await pool.query("SELECT * FROM turnos WHERE id = ?", [id]);
  return filaAVista(fila);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM turnos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El turno no existe.", 404);
}

/**
 * Recordatorios por email: barrido cada 5 minutos (mismo patron que el de
 * sesiones_guardadas.js, en horas). Cada turno se marca apenas se envia el
 * correo para no reenviarlo en el siguiente barrido.
 */
async function enviarRecordatoriosPendientes() {
  const [filas] = await pool.query(
    `SELECT t.id, t.titulo, t.notas, t.fecha_hora, u.email, u.nombre
       FROM turnos t
       JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.recordatorio_enviado_en IS NULL
        AND t.recordatorio_minutos_antes > 0
        AND t.estado NOT IN ('cancelado', 'realizado')
        AND t.fecha_hora >= NOW()
        AND TIMESTAMPDIFF(MINUTE, NOW(), t.fecha_hora) <= t.recordatorio_minutos_antes`,
  );
  for (const t of filas) {
    const fecha = new Date(t.fecha_hora).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
    try {
      await enviarCorreo({
        para: t.email,
        asunto: `Recordatorio de turno: ${t.titulo}`,
        texto: `Hola ${t.nombre || ""},\n\nTiene un turno agendado: "${t.titulo}" el ${fecha}.${t.notas ? `\n\nNotas: ${t.notas}` : ""}`,
      });
      await pool.query("UPDATE turnos SET recordatorio_enviado_en = NOW() WHERE id = ?", [t.id]);
    } catch (e) {
      logger.warn("Fallo el envio de un recordatorio de turno (se reintenta en el proximo barrido)", { turnoId: t.id, codigo: e.code });
    }
  }
}

const intervalo = setInterval(() => {
  enviarRecordatoriosPendientes().catch((e) => logger.warn("Fallo el barrido de recordatorios de turnos (ignorado)", { codigo: e.code }));
}, 5 * 60 * 1000);
intervalo.unref();
