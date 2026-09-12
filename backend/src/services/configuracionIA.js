/**
 * Configuracion del proveedor de IA editable desde la aplicacion.
 * Se guarda en la tabla `configuracion` (la clave de API cifrada) y se cachea
 * en memoria. Las variables de entorno actuan como valores por defecto.
 */
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errores.js";

const CLAVES = {
  proveedor: "ia_proveedor", // anthropic | local | mock | auto
  apiKey: "ia_anthropic_api_key_enc",
  modelo: "ia_modelo",
  localBaseUrl: "ia_local_base_url",
  localModelo: "ia_local_modelo",
  localApiKey: "ia_local_api_key_enc",
  geminiApiKey: "ia_gemini_api_key_enc",
  geminiModelo: "ia_gemini_modelo",
};

const cache = { cargada: false, proveedor: null, apiKey: null, modelo: null, localBaseUrl: null, localModelo: null, localApiKey: null, geminiApiKey: null, geminiModelo: null, claveIlegible: false };

export async function cargarConfiguracionIA() {
  const [rows] = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN (?)", [Object.values(CLAVES)]);
  const m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  cache.proveedor = m[CLAVES.proveedor] || null;
  cache.modelo = m[CLAVES.modelo] || null;
  cache.localBaseUrl = m[CLAVES.localBaseUrl] || null;
  cache.localModelo = m[CLAVES.localModelo] || null;
  cache.claveIlegible = false;
  cache.apiKey = null;
  cache.localApiKey = null;
  if (m[CLAVES.apiKey]) {
    cache.apiKey = descifrar(m[CLAVES.apiKey]);
    if (!cache.apiKey) {
      cache.claveIlegible = true;
      logger.warn("La clave de API guardada no se puede descifrar (¿cambio JWT_SECRET?). Vuelva a cargarla desde Configuracion.");
    }
  }
  if (m[CLAVES.localApiKey]) cache.localApiKey = descifrar(m[CLAVES.localApiKey]);
  cache.geminiApiKey = m[CLAVES.geminiApiKey] ? descifrar(m[CLAVES.geminiApiKey]) : null;
  cache.geminiModelo = m[CLAVES.geminiModelo] || null;
  // Migracion: Google retiro gemini-2.5-pro para cuentas nuevas; se reemplaza por el modelo por defecto actual.
  if (cache.geminiModelo && /^gemini-2\.5-pro/.test(cache.geminiModelo)) {
    logger.warn(`Modelo Gemini guardado (${cache.geminiModelo}) retirado por Google; se cambia a ${env.llm.gemini.modelo}.`);
    cache.geminiModelo = env.llm.gemini.modelo;
    await guardarClave(CLAVES.geminiModelo, cache.geminiModelo);
  }
  cache.cargada = true;
  return cache;
}

async function guardarClave(clave, valor) {
  if (valor === null || valor === undefined || valor === "") {
    await pool.query("DELETE FROM configuracion WHERE clave = ?", [clave]);
  } else {
    await pool.query("INSERT INTO configuracion (clave, valor, descripcion) VALUES (?, ?, 'Configuracion de IA (editada desde la aplicacion)') ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [clave, valor]);
  }
}

/** Valores efectivos: base de datos si existe, si no variables de entorno. */
export function configIA() {
  const hayClaveEnv = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return {
    proveedor: cache.proveedor || env.llm.proveedor || "auto",
    apiKey: cache.apiKey || process.env.ANTHROPIC_API_KEY || null,
    origenClave: cache.apiKey ? "aplicacion" : hayClaveEnv ? "entorno" : null,
    claveIlegible: cache.claveIlegible,
    modelo: cache.modelo || env.claude.model,
    modeloFijadoEnApp: Boolean(cache.modelo),
    localBaseUrl: cache.localBaseUrl || env.llm.local.baseUrl,
    localModelo: cache.localModelo || env.llm.local.modelo,
    localApiKey: cache.localApiKey || env.llm.local.apiKey || "",
    geminiApiKey: cache.geminiApiKey || env.llm.gemini.apiKey || null,
    origenClaveGemini: cache.geminiApiKey ? "aplicacion" : env.llm.gemini.apiKey ? "entorno" : null,
    geminiModelo: cache.geminiModelo || env.llm.gemini.modelo,
  };
}

const MODELOS_CLAUDE = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8", "claude-sonnet-4-6"];

export async function guardarConfiguracionIA({ proveedor, apiKey, modelo, localBaseUrl, localModelo, localApiKey, geminiApiKey, geminiModelo }) {
  if (proveedor !== undefined) {
    if (!["auto", "anthropic", "gemini", "local", "mock"].includes(proveedor)) throw new AppError("PROVEEDOR_INVALIDO", "Proveedor invalido.", 400);
    await guardarClave(CLAVES.proveedor, proveedor);
  }
  if (apiKey !== undefined) {
    // "" borra la clave; undefined la conserva.
    if (apiKey && !/^sk-ant-\S{10,}$/.test(apiKey.trim())) throw new AppError("CLAVE_INVALIDA", "La clave debe empezar con sk-ant- y no contener espacios (se crea en console.anthropic.com).", 400);
    await guardarClave(CLAVES.apiKey, apiKey ? cifrar(apiKey.trim()) : "");
  }
  if (modelo !== undefined) {
    if (modelo && !MODELOS_CLAUDE.includes(modelo)) throw new AppError("MODELO_INVALIDO", `Modelo no reconocido. Opciones: ${MODELOS_CLAUDE.join(", ")}.`, 400);
    await guardarClave(CLAVES.modelo, modelo || "");
  }
  if (localBaseUrl !== undefined) {
    if (localBaseUrl && !/^https?:\/\//.test(localBaseUrl)) throw new AppError("URL_INVALIDA", "La URL de la IA local debe empezar con http:// o https://", 400);
    await guardarClave(CLAVES.localBaseUrl, (localBaseUrl || "").replace(/\/$/, ""));
  }
  if (localModelo !== undefined) await guardarClave(CLAVES.localModelo, String(localModelo || "").slice(0, 120));
  if (localApiKey !== undefined) await guardarClave(CLAVES.localApiKey, localApiKey ? cifrar(localApiKey) : "");
  if (geminiApiKey !== undefined) {
    if (geminiApiKey && !/^\S{10,300}$/.test(geminiApiKey.trim())) throw new AppError("CLAVE_INVALIDA", "La clave de Gemini no puede contener espacios ni estar vacia. Use \"Probar conexion\" para validarla contra Google.", 400);
    await guardarClave(CLAVES.geminiApiKey, geminiApiKey ? cifrar(geminiApiKey.trim()) : "");
  }
  if (geminiModelo !== undefined) {
    if (geminiModelo && !/^[a-z0-9.-]{3,80}$/.test(geminiModelo)) throw new AppError("MODELO_INVALIDO", "Nombre de modelo Gemini invalido (ej.: gemini-2.5-pro).", 400);
    await guardarClave(CLAVES.geminiModelo, geminiModelo || "");
  }
  await cargarConfiguracionIA();
  return vistaPublicaIA();
}

export function vistaPublicaIA() {
  const c = configIA();
  const enmascarar = (k) => (k ? `${k.slice(0, 10)}…${k.slice(-4)}` : null);
  return {
    proveedor: c.proveedor,
    modelo: c.modelo,
    modelosDisponibles: MODELOS_CLAUDE,
    tieneClave: Boolean(c.apiKey),
    claveEnmascarada: enmascarar(c.apiKey),
    origenClave: c.origenClave,
    claveIlegible: c.claveIlegible,
    localBaseUrl: c.localBaseUrl,
    localModelo: c.localModelo,
    tieneClaveLocal: Boolean(c.localApiKey),
    geminiModelo: c.geminiModelo,
    tieneClaveGemini: Boolean(c.geminiApiKey),
    claveGeminiEnmascarada: c.geminiApiKey ? `${c.geminiApiKey.slice(0, 6)}…${c.geminiApiKey.slice(-4)}` : null,
    origenClaveGemini: c.origenClaveGemini,
  };
}
