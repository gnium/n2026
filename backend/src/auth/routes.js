import { Router } from "express";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { auditoria } from "../services/auditoria.js";
import { enviarCorreo } from "../services/correo.js";
import { hashPassword, verificarPassword, validarPassword } from "./password.js";
import { emitirToken } from "./token.js";
import { NOMBRE_COOKIE, opcionesCookie, requerirAuth } from "../middleware/auth.js";
import * as repo from "./repositorio.js";

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

function fijarSesion(res, usuario) {
  const token = emitirToken({ sub: usuario.id, email: usuario.email });
  res.cookie(NOMBRE_COOKIE, token, opcionesCookie(env.auth.sesionSegundos));
}

const publico = (u) => ({ id: u.id, email: u.email, nombre: u.nombre, esAdmin: Boolean(u.es_admin) });

/** POST /api/auth/registro {email, password, nombre?, codigo?} */
rutasAuth.post("/registro", async (req, res, next) => {
  try {
    const email = normalizarEmail(req.body?.email);
    const { password, nombre, codigo } = req.body || {};
    if (!emailValido(email)) throw new AppError("EMAIL_INVALIDO", "Ingrese un correo valido.", 400);
    const errPass = validarPassword(password);
    if (errPass) throw new AppError("PASSWORD_DEBIL", errPass, 400);

    // Politica: el primer usuario se registra libremente; luego hace falta el codigo de registro (o REGISTRO_ABIERTO=1).
    const cantidad = await repo.contarUsuarios();
    const permitido = cantidad === 0 || env.auth.registroAbierto || (env.auth.codigoRegistro && codigo === env.auth.codigoRegistro);
    if (!permitido) throw new AppError("REGISTRO_CERRADO", "El registro requiere el codigo de invitacion configurado por la administradora.", 403);

    if (await repo.buscarPorEmail(email)) throw new AppError("EMAIL_EN_USO", "Ya existe una cuenta con ese correo.", 409);
    const id = await repo.crearUsuario({ email, nombre: String(nombre || "").slice(0, 120), passwordHash: await hashPassword(password) });
    const usuario = await repo.buscarPorId(id);
    fijarSesion(res, usuario);
    await auditoria.evento("auth.registro", null, { cantidad: id });
    res.status(201).json({ usuario: publico(usuario) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/login {email, password} */
rutasAuth.post("/login", async (req, res, next) => {
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
    res.json({ usuario: publico(usuario) });
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
    res.json({ usuario: publico(usuario) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/recuperar {email} -> siempre 200 (no revela si el correo existe). */
rutasAuth.post("/recuperar", async (req, res, next) => {
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
        html: `<p>Para elegir una nueva contrase&ntilde;a ingrese a:</p><p><a href="${enlace}">${enlace}</a></p><p>El enlace vence en ${env.auth.recuperacionMinutos} minutos. Si no lo pidi&oacute;, ignore este correo.</p>`,
      });
      await auditoria.evento("auth.recuperacion_solicitada", null, { cantidad: usuario.id });
    } else {
      logger.info("Recuperacion solicitada para correo inexistente");
    }
    res.json({ ok: true, mensaje: "Si el correo esta registrado, recibira un enlace para restablecer la contrasena." });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/restablecer {token, password} */
rutasAuth.post("/restablecer", async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    const errPass = validarPassword(password);
    if (errPass) throw new AppError("PASSWORD_DEBIL", errPass, 400);
    const usuarioId = await repo.consumirTokenRecuperacion(String(token || ""));
    if (!usuarioId) throw new AppError("TOKEN_INVALIDO", "El enlace es invalido o vencio. Solicite uno nuevo.", 400);
    await repo.actualizarPassword(usuarioId, await hashPassword(password));
    const usuario = await repo.buscarPorId(usuarioId);
    fijarSesion(res, usuario);
    await auditoria.evento("auth.password_restablecida", null, { cantidad: usuarioId });
    res.json({ usuario: publico(usuario) });
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
    await repo.actualizarPassword(usuario.id, await hashPassword(nueva));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
