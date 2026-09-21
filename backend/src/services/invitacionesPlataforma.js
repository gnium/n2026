/**
 * Invitaciones de la PLATAFORMA: el operador da de alta una escribania nueva
 * desde el panel de Operacion.
 *
 * No confundir con `services/equipo.js`, que son las invitaciones DENTRO de
 * una escribania (sumar un empleado o un colega al equipo de la titular).
 * Aca se crea una cuenta nueva, duena de sus datos, con su periodo de prueba.
 *
 * El alta queda cerrada: sin invitacion vigente (o sin el codigo de registro,
 * si la instalacion lo usa) nadie puede crearse una cuenta. Del token solo se
 * guarda el sha256, igual que en la recuperacion de contrasena: quien lea la
 * base no puede usar las invitaciones pendientes.
 */
import { randomBytes } from "node:crypto";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { sha256 } from "../auth/repositorio.js";
import { enviarCorreo, escaparHtml } from "./correo.js";
import { parametros, iniciarPrueba } from "./prueba.js";
import { crear as crearEquipo } from "./equipo.js";
import { logger } from "../utils/logger.js";

const DIAS_INVITACION = 14;
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 190;
const limpio = (v, n) => String(v ?? "").trim().slice(0, n) || null;

const aVista = (r) => ({
  id: r.id,
  email: r.email,
  nombre: r.nombre,
  escribania: r.escribania,
  diasPrueba: Number(r.dias_prueba),
  expiraEn: r.expira_en,
  creadoEn: r.creado_en,
  aceptadaEn: r.aceptada_en,
  canceladaEn: r.cancelada_en,
  usuarioId: r.usuario_id,
  estado: r.cancelada_en ? "cancelada" : r.aceptada_en ? "aceptada" : new Date(r.expira_en) < new Date() ? "vencida" : "pendiente",
});

/** Invitaciones de la plataforma, las pendientes primero. */
export async function listar() {
  const [rows] = await pool.query(
    `SELECT id, email, nombre, escribania, dias_prueba, expira_en, creado_en, aceptada_en, cancelada_en, usuario_id
       FROM invitaciones_plataforma
      ORDER BY (aceptada_en IS NULL AND cancelada_en IS NULL AND expira_en > NOW()) DESC, creado_en DESC
      LIMIT 200`,
  );
  return rows.map(aVista);
}

async function enviar(inv, token) {
  const enlace = `${env.appUrl}/?alta=${token}`;
  const saludo = inv.nombre ? `Hola ${inv.nombre}` : "Hola";
  const texto = `${saludo}. Le damos acceso a Doy Fe, el asistente de redaccion y gestion para escribanias.\n\nPara crear su cuenta, abra este enlace:\n${enlace}\n\nIncluye ${inv.diasPrueba} dias de prueba sin cargo. Al terminar, si no activa una suscripcion, la cuenta y todos sus datos se eliminan de forma definitiva: no conservamos informacion de escribanias que no usan el servicio.\n\nLa invitacion vence en ${DIAS_INVITACION} dias y solo sirve para ${inv.email}.`;
  const html = `<p>${escaparHtml(saludo)}. Le damos acceso a <b>Doy Fe</b>, el asistente de redacci&oacute;n y gesti&oacute;n para escribanías.</p>
<p><a href="${escaparHtml(enlace)}">Crear mi cuenta</a></p>
<p>Incluye <b>${inv.diasPrueba} d&iacute;as de prueba</b> sin cargo. Al terminar, si no activa una suscripci&oacute;n, la cuenta y todos sus datos se eliminan de forma definitiva: no conservamos informaci&oacute;n de escribanías que no usan el servicio.</p>
<p>La invitaci&oacute;n vence en ${DIAS_INVITACION} d&iacute;as y solo sirve para ${escaparHtml(inv.email)}.</p>`;
  const { enviado } = await enviarCorreo({ para: inv.email, asunto: "Su acceso a Doy Fe", texto, html });
  // El enlace lleva el token en claro: solo vuelve al panel si el correo no salio.
  return { enviado, enlace: enviado ? null : enlace };
}

/** Crea una invitacion para una escribania nueva y la manda por correo. */
export async function invitar(rootId, { email, nombre, escribania, diasPrueba } = {}) {
  const destino = String(email || "").trim().toLowerCase();
  if (!emailValido(destino)) throw new AppError("DATOS_INVALIDOS", "Ingrese un correo valido.", 400);
  const [[ya]] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [destino]);
  if (ya) throw new AppError("EMAIL_EN_USO", "Ya existe una cuenta con ese correo.", 409);

  const { diasPrueba: pordefecto } = await parametros();
  const dias = Math.min(Math.max(Number(diasPrueba) || pordefecto, 1), 365);
  // Una invitacion vigente por correo: la nueva reemplaza a la anterior.
  await pool.query("UPDATE invitaciones_plataforma SET cancelada_en = NOW() WHERE email = ? AND aceptada_en IS NULL AND cancelada_en IS NULL", [destino]);

  const token = randomBytes(32).toString("base64url");
  const [r] = await pool.query(
    `INSERT INTO invitaciones_plataforma (email, nombre, escribania, token_hash, dias_prueba, invitado_por, expira_en)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [destino, limpio(nombre, 120), limpio(escribania, 160), sha256(token), dias, rootId, DIAS_INVITACION],
  );
  const envio = await enviar({ email: destino, nombre: limpio(nombre, 120), diasPrueba: dias }, token);
  logger.info("Invitacion de plataforma creada", { cantidad: r.insertId, enviado: envio.enviado });
  return { ...envio, id: r.insertId, email: destino, diasPrueba: dias, invitaciones: await listar() };
}

/** Vuelve a mandar el correo con un token NUEVO (el anterior deja de servir). */
export async function reenviar(rootId, id) {
  const [[inv]] = await pool.query(
    "SELECT id, email, nombre, escribania, dias_prueba FROM invitaciones_plataforma WHERE id = ? AND aceptada_en IS NULL AND cancelada_en IS NULL",
    [id],
  );
  if (!inv) throw new AppError("NO_ENCONTRADO", "La invitacion no existe o ya fue usada.", 404);
  return invitar(rootId, { email: inv.email, nombre: inv.nombre, escribania: inv.escribania, diasPrueba: inv.dias_prueba });
}

export async function cancelar(_rootId, id) {
  const [r] = await pool.query("UPDATE invitaciones_plataforma SET cancelada_en = NOW() WHERE id = ? AND aceptada_en IS NULL AND cancelada_en IS NULL", [id]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La invitacion no existe o ya fue usada.", 404);
  return { ok: true, invitaciones: await listar() };
}

/** Datos publicos de una invitacion vigente (para mostrarla antes de crear la cuenta). */
export async function ver(token) {
  const [[r]] = await pool.query(
    `SELECT email, nombre, escribania, dias_prueba, expira_en FROM invitaciones_plataforma
      WHERE token_hash = ? AND aceptada_en IS NULL AND cancelada_en IS NULL AND expira_en > NOW()`,
    [sha256(String(token || ""))],
  );
  if (!r) return null;
  return { tipo: "plataforma", email: r.email, nombre: r.nombre, escribania: r.escribania, diasPrueba: Number(r.dias_prueba), expiraEn: r.expira_en };
}

/**
 * Consume la invitacion con la cuenta recien creada: arranca la prueba y, si
 * la invitacion traia nombre de escribania, crea el equipo con esta cuenta
 * como titular. El correo tiene que coincidir: un enlace reenviado no sirve
 * para dar de alta a otra persona.
 */
export async function aceptar(usuarioId, token) {
  const [[inv]] = await pool.query(
    `SELECT id, email, escribania, dias_prueba FROM invitaciones_plataforma
      WHERE token_hash = ? AND aceptada_en IS NULL AND cancelada_en IS NULL AND expira_en > NOW()`,
    [sha256(String(token || ""))],
  );
  if (!inv) throw new AppError("INVITACION_INVALIDA", "La invitacion no existe, ya fue usada o vencio.", 404);
  const [[u]] = await pool.query("SELECT id, email FROM usuarios WHERE id = ?", [usuarioId]);
  if (!u || u.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw new AppError("INVITACION_OTRO_CORREO", `La invitacion es para ${inv.email}. Use ese correo para crear la cuenta.`, 403);
  }
  const [r] = await pool.query("UPDATE invitaciones_plataforma SET aceptada_en = NOW(), usuario_id = ? WHERE id = ? AND aceptada_en IS NULL", [usuarioId, inv.id]);
  if (r.affectedRows === 0) throw new AppError("INVITACION_INVALIDA", "La invitacion ya fue usada.", 409);

  const dias = await iniciarPrueba(usuarioId, inv.dias_prueba);
  if (inv.escribania) await crearEquipo(usuarioId, inv.escribania).catch((e) => logger.warn("No se pudo crear el equipo de la invitacion", { codigo: e.codigo || "error" }));
  return { diasPrueba: dias };
}
