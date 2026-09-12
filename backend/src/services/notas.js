/**
 * Notas individuales o compartidas entre las cuentas de la misma instalacion.
 * Tabla sin cifrar (ver docs/PRIVACIDAD.md, "Excepcion sin cifrar: agenda,
 * notas y biblioteca de modelos").
 */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

function filaAVista(r, usuarioId) {
  return {
    id: r.id,
    contenido: r.contenido,
    compartida: Boolean(r.compartida),
    propia: r.usuario_id === usuarioId,
    autor: r.usuario_id === usuarioId ? null : r.autor_nombre || r.autor_email,
    ejecucionId: r.ejecucion_id,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export async function listar(usuarioId) {
  const [rows] = await pool.query(
    `SELECT n.*, u.nombre AS autor_nombre, u.email AS autor_email
       FROM notas n
       JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.usuario_id = :usuarioId OR n.compartida = 1
      ORDER BY n.creado_en DESC`,
    { usuarioId },
  );
  return rows.map((r) => filaAVista(r, usuarioId));
}

export async function crear(usuarioId, datos) {
  if (typeof datos.contenido !== "string" || !datos.contenido.trim()) throw new AppError("DATOS_INVALIDOS", "La nota necesita contenido.", 400);
  const [r] = await pool.query(
    "INSERT INTO notas (usuario_id, contenido, compartida, ejecucion_id) VALUES (:usuarioId, :contenido, :compartida, :ejecucionId)",
    { usuarioId, contenido: datos.contenido.trim(), compartida: datos.compartida ? 1 : 0, ejecucionId: datos.ejecucionId ?? null },
  );
  const [[fila]] = await pool.query("SELECT n.*, u.nombre AS autor_nombre, u.email AS autor_email FROM notas n JOIN usuarios u ON u.id = n.usuario_id WHERE n.id = ?", [r.insertId]);
  return filaAVista(fila, usuarioId);
}

export async function actualizar(usuarioId, id, datos) {
  if (typeof datos.contenido !== "string" || !datos.contenido.trim()) throw new AppError("DATOS_INVALIDOS", "La nota necesita contenido.", 400);
  const [r] = await pool.query(
    "UPDATE notas SET contenido = :contenido, compartida = :compartida WHERE id = :id AND usuario_id = :usuarioId",
    { id, usuarioId, contenido: datos.contenido.trim(), compartida: datos.compartida ? 1 : 0 },
  );
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La nota no existe o no le pertenece.", 404);
  const [[fila]] = await pool.query("SELECT n.*, u.nombre AS autor_nombre, u.email AS autor_email FROM notas n JOIN usuarios u ON u.id = n.usuario_id WHERE n.id = ?", [id]);
  return filaAVista(fila, usuarioId);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM notas WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La nota no existe o no le pertenece.", 404);
}
