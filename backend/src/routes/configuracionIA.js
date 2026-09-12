import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { configIA, guardarConfiguracionIA, vistaPublicaIA } from "../services/configuracionIA.js";
import { modoClaude, reiniciarCliente } from "../services/claudeClient.js";
import { auditoria } from "../services/auditoria.js";
import { env } from "../config/env.js";
import { pedirGemini } from "../services/llmGemini.js";
import { AppError } from "../utils/errores.js";

export const rutasConfiguracionIA = Router();

rutasConfiguracionIA.get("/", (_req, res) => {
  res.json({ ...vistaPublicaIA(), modoActivo: modoClaude() });
});

rutasConfiguracionIA.put("/", async (req, res, next) => {
  try {
    const { proveedor, apiKey, modelo, localBaseUrl, localModelo, localApiKey, geminiApiKey, geminiModelo } = req.body || {};
    const vista = await guardarConfiguracionIA({ proveedor, apiKey, modelo, localBaseUrl, localModelo, localApiKey, geminiApiKey, geminiModelo });
    reiniciarCliente();
    await auditoria.evento("config.ia_actualizada", null, { motivo: vista.proveedor });
    res.json({ ...vista, modoActivo: modoClaude() });
  } catch (e) {
    next(e);
  }
});

/** Lista los modelos Gemini disponibles para la clave (los que admiten generateContent). */
rutasConfiguracionIA.post("/gemini/modelos", async (req, res, next) => {
  try {
    const c = configIA();
    const apiKey = (req.body?.geminiApiKey || "").trim() || c.geminiApiKey;
    if (!apiKey) throw new AppError("SIN_CLAVE", "No hay clave de Gemini cargada.", 400);
    let r;
    try {
      r = await fetch(`${env.llm.gemini.baseUrl}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new AppError("SIN_CONEXION", "No se pudo conectar con la API de Gemini.", 503);
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new AppError(r.status === 400 || r.status === 403 ? "CREDENCIAL_INVALIDA" : "ERROR_GEMINI", `Gemini: ${data?.error?.message || "HTTP " + r.status}`, 400);
    const modelos = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), nombre: m.displayName || m.name, descripcion: m.description || "", entrada: m.inputTokenLimit || null, salida: m.outputTokenLimit || null }))
      .filter((m) => !/embedding|imagen|veo|tts|audio|image|live|robotics|computer-use/i.test(m.id))
      .map((m) => ({ ...m, gratuito: /flash/i.test(m.id) }))
      .sort((a, b) => (b.gratuito - a.gratuito) || b.id.localeCompare(a.id));
    res.json({ modelos });
  } catch (e) {
    next(e);
  }
});

/** Prueba la conexion con el proveedor sin consumir tokens (lista/consulta modelos). Acepta una clave provisoria en el cuerpo. */
rutasConfiguracionIA.post("/probar", async (req, res, next) => {
  try {
    const c = configIA();
    const proveedor = req.body?.proveedor || (c.proveedor === "auto" ? (c.apiKey ? "anthropic" : "mock") : c.proveedor);
    const t0 = Date.now();
    if (proveedor === "anthropic") {
      const apiKey = (req.body?.apiKey || "").trim() || c.apiKey;
      if (!apiKey) throw new AppError("SIN_CLAVE", "No hay clave de API cargada.", 400);
      const modelo = req.body?.modelo || c.modelo;
      const cliente = new Anthropic({ apiKey, timeout: 20000, maxRetries: 0 });
      try {
        const m = await cliente.models.retrieve(modelo);
        return res.json({ ok: true, proveedor, modelo: m.id, nombre: m.display_name, ms: Date.now() - t0 });
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new AppError("CREDENCIAL_INVALIDA", "La clave no es valida o fue revocada.", 400);
        if (e instanceof Anthropic.PermissionDeniedError) throw new AppError("SIN_PERMISO", "La clave no tiene permiso para usar la API (revise el estado de la organizacion y el credito).", 400);
        if (e instanceof Anthropic.NotFoundError) throw new AppError("MODELO_INEXISTENTE", `El modelo ${modelo} no esta disponible para esta cuenta.`, 400);
        if (e instanceof Anthropic.APIConnectionError) throw new AppError("SIN_CONEXION", "No se pudo conectar con api.anthropic.com.", 503);
        throw new AppError("ERROR_API", `La API respondio un error${e.status ? " " + e.status : ""}: ${e.message}`, 502);
      }
    }
    if (proveedor === "gemini") {
      const apiKey = (req.body?.geminiApiKey || "").trim() || c.geminiApiKey;
      if (!apiKey) throw new AppError("SIN_CLAVE", "No hay clave de Gemini cargada.", 400);
      const modelo = req.body?.geminiModelo || c.geminiModelo;
      let r;
      try {
        r = await fetch(`${env.llm.gemini.baseUrl}/models/${encodeURIComponent(modelo)}`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(15000) });
      } catch {
        throw new AppError("SIN_CONEXION", "No se pudo conectar con la API de Gemini.", 503);
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = data?.error?.message || `HTTP ${r.status}`;
        if (r.status === 400 && /API key/i.test(msg)) throw new AppError("CREDENCIAL_INVALIDA", "La clave de Gemini no es valida.", 400);
        if (r.status === 403) throw new AppError("SIN_PERMISO", `Gemini: ${msg}`, 400);
        if (r.status === 404) throw new AppError("MODELO_INEXISTENTE", `El modelo ${modelo} no existe o no esta disponible para esta clave.`, 400);
        throw new AppError("ERROR_GEMINI", `Gemini: ${msg}`, 502);
      }
      // Generacion minima real: detecta cuota/plan (el listado de modelos no lo revela).
      const gen = await pedirGemini({ apiKey, modelo, timeoutMs: 30000, sinReintentos: true, cuerpo: { contents: [{ role: "user", parts: [{ text: "Responde solo: OK" }] }], generationConfig: { maxOutputTokens: 5 } } }).catch((e) => {
        throw new AppError(e.codigo || "ERROR_GEMINI", e.message, e.status || 400);
      });
      return res.json({ ok: true, proveedor, modelo: data.name?.replace(/^models\//, "") || modelo, nombre: data.displayName, generacion: Boolean(gen?.candidates?.length), ms: Date.now() - t0 });
    }
    if (proveedor === "local") {
      const base = (req.body?.localBaseUrl || c.localBaseUrl).replace(/\/$/, "");
      const modelo = req.body?.localModelo || c.localModelo;
      let r;
      try {
        r = await fetch(`${base}/models`, { signal: AbortSignal.timeout(8000), headers: c.localApiKey ? { Authorization: `Bearer ${c.localApiKey}` } : {} });
      } catch {
        throw new AppError("SIN_CONEXION_LOCAL", `No responde ${base}. ¿Esta corriendo Ollama o LM Studio?`, 503);
      }
      if (!r.ok) throw new AppError("ERROR_LLM_LOCAL", `El servidor local respondio ${r.status}.`, 502);
      const data = await r.json().catch(() => ({}));
      const ids = (data.data || []).map((m) => m.id);
      return res.json({ ok: true, proveedor, modelo, modeloDisponible: ids.length ? ids.includes(modelo) : null, modelosServidor: ids.slice(0, 30), ms: Date.now() - t0 });
    }
    res.json({ ok: true, proveedor: "mock", modelo: "simulado", ms: 0 });
  } catch (e) {
    next(e);
  }
});
