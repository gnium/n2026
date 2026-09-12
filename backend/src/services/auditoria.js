/**
 * Registro operativo en MySQL. Solo metadatos: nunca texto del documento,
 * entidades ni el mapa. Cualquier fallo de la BD aqui NO interrumpe el pipeline.
 *
 * Cada llamada a un skill (la corrida inicial, la continuacion de un reintento,
 * o cada iteracion de "mejorar resultado") inserta su PROPIA fila en
 * `ejecuciones_skills` en vez de reutilizar una fila fija por skill. Es necesario
 * para que el costo de varias iteraciones sobre el mismo paso se sume
 * correctamente en vez de que la ultima pise el registro de las anteriores.
 */
import { pool } from "../config/db.js";
import { logger } from "../utils/logger.js";

const CLAVES_PERMITIDAS = new Set(["motivo", "skill", "codigo", "cantidad", "duracionMs", "bytes", "tipoActo", "plantilla", "tokensEntrada", "tokensSalida"]);

function filtrarDetalle(detalle) {
  if (!detalle) return null;
  const out = {};
  for (const [k, v] of Object.entries(detalle)) {
    if (CLAVES_PERMITIDAS.has(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 64))) out[k] = v;
  }
  return out;
}

async function seguro(fn) {
  try {
    return await fn();
  } catch (e) {
    logger.warn("Fallo de auditoria (ignorado)", { codigo: e.code || e.message?.slice(0, 40) });
    return null;
  }
}

export const auditoria = {
  evento: (evento, sessionUuid, detalle) =>
    seguro(() => pool.query("INSERT INTO auditoria (evento, session_uuid, detalle) VALUES (?, ?, ?)", [evento, sessionUuid, JSON.stringify(filtrarDetalle(detalle))])),

  iniciarEjecucion: (sessionUuid, bytesEntrada, usuarioId) =>
    seguro(async () => {
      const [r] = await pool.query("INSERT INTO ejecuciones (session_uuid, bytes_entrada, usuario_id) VALUES (?, ?, ?)", [sessionUuid, bytesEntrada, usuarioId ?? null]);
      return r.insertId;
    }),

  /** Nueva fila para UNA llamada a un skill. Devuelve su id (o null si la BD fallo: el llamador debe tolerarlo). */
  registrarSkill: (ejecucionId, clave, { modelo, proveedor } = {}) =>
    seguro(async () => {
      const [r] = await pool.query("INSERT INTO ejecuciones_skills (ejecucion_id, skill_clave, estado, modelo, proveedor, iniciado_en) VALUES (?, ?, 'en_curso', ?, ?, NOW())", [
        ejecucionId,
        clave,
        modelo ?? null,
        proveedor ?? null,
      ]);
      return r.insertId;
    }),

  /** Completa la fila abierta por registrarSkill. `id` puede ser null si el insert fallo: no hace nada. */
  actualizarSkill: (id, campos) => {
    if (id == null) return null;
    return seguro(() =>
      pool.query(
        `UPDATE ejecuciones_skills SET estado = :estado, modelo = COALESCE(:modelo, modelo), proveedor = COALESCE(:proveedor, proveedor),
           tokens_entrada = :tokensEntrada, tokens_salida = :tokensSalida, costo_usd = :costoUsd, duracion_ms = :duracionMs,
           codigo_error = :codigoError, riesgos_detectados = :riesgos, finalizado_en = :finalizadoEn
         WHERE id = :id`,
        {
          id,
          estado: campos.estado,
          modelo: campos.modelo ?? null,
          proveedor: campos.proveedor ?? null,
          tokensEntrada: campos.tokensEntrada ?? 0,
          tokensSalida: campos.tokensSalida ?? 0,
          costoUsd: campos.costoUsd ?? null,
          duracionMs: campos.duracionMs ?? null,
          codigoError: campos.codigoError ?? null,
          riesgos: campos.riesgos ?? null,
          finalizadoEn: campos.finalizadoEn ?? null,
        },
      ),
    );
  },

  /** Suma autoritativa desde la BD (no depende de contadores en memoria, que no ven lo ya guardado en un reintento o iteracion previa). */
  totalesEjecucion: (ejecucionId) =>
    seguro(async () => {
      const [[r]] = await pool.query(
        `SELECT COALESCE(SUM(tokens_entrada), 0) AS tokensEntrada, COALESCE(SUM(tokens_salida), 0) AS tokensSalida,
                SUM(CASE WHEN estado = 'completado' AND costo_usd IS NULL THEN 1 ELSE 0 END) AS conPrecioFaltante,
                SUM(costo_usd) AS costoConocido
         FROM ejecuciones_skills WHERE ejecucion_id = ?`,
        [ejecucionId],
      );
      const conPrecioFaltante = Number(r.conPrecioFaltante) > 0;
      return { tokensEntrada: Number(r.tokensEntrada), tokensSalida: Number(r.tokensSalida), costoUsd: conPrecioFaltante ? null : r.costoConocido === null ? null : Number(r.costoConocido), costoParcial: conPrecioFaltante && r.costoConocido !== null, conPrecioFaltante };
    }),

  finalizarEjecucion: (ejecucionId, campos) =>
    seguro(() =>
      pool.query(
        `UPDATE ejecuciones SET estado = :estado, tipo_acto_detectado = :tipoActo, plantilla_id = :plantillaId,
           entidades_anonimizadas = :entidades, tokens_entrada = :tokensEntrada, tokens_salida = :tokensSalida,
           costo_usd = :costoUsd, duracion_ms = :duracionMs, finalizado_en = NOW()
         WHERE id = :ejecucionId`,
        {
          ejecucionId,
          estado: campos.estado,
          tipoActo: campos.tipoActo ?? null,
          plantillaId: campos.plantillaId ?? null,
          entidades: campos.entidades ?? null,
          tokensEntrada: campos.tokensEntrada ?? 0,
          tokensSalida: campos.tokensSalida ?? 0,
          costoUsd: campos.costoUsd ?? null,
          duracionMs: campos.duracionMs ?? null,
        },
      ),
    ),
};
