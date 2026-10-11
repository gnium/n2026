import { pool } from "../config/db.js";
import { enviarCorreo, escaparHtml } from "./correo.js";
import { logger } from "../utils/logger.js";

async function enviarNotificacionesDiarias() {
  const [rows] = await pool.query(
    `SELECT v.id, v.descripcion, v.fecha_vencimiento, v.estado, v.usuario_id,
            u.nombre AS usuario_nombre, u.email AS usuario_email
       FROM vencimientos v
       JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.estado = 'por_vencer' AND v.notificado = 0
        AND u.notificaciones_email = 1
      ORDER BY v.usuario_id, v.fecha_vencimiento
      LIMIT 200`,
  );
  if (!rows.length) return;

  const porUsuario = new Map();
  for (const r of rows) {
    if (!porUsuario.has(r.usuario_id)) porUsuario.set(r.usuario_id, { email: r.usuario_email, nombre: r.usuario_nombre, vencs: [] });
    porUsuario.get(r.usuario_id).vencs.push(r);
  }

  const ids = rows.map((r) => r.id);

  for (const [, u] of porUsuario) {
    const filas = u.vencs
      .map((v) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${escaparHtml(v.descripcion)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${new Date(v.fecha_vencimiento).toLocaleDateString("es-AR")}</td></tr>`)
      .join("");
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:auto">
<h2 style="color:#24466b">Vencimientos próximos</h2>
<p>Hola${u.nombre ? ` ${escaparHtml(u.nombre)}` : ""}, tenés <strong>${u.vencs.length}</strong> vencimiento${u.vencs.length > 1 ? "s" : ""} próximo${u.vencs.length > 1 ? "s" : ""}:</p>
<table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;padding:6px 12px;border-bottom:2px solid #24466b">Descripción</th><th style="text-align:left;padding:6px 12px;border-bottom:2px solid #24466b">Vence</th></tr></thead><tbody>${filas}</tbody></table>
<p style="margin-top:16px;font-size:13px;color:#666">Ingresá a Doy Fe para ver el detalle y marcarlos como completados.</p>
</div>`;
    const texto = u.vencs.map((v) => `- ${v.descripcion}: vence el ${new Date(v.fecha_vencimiento).toLocaleDateString("es-AR")}`).join("\n");
    await enviarCorreo({
      para: u.email,
      asunto: `Doy Fe: tenés ${u.vencs.length} vencimiento${u.vencs.length > 1 ? "s" : ""} próximo${u.vencs.length > 1 ? "s" : ""}`,
      texto: `Hola${u.nombre ? ` ${u.nombre}` : ""},\n\n${texto}\n\nIngresá a Doy Fe para ver el detalle.`,
      html,
    }).catch((e) => logger.warn("notificacion-vencimiento-email", { email: u.email, error: e.message }));
  }

  if (ids.length) {
    await pool.query("UPDATE vencimientos SET notificado = 1 WHERE id IN (?)", [ids]);
  }
  logger.info(`Notificaciones de vencimientos enviadas: ${porUsuario.size} usuario(s), ${ids.length} vencimiento(s)`);
}

export function programarNotificaciones() {
  setTimeout(() => {
    enviarNotificacionesDiarias().catch((e) => logger.warn("notificaciones-vencimientos-inicial", { error: e.message }));
    const intervalo = setInterval(() => {
      enviarNotificacionesDiarias().catch((e) => logger.warn("notificaciones-vencimientos", { error: e.message }));
    }, 6 * 60 * 60 * 1000);
    intervalo.unref();
  }, 60_000).unref();
}
