/**
 * Integrador con la API de Claude (SDK oficial @anthropic-ai/sdk).
 *
 * - Streaming + finalMessage() para evitar timeouts en salidas largas.
 * - Adaptive thinking + output_config.effort segun la configuracion del skill.
 * - Salida estructurada validada con Zod (output_config.format).
 * - Fallback del lado del servidor ante un rechazo de seguridad (opcional por env).
 * - Cache de prompt sobre el system prompt del skill (estable entre corridas).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { ejecutarSkillSimulado } from "./claudeMock.js";
import { ejecutarSkillLocal } from "./llmLocal.js";
import { ejecutarSkillGemini } from "./llmGemini.js";
import { configIA } from "./configuracionIA.js";

/**
 * Proveedor activo: "real" (Claude API), "local" (Ollama/LM Studio) o "simulado".
 * LLM_PROVIDER manda; CLAUDE_MODE se mantiene por compatibilidad.
 */
export function modoClaude() {
  const c = configIA();
  const hayClave = Boolean(c.apiKey || process.env.ANTHROPIC_AUTH_TOKEN);
  const p = c.proveedor;
  if (p === "local") return "local";
  if (p === "gemini") return c.geminiApiKey ? "gemini" : "simulado";
  if (p === "mock" || env.claude.modo === "mock") return "simulado";
  if (p === "anthropic" || env.claude.modo === "real") return hayClave ? "real" : "simulado";
  return hayClave ? "real" : "simulado";
}

export function descripcionProveedor() {
  const m = modoClaude();
  const c = configIA();
  if (m === "real") return { modo: m, proveedor: "anthropic", modelo: c.modelo, origenClave: c.origenClave };
  if (m === "local") return { modo: m, proveedor: "local", modelo: c.localModelo, baseUrl: c.localBaseUrl };
  if (m === "gemini") return { modo: m, proveedor: "gemini", modelo: c.geminiModelo, origenClave: c.origenClaveGemini };
  return { modo: m, proveedor: "simulado", modelo: "simulado", claveIlegible: c.claveIlegible };
}

let cliente = null;
let claveEnUso = null;
export function reiniciarCliente() {
  cliente = null;
  claveEnUso = null;
}
function getCliente() {
  const { apiKey } = configIA();
  if (!cliente || claveEnUso !== apiKey) {
    if (!apiKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new AppError("SIN_CREDENCIALES", "No hay clave de API de Claude. Carguela en Configuracion.", 500);
    }
    cliente = new Anthropic({ ...(apiKey ? { apiKey } : {}), timeout: 15 * 60 * 1000, maxRetries: 2 });
    claveEnUso = apiKey;
  }
  return cliente;
}

/**
 * Ejecuta un skill y devuelve su salida ya validada contra el esquema.
 * @param {object} p
 * @param {string} p.clave    Clave del skill (usada por el modo simulado).
 * @param {string} p.modelo
 * @param {string} p.systemPrompt
 * @param {string} p.entrada   Texto/JSON que ve el modelo (ya saneado segun la fase).
 * @param {import('zod').ZodTypeAny} p.esquema
 * @param {string} p.esfuerzo  low|medium|high|xhigh|max
 * @param {number} p.maxTokens
 * @param {(n:number)=>void} [p.onProgreso]  Recibe caracteres generados acumulados.
 */
export async function ejecutarSkill({ clave, modelo, systemPrompt, entrada, esquema, esfuerzo, maxTokens, onProgreso }) {
  const modo = modoClaude();
  if (modo === "simulado") return ejecutarSkillSimulado({ clave, entrada, esquema, onProgreso });
  if (modo === "local") return ejecutarSkillLocal({ systemPrompt, entrada, esquema, maxTokens, onProgreso });
  if (modo === "gemini") return ejecutarSkillGemini({ systemPrompt, entrada, esquema, maxTokens, onProgreso });
  const client = getCliente();
  const cfg = configIA();
  const params = {
    model: cfg.modeloFijadoEnApp ? cfg.modelo : modelo || cfg.modelo,
    max_tokens: maxTokens || 32000,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: entrada }],
    thinking: { type: "adaptive" },
    output_config: { effort: esfuerzo || "high", format: zodOutputFormat(esquema) },
  };

  let stream;
  if (env.claude.fallbacks) {
    stream = client.beta.messages.stream({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } else {
    stream = client.messages.stream(params);
  }

  let chars = 0;
  if (onProgreso) {
    stream.on("text", (delta) => {
      chars += delta.length;
      onProgreso(chars);
    });
  }

  let msg;
  try {
    msg = await stream.finalMessage();
  } catch (e) {
    throw traducirError(e);
  }

  if (msg.stop_reason === "refusal") {
    const cat = msg.stop_details?.category || "desconocida";
    throw new AppError("RECHAZO_MODELO", `El modelo declino procesar este contenido (categoria: ${cat}).`, 422);
  }
  if (msg.stop_reason === "max_tokens") {
    throw new AppError("SALIDA_TRUNCADA", "La respuesta supero el maximo de tokens del skill. Aumente max_tokens en la configuracion.", 500);
  }

  const texto = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new AppError("JSON_INVALIDO", "El modelo no devolvio un JSON valido.", 500);
  }
  const parsed = esquema.safeParse(json);
  if (!parsed.success) {
    throw new AppError("ESQUEMA_INVALIDO", "La salida del modelo no respeta el esquema esperado.", 500, parsed.error.issues.slice(0, 5));
  }

  return {
    datos: parsed.data,
    uso: {
      modelo: msg.model,
      tokensEntrada: (msg.usage?.input_tokens || 0) + (msg.usage?.cache_read_input_tokens || 0) + (msg.usage?.cache_creation_input_tokens || 0),
      tokensSalida: msg.usage?.output_tokens || 0,
      cacheLeido: msg.usage?.cache_read_input_tokens || 0,
    },
  };
}

function traducirError(e) {
  if (e instanceof Anthropic.AuthenticationError) return new AppError("CREDENCIAL_INVALIDA", "La clave ANTHROPIC_API_KEY no es valida.", 500);
  if (e instanceof Anthropic.RateLimitError) return new AppError("LIMITE_TASA", "Se alcanzo el limite de uso de la API. Intente en unos minutos.", 503);
  if (e instanceof Anthropic.BadRequestError) return new AppError("PEDIDO_INVALIDO", `La API rechazo el pedido: ${e.message}`, 500);
  if (e instanceof Anthropic.APIConnectionError) return new AppError("SIN_CONEXION", "No se pudo conectar con la API de Claude.", 503);
  if (e instanceof Anthropic.APIError) return new AppError("ERROR_API", `Error de la API (${e.status}): ${e.message}`, 502);
  return e;
}
