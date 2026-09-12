import { verificarToken } from "../auth/token.js";
import { AppError } from "../utils/errores.js";
import { env } from "../config/env.js";
import { buscarPorId } from "../auth/repositorio.js";

export const NOMBRE_COOKIE = "notarius_sesion";

export function leerCookies(req) {
  const out = {};
  for (const par of (req.headers.cookie || "").split(";")) {
    const i = par.indexOf("=");
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}

export function opcionesCookie(maxAgeSegundos) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.auth.cookieSegura,
    path: "/",
    maxAge: maxAgeSegundos * 1000,
  };
}

/** Exige sesion valida; deja req.usuario = { id, email }. */
export function requerirAuth(req, _res, next) {
  const token = leerCookies(req)[NOMBRE_COOKIE] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verificarToken(token);
  if (!payload?.sub) return next(new AppError("NO_AUTENTICADO", "Debe iniciar sesion.", 401));
  req.usuario = { id: payload.sub, email: payload.email };
  next();
}

/**
 * Exige que el usuario autenticado sea administrador. Consulta la BD en cada
 * pedido (no confia en un dato viejo del token) porque el rol puede cambiar
 * despues de emitida la cookie. Usar siempre DESPUES de requerirAuth.
 */
export async function requerirAdmin(req, _res, next) {
  try {
    const u = await buscarPorId(req.usuario.id);
    if (!u || !u.activo || !u.es_admin) return next(new AppError("PROHIBIDO", "Esta accion requiere una cuenta administradora.", 403));
    req.usuarioCompleto = u;
    next();
  } catch (e) {
    next(e);
  }
}
