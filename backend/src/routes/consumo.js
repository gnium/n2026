/**
 * Registro de consumo de IA: totales, serie por dia y por proveedor/modelo,
 * y el detalle de las ultimas ejecuciones. Todo sin datos de clientes:
 * `ejecuciones` y `ejecuciones_skills` solo guardan metadatos operativos.
 *
 * Cada cuenta ve solo su propio consumo. La cuenta administradora ve el de
 * todas (y ademas un desglose por cuenta), porque es quien factura el uso.
 */
import { Router } from "express";
import { pool } from "../config/db.js";
import { buscarPorId } from "../auth/repositorio.js";

export const rutasConsumo = Router();

rutasConsumo.get("/", async (req, res, next) => {
  try {
    const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 365);
    const usuario = await buscarPorId(req.usuario.id);
    const esAdmin = Boolean(usuario?.es_admin);
    const filtroUsuario = esAdmin ? "" : "AND e.usuario_id = ?";
    const paramsBase = esAdmin ? [dias] : [dias, req.usuario.id];

    const [[total]] = await pool.query(
      `SELECT COUNT(*) AS ejecuciones,
              COALESCE(SUM(e.tokens_entrada), 0) AS tokensEntrada,
              COALESCE(SUM(e.tokens_salida), 0) AS tokensSalida,
              SUM(e.costo_usd) AS costoUsd,
              SUM(e.costo_usd IS NULL AND e.estado = 'completada') AS conPrecioFaltante
       FROM ejecuciones e WHERE e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filtroUsuario}`,
      paramsBase,
    );

    const [porDia] = await pool.query(
      `SELECT DATE(e.iniciado_en) AS fecha, COUNT(*) AS ejecuciones, SUM(e.costo_usd) AS costoUsd,
              COALESCE(SUM(e.tokens_entrada), 0) AS tokensEntrada, COALESCE(SUM(e.tokens_salida), 0) AS tokensSalida
       FROM ejecuciones e WHERE e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filtroUsuario}
       GROUP BY DATE(e.iniciado_en) ORDER BY fecha DESC`,
      paramsBase,
    );

    const [porModelo] = await pool.query(
      `SELECT es.proveedor, es.modelo, COUNT(*) AS llamadas,
              COALESCE(SUM(es.tokens_entrada), 0) AS tokensEntrada, COALESCE(SUM(es.tokens_salida), 0) AS tokensSalida,
              SUM(es.costo_usd) AS costoUsd, SUM(es.costo_usd IS NULL) AS conPrecioFaltante
       FROM ejecuciones_skills es
       JOIN ejecuciones e ON e.id = es.ejecucion_id
       WHERE e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY) AND es.estado = 'completado' ${filtroUsuario}
       GROUP BY es.proveedor, es.modelo ORDER BY costoUsd IS NULL, costoUsd DESC, llamadas DESC`,
      paramsBase,
    );

    const [porModo] = await pool.query(
      `SELECT COALESCE(e.tipo_acto_detectado, 'sin_determinar') AS tipoActo, COUNT(*) AS ejecuciones, SUM(e.costo_usd) AS costoUsd
       FROM ejecuciones e WHERE e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filtroUsuario}
       GROUP BY tipoActo ORDER BY ejecuciones DESC`,
      paramsBase,
    );

    const [recientes] = await pool.query(
      `SELECT e.id, e.session_uuid AS sesionId, e.estado, e.tipo_acto_detectado AS tipoActo, e.entidades_anonimizadas AS entidades,
              e.tokens_entrada AS tokensEntrada, e.tokens_salida AS tokensSalida, e.costo_usd AS costoUsd,
              e.duracion_ms AS duracionMs, e.iniciado_en AS iniciadoEn, e.finalizado_en AS finalizadoEn
       FROM ejecuciones e WHERE e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filtroUsuario}
       ORDER BY e.iniciado_en DESC LIMIT 100`,
      paramsBase,
    );

    let porUsuario = null;
    if (esAdmin) {
      const [filas] = await pool.query(
        `SELECT u.id AS usuarioId, u.email, u.nombre, COUNT(e.id) AS ejecuciones, SUM(e.costo_usd) AS costoUsd
         FROM usuarios u LEFT JOIN ejecuciones e ON e.usuario_id = u.id AND e.iniciado_en >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY u.id ORDER BY costoUsd IS NULL, costoUsd DESC, ejecuciones DESC`,
        [dias],
      );
      porUsuario = filas.map((r) => ({ ...r, costoUsd: r.costoUsd === null ? null : Number(r.costoUsd) }));
    }

    res.json({
      dias,
      alcance: esAdmin ? "todas_las_cuentas" : "propio",
      total: { ejecuciones: total.ejecuciones, tokensEntrada: total.tokensEntrada, tokensSalida: total.tokensSalida, costoUsd: total.costoUsd === null ? null : Number(total.costoUsd), conPrecioFaltante: Number(total.conPrecioFaltante) > 0 },
      porDia: porDia.map((r) => ({ ...r, costoUsd: r.costoUsd === null ? null : Number(r.costoUsd) })),
      porModelo: porModelo.map((r) => ({ ...r, costoUsd: r.costoUsd === null ? null : Number(r.costoUsd), conPrecioFaltante: Number(r.conPrecioFaltante) > 0 })),
      porModo: porModo.map((r) => ({ ...r, costoUsd: r.costoUsd === null ? null : Number(r.costoUsd) })),
      porUsuario,
      recientes: recientes.map((r) => ({ ...r, costoUsd: r.costoUsd === null ? null : Number(r.costoUsd) })),
    });
  } catch (e) {
    next(e);
  }
});
