/**
 * Limitador de intentos en memoria (ventana deslizante simple).
 *
 * Alcanza para una sola instancia, que es como se despliega hoy. Si algun dia
 * hay mas de un proceso, esto hay que moverlo a la base o a Redis: son dos
 * contadores, pero el limite se multiplicaria por la cantidad de instancias.
 *
 * Cubre lo que no se puede dejar abierto: probar contrasenas, pedir
 * recuperaciones (cada una manda un correo), crear cuentas y quemar
 * invitaciones a fuerza de bruta.
 */
import { AppError } from "../utils/errores.js";

const baldes = new Map();

setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of baldes) if (ahora > v.hasta) baldes.delete(k);
}, 60_000).unref();

/** Cuenta un intento y devuelve true si ya se paso del limite. */
export function excedido(clave, maximo, ventanaMs) {
  const ahora = Date.now();
  const b = baldes.get(clave);
  if (!b || ahora > b.hasta) {
    baldes.set(clave, { n: 1, hasta: ahora + ventanaMs });
    return false;
  }
  b.n += 1;
  return b.n > maximo;
}

export function limpiar(clave) {
  baldes.delete(clave);
}

/**
 * Middleware. `clave` arma el identificador del balde a partir del pedido
 * (por omision, la IP). Conviene combinar IP y el dato apuntado (el correo,
 * por ejemplo) para que rotar de IP no alcance y para no castigar a toda una
 * oficina detras de una misma salida a internet.
 */
export function limitar({ maximo, ventanaMs, clave = (req) => req.ip, mensaje }) {
  return (req, _res, next) => {
    const id = `${req.method} ${req.baseUrl}${req.path}|${clave(req)}`;
    if (excedido(id, maximo, ventanaMs)) {
      return next(new AppError("DEMASIADOS_INTENTOS", mensaje || "Demasiados intentos. Espere unos minutos y vuelva a probar.", 429));
    }
    next();
  };
}
