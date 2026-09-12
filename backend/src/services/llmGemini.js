/**
 * Proveedor Google Gemini via API REST (generativelanguage.googleapis.com).
 * Pide salida JSON con el mismo esquema que Claude; si el servidor rechaza
 * responseSchema, reintenta con responseMimeType JSON e instruccion en el prompt.
 *
 * Si el modelo elegido falla de forma repetida (saturado, sin cuota, retirado),
 * el skill cae automaticamente a otro modelo "flash" del plan gratuito.
 *
 * ADVERTENCIA: en el plan gratuito de la API de Gemini, Google puede usar los
 * datos enviados para mejorar sus modelos. Para datos de clientes conviene el plan pago.
 */
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { configIA } from "./configuracionIA.js";

/** Adapta el JSON Schema de Zod al subconjunto OpenAPI que acepta Gemini. */
export function esquemaParaGemini(schema) {
  const rec = (n) => {
    if (Array.isArray(n)) return n.map(rec);
    if (!n || typeof n !== "object") return n;
    const o = {};
    for (const [k, v] of Object.entries(n)) {
      if (["$schema", "additionalProperties", "default", "$id", "title"].includes(k)) continue;
      o[k] = rec(v);
    }
    // { anyOf: [X, {type:"null"}] }  ->  { ...X, nullable: true }
    if (Array.isArray(o.anyOf) && o.anyOf.length === 2 && o.anyOf.some((x) => x?.type === "null")) {
      const base = o.anyOf.find((x) => x?.type !== "null");
      delete o.anyOf;
      return { ...rec(base), nullable: true };
    }
    if (Array.isArray(o.type) && o.type.includes("null")) {
      o.type = o.type.find((t) => t !== "null");
      o.nullable = true;
    }
    return o;
  };
  return rec(schema);
}

function extraerJson(texto) {
  const limpio = texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(limpio);
  } catch {
    const i = limpio.indexOf("{");
    const j = limpio.lastIndexOf("}");
    if (i >= 0 && j > i) return JSON.parse(limpio.slice(i, j + 1));
    throw new AppError("JSON_INVALIDO", "Gemini no devolvio un JSON valido.", 500);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lista de respaldo si no se puede consultar la API (sin conexion a /models). Se prueban en este orden. */
const MODELOS_FLASH_RESPALDO = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];

/** Nombre "limpio" de modelo GA: gemini-<version>-flash(-lite), sin sufijos preview/omni/exp. Estos suelen tener
 *  mas cuota y menos saturacion que los preview/omni, que comparten un pool de demanda mas chico. */
function esModeloEstable(id) {
  return /^gemini-\d+(?:\.\d+)?-flash(?:-lite)?$/.test(id);
}

/** Modelos "flash" (plan gratuito) que admiten generateContent para esta clave: primero los GA estables (mas
 *  capaces y con mas cuota primero dentro de ese grupo), y como ultimo recurso los preview/omni/latest, que
 *  se saturan con mucha mas frecuencia. */
async function listarModelosFlash(apiKey) {
  try {
    const r = await fetch(`${env.llm.gemini.baseUrl.replace(/\/$/, "")}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return MODELOS_FLASH_RESPALDO;
    const data = await r.json();
    const ids = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((id) => /flash/i.test(id) && !/embedding|imagen|veo|tts|audio|image|live|robotics|computer-use/i.test(id));
    const orden = (a, b) => {
      const ea = esModeloEstable(a), eb = esModeloEstable(b);
      if (ea !== eb) return ea ? -1 : 1;
      return b.localeCompare(a);
    };
    return ids.length ? [...new Set(ids)].sort(orden) : MODELOS_FLASH_RESPALDO;
  } catch {
    return MODELOS_FLASH_RESPALDO;
  }
}

/** Errores por los que vale la pena probar OTRO modelo (disponibilidad), no un problema de la cuenta o del contenido. */
function esErrorDeDisponibilidad(e) {
  return ["SIN_CONEXION", "TIMEOUT_GEMINI", "ERROR_GEMINI", "LIMITE_TASA", "MODELO_INEXISTENTE"].includes(e.codigo);
}

/** Reintenta ante errores transitorios (503 alta demanda, 429 sin cuota cero, 500) con espera creciente. */
export async function pedirGemini(args) {
  const esperas = [3000, 8000, 20000];
  for (let i = 0; ; i++) {
    try {
      return await pedirGeminiUnaVez(args);
    } catch (e) {
      const transitorio = e.status_http === 503 || e.status_http === 500 || (e.status_http === 429 && !/limit: 0/.test(e.mensaje_google || ""));
      if (!transitorio || i >= esperas.length || args.sinReintentos) throw e;
      logger.warn(`Gemini (${args.modelo}) respondio ${e.status_http}; reintento ${i + 1}/${esperas.length} en ${esperas[i] / 1000} s`);
      args.onReintento?.(i + 1, esperas[i]);
      await dormir(esperas[i]);
    }
  }
}

async function pedirGeminiUnaVez({ apiKey, modelo, cuerpo, timeoutMs }) {
  const url = `${env.llm.gemini.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(modelo)}:generateContent`;
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e.name === "TimeoutError") throw new AppError("TIMEOUT_GEMINI", "Gemini tardo demasiado en responder.", 504);
    throw new AppError("SIN_CONEXION", "No se pudo conectar con la API de Gemini.", 503);
  }
  if (!res.ok) {
    const detalle = await res.json().catch(() => ({}));
    let msg = detalle?.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 && /free_tier/.test(msg) && /limit: 0/.test(msg)) {
      msg = `El modelo ${modelo} no esta incluido en el plan gratuito de Google (cuota 0).`;
    } else if (res.status === 429) {
      const seg = msg.match(/retry in ([\d.]+)s/i)?.[1];
      msg = `Cuota de Gemini agotada por ahora${seg ? ` (reintentar en ${Math.ceil(Number(seg))} s)` : ""}. En el plan gratuito hay limites por minuto y por dia.`;
    } else if (res.status === 503 && /high demand/i.test(msg)) {
      msg = `El modelo ${modelo} esta saturado en este momento (alta demanda).`;
    }
    const e = new AppError(res.status === 400 && /API key/i.test(msg) ? "CREDENCIAL_INVALIDA" : res.status === 403 ? "SIN_PERMISO" : res.status === 404 ? "MODELO_INEXISTENTE" : res.status === 429 ? "LIMITE_TASA" : "ERROR_GEMINI", `Gemini: ${msg}`, res.status === 429 ? 503 : res.status >= 500 ? 502 : 400, null);
    e.status_http = res.status;
    e.mensaje_google = msg;
    throw e;
  }
  return res.json();
}

/** Un intento completo (con sus reintentos por saturacion) contra UN modelo puntual. */
async function intentarConModelo({ apiKey, modelo, base, jsonSchema, entrada, onReintento }) {
  try {
    return await pedirGemini({ apiKey, modelo, timeoutMs: env.llm.gemini.timeoutMs, onReintento, cuerpo: { ...base, generationConfig: { ...base.generationConfig, responseSchema: esquemaParaGemini(jsonSchema) } } });
  } catch (e) {
    if (e.status_http === 400 && !/API key/i.test(e.mensaje_google || "")) {
      logger.warn(`Gemini (${modelo}) rechazo responseSchema; reintentando con el esquema en el prompt.`);
      return pedirGemini({ apiKey, modelo, timeoutMs: env.llm.gemini.timeoutMs, onReintento, cuerpo: { ...base, contents: [{ role: "user", parts: [{ text: `${entrada}\n\nResponde unicamente con un objeto JSON que cumpla este esquema:\n${JSON.stringify(jsonSchema)}` }] }] } });
    }
    throw e;
  }
}

export async function ejecutarSkillGemini({ systemPrompt, entrada, esquema, maxTokens, onProgreso }) {
  const c = configIA();
  if (!c.geminiApiKey) throw new AppError("SIN_CREDENCIALES", "No hay clave de Gemini. Carguela en Configuracion.", 500);
  const jsonSchema = z.toJSONSchema(esquema, { target: "draft-7" });
  const base = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: entrada }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: Math.min(maxTokens || 16000, 65536), responseMimeType: "application/json" },
  };
  onProgreso?.(0);

  // Candidatos: el modelo configurado primero; si falla por disponibilidad, se prueban
  // hasta dos modelos "flash" (plan gratuito) mas, distintos del que ya fallo.
  const candidatos = [c.geminiModelo];
  let flashCargados = false;
  let data, modeloUsado, ultimoError;
  for (let intento = 0; intento < candidatos.length && intento < 3; intento++) {
    const modelo = candidatos[intento];
    const onReintento = (n, ms) => onProgreso?.(0, `Gemini (${modelo}) saturado; reintento ${n} en ${Math.round(ms / 1000)} s`);
    try {
      data = await intentarConModelo({ apiKey: c.geminiApiKey, modelo, base, jsonSchema, entrada, onReintento });
      modeloUsado = modelo;
      break;
    } catch (e) {
      ultimoError = e;
      if (!esErrorDeDisponibilidad(e)) throw e; // problema de cuenta, contenido o esquema: no tiene sentido cambiar de modelo
      logger.warn(`Gemini (${modelo}) no disponible tras los reintentos (${e.codigo}); buscando un modelo alterno del plan gratuito.`);
      if (!flashCargados) {
        const flash = (await listarModelosFlash(c.geminiApiKey)).filter((m) => !candidatos.includes(m));
        candidatos.push(...flash.slice(0, 2));
        flashCargados = true;
      }
      const siguiente = candidatos[intento + 1];
      if (siguiente) onProgreso?.(0, `Modelo ${modelo} no disponible; probando con ${siguiente} (plan gratuito)...`);
    }
  }
  if (!data) {
    ultimoError.message = `${ultimoError.message} Se probaron ${candidatos.length} modelo(s) sin exito (${candidatos.join(", ")}).`;
    throw ultimoError;
  }
  if (modeloUsado !== c.geminiModelo) onProgreso?.(0, `Continuando con ${modeloUsado} (modelo alterno).`);

  const cand = data.candidates?.[0];
  if (!cand || cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw new AppError("RECHAZO_MODELO", `Gemini declino la respuesta (${cand?.finishReason || "sin candidatos"}).`, 422);
  if (cand.finishReason === "MAX_TOKENS") throw new AppError("SALIDA_TRUNCADA", "La respuesta de Gemini supero el maximo de tokens del skill.", 500);
  const texto = (cand.content?.parts || []).map((p) => p.text || "").join("");
  const parsed = esquema.safeParse(extraerJson(texto));
  if (!parsed.success) throw new AppError("ESQUEMA_INVALIDO", "La salida de Gemini no respeta el esquema esperado.", 500, parsed.error.issues.slice(0, 5));
  onProgreso?.(texto.length);
  return { datos: parsed.data, uso: { modelo: data.modelVersion || modeloUsado, tokensEntrada: data.usageMetadata?.promptTokenCount || 0, tokensSalida: data.usageMetadata?.candidatesTokenCount || 0, cacheLeido: data.usageMetadata?.cachedContentTokenCount || 0 } };
}
