/**
 * Defensa CSRF por origen.
 *
 * La sesion viaja en una cookie SameSite=Lax, que ya frena el grueso de los
 * envios entre sitios, pero no todo: Lax deja pasar navegaciones de nivel
 * superior, y un formulario que no se pueda distinguir de una navegacion
 * seguiria llevando la cookie. Como la interfaz habla siempre con su mismo
 * origen (y en despliegue de un solo servicio es literalmente el mismo host),
 * se puede exigir que todo pedido que MODIFIQUE algo declare un origen conocido.
 *
 * No aplica a /api/webhooks: ahi no hay cookie, la autenticacion es la firma
 * HMAC de Mercado Pago, y el pedido viene de un servidor sin Origin.
 */
import { AppError } from "../utils/errores.js";
import { env } from "../config/env.js";

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

const host = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

export function verificarOrigen(req, _res, next) {
  if (SEGUROS.has(req.method)) return next();
  if (req.path.startsWith("/webhooks")) return next();

  // Chrome/Firefox/Safari modernos mandan Sec-Fetch-Site: un 'same-origin' es
  // prueba directa de que el pedido salio de la propia app.
  const sitio = req.headers["sec-fetch-site"];
  if (sitio === "same-origin" || sitio === "none") return next();
  if (sitio && sitio !== "same-site") {
    return next(new AppError("ORIGEN_INVALIDO", "Pedido rechazado: proviene de otro sitio.", 403));
  }

  const declarado = req.headers.origin || req.headers.referer;
  if (!declarado) {
    // Sin Origin ni Referer no hay forma de saber de donde vino. Los clientes
    // que no son un navegador pueden usar el encabezado Authorization, que no
    // se envia solo y por lo tanto no es vulnerable a CSRF.
    if ((req.headers.authorization || "").startsWith("Bearer ")) return next();
    return next(new AppError("ORIGEN_INVALIDO", "Pedido rechazado: falta el origen.", 403));
  }

  const permitidos = new Set([host(env.frontendOrigin), host(env.appUrl), req.headers.host].filter(Boolean));
  if (!permitidos.has(host(declarado))) {
    return next(new AppError("ORIGEN_INVALIDO", "Pedido rechazado: proviene de otro sitio.", 403));
  }
  next();
}
