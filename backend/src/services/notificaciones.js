import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

export async function listar(usuarioId) {
  const [rows] = await pool.query(
    `SELECT id, titulo, mensaje, tipo, creado_en,
            JSON_CONTAINS(COALESCE(leida_por, '[]'), CAST(? AS JSON)) AS leida
       FROM notificaciones
      WHERE (destinatario_id IS NULL OR destinatario_id = ?)
        AND creado_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY creado_en DESC
      LIMIT 50`,
    [String(usuarioId), usuarioId],
  );
  return rows.map((r) => ({ ...r, leida: !!r.leida }));
}

export async function sinLeer(usuarioId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM notificaciones
      WHERE (destinatario_id IS NULL OR destinatario_id = ?)
        AND NOT JSON_CONTAINS(COALESCE(leida_por, '[]'), CAST(? AS JSON))
        AND creado_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [usuarioId, String(usuarioId)],
  );
  return row.total;
}

export async function marcarLeida(usuarioId, notificacionId) {
  const [[notif]] = await pool.query(
    `SELECT id, leida_por FROM notificaciones WHERE id = ? AND (destinatario_id IS NULL OR destinatario_id = ?)`,
    [notificacionId, usuarioId],
  );
  if (!notif) throw new AppError("NOTIF_NO_ENCONTRADA", "Notificación no encontrada", 404);
  const arr = notif.leida_por ? JSON.parse(notif.leida_por) : [];
  if (arr.includes(usuarioId)) return;
  await pool.query(
    `UPDATE notificaciones SET leida_por = JSON_ARRAY_APPEND(COALESCE(leida_por, '[]'), '$', ?) WHERE id = ?`,
    [usuarioId, notificacionId],
  );
}

export async function marcarTodasLeidas(usuarioId) {
  await pool.query(
    `UPDATE notificaciones
        SET leida_por = JSON_ARRAY_APPEND(COALESCE(leida_por, '[]'), '$', ?)
      WHERE (destinatario_id IS NULL OR destinatario_id = ?)
        AND NOT JSON_CONTAINS(COALESCE(leida_por, '[]'), CAST(? AS JSON))
        AND creado_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [usuarioId, usuarioId, String(usuarioId)],
  );
}

export async function crear(adminId, { titulo, mensaje, tipo = "info", destinatarioId = null }) {
  if (!titulo?.trim()) throw new AppError("CAMPO_REQUERIDO", "El título es obligatorio", 400);
  if (!mensaje?.trim()) throw new AppError("CAMPO_REQUERIDO", "El mensaje es obligatorio", 400);
  if (!["info", "alerta", "novedad"].includes(tipo)) throw new AppError("TIPO_INVALIDO", "Tipo inválido", 400);
  const [result] = await pool.query(
    `INSERT INTO notificaciones (titulo, mensaje, tipo, destinatario_id, creado_por) VALUES (?, ?, ?, ?, ?)`,
    [titulo.trim(), mensaje.trim(), tipo, destinatarioId || null, adminId],
  );
  return { id: result.insertId };
}

export async function listarAdmin() {
  const [rows] = await pool.query(
    `SELECT n.id, n.titulo, n.mensaje, n.tipo, n.destinatario_id, n.creado_en,
            u.email AS destinatario_email
       FROM notificaciones n
       LEFT JOIN usuarios u ON u.id = n.destinatario_id
      ORDER BY n.creado_en DESC
      LIMIT 100`,
  );
  return rows;
}

export async function borrar(id) {
  const [result] = await pool.query(`DELETE FROM notificaciones WHERE id = ?`, [id]);
  if (!result.affectedRows) throw new AppError("NOTIF_NO_ENCONTRADA", "Notificación no encontrada", 404);
}
