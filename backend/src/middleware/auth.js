import { verificarToken } from "../auth/token.js";
import { AppError } from "../utils/errores.js";
import { env } from "../config/env.js";
import { buscarPorId } from "../auth/repositorio.js";
import { contexto, alcanza } from "../services/equipo.js";

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

const MOTIVO = {
  escribano: "Esta seccion esta reservada a la escribana o el escribano: el protocolo, la caja, los comprobantes y los legajos UIF no son visibles para las cuentas con rol empleado.",
  titular: "Esta accion la hace la titular del equipo.",
};

/**
 * Exige un rol minimo dentro del equipo (empleado < escribano < titular).
 * Se consulta en cada pedido, como requerirAdmin, porque la titular puede
 * cambiar el rol despues de emitida la cookie. Deja req.contexto con el rol
 * y el equipo. Usar siempre DESPUES de requerirAuth.
 */
export function requerirRol(minimo) {
  return async (req, _res, next) => {
    try {
      const ctx = await contexto(req.usuario.id); // lanza NO_AUTENTICADO si la cuenta esta desactivada
      req.contexto = ctx;
      if (ctx.suspendido) return next(new AppError("CUENTA_SUSPENDIDA", "Su cuenta esta suspendida en el equipo. Hable con la titular.", 403));
      if (!alcanza(ctx.rol, minimo)) return next(new AppError("PROHIBIDO", MOTIVO[minimo] || "No tiene permiso para esta accion.", 403));
      next();
    } catch (e) {
      next(e);
    }
  };
}
