/**
 * Cifrado simetrico AES-256-GCM para datos sensibles guardados en la base.
 * Cada "contexto" deriva su propia llave (mismo secreto raiz, distinto salt), para que
 * comprometer o rotar una no afecte a las demas. "config" es el contexto historico
 * (secretos de configuracion, ej.: clave de API) y se mantiene igual para no romper
 * lo que ya esta cifrado en la base.
 *
 * El secreto raiz sale de DATA_ENCRYPTION_KEY y, si no esta, de JWT_SECRET.
 * Conviene separarlos: JWT_SECRET deberia poder rotarse (echa a todas las
 * sesiones y listo), pero rotarlo cuando tambien cifra datos vuelve ilegibles
 * los identificadores de clientes, el protocolo y las credenciales de ARCA, sin
 * aviso y sin vuelta atras. Con DATA_ENCRYPTION_KEY cargada, rotar el de
 * sesiones no toca nada de lo guardado.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/env.js";

const llaves = new Map();
function getLlave(contexto) {
  if (!llaves.has(contexto)) llaves.set(contexto, scryptSync(env.datosSecreto || env.auth.secreto, `notarius-${contexto}-v1`, 32));
  return llaves.get(contexto);
}

export function cifrar(texto, contexto = "config") {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", getLlave(contexto), iv);
  const enc = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

/** Devuelve null si no se puede descifrar (por ejemplo, cambio JWT_SECRET o contexto equivocado). */
export function descifrar(valor, contexto = "config") {
  try {
    const [v, ivB, tagB, encB] = String(valor).split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", getLlave(contexto), Buffer.from(ivB, "base64url"));
    d.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([d.update(Buffer.from(encB, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
