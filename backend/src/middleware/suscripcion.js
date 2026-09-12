/**
 * Exige una suscripcion activa para iniciar un documento NUEVO. Solo actua
 * si la administradora activo `suscripcion_requerida` en Configuracion; por
 * defecto queda apagado para no interrumpir instalaciones de una sola
 * escribana o escribano. La administradora siempre puede usar la app, tenga o no plan.
 * Usar siempre DESPUES de requerirAuth (y de requerirAdmin no hace falta).
 */
import { buscarPorId } from "../auth/repositorio.js";
import { parametrosFacturacion } from "../services/facturacion.js";
import { AppError } from "../utils/errores.js";

export async function requerirSuscripcionActiva(req, _res, next) {
  try {
    const { suscripcionRequerida } = await parametrosFacturacion();
    if (!suscripcionRequerida) return next();
    const u = req.usuarioCompleto || (await buscarPorId(req.usuario.id));
    if (u?.es_admin) return next();
    if (u?.estado_suscripcion === "activa") return next();
    throw new AppError("SUSCRIPCION_INACTIVA", "Su suscripción no está activa. Actívela en Suscripción para seguir procesando documentos.", 402);
  } catch (e) {
    next(e);
  }
}
