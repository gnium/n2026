/** Tokens de sesion firmados (HS256) con crypto nativo. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function firma(datos) {
  return createHmac("sha256", env.auth.secreto).update(datos).digest("base64url");
}

export function emitirToken(payload, ttlSegundos = env.auth.sesionSegundos) {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = b64u(JSON.stringify({ ...payload, iat: ahora, exp: ahora + ttlSegundos }));
  return `${cuerpo}.${firma(cuerpo)}`;
}

export function verificarToken(token) {
  if (typeof token !== "string") return null;
  const [cuerpo, sig] = token.split(".");
  if (!cuerpo || !sig) return null;
  const esperada = firma(cuerpo);
  if (sig.length !== esperada.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))) return null;
  try {
    const payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
