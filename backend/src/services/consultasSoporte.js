/**
 * Canal de consultas de soporte: cada cuenta suscriptora puede abrir hilos
 * de consulta y el operador responde desde el panel de Operacion.
 *
 * Cada cuenta ve solo sus propias consultas. El operador (es_admin) ve todas.
 * Los mensajes son texto libre de soporte tecnico; no deben contener datos
 * de clientes ni documentos de las escribanias.
 */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

const MAX_ASUNTO = 200;
const MAX_CONTENIDO = 4000;
const limpio = (v, n) => String(v ?? "").trim().slice(0, n) || null;

function consultaAVista(r) {
  return {
    id: r.id,
    usuarioId: r.usuario_id,
    email: r.email || null,
    nombre: r.nombre_usuario || null,
    equipo: r.equipo || null,
    asunto: r.asunto,
    estado: r.estado,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
    mensajes: r._mensajes || undefined,
    sinLeer: r.sin_leer != null ? Number(r.sin_leer) : undefined,
  };
}

function mensajeAVista(r) {
  return {
    id: r.id,
    usuarioId: r.usuario_id,
    email: r.email || null,
    nombre: r.nombre || null,
    esAdmin: Boolean(r.es_admin),
    contenido: r.contenido,
    leido: Boolean(r.leido),
    creadoEn: r.creado_en,
  };
}

/** Consultas propias de una cuenta (suscriptora). */
export async function listarMias(usuarioId) {
  const [rows] = await pool.query(
    `SELECT c.id, c.usuario_id, c.asunto, c.estado, c.creado_en, c.actualizado_en,
            (SELECT COUNT(*) FROM mensajes_soporte m WHERE m.consulta_id = c.id AND m.leido = 0 AND m.usuario_id <> ?) AS sin_leer
       FROM consultas_soporte c
      WHERE c.usuario_id = ?
      ORDER BY c.actualizado_en DESC
      LIMIT 100`,
    [usuarioId, usuarioId],
  );
  return rows.map(consultaAVista);
}

/** Todas las consultas (para el operador). */
export async function listarTodas({ estado, q } = {}) {
  const filtroEstado = estado ? "AND c.estado = :estado" : "";
  const filtroQ = q ? "AND (u.email LIKE :like OR u.nombre LIKE :like OR c.asunto LIKE :like)" : "";
  const busqueda = String(q || "").trim().slice(0, 100);
  const [rows] = await pool.query(
    `SELECT c.id, c.usuario_id, u.email, u.nombre AS nombre_usuario, e.nombre AS equipo,
            c.asunto, c.estado, c.creado_en, c.actualizado_en,
            (SELECT COUNT(*) FROM mensajes_soporte m WHERE m.consulta_id = c.id AND m.leido = 0 AND m.usuario_id <> c.usuario_id) AS sin_leer
       FROM consultas_soporte c
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN equipo_miembros em ON em.usuario_id = c.usuario_id
       LEFT JOIN equipos e ON e.id = em.equipo_id
      WHERE 1=1 ${filtroEstado} ${filtroQ}
      ORDER BY (c.estado = 'abierta') DESC, c.actualizado_en DESC
      LIMIT 200`,
    { estado, like: `%${busqueda}%` },
  );
  return rows.map(consultaAVista);
}

/** Contador de consultas abiertas sin responder (para el badge del operador). */
export async function contarAbiertas() {
  const [[r]] = await pool.query(
    "SELECT COUNT(*) AS n FROM consultas_soporte WHERE estado = 'abierta'",
  );
  return Number(r.n);
}

/** Contador de mensajes sin leer para el suscriptor. */
export async function contarSinLeer(usuarioId) {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS n FROM mensajes_soporte m
       JOIN consultas_soporte c ON c.id = m.consulta_id
      WHERE c.usuario_id = ? AND m.usuario_id <> ? AND m.leido = 0`,
    [usuarioId, usuarioId],
  );
  return Number(r.n);
}

/** Detalle de una consulta con todos sus mensajes. */
export async function obtener(consultaId, usuarioId, esAdmin) {
  const [[c]] = await pool.query(
    `SELECT c.id, c.usuario_id, u.email, u.nombre AS nombre_usuario, e.nombre AS equipo,
            c.asunto, c.estado, c.creado_en, c.actualizado_en
       FROM consultas_soporte c
       JOIN usuarios u ON u.id = c.usuario_id
       LEFT JOIN equipo_miembros em ON em.usuario_id = c.usuario_id
       LEFT JOIN equipos e ON e.id = em.equipo_id
      WHERE c.id = ?`,
    [consultaId],
  );
  if (!c) throw new AppError("NO_ENCONTRADO", "La consulta no existe.", 404);
  if (!esAdmin && c.usuario_id !== usuarioId) throw new AppError("NO_AUTORIZADO", "No tiene permiso para ver esta consulta.", 403);

  const [msgs] = await pool.query(
    `SELECT m.id, m.usuario_id, u.email, u.nombre, u.es_admin, m.contenido, m.leido, m.creado_en
       FROM mensajes_soporte m
       JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.consulta_id = ?
      ORDER BY m.creado_en`,
    [consultaId],
  );

  // Marcar como leidos los mensajes de la otra parte.
  await pool.query(
    "UPDATE mensajes_soporte SET leido = 1 WHERE consulta_id = ? AND usuario_id <> ? AND leido = 0",
    [consultaId, usuarioId],
  );

  const vista = consultaAVista(c);
  vista.mensajes = msgs.map(mensajeAVista);
  return vista;
}

/** Abre una consulta nueva con el primer mensaje. */
export async function crear(usuarioId, { asunto, contenido }) {
  const as = limpio(asunto, MAX_ASUNTO);
  const ct = limpio(contenido, MAX_CONTENIDO);
  if (!as) throw new AppError("DATOS_INVALIDOS", "Ingrese un asunto para la consulta.", 400);
  if (!ct) throw new AppError("DATOS_INVALIDOS", "Escriba su consulta.", 400);

  const [r] = await pool.query(
    "INSERT INTO consultas_soporte (usuario_id, asunto) VALUES (?, ?)",
    [usuarioId, as],
  );
  await pool.query(
    "INSERT INTO mensajes_soporte (consulta_id, usuario_id, contenido) VALUES (?, ?, ?)",
    [r.insertId, usuarioId, ct],
  );
  return obtener(r.insertId, usuarioId, false);
}

/** Agrega un mensaje a una consulta existente. */
export async function responder(consultaId, usuarioId, esAdmin, { contenido }) {
  const ct = limpio(contenido, MAX_CONTENIDO);
  if (!ct) throw new AppError("DATOS_INVALIDOS", "Escriba un mensaje.", 400);

  const [[c]] = await pool.query("SELECT usuario_id, estado FROM consultas_soporte WHERE id = ?", [consultaId]);
  if (!c) throw new AppError("NO_ENCONTRADO", "La consulta no existe.", 404);
  if (!esAdmin && c.usuario_id !== usuarioId) throw new AppError("NO_AUTORIZADO", "No tiene permiso para responder a esta consulta.", 403);
  if (c.estado === "cerrada") throw new AppError("CONSULTA_CERRADA", "Esta consulta ya esta cerrada.", 400);

  await pool.query(
    "INSERT INTO mensajes_soporte (consulta_id, usuario_id, contenido) VALUES (?, ?, ?)",
    [consultaId, usuarioId, ct],
  );

  const nuevoEstado = esAdmin ? "respondida" : "abierta";
  await pool.query("UPDATE consultas_soporte SET estado = ? WHERE id = ?", [nuevoEstado, consultaId]);

  return obtener(consultaId, usuarioId, esAdmin);
}

/** El operador cierra una consulta. */
export async function cerrar(consultaId) {
  const [r] = await pool.query("UPDATE consultas_soporte SET estado = 'cerrada' WHERE id = ? AND estado <> 'cerrada'", [consultaId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La consulta no existe o ya esta cerrada.", 404);
  return { ok: true };
}

/** El operador reabre una consulta cerrada. */
export async function reabrir(consultaId) {
  const [r] = await pool.query("UPDATE consultas_soporte SET estado = 'abierta' WHERE id = ? AND estado = 'cerrada'", [consultaId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La consulta no existe o no esta cerrada.", 404);
  return { ok: true };
}
