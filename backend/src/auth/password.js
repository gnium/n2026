/** Hash de contrasenas con scrypt (crypto nativo de Node): sin dependencias nativas. */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const N = 16384;
const LARGO = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, LARGO, { N });
  return `scrypt$${N}$${salt.toString("base64")}$${Buffer.from(hash).toString("base64")}`;
}

export async function verificarPassword(password, almacenado) {
  try {
    const [alg, n, saltB64, hashB64] = almacenado.split("$");
    if (alg !== "scrypt") return false;
    const esperado = Buffer.from(hashB64, "base64");
    const calculado = Buffer.from(await scrypt(password, Buffer.from(saltB64, "base64"), esperado.length, { N: Number(n) }));
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

export function validarPassword(password) {
  if (typeof password !== "string" || password.length < 10) return "La contrasena debe tener al menos 10 caracteres.";
  if (password.length > 200) return "La contrasena es demasiado larga.";
  return null;
}
