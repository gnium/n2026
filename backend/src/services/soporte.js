/**
 * Panel de operacion de la plataforma (root de Doy Fe).
 *
 * REGLA DE ESTE MODULO: solo metadatos y agregados. Nunca devuelve contenido
 * de las escribanias -ni clientes, ni expedientes, ni protocolo, ni
 * comprobantes, ni documentos-. De las tablas con datos de las partes solo se
 * leen CONTEOS (cuantos clientes tiene una cuenta), jamas sus filas. Asi el
 * operador puede dar soporte sin poder mirar una escritura, que es la promesa
 * central del producto (docs/PRIVACIDAD.md).
 *
 * Quien accede: `usuarios.es_admin`, que se asigna unicamente a la primera
 * cuenta registrada en la instalacion, es decir al operador de la plataforma.
 * El titular de cada escribania NO es es_admin: su rol sale de equipo_miembros.
 */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

const dias = (v, def = 30) => Math.min(Math.max(Number(v) || def, 1), 365);

/** Indicadores de la plataforma para el periodo. */
export async function resumen(periodo) {
  const d = dias(periodo);
  const [[cuentas]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(activo = 1) AS activas,
            SUM(creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS altas,
            SUM(ultimo_acceso >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS conAcceso
       FROM usuarios`,
    [d, d],
  );
  const [[equipos]] = await pool.query("SELECT COUNT(*) AS total FROM equipos");
  const [suscripciones] = await pool.query("SELECT estado_suscripcion AS estado, COUNT(*) AS n FROM usuarios GROUP BY estado_suscripcion");
  const [[uso]] = await pool.query(
    `SELECT COUNT(*) AS ejecuciones,
            SUM(estado = 'completada') AS completadas,
            SUM(estado = 'fallida') AS fallidas,
            COALESCE(SUM(costo_usd), 0) AS costoUsd
       FROM ejecuciones WHERE iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [d],
  );
  const [[facturado]] = await pool.query(
    `SELECT COUNT(*) AS cargos, COALESCE(SUM(monto_ars), 0) AS montoArs, COALESCE(SUM(costo_ia_usd), 0) AS costoIaUsd
       FROM cargos_uso WHERE creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [d],
  );
  // Embudo: cada etapa cuenta cuentas distintas, no eventos.
  const [[embudo]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM usuarios WHERE creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS registradas,
       (SELECT COUNT(DISTINCT u.id) FROM usuarios u JOIN ejecuciones e ON e.usuario_id = u.id
         WHERE u.creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS probaron,
       (SELECT COUNT(DISTINCT u.id) FROM usuarios u JOIN ejecuciones e ON e.usuario_id = u.id AND e.estado = 'completada'
         WHERE u.creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)) AS completaronUno,
       (SELECT COUNT(*) FROM usuarios WHERE creado_en >= DATE_SUB(NOW(), INTERVAL ? DAY) AND estado_suscripcion = 'activa') AS suscribieron`,
    [d, d, d, d],
  );
  return {
    dias: d,
    cuentas: { total: Number(cuentas.total), activas: Number(cuentas.activas || 0), altas: Number(cuentas.altas || 0), conAccesoEnPeriodo: Number(cuentas.conAcceso || 0) },
    escribanias: Number(equipos.total),
    suscripciones: Object.fromEntries(suscripciones.map((s) => [s.estado, Number(s.n)])),
    uso: {
      ejecuciones: Number(uso.ejecuciones),
      completadas: Number(uso.completadas || 0),
      fallidas: Number(uso.fallidas || 0),
      costoIaUsd: Number(uso.costoUsd),
    },
    facturacion: { cargos: Number(facturado.cargos), montoArs: Number(facturado.montoArs), costoIaUsd: Number(facturado.costoIaUsd) },
    embudo: {
      registradas: Number(embudo.registradas),
      probaron: Number(embudo.probaron),
      completaronUno: Number(embudo.completaronUno),
      suscribieron: Number(embudo.suscribieron),
    },
  };
}

const SELECT_CUENTA = `
  SELECT u.id, u.email, u.nombre, u.activo, u.es_admin, u.creado_en, u.ultimo_acceso,
         u.estado_suscripcion, u.proximo_cobro_en,
         p.nombre AS plan, p.precio_mensual_ars AS planPrecio,
         e.id AS equipoId, e.nombre AS equipo, m.rol, m.estado AS estadoEquipo,
         (SELECT COUNT(*) FROM ejecuciones x WHERE x.usuario_id = u.id AND x.iniciado_en >= DATE_SUB(NOW(), INTERVAL :dias DAY)) AS documentos,
         (SELECT COUNT(*) FROM ejecuciones x WHERE x.usuario_id = u.id AND x.estado = 'fallida' AND x.iniciado_en >= DATE_SUB(NOW(), INTERVAL :dias DAY)) AS fallidas,
         (SELECT COALESCE(SUM(x.costo_usd), 0) FROM ejecuciones x WHERE x.usuario_id = u.id AND x.iniciado_en >= DATE_SUB(NOW(), INTERVAL :dias DAY)) AS costoIaUsd,
         (SELECT COALESCE(SUM(c.monto_ars), 0) FROM cargos_uso c WHERE c.usuario_id = u.id AND c.creado_en >= DATE_SUB(NOW(), INTERVAL :dias DAY)) AS facturadoArs,
         (SELECT COUNT(*) FROM clientes cl WHERE cl.usuario_id = u.id) AS clientes,
         (SELECT COUNT(*) FROM expedientes ex WHERE ex.usuario_id = u.id) AS expedientes,
         (SELECT COUNT(*) FROM comprobantes co WHERE co.usuario_id = u.id) AS comprobantes,
         (SELECT f.arca_entorno FROM configuracion_fiscal f WHERE f.usuario_id = u.id) AS arca,
         (SELECT g.email FROM google_cuentas g WHERE g.usuario_id = u.id) AS google
    FROM usuarios u
    LEFT JOIN planes p ON p.id = u.plan_id
    LEFT JOIN equipo_miembros m ON m.usuario_id = u.id
    LEFT JOIN equipos e ON e.id = m.equipo_id`;

const cuentaAVista = (r) => ({
  id: r.id,
  email: r.email,
  nombre: r.nombre,
  activo: Boolean(r.activo),
  esRoot: Boolean(r.es_admin),
  creadoEn: r.creado_en,
  ultimoAcceso: r.ultimo_acceso,
  equipoId: r.equipoId,
  equipo: r.equipo,
  rol: r.es_admin ? "root" : r.rol || "escribano",
  estadoEquipo: r.estadoEquipo,
  plan: r.plan,
  planPrecioArs: r.planPrecio != null ? Number(r.planPrecio) : null,
  suscripcion: r.estado_suscripcion,
  proximoCobro: r.proximo_cobro_en,
  documentos: Number(r.documentos),
  fallidas: Number(r.fallidas),
  costoIaUsd: Number(r.costoIaUsd),
  facturadoArs: Number(r.facturadoArs),
  // Conteos, no contenido: cuantos tiene, nunca cuales.
  volumen: { clientes: Number(r.clientes), expedientes: Number(r.expedientes), comprobantes: Number(r.comprobantes) },
  arca: r.arca || "apagado",
  googleConectado: Boolean(r.google),
});

/** Listado de cuentas para soporte, con busqueda por nombre o correo. */
export async function cuentas({ q, periodo, soloProblemas } = {}) {
  const d = dias(periodo);
  const busqueda = String(q || "").trim().slice(0, 100);
  const [rows] = await pool.query(
    `${SELECT_CUENTA}
      WHERE (:q = '' OR u.email LIKE :like OR u.nombre LIKE :like OR e.nombre LIKE :like)
      ORDER BY u.ultimo_acceso IS NULL, u.ultimo_acceso DESC, u.id DESC
      LIMIT 200`,
    { dias: d, q: busqueda, like: `%${busqueda}%` },
  );
  const lista = rows.map(cuentaAVista);
  return { dias: d, total: lista.length, cuentas: soloProblemas ? lista.filter((c) => c.fallidas > 0 || !c.activo || c.estadoEquipo === "suspendido") : lista };
}

/**
 * Ficha de soporte de una cuenta: su estado y sus ultimas ejecuciones, con
 * metadatos del pipeline (estado, tipo de acto detectado, error, costo).
 * `ejecuciones` no guarda texto del documento ni datos de las partes.
 */
export async function cuenta(id, periodo) {
  const d = dias(periodo);
  const [[r]] = await pool.query(`${SELECT_CUENTA} WHERE u.id = :id`, { dias: d, id });
  if (!r) throw new AppError("NO_ENCONTRADO", "La cuenta no existe.", 404);
  const [ejecuciones] = await pool.query(
    `SELECT id, estado, tipo_acto_detectado AS tipoActo, iniciado_en AS iniciadoEn, duracion_ms AS duracionMs,
            tokens_entrada AS tokensEntrada, tokens_salida AS tokensSalida, costo_usd AS costoUsd
       FROM ejecuciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 15`,
    [id],
  );
  const [skills] = await pool.query(
    `SELECT es.skill_clave AS skill, es.estado, es.codigo_error AS error, COUNT(*) AS n
       FROM ejecuciones_skills es JOIN ejecuciones e ON e.id = es.ejecucion_id
      WHERE e.usuario_id = ? AND es.estado = 'fallido' AND e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY es.skill_clave, es.estado, es.codigo_error ORDER BY n DESC LIMIT 10`,
    [id, d],
  );
  const [cargos] = await pool.query(
    "SELECT id, monto_ars AS montoArs, costo_ia_usd AS costoIaUsd, facturado_en AS facturadoEn, creado_en AS creadoEn FROM cargos_uso WHERE usuario_id = ? ORDER BY id DESC LIMIT 10",
    [id],
  );
  return {
    ...cuentaAVista(r),
    ejecuciones: ejecuciones.map((e) => ({ ...e, costoUsd: e.costoUsd != null ? Number(e.costoUsd) : null })),
    fallasPorSkill: skills.map((s) => ({ ...s, n: Number(s.n) })),
    cargos: cargos.map((c) => ({ ...c, montoArs: Number(c.montoArs), costoIaUsd: Number(c.costoIaUsd) })),
  };
}

/** Activa o desactiva una cuenta (accion de soporte; no borra nada). */
export async function cambiarActivo(rootId, id, activo) {
  if (Number(id) === Number(rootId)) throw new AppError("DATOS_INVALIDOS", "No puede desactivar su propia cuenta de operador.", 400);
  const [[u]] = await pool.query("SELECT es_admin FROM usuarios WHERE id = ?", [id]);
  if (!u) throw new AppError("NO_ENCONTRADO", "La cuenta no existe.", 404);
  if (u.es_admin) throw new AppError("DATOS_INVALIDOS", "No se desactiva una cuenta de operador desde el panel.", 400);
  await pool.query("UPDATE usuarios SET activo = ? WHERE id = ?", [activo ? 1 : 0, id]);
  return cuenta(id);
}
