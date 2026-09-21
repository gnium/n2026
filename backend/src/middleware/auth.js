import { verificarToken } from "../auth/token.js";
import { AppError } from "../utils/errores.js";
import { env } from "../config/env.js";
import { buscarPorId, estadoCuenta } from "../auth/repositorio.js";
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

/**
 * Exige sesion valida; deja req.usuario = { id, email }.
 *
 * La firma del token no alcanza: tambien se comprueba contra la base que la
 * cuenta siga activa y que el token lleve la version de sesion vigente. Asi,
 * desactivar una cuenta o cambiar su contrasena corta las cookies ya emitidas
 * en el acto, en vez de dejarlas vivas hasta que venzan (hasta 12 h). El
 * estado se cachea 5 s para no agregar una consulta por pedido en las
 * pantallas que sondean.
 */
export async function requerirAuth(req, _res, next) {
  try {
    const token = leerCookies(req)[NOMBRE_COOKIE] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const payload = verificarToken(token);
    if (!payload?.sub) throw new AppError("NO_AUTENTICADO", "Debe iniciar sesion.", 401);
    const cuenta = await estadoCuenta(payload.sub);
    if (!cuenta || !cuenta.activo) throw new AppError("NO_AUTENTICADO", "La sesion ya no es valida.", 401);
    if (Number(payload.v || 0) !== Number(cuenta.sesion_version || 0)) {
      throw new AppError("NO_AUTENTICADO", "La sesion se cerro. Vuelva a ingresar.", 401);
    }
    req.usuario = { id: cuenta.id, email: cuenta.email };
    next();
  } catch (e) {
    next(e);
  }
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
