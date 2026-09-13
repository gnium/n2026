/**
 * Equipo de la escribania. Modelo: cuentas separadas con compartir puntual
 * (ver database/13_equipo.sql). Cada cuenta sigue siendo duena de sus datos;
 * el equipo solo define roles, invitaciones, que se comparte y las metricas
 * agregadas que ve la titular.
 *
 * Roles:
 *   titular   - administra la instalacion (IA, precios, planes, parametros UIF) y el equipo.
 *   escribano - todo su trabajo: protocolo, caja, comprobantes y UIF incluidos.
 *   empleado  - clientes, expedientes, tareas, agenda, notas y biblioteca; sin
 *               protocolo, sin caja/comprobantes y sin legajos UIF.
 *
 * Una cuenta sin equipo se comporta como 'escribano' sobre sus propios datos:
 * las instalaciones de una sola escribana o escribano no cambian en nada.
 */
import { randomBytes } from "node:crypto";
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";
import { env } from "../config/env.js";
import { enviarCorreo } from "./correo.js";
import { sha256 } from "../auth/repositorio.js";
import { logger } from "../utils/logger.js";

export const ROLES = ["titular", "escribano", "empleado"];
const RANGO = { empleado: 1, escribano: 2, titular: 3 };
const DIAS_INVITACION = 7;

/** Rol efectivo y equipo de una cuenta. Sin equipo: 'escribano' (o 'titular' si es la administradora). */
export async function contexto(usuarioId) {
  const [[r]] = await pool.query(
    `SELECT u.id, u.email, u.nombre, u.activo, u.es_admin, m.equipo_id, m.rol, m.estado, e.nombre AS equipo_nombre, e.titular_usuario_id
       FROM usuarios u
       LEFT JOIN equipo_miembros m ON m.usuario_id = u.id
       LEFT JOIN equipos e ON e.id = m.equipo_id
      WHERE u.id = ?`,
    [usuarioId],
  );
  if (!r || !r.activo) throw new AppError("NO_AUTENTICADO", "Sesion invalida.", 401);
  const suspendido = r.estado === "suspendido";
  const retirado = r.estado === "retirado";
  // Quien queda suspendido o sale del equipo NO recupera permisos: pasa a empleado.
  // (Una cuenta que nunca tuvo equipo es 'escribano' sobre sus propios datos.)
  const rol = r.es_admin ? "titular" : suspendido || retirado ? "empleado" : r.rol || "escribano";
  return {
    usuarioId: r.id,
    email: r.email,
    nombre: r.nombre,
    esAdmin: Boolean(r.es_admin),
    equipoId: retirado ? null : r.equipo_id || null,
    equipoNombre: retirado ? null : r.equipo_nombre || null,
    rol,
    suspendido,
    retirado,
    esTitular: rol === "titular",
  };
}

export const alcanza = (rol, minimo) => (RANGO[rol] || 0) >= (RANGO[minimo] || 0);

/** Cuentas cuyo contenido compartido (notas y turnos del equipo) ve esta cuenta. Siempre incluye la propia. */
export async function idsDelEquipo(usuarioId) {
  const [rows] = await pool.query(
    `SELECT m2.usuario_id FROM equipo_miembros m1
       JOIN equipo_miembros m2 ON m2.equipo_id = m1.equipo_id AND m2.estado = 'activo'
       JOIN usuarios u ON u.id = m2.usuario_id AND u.activo = 1
      WHERE m1.usuario_id = ? AND m1.estado = 'activo'`,
    [usuarioId],
  );
  const ids = rows.map((r) => Number(r.usuario_id));
  return ids.length ? ids : [Number(usuarioId)];
}

async function exigirTitular(usuarioId) {
  const ctx = await contexto(usuarioId);
  if (!ctx.equipoId) throw new AppError("SIN_EQUIPO", "Todavia no hay un equipo creado.", 404);
  if (!ctx.esTitular) throw new AppError("PROHIBIDO", "Solo la titular del equipo puede hacer esto.", 403);
  return ctx;
}

const miembroAVista = (r) => ({
  usuarioId: r.usuario_id,
  nombre: r.nombre,
  email: r.email,
  rol: r.rol,
  estado: r.estado,
  activo: Boolean(r.activo),
  ultimoAcceso: r.ultimo_acceso,
  desde: r.creado_en,
});

/** Equipo de la cuenta con sus integrantes e invitaciones pendientes (estas ultimas, solo para la titular). */
export async function obtener(usuarioId) {
  const ctx = await contexto(usuarioId);
  if (!ctx.equipoId) return { existe: false, rol: ctx.rol, miembros: [], invitaciones: [], nombre: null, esTitular: ctx.esAdmin };
  const [miembros] = await pool.query(
    `SELECT m.*, u.nombre, u.email, u.activo, u.ultimo_acceso
       FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.equipo_id = ? AND m.estado <> 'retirado' ORDER BY FIELD(m.rol, 'titular', 'escribano', 'empleado'), u.nombre, u.email`,
    [ctx.equipoId],
  );
  let invitaciones = [];
  if (ctx.esTitular) {
    const [rows] = await pool.query(
      "SELECT id, email, rol, expira_en, creado_en FROM equipo_invitaciones WHERE equipo_id = ? AND aceptada_en IS NULL AND cancelada_en IS NULL AND expira_en > NOW() ORDER BY creado_en DESC",
      [ctx.equipoId],
    );
    invitaciones = rows.map((r) => ({ id: r.id, email: r.email, rol: r.rol, expiraEn: r.expira_en, creadoEn: r.creado_en }));
  }
  return { existe: true, id: ctx.equipoId, nombre: ctx.equipoNombre, rol: ctx.rol, esTitular: ctx.esTitular, miembros: miembros.map(miembroAVista), invitaciones };
}

/** Crea el equipo de esta cuenta (queda como titular). Solo si todavia no pertenece a ninguno. */
export async function crear(usuarioId, nombre) {
  const ctx = await contexto(usuarioId);
  if (ctx.equipoId) throw new AppError("YA_TIENE_EQUIPO", "La cuenta ya pertenece a un equipo.", 409);
  const limpio = String(nombre || "").trim().slice(0, 160);
  if (!limpio) throw new AppError("DATOS_INVALIDOS", "El equipo necesita un nombre.", 400);
  const [r] = await pool.query("INSERT INTO equipos (nombre, titular_usuario_id) VALUES (?, ?)", [limpio, usuarioId]);
  await pool.query("INSERT INTO equipo_miembros (usuario_id, equipo_id, rol) VALUES (?, ?, 'titular')", [usuarioId, r.insertId]);
  return obtener(usuarioId);
}

export async function renombrar(usuarioId, nombre) {
  const ctx = await exigirTitular(usuarioId);
  const limpio = String(nombre || "").trim().slice(0, 160);
  if (!limpio) throw new AppError("DATOS_INVALIDOS", "El equipo necesita un nombre.", 400);
  await pool.query("UPDATE equipos SET nombre = ? WHERE id = ?", [limpio, ctx.equipoId]);
  return obtener(usuarioId);
}

/** Invita por correo. Devuelve el enlace para poder copiarlo si no hay SMTP configurado. */
export async function invitar(usuarioId, { email, rol }) {
  const ctx = await exigirTitular(usuarioId);
  const destino = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino) || destino.length > 190) throw new AppError("DATOS_INVALIDOS", "Ingrese un correo valido.", 400);
  if (!["escribano", "empleado"].includes(rol)) throw new AppError("DATOS_INVALIDOS", "rol debe ser escribano o empleado.", 400);
  const [[yaMiembro]] = await pool.query(
    "SELECT m.usuario_id FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE u.email = ? AND m.equipo_id = ?",
    [destino, ctx.equipoId],
  );
  if (yaMiembro) throw new AppError("YA_ES_MIEMBRO", "Esa cuenta ya forma parte del equipo.", 409);
  await pool.query("UPDATE equipo_invitaciones SET cancelada_en = NOW() WHERE equipo_id = ? AND email = ? AND aceptada_en IS NULL AND cancelada_en IS NULL", [ctx.equipoId, destino]);
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO equipo_invitaciones (equipo_id, email, rol, token_hash, invitado_por, expira_en) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
    [ctx.equipoId, destino, rol, sha256(token), usuarioId, DIAS_INVITACION],
  );
  const enlace = `${env.appUrl}/?invitacion=${token}`;
  const texto = `${ctx.nombre || ctx.email} lo invita a sumarse a "${ctx.equipoNombre}" en Doy Fe como ${rol}.\n\nPara aceptar, abra este enlace e ingrese (o cree su cuenta con este mismo correo):\n${enlace}\n\nLa invitacion vence en ${DIAS_INVITACION} dias. Si no esperaba este correo, ignorelo.`;
  const { enviado } = await enviarCorreo({
    para: destino,
    asunto: `Invitacion a ${ctx.equipoNombre} en Doy Fe`,
    texto,
    html: `<p>${ctx.nombre || ctx.email} lo invita a sumarse a <b>${ctx.equipoNombre}</b> en Doy Fe como <b>${rol}</b>.</p><p><a href="${enlace}">Aceptar la invitacion</a></p><p>Vence en ${DIAS_INVITACION} dias.</p>`,
  });
  // El enlace lleva el token en claro: solo se devuelve si no se pudo enviar el correo.
  return { enviado, enlace: enviado ? null : enlace, email: destino, rol, equipo: await obtener(usuarioId) };
}

export async function cancelarInvitacion(usuarioId, id) {
  const ctx = await exigirTitular(usuarioId);
  const [r] = await pool.query("UPDATE equipo_invitaciones SET cancelada_en = NOW() WHERE id = ? AND equipo_id = ? AND aceptada_en IS NULL", [id, ctx.equipoId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La invitacion no existe.", 404);
  return obtener(usuarioId);
}

/** Datos publicos de una invitacion, para mostrarlos antes de pedir el ingreso. */
export async function verInvitacion(token) {
  const [[r]] = await pool.query(
    `SELECT i.email, i.rol, i.expira_en, e.nombre AS equipo
       FROM equipo_invitaciones i JOIN equipos e ON e.id = i.equipo_id
      WHERE i.token_hash = ? AND i.aceptada_en IS NULL AND i.cancelada_en IS NULL AND i.expira_en > NOW()`,
    [sha256(String(token || ""))],
  );
  if (!r) return null;
  return { email: r.email, rol: r.rol, equipo: r.equipo, expiraEn: r.expira_en };
}

/**
 * Acepta la invitacion con la cuenta autenticada. El correo de la invitacion
 * debe coincidir con el de la cuenta: asi un enlace reenviado no suma a otra persona.
 */
export async function aceptarInvitacion(usuarioId, token) {
  const hash = sha256(String(token || ""));
  const [[inv]] = await pool.query(
    "SELECT id, equipo_id, email, rol FROM equipo_invitaciones WHERE token_hash = ? AND aceptada_en IS NULL AND cancelada_en IS NULL AND expira_en > NOW()",
    [hash],
  );
  if (!inv) throw new AppError("INVITACION_INVALIDA", "La invitacion no existe, ya fue usada o vencio.", 404);
  const [[u]] = await pool.query("SELECT id, email FROM usuarios WHERE id = ?", [usuarioId]);
  if (!u || u.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw new AppError("INVITACION_OTRO_CORREO", `La invitacion es para ${inv.email}. Ingrese con esa cuenta para aceptarla.`, 403);
  }
  const [[actual]] = await pool.query("SELECT equipo_id FROM equipo_miembros WHERE usuario_id = ?", [usuarioId]);
  if (actual && Number(actual.equipo_id) !== Number(inv.equipo_id)) throw new AppError("YA_TIENE_EQUIPO", "La cuenta ya pertenece a otro equipo. Salga de ese equipo antes de aceptar.", 409);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "INSERT INTO equipo_miembros (usuario_id, equipo_id, rol) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rol = VALUES(rol), estado = 'activo'",
      [usuarioId, inv.equipo_id, inv.rol],
    );
    await conn.query("UPDATE equipo_invitaciones SET aceptada_en = NOW() WHERE id = ?", [inv.id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  logger.info(`equipo: usuario ${usuarioId} acepto invitacion al equipo ${inv.equipo_id} como ${inv.rol}`);
  return obtener(usuarioId);
}

export async function cambiarRol(usuarioId, miembroId, rol) {
  const ctx = await exigirTitular(usuarioId);
  if (!["escribano", "empleado"].includes(rol)) throw new AppError("DATOS_INVALIDOS", "rol debe ser escribano o empleado.", 400);
  if (Number(miembroId) === Number(usuarioId)) throw new AppError("DATOS_INVALIDOS", "La titular no puede cambiar su propio rol.", 400);
  const [r] = await pool.query("UPDATE equipo_miembros SET rol = ? WHERE usuario_id = ? AND equipo_id = ? AND rol <> 'titular'", [rol, miembroId, ctx.equipoId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El integrante no existe en este equipo.", 404);
  return obtener(usuarioId);
}

export async function cambiarEstado(usuarioId, miembroId, estado) {
  const ctx = await exigirTitular(usuarioId);
  if (!["activo", "suspendido"].includes(estado)) throw new AppError("DATOS_INVALIDOS", "estado debe ser activo o suspendido.", 400);
  if (Number(miembroId) === Number(usuarioId)) throw new AppError("DATOS_INVALIDOS", "La titular no puede suspenderse a si misma.", 400);
  const [r] = await pool.query("UPDATE equipo_miembros SET estado = ? WHERE usuario_id = ? AND equipo_id = ? AND rol <> 'titular'", [estado, miembroId, ctx.equipoId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El integrante no existe en este equipo.", 404);
  return obtener(usuarioId);
}

/**
 * Quita a un integrante del equipo. No borra nada suyo: sus clientes,
 * expedientes y comprobantes siguen siendo de su cuenta. Solo pierde el
 * acceso a los expedientes que le habian compartido.
 */
export async function quitarMiembro(usuarioId, miembroId) {
  const ctx = await exigirTitular(usuarioId);
  if (Number(miembroId) === Number(usuarioId)) throw new AppError("DATOS_INVALIDOS", "La titular no puede quitarse del equipo.", 400);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // No se borra la fila: queda 'retirado' para que la persona no recupere permisos al salir.
    const [r] = await conn.query("UPDATE equipo_miembros SET estado = 'retirado', rol = 'empleado' WHERE usuario_id = ? AND equipo_id = ? AND rol <> 'titular' AND estado <> 'retirado'", [miembroId, ctx.equipoId]);
    if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El integrante no existe en este equipo.", 404);
    // Corta el acceso en los dos sentidos: lo que le compartieron y lo que el compartio.
    await conn.query(
      `DELETE ec FROM expediente_colaboradores ec
         JOIN expedientes e ON e.id = ec.expediente_id
         JOIN equipo_miembros m ON m.usuario_id = e.usuario_id
        WHERE ec.usuario_id = ? AND m.equipo_id = ?`,
      [miembroId, ctx.equipoId],
    );
    await conn.query("DELETE FROM expediente_colaboradores WHERE expediente_id IN (SELECT id FROM expedientes WHERE usuario_id = ?)", [miembroId]);
    // Las tareas que tenia asignadas quedan sin responsable, no apuntando a alguien que ya no esta.
    await conn.query(
      `UPDATE tareas t JOIN expedientes e ON e.id = t.expediente_id JOIN equipo_miembros m ON m.usuario_id = e.usuario_id
          SET t.responsable_usuario_id = NULL
        WHERE t.responsable_usuario_id = ? AND m.equipo_id = ?`,
      [miembroId, ctx.equipoId],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  return obtener(usuarioId);
}

/**
 * Metricas agregadas por integrante (solo conteos y totales: ningun contenido
 * de expedientes, clientes ni documentos sale de la cuenta que los creo).
 */
export async function metricas(usuarioId, dias = 30) {
  const ctx = await exigirTitular(usuarioId);
  const n = Math.min(Math.max(Number(dias) || 30, 1), 365);
  const [rows] = await pool.query(
    `SELECT u.id AS usuario_id, u.nombre, u.email, m.rol, m.estado,
            (SELECT COUNT(*) FROM expedientes e WHERE e.usuario_id = u.id AND e.creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS expedientes_creados,
            (SELECT COUNT(*) FROM expedientes e WHERE e.usuario_id = u.id AND e.estado IN ('cerrado','archivado') AND e.actualizado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS expedientes_cerrados,
            (SELECT COUNT(*) FROM expedientes e WHERE e.usuario_id = u.id AND e.estado IN ('abierto','en_firma')) AS expedientes_abiertos,
            (SELECT COUNT(*) FROM tareas t WHERE t.usuario_id = u.id AND t.estado = 'hecha' AND t.completada_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS tareas_completadas,
            (SELECT COUNT(*) FROM tareas t JOIN expedientes e ON e.id = t.expediente_id
              WHERE t.estado = 'pendiente' AND (t.responsable_usuario_id = u.id OR (t.responsable_usuario_id IS NULL AND e.usuario_id = u.id))) AS tareas_pendientes,
            (SELECT COUNT(*) FROM turnos tu WHERE tu.usuario_id = u.id AND tu.estado = 'realizado' AND tu.fecha_hora >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS turnos_realizados,
            (SELECT COUNT(*) FROM ejecuciones ex WHERE ex.usuario_id = u.id AND ex.estado = 'completada' AND ex.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS documentos_generados,
            (SELECT COUNT(*) FROM comprobantes c WHERE c.usuario_id = u.id AND c.estado = 'emitido' AND c.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)) AS comprobantes_emitidos,
            (SELECT COALESCE(SUM(mv.monto), 0) FROM movimientos mv WHERE mv.usuario_id = u.id AND mv.tipo = 'pago' AND mv.moneda = 'ARS' AND mv.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)) AS cobrado_ars
       FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.equipo_id = ?
      ORDER BY FIELD(m.rol, 'titular', 'escribano', 'empleado'), u.nombre, u.email`,
    [n, n, n, n, n, n, n, ctx.equipoId],
  );
  return {
    dias: n,
    miembros: rows.map((r) => ({
      usuarioId: r.usuario_id,
      nombre: r.nombre,
      email: r.email,
      rol: r.rol,
      estado: r.estado,
      expedientesCreados: Number(r.expedientes_creados),
      expedientesCerrados: Number(r.expedientes_cerrados),
      expedientesAbiertos: Number(r.expedientes_abiertos),
      tareasCompletadas: Number(r.tareas_completadas),
      tareasPendientes: Number(r.tareas_pendientes),
      turnosRealizados: Number(r.turnos_realizados),
      documentosGenerados: Number(r.documentos_generados),
      comprobantesEmitidos: Number(r.comprobantes_emitidos),
      cobradoArs: Number(r.cobrado_ars),
    })),
  };
}

/** Integrantes a los que esta cuenta puede compartirles un expediente. */
export async function companeros(usuarioId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.email, m.rol FROM equipo_miembros m1
       JOIN equipo_miembros m ON m.equipo_id = m1.equipo_id AND m.usuario_id <> m1.usuario_id AND m.estado = 'activo'
       JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1
      WHERE m1.usuario_id = ? ORDER BY u.nombre, u.email`,
    [usuarioId],
  );
  return rows.map((r) => ({ usuarioId: r.id, nombre: r.nombre, email: r.email, rol: r.rol }));
}
