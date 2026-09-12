/**
 * Logger minimo. REGLA: nunca se le pasa contenido del documento, entidades
 * ni el mapa de anonimizacion. Solo mensajes fijos y metadatos numericos.
 */
const CLAVES_PROHIBIDAS = new Set(["mapping", "mapa", "texto", "text", "valor_literal", "variantes", "contenido"]);

function limpiar(meta) {
  if (!meta || typeof meta !== "object") return meta;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (CLAVES_PROHIBIDAS.has(k)) continue;
    out[k] = typeof v === "object" && v !== null ? "[omitido]" : v;
  }
  return out;
}

function linea(nivel, msg, meta) {
  const ts = new Date().toISOString();
  const extra = meta ? " " + JSON.stringify(limpiar(meta)) : "";
  const fn = nivel === "error" ? console.error : nivel === "warn" ? console.warn : console.log;
  fn(`[${ts}] ${nivel.toUpperCase()} ${msg}${extra}`);
}

export const logger = {
  info: (m, meta) => linea("info", m, meta),
  warn: (m, meta) => linea("warn", m, meta),
  error: (m, meta) => linea("error", m, meta),
};
