/**
 * Proveedor de IA LOCAL via API compatible con OpenAI (Ollama, LM Studio, vLLM).
 * Pensado para correr en la misma maquina que el backend (por ejemplo una
 * Mac mini): los datos nunca salen de la oficina.
 *
 * Config: LLM_PROVIDER=local, LOCAL_LLM_BASE_URL=http://localhost:11434/v1,
 *         LOCAL_LLM_MODEL=qwen3:32b, LOCAL_LLM_API_KEY (opcional)
 *
 * Usa /chat/completions con response_format json_schema; si el servidor lo
 * rechaza, reintenta pidiendo JSON por instruccion y extrae el primer objeto.
 */
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { configIA } from "./configuracionIA.js";

function extraerJson(texto) {
  const limpio = texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); // modelos "thinking" (Qwen3, DeepSeek)
  try {
    return JSON.parse(limpio);
  } catch {
    const i = limpio.indexOf("{");
    const j = limpio.lastIndexOf("}");
    if (i >= 0 && j > i) return JSON.parse(limpio.slice(i, j + 1));
    throw new AppError("JSON_INVALIDO", "El modelo local no devolvio JSON valido.", 500);
  }
}

async function pedir(cuerpo) {
  const c = configIA();
  const res = await fetch(`${c.localBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(c.localApiKey ? { Authorization: `Bearer ${c.localApiKey}` } : {}) },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(env.llm.local.timeoutMs),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    const e = new AppError("ERROR_LLM_LOCAL", `El servidor de IA local respondio ${res.status}.`, 502, detalle.slice(0, 300));
    e.status_http = res.status;
    throw e;
  }
  return res.json();
}

export async function ejecutarSkillLocal({ systemPrompt, entrada, esquema, maxTokens, onProgreso }) {
  const jsonSchema = z.toJSONSchema(esquema, { target: "draft-7" });
  const c = configIA();
  const base = {
    model: c.localModelo,
    messages: [
      { role: "system", content: `${systemPrompt}\n\nRespondé únicamente con un objeto JSON válido que cumpla exactamente este esquema, sin texto adicional:\n${JSON.stringify(jsonSchema)}` },
      { role: "user", content: entrada },
    ],
    temperature: 0.2,
    max_tokens: maxTokens || 8000,
    stream: false,
  };
  onProgreso?.(0);
  let data;
  try {
    data = await pedir({ ...base, response_format: { type: "json_schema", json_schema: { name: "salida", schema: jsonSchema, strict: true } } });
  } catch (e) {
    if (e.status_http === 400) {
      logger.warn("El servidor local no acepta response_format json_schema; reintentando sin el.");
      data = await pedir(base);
    } else if (e.name === "TimeoutError") {
      throw new AppError("TIMEOUT_LLM_LOCAL", "El modelo local tardo demasiado. Pruebe un modelo mas chico o suba LOCAL_LLM_TIMEOUT_MS.", 504);
    } else if (e instanceof AppError) {
      throw e;
    } else {
      throw new AppError("SIN_CONEXION_LOCAL", `No se pudo conectar con la IA local en ${c.localBaseUrl}. ¿Esta corriendo Ollama / LM Studio?`, 503);
    }
  }
  const texto = data.choices?.[0]?.message?.content || "";
  const parsed = esquema.safeParse(extraerJson(texto));
  if (!parsed.success) throw new AppError("ESQUEMA_INVALIDO", "La salida del modelo local no respeta el esquema esperado.", 500, parsed.error.issues.slice(0, 5));
  onProgreso?.(texto.length);
  return {
    datos: parsed.data,
    uso: { modelo: data.model || c.localModelo, tokensEntrada: data.usage?.prompt_tokens || 0, tokensSalida: data.usage?.completion_tokens || 0, cacheLeido: 0 },
  };
}
