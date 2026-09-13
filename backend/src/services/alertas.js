/**
 * Novedades: lo que vence o pide atencion, reunido en un solo lugar.
 *
 * Junta lo que ya calculan otros modulos (UIF) con los vencimientos
 * operativos: certificado de ARCA, tareas, turnos del dia, presupuestos
 * vencidos y sesiones guardadas por caducar. Respeta los roles del equipo:
 * una cuenta con rol `empleado` no recibe novedades de caja, comprobantes,
 * protocolo ni UIF, igual que no ve esas pantallas.
 *
 * Todo sale de datos que ya estaban en la base: no consulta a terceros ni
 * descifra nada mas que el certificado fiscal de la propia cuenta.
 */
import { pool } from "../config/db.js";
import { contexto, alcanza } from "./equipo.js";
import { alertas as alertasUif } from "./uif.js";
import { descifrar } from "../utils/cifrado.js";
import { vencimientoCertificado } from "./arca.js";
import { logger } from "../utils/logger.js";
import { hoyLocal } from "../utils/fechas.js";

const DIAS_AVISO_CERTIFICADO = 45;
const DIAS_AVISO_TAREA = 7;

const fecha = (d) => (d ? String(d).slice(0, 10) : null);

/** Certificado de ARCA por vencer o vencido (solo si la cuenta lo cargo). */
async function certificadoArca(usuarioId) {
  const [[r]] = await pool.query("SELECT arca_cert_cifrado, arca_entorno FROM configuracion_fiscal WHERE usuario_id = ?", [usuarioId]);
  if (!r?.arca_cert_cifrado) return [];
  const pem = descifrar(r.arca_cert_cifrado, "fiscal");
  if (!pem) {
    return [{ nivel: "alta", tipo: "arca_credenciales", texto: "No se pueden leer las credenciales de ARCA (¿cambió JWT_SECRET?). Vuelva a cargar el certificado.", pantalla: "comprobantes" }];
  }
  const vence = vencimientoCertificado(pem);
  if (!vence) return [];
  const dias = Math.floor((vence.getTime() - Date.now()) / 86400000);
  if (dias < 0) return [{ nivel: "alta", tipo: "arca_certificado", texto: `El certificado de ARCA venció el ${vence.toLocaleDateString("es-AR")}: no se pueden emitir facturas electrónicas hasta renovarlo.`, pantalla: "comprobantes", fecha: fecha(vence.toISOString()) }];
  if (dias <= DIAS_AVISO_CERTIFICADO) return [{ nivel: dias <= 15 ? "alta" : "media", tipo: "arca_certificado", texto: `El certificado de ARCA vence en ${dias} día${dias === 1 ? "" : "s"} (${vence.toLocaleDateString("es-AR")}). Renuévelo en el portal de ARCA y vuelva a cargarlo.`, pantalla: "comprobantes", fecha: fecha(vence.toISOString()) }];
  return [];
}

/** Tareas pendientes vencidas o que vencen esta semana, propias o de expedientes compartidos. */
async function tareas(usuarioId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.descripcion, t.vence_en, e.id AS expediente_id, e.caratula
       FROM tareas t
       JOIN expedientes e ON e.id = t.expediente_id
       LEFT JOIN expediente_colaboradores ec ON ec.expediente_id = e.id AND ec.usuario_id = :usuarioId
      WHERE t.estado = 'pendiente' AND t.vence_en IS NOT NULL
        AND t.vence_en <= DATE_ADD(CURDATE(), INTERVAL :dias DAY)
        AND (e.usuario_id = :usuarioId OR ec.usuario_id IS NOT NULL)
        AND (t.responsable_usuario_id = :usuarioId OR t.responsable_usuario_id IS NULL)
      ORDER BY t.vence_en LIMIT 20`,
    { usuarioId, dias: DIAS_AVISO_TAREA },
  );
  const hoy = hoyLocal();
  return rows.map((t) => {
    const vencida = fecha(t.vence_en) < hoy;
    return {
      nivel: vencida ? "alta" : "media",
      tipo: "tarea",
      texto: `${vencida ? "Tarea vencida" : "Tarea por vencer"}: ${t.descripcion} · ${t.caratula}`,
      pantalla: "expedientes",
      referenciaId: t.expediente_id,
      fecha: fecha(t.vence_en),
    };
  });
}

/** Turnos propios de hoy y mañana que siguen en pie. */
async function turnos(usuarioId) {
  const [rows] = await pool.query(
    `SELECT id, titulo, fecha_hora FROM turnos
      WHERE usuario_id = ? AND estado IN ('pendiente','confirmado')
        AND fecha_hora >= NOW() AND fecha_hora < DATE_ADD(NOW(), INTERVAL 2 DAY)
      ORDER BY fecha_hora LIMIT 10`,
    [usuarioId],
  );
  return rows.map((t) => ({
    nivel: "baja",
    tipo: "turno",
    texto: `Turno: ${t.titulo} · ${new Date(t.fecha_hora).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`,
    pantalla: "agenda",
    referenciaId: t.id,
    fecha: fecha(t.fecha_hora),
  }));
}

/** Presupuestos enviados cuya validez ya paso y siguen sin respuesta. */
async function presupuestos(usuarioId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.numero, p.fecha, p.validez_dias, c.nombre AS cliente
       FROM presupuestos p LEFT JOIN clientes c ON c.id = p.cliente_id
      WHERE p.usuario_id = ? AND p.estado = 'enviado'
        AND DATE_ADD(p.fecha, INTERVAL p.validez_dias DAY) < CURDATE()
      ORDER BY p.fecha DESC LIMIT 10`,
    [usuarioId],
  );
  return rows.map((p) => ({
    nivel: "media",
    tipo: "presupuesto",
    texto: `Presupuesto N° ${p.numero}${p.cliente ? ` a ${p.cliente}` : ""} venció sin respuesta (validez de ${p.validez_dias} días).`,
    pantalla: "expedientes",
    referenciaId: p.id,
    fecha: fecha(p.fecha),
  }));
}

/** Sesiones guardadas que estan por caducar (se borran solas al vencer). */
async function sesionesGuardadas(usuarioId) {
  const [rows] = await pool.query(
    "SELECT id, modo, expira_en FROM sesiones_guardadas WHERE usuario_id = ? AND expira_en < DATE_ADD(NOW(), INTERVAL 2 DAY) ORDER BY expira_en LIMIT 5",
    [usuarioId],
  );
  return rows.map((s) => ({
    nivel: "media",
    tipo: "sesion_guardada",
    texto: `Una sesión guardada (${s.modo}) vence el ${new Date(s.expira_en).toLocaleDateString("es-AR")} y se borra sola. Reanúdela o descárguela.`,
    pantalla: "principal",
    fecha: fecha(s.expira_en),
  }));
}

const ORDEN = { alta: 0, media: 1, baja: 2 };

/**
 * Novedades de la cuenta, ordenadas por urgencia. `rol` define que se incluye:
 * las de caja, comprobantes, protocolo y UIF solo para escribana/escribano.
 */
export async function novedades(usuarioId) {
  const ctx = await contexto(usuarioId);
  const esEscribano = alcanza(ctx.rol, "escribano");
  const fuentes = [tareas(usuarioId), turnos(usuarioId), sesionesGuardadas(usuarioId)];
  if (esEscribano) fuentes.push(certificadoArca(usuarioId), presupuestos(usuarioId), alertasUif(usuarioId).then((l) => l.map((a) => ({ ...a, pantalla: a.expedienteId ? "expedientes" : "uif", referenciaId: a.expedienteId || null }))));
  const partes = await Promise.allSettled(fuentes);
  const alertas = [];
  for (const p of partes) {
    if (p.status === "fulfilled") alertas.push(...p.value);
    else logger.warn("Una fuente de novedades fallo (se ignora)", { codigo: p.reason?.codigo || p.reason?.code });
  }
  alertas.sort((a, b) => (ORDEN[a.nivel] ?? 3) - (ORDEN[b.nivel] ?? 3) || String(a.fecha || "").localeCompare(String(b.fecha || "")));
  return {
    generadoEn: new Date().toISOString(),
    rol: ctx.rol,
    total: alertas.length,
    altas: alertas.filter((a) => a.nivel === "alta").length,
    alertas: alertas.slice(0, 40),
  };
}
