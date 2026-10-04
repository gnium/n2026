/**
 * Puerta de acceso al trabajo nuevo segun el estado de pago de la cuenta.
 *
 * Dos reglas distintas:
 *
 *  1. Prueba vencida: SIEMPRE bloquea, este o no activado
 *     `suscripcion_requerida`. Una cuenta que llego al final de sus 60 dias
 *     sin suscribirse no sigue generando documentos (y sus datos estan en
 *     camino de borrarse: ver services/prueba.js).
 *  2. `suscripcion_requerida` (opcional, la activa la administradora): con
 *     ella encendida tampoco pueden trabajar las cuentas sin suscripcion. Por
 *     omision queda apagada para no interrumpir instalaciones de una sola
 *     escribana o escribano que no pasan por Mercado Pago.
 *
 * El control mira la FECHA de fin de prueba, no el estado. El estado lo mueve
 * Mercado Pago a pedido de la propia cuenta (crear una suscripcion la deja
 * `pendiente`, cancelarla la deja `cancelada`), asi que condicionar el bloqueo
 * a que diga `vencida` dejaba salir de la prueba con un pedido cualquiera y sin
 * pagar. `prueba_termina_en` solo se limpia cuando la suscripcion queda activa.
 *
 * Durante la prueba la cuenta trabaja normalmente. La cuenta operadora siempre
 * puede. Usar siempre DESPUES de requerirAuth.
 */
import { buscarPorId } from "../auth/repositorio.js";
import { parametrosFacturacion } from "../services/facturacion.js";
import { modulosDelPlan } from "../services/facturacion.js";
import { AppError } from "../utils/errores.js";
import { pruebaVencida, enPrueba } from "../services/prueba.js";

export async function requerirSuscripcionActiva(req, _res, next) {
  try {
    const u = req.usuarioCompleto || (await buscarPorId(req.usuario.id));
    if (u?.es_admin) return next();
    if (u?.estado_suscripcion === "activa") return next();

    if (pruebaVencida(u)) {
      throw new AppError(
        "PRUEBA_VENCIDA",
        "Su periodo de prueba termino. Active una suscripcion para seguir trabajando: hasta entonces puede entrar y exportar lo suyo, pero no iniciar documentos nuevos.",
        402,
      );
    }
    if (enPrueba(u)) return next();

    const { suscripcionRequerida } = await parametrosFacturacion();
    if (!suscripcionRequerida) return next();
    throw new AppError("SUSCRIPCION_INACTIVA", "Su suscripción no está activa. Actívela en Suscripción para seguir procesando documentos.", 402);
  } catch (e) {
    next(e);
  }
}

export function requerirModulo(modulo) {
  return async (req, _res, next) => {
    try {
      const u = req.usuarioCompleto || (await buscarPorId(req.usuario.id));
      if (u?.es_admin) return next();
      const modulos = await modulosDelPlan(u.plan_id);
      if (modulos === null || modulos.includes(modulo)) return next();
      throw new AppError("MODULO_NO_DISPONIBLE", "Su plan no incluye esta función. Actualice su suscripción para acceder.", 403);
    } catch (e) {
      next(e);
    }
  };
}
