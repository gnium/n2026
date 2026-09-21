/**
 * Borrado definitivo de una cuenta y de TODO su contenido.
 *
 * Por que existe: la promesa del producto es que el dato de una escribania no
 * queda alojado mas alla de lo necesario. Si una prueba vence y no hay
 * suscripcion, conservar clientes, expedientes, protocolo y comprobantes
 * "por si vuelve" seria guardar datos personales de terceros sin ninguna base
 * para hacerlo. Por eso se borran, no se archivan.
 *
 * Como borra, sin tener que mantener a mano una lista de tablas:
 *   1. Averigua en information_schema que tablas tienen `usuario_id`.
 *   2. Las que NO tienen una clave foranea ON DELETE CASCADE contra
 *      `usuarios` se borran a mano (hoy: `ejecuciones`, `mp_eventos`).
 *   3. `DELETE FROM usuarios` arrastra por cascada todo el resto, incluidas
 *      las tablas hijas (partes de expedientes, tareas, fichas UIF...).
 * Asi, una tabla nueva con `usuario_id` queda cubierta desde el dia uno, con
 * o sin clave foranea.
 *
 * Lo unico que sobrevive es una fila en `cuentas_eliminadas` con el sha256 del
 * correo: alcanza para responder "esa cuenta se borro tal dia" sin conservar
 * el correo en claro.
 */
import { pool } from "../config/db.js";
import { sha256, invalidarCache } from "../auth/repositorio.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";

/** Todas las tablas con `usuario_id` (para contar cuanto se borro). */
async function tablasConUsuario() {
  const [rows] = await pool.query(
    "SELECT table_name AS tabla FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'usuario_id' AND table_name <> 'usuarios'",
  );
  return rows.map((r) => r.tabla);
}

/** Tablas con `usuario_id` que NO se borran solas por cascada al borrar la fila de usuarios. */
async function tablasSinCascada() {
  const [rows] = await pool.query(
    `SELECT c.table_name AS tabla
       FROM information_schema.columns c
       LEFT JOIN information_schema.key_column_usage k
         ON k.table_schema = c.table_schema AND k.table_name = c.table_name
        AND k.column_name = c.column_name AND k.referenced_table_name = 'usuarios'
       LEFT JOIN information_schema.referential_constraints r
         ON r.constraint_schema = k.table_schema AND r.constraint_name = k.constraint_name
        AND r.delete_rule = 'CASCADE'
      WHERE c.table_schema = DATABASE() AND c.column_name = 'usuario_id' AND c.table_name <> 'usuarios'
        AND r.constraint_name IS NULL`,
  );
  return rows.map((r) => r.tabla);
}

/**
 * Borra la cuenta `id` y todo lo suyo. `motivo` queda en la constancia.
 * Devuelve cuantas filas se borraron en total (para el registro de operacion).
 *
 * Nota sobre equipos: si la cuenta era la titular, el equipo desaparece con
 * ella (clave foranea en cascada) y quienes lo integraban quedan sin equipo.
 * Sus cuentas y sus propios datos NO se tocan: cada cuenta es duena de lo suyo.
 */
export async function eliminarCuenta(id, motivo = "prueba_vencida") {
  const usuarioId = Number(id);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) throw new AppError("DATOS_INVALIDOS", "Identificador de cuenta invalido.", 400);
  const [[u]] = await pool.query("SELECT id, email, es_admin FROM usuarios WHERE id = ?", [usuarioId]);
  if (!u) throw new AppError("NO_ENCONTRADO", "La cuenta no existe.", 404);
  if (u.es_admin) throw new AppError("DATOS_INVALIDOS", "No se borra la cuenta operadora de la plataforma.", 400);

  const sueltas = await tablasSinCascada();
  // Se cuenta ANTES de borrar: lo que se va por cascada no vuelve como
  // `affectedRows`, y el panel informa cuantos registros se eliminaron.
  let filas = 1; // la propia fila de usuarios
  for (const tabla of await tablasConUsuario()) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${tabla}\` WHERE usuario_id = ?`, [usuarioId]);
    filas += n;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const tabla of sueltas) {
      await conn.query(`DELETE FROM \`${tabla}\` WHERE usuario_id = ?`, [usuarioId]);
    }
    // La invitacion con la que se dio de alta guarda su correo y su nombre: es
    // dato personal y se va con la cuenta (la clave foranea solo lo desvincula).
    await conn.query("DELETE FROM invitaciones_plataforma WHERE usuario_id = ? OR email = ?", [usuarioId, u.email]);
    await conn.query("DELETE FROM usuarios WHERE id = ? AND es_admin = 0", [usuarioId]);
    await conn.query("INSERT INTO cuentas_eliminadas (usuario_id, email_hash, motivo, filas) VALUES (?, ?, ?, ?)", [usuarioId, sha256(u.email), String(motivo).slice(0, 40), filas]);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  invalidarCache(usuarioId);
  // Sin correo ni nombre en el log: la cuenta se borro, el registro no la resucita.
  logger.info("Cuenta eliminada definitivamente", { cantidad: usuarioId, motivo, filas });
  return { usuarioId, filas, motivo };
}
