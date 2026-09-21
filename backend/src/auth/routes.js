import { Router } from "express";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { auditoria } from "../services/auditoria.js";
import { enviarCorreo, escaparHtml } from "../services/correo.js";
import { hashPassword, verificarPassword, validarPassword } from "./password.js";
import { emitirToken } from "./token.js";
import { NOMBRE_COOKIE, opcionesCookie, requerirAuth } from "../middleware/auth.js";
import * as repo from "./repositorio.js";
import { contexto, verInvitacion, aceptarInvitacion } from "../services/equipo.js";
import * as altaPlataforma from "../services/invitacionesPlataforma.js";
import { limitar } from "../middleware/limitador.js";
import { timingSafeEqual } from "node:crypto";

export const rutasAuth = Router();

const normalizarEmail = (e) => String(e || "").trim().toLowerCase();
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 190;

// Limite simple de intentos de login por email+IP (en memoria).
const intentos = new Map();
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
function registrarIntento(clave, exito) {
  const ahora = Date.now();
  const r = intentos.get(clave) || { n: 0, desde: ahora };
  if (ahora - r.desde > VENTANA_MS) Object.assign(r, { n: 0, desde: ahora });
  r.n = exito ? 0 : r.n + 1;
  intentos.set(clave, r);
  return r.n;
}
function bloqueado(clave) {
  const r = intentos.get(clave);
  return r && r.n >= MAX_INTENTOS && Date.now() - r.desde <= VENTANA_MS;
}

const MINUTO = 60 * 1000;
// Por IP: frena el barrido de correos y el bombardeo de correos de recuperacion.
// Se combina con el limite por correo que ya habia en el login.
const limiteLogin = limitar({ maximo: 30, ventanaMs: 15 * MINUTO, mensaje: "Demasiados intentos de ingreso desde esta conexion. Espere 15 minutos." });
const limiteRecuperacion = limitar({ maximo: 5, ventanaMs: 15 * MINUTO, mensaje: "Demasiados pedidos de recuperacion. Espere 15 minutos." });
const limiteRegistro = limitar({ maximo: 10, ventanaMs: 60 * MINUTO, mensaje: "Demasiados intentos de alta. Espere una hora." });
const limiteToken = limitar({ maximo: 30, ventanaMs: 15 * MINUTO, mensaje: "Demasiados intentos. Espere 15 minutos." });

/** Comparacion en tiempo constante: el codigo de registro no se adivina midiendo respuestas. */
function igualSeguro(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** El token lleva la version de sesion: si la cuenta la incrementa, esta cookie deja de valer. */
function fijarSesion(res, usuario, version) {
  const token = emitirToken({ sub: usuario.id, email: usuario.email, v: Number(version ?? usuario.sesion_version ?? 0) });
  res.cookie(NOMBRE_COOKIE, token, opcionesCookie(env.auth.sesionSegundos));
}

/** Datos de la cuenta para el frontend, con su rol y equipo (fase 4). */
async function publico(u) {
  const ctx = await contexto(u.id);
  return { id: u.id, email: u.email, nombre: u.nombre, esAdmin: Boolean(u.es_admin), rol: ctx.rol, equipoId: ctx.equipoId, equipo: ctx.equipoNombre, suspendido: ctx.suspendido };
}

/** POST /api/auth/registro {email, password, nombre?, codigo?} */
rutasAuth.post("/registro", limiteRegistro, async (req, res, next) => {
  try {
    const email = normalizarEmail(req.body?.email);
    const { password, nombre, codigo } = req.body || {};
    if (!emailValido(email)) throw new AppError("EMAIL_INVALIDO", "Ingrese un correo valido.", 400);
    const errPass = validarPassword(password);
    if (errPass) throw new AppError("PASSWORD_DEBIL", errPass, 400);

    // Politica: el primer usuario se registra libremente; luego hace falta el codigo de registro (o REGISTRO_ABIERTO=1).
    // Una invitacion del equipo vigente para este mismo correo habilita el registro sin codigo.
    const cantidad = await repo.contarUsuarios();
    const invitacion = req.body?.invitacion ? await verInvitacion(req.body.invitacion) : null;
    if (invitacion && invitacion.email.toLowerCase() !== email) throw new AppError("INVITACION_OTRO_CORREO", `La invitacion es para ${invitacion.email}: registrese con ese correo.`, 403);
    // Alta de una escribania nueva invitada desde el panel de Operacion (con su periodo de prueba).
    const alta = req.body?.alta ? await altaPlataforma.ver(req.body.alta) : null;
    if (req.body?.alta && !alta) throw new AppError("INVITACION_INVALIDA", "La invitacion no existe, ya fue usada o vencio.", 404);
    if (alta && alta.email.toLowerCase() !== email) throw new AppError("INVITACION_OTRO_CORREO", `La invitacion es para ${alta.email}: registrese con ese correo.`, 403);
    const permitido = cantidad === 0 || Boolean(invitacion) || Boolean(alta) || env.auth.registroAbierto || (env.auth.codigoRegistro && igualSeguro(codigo, env.auth.codigoRegistro));
    if (!permitido) throw new AppError("REGISTRO_CERRADO", "Para crear una cuenta hace falta una invitacion. Escribanos y le enviamos uno.", 403);

    if (await repo.buscarPorEmail(email)) throw new AppError("EMAIL_EN_USO", "Ya existe una cuenta con ese correo.", 409);
    const id = await repo.crearUsuario({ email, nombre: String(nombre || "").slice(0, 120), passwordHash: await hashPassword(password) });
    if (invitacion) await aceptarInvitacion(id, req.body.invitacion);
    if (alta) await altaPlataforma.aceptar(id, req.body.alta);
    const usuario = await repo.buscarPorId(id);
    fijarSesion(res, usuario);
    await auditoria.evento("auth.registro", null, { cantidad: id });
    res.status(201).json({ usuario: await publico(usuario) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/login {email, password} */
rutasAuth.post("/login", limiteLogin, async (req, res, next) => {
  try {
    const email = normalizarEmail(req.body?.email);
    const clave = `${email}|${req.ip}`;
    if (bloqueado(clave)) throw new AppError("DEMASIADOS_INTENTOS", "Demasiados intentos fallidos. Espere 15 minutos.", 429);
    const usuario = await repo.buscarPorEmail(email);
    const ok = usuario && usuario.activo && (await verificarPassword(String(req.body?.password || ""), usuario.password_hash));
    registrarIntento(clave, Boolean(ok));
    if (!ok) throw new AppError("CREDENCIALES_INVALIDAS", "Correo o contrasena incorrectos.", 401);
    await repo.registrarAcceso(usuario.id);
    fijarSesion(res, usuario);
    await auditoria.evento("auth.login", null, { cantidad: usuario.id });
    res.json({ usuario: await publico(usuario) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/logout */
rutasAuth.post("/logout", (req, res) => {
  res.clearCookie(NOMBRE_COOKIE, { path: "/" });
  res.status(204).end();
});

/** GET /api/auth/yo */
rutasAuth.get("/yo", requerirAuth, async (req, res, next) => {
  try {
    const usuario = await repo.buscarPorId(req.usuario.id);
    if (!usuario || !usuario.activo) throw new AppError("NO_AUTENTICADO", "Sesion invalida.", 401);
    res.json({ usuario: await publico(usuario) });
  } catch (e) {
    next(e);
  }
});

/** GET /api/auth/invitacion/:token -> datos publicos de la invitacion, para mostrarla antes de ingresar. */
rutasAuth.get("/invitacion/:token", limiteToken, async (req, res, next) => {
  try {
    const inv = await verInvitacion(req.params.token);
    if (!inv) throw new AppError("INVITACION_INVALIDA", "La invitacion no existe, ya fue usada o vencio.", 404);
    res.json(inv);
  } catch (e) {
    next(e);
  }
});

/** GET /api/auth/alta/:token -> datos publicos de una invitacion de la plataforma (alta de una escribania nueva). */
rutasAuth.get("/alta/:token", limiteToken, async (req, res, next) => {
  try {
    const inv = await altaPlataforma.ver(req.params.token);
    if (!inv) throw new AppError("INVITACION_INVALIDA", "La invitacion no existe, ya fue usada o vencio.", 404);
    res.json(inv);
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/recuperar {email} -> siempre 200 (no revela si el correo existe). */
rutasAuth.post(
  "/recuperar",
  limiteRecuperacion,
  limitar({ maximo: 3, ventanaMs: 60 * MINUTO, clave: (req) => normalizarEmail(req.body?.email), mensaje: "Ya se enviaron varios enlaces a ese correo. Revise su bandeja o espere una hora." }),
  async (req, res, next) => {
    try {
      const email = normalizarEmail(req.body?.email);
      const usuario = emailValido(email) ? await repo.buscarPorEmail(email) : null;
      if (usuario && usuario.activo) {
        const token = randomBytes(32).toString("base64url");
        await repo.crearTokenRecuperacion(usuario.id, token, env.auth.recuperacionMinutos);
        const enlace = `${env.appUrl}/restablecer?token=${token}`;
        await enviarCorreo({
          para: usuario.email,
          asunto: "Doy Fe: restablecer contrasena",
          texto: `Para elegir una nueva contrasena ingrese a:\n${enlace}\n\nEl enlace vence en ${env.auth.recuperacionMinutos} minutos. Si no lo pidio, ignore este correo.`,
          html: `<p>Para elegir una nueva contrase&ntilde;a ingrese a:</p><p><a href="${escaparHtml(enlace)}">${escaparHtml(enlace)}</a></p><p>El enlace vence en ${env.auth.recuperacionMinutos} minutos. Si no lo pidi&oacute;, ignore este correo.</p>`,
        });
        await auditoria.evento("auth.recuperacion_solicitada", null, { cantidad: usuario.id });
      } else {
        logger.info("Recuperacion solicitada para correo inexistente");
      }
      res.json({ ok: true, mensaje: "Si el correo esta registrado, recibira un enlace para restablecer la contrasena." });
    } catch (e) {
      next(e);
    }
  },
);

/** POST /api/auth/restablecer {token, password} */
rutasAuth.post("/restablecer", limiteToken, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    const errPass = validarPassword(password);
    if (errPass) throw new AppError("PASSWORD_DEBIL", errPass, 400);
    const usuarioId = await repo.consumirTokenRecuperacion(String(token || ""));
    if (!usuarioId) throw new AppError("TOKEN_INVALIDO", "El enlace es invalido o vencio. Solicite uno nuevo.", 400);
    const version = await repo.actualizarPassword(usuarioId, await hashPassword(password));
    const usuario = await repo.buscarPorId(usuarioId);
    fijarSesion(res, usuario, version);
    await auditoria.evento("auth.password_restablecida", null, { cantidad: usuarioId });
    res.json({ usuario: await publico(usuario) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/cambiar-password {actual, nueva} */
rutasAuth.post("/cambiar-password", requerirAuth, async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    const errPass = validarPassword(nueva);
    if (errPass) throw new AppError("PASSWORD_DEBIL", errPass, 400);
    const usuario = await repo.buscarPorEmail(req.usuario.email);
    if (!usuario || !(await verificarPassword(String(actual || ""), usuario.password_hash))) throw new AppError("CREDENCIALES_INVALIDAS", "La contrasena actual no es correcta.", 401);
    const version = await repo.actualizarPassword(usuario.id, await hashPassword(nueva));
    // Cambiar la contrasena invalida todas las cookies emitidas, tambien la de
    // este navegador: se emite una nueva para no echar a quien acaba de cambiarla.
    fijarSesion(res, usuario, version);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
