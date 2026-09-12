/**
 * Precios de cada proveedor de IA (USD por millon de tokens), editables desde
 * la aplicacion (Configuracion -> Precios) y guardados en `precios_ia`.
 *
 * IMPORTANTE: los precios de Gemini cambian con frecuencia (Google publica
 * modelos "preview" nuevos cada pocos meses). Los que trae el seed estan
 * marcados como aproximados; conviene verificarlos en
 * https://ai.google.dev/gemini-api/docs/pricing y corregirlos aqui si
 * difieren antes de usar el costo para facturar a un tercero.
 */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

const cache = new Map(); // "proveedor::modelo" -> { entrada, salida, cache, aproximado }
let cargado = false;

export async function cargarPrecios() {
  const [rows] = await pool.query("SELECT proveedor, modelo, precio_entrada, precio_salida, precio_cache, aproximado FROM precios_ia");
  cache.clear();
  for (const r of rows) {
    cache.set(`${r.proveedor}::${r.modelo}`, { entrada: Number(r.precio_entrada), salida: Number(r.precio_salida), cache: r.precio_cache === null ? null : Number(r.precio_cache), aproximado: Boolean(r.aproximado) });
  }
  cargado = true;
}

export async function listarPrecios() {
  if (!cargado) await cargarPrecios();
  const [rows] = await pool.query("SELECT proveedor, modelo, precio_entrada AS entrada, precio_salida AS salida, precio_cache AS cache, aproximado, actualizado_en FROM precios_ia ORDER BY proveedor, modelo");
  return rows;
}

export async function guardarPrecio({ proveedor, modelo, entrada, salida, cache: precioCache, aproximado }) {
  if (!["anthropic", "gemini", "local", "mock"].includes(proveedor)) throw new AppError("PROVEEDOR_INVALIDO", "Proveedor invalido.", 400);
  if (!modelo || typeof modelo !== "string" || modelo.length > 80) throw new AppError("MODELO_INVALIDO", "Indique el nombre exacto del modelo.", 400);
  for (const [nombre, v] of [["entrada", entrada], ["salida", salida]]) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new AppError("PRECIO_INVALIDO", `El precio de ${nombre} debe ser un numero mayor o igual a 0.`, 400);
  }
  if (precioCache !== null && precioCache !== undefined && (typeof precioCache !== "number" || !Number.isFinite(precioCache) || precioCache < 0)) {
    throw new AppError("PRECIO_INVALIDO", "El precio de cache debe ser un numero mayor o igual a 0, o vacio.", 400);
  }
  await pool.query(
    `INSERT INTO precios_ia (proveedor, modelo, precio_entrada, precio_salida, precio_cache, aproximado) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE precio_entrada = VALUES(precio_entrada), precio_salida = VALUES(precio_salida), precio_cache = VALUES(precio_cache), aproximado = VALUES(aproximado)`,
    [proveedor, modelo.trim(), entrada, salida, precioCache ?? null, aproximado ? 1 : 0],
  );
  await cargarPrecios();
}

export async function borrarPrecio(proveedor, modelo) {
  await pool.query("DELETE FROM precios_ia WHERE proveedor = ? AND modelo = ?", [proveedor, modelo]);
  await cargarPrecios();
}

/**
 * Costo estimado de una llamada, en USD, o null si no hay precio cargado
 * para ese proveedor+modelo (se ve como "N/D" en la interfaz).
 * `local` y `mock` siempre cuestan 0: corren en la propia maquina o son de prueba.
 */
export function calcularCosto({ proveedor, modelo, tokensEntrada = 0, tokensSalida = 0, cacheLeido = 0 }) {
  if (proveedor === "local" || proveedor === "mock") return { costo: 0, aproximado: false, precioEncontrado: true };
  if (!cargado) return { costo: null, aproximado: false, precioEncontrado: false };
  const p = cache.get(`${proveedor}::${modelo}`);
  if (!p) return { costo: null, aproximado: false, precioEncontrado: false };
  const frescos = Math.max(0, tokensEntrada - cacheLeido);
  const precioCache = p.cache ?? p.entrada;
  const costo = (frescos * p.entrada + cacheLeido * precioCache + tokensSalida * p.salida) / 1_000_000;
  return { costo, aproximado: p.aproximado, precioEncontrado: true };
}

/** proveedor tal como se guarda en precios_ia/ejecuciones_skills, a partir del modo activo del pipeline. */
export function proveedorDeModo(modo) {
  return { real: "anthropic", gemini: "gemini", local: "local", simulado: "mock" }[modo] || "mock";
}
