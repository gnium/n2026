import { Router } from "express";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { cifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";
import { auditoria } from "../services/auditoria.js";
import { configNerEfectiva } from "../services/configNer.js";

export const rutasConfiguracionNer = Router();

const CLAVES = {
  endpoint: "ner_endpoint",
  apiKey: "ner_api_key_enc",
  timeoutMs: "ner_timeout_ms",
};

async function leerDb() {
  const [rows] = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN (?)", [Object.values(CLAVES)]);
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
}

async function configConOrigen() {
  const m = await leerDb();
  const c = await configNerEfectiva();
  return { ...c, origenEndpoint: m[CLAVES.endpoint] ? "aplicacion" : env.ner.endpoint ? "entorno" : null };
}

function vistaPublica(c) {
  return {
    endpoint: c.endpoint,
    tieneApiKey: Boolean(c.apiKey),
    apiKeyEnmascarada: c.apiKey ? `${c.apiKey.slice(0, 8)}…${c.apiKey.slice(-4)}` : null,
    timeoutMs: c.timeoutMs,
    origenEndpoint: c.origenEndpoint,
  };
}

rutasConfiguracionNer.get("/", async (_req, res, next) => {
  try {
    const c = await configConOrigen();
    res.json(vistaPublica(c));
  } catch (e) {
    next(e);
  }
});

rutasConfiguracionNer.put("/", async (req, res, next) => {
  try {
    const { endpoint, apiKey, timeoutMs } = req.body || {};
    if (endpoint !== undefined) {
      if (endpoint && !/^https?:\/\//.test(endpoint)) throw new AppError("URL_INVALIDA", "El endpoint debe empezar con http:// o https://", 400);
      const val = (endpoint || "").replace(/\/$/, "");
      await pool.query("INSERT INTO configuracion (clave, valor, descripcion) VALUES (?, ?, 'Endpoint del servicio NER') ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [CLAVES.endpoint, val]);
    }
    if (apiKey !== undefined) {
      const val = apiKey ? cifrar(apiKey.trim()) : "";
      if (val) {
        await pool.query("INSERT INTO configuracion (clave, valor, descripcion) VALUES (?, ?, 'API key NER cifrada') ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [CLAVES.apiKey, val]);
      } else {
        await pool.query("DELETE FROM configuracion WHERE clave = ?", [CLAVES.apiKey]);
      }
    }
    if (timeoutMs !== undefined) {
      const val = Math.max(5000, Math.min(120000, Number(timeoutMs) || 30000));
      await pool.query("INSERT INTO configuracion (clave, valor, descripcion) VALUES (?, ?, 'Timeout NER en ms') ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [CLAVES.timeoutMs, String(val)]);
    }
    await auditoria.evento("config.ner_actualizada", null, {});
    const c = await configConOrigen();
    res.json(vistaPublica(c));
  } catch (e) {
    next(e);
  }
});

rutasConfiguracionNer.post("/test", async (req, res, next) => {
  try {
    const c = await configNerEfectiva();
    const endpoint = (req.body?.endpoint || "").trim() || c.endpoint;
    if (!endpoint) throw new AppError("SIN_ENDPOINT", "No hay endpoint de NER configurado.", 400);

    const headers = { "Content-Type": "application/json" };
    const apiKey = (req.body?.apiKey || "").trim() || c.apiKey;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const t0 = Date.now();
    let healthRes;
    try {
      healthRes = await fetch(`${endpoint.replace(/\/$/, "")}/health`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new AppError("SIN_CONEXION", `No se pudo conectar con ${endpoint}. Verifique que el servicio está corriendo.`, 503);
    }
    if (!healthRes.ok) throw new AppError("ERROR_NER", `El servicio respondió HTTP ${healthRes.status}.`, 502);
    const health = await healthRes.json().catch(() => ({}));

    let analyzeOk = false;
    try {
      const testRes = await fetch(`${endpoint.replace(/\/$/, "")}/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: "Juan Pérez, DNI 30.123.456, domiciliado en Av. Corrientes 1234, CABA.", language: "es", score_threshold: 0.3 }),
        signal: AbortSignal.timeout(30000),
      });
      if (testRes.ok) {
        const data = await testRes.json().catch(() => null);
        analyzeOk = Boolean(data?.entities?.length);
      }
    } catch { /* timeout or network error */ }

    res.json({
      ok: true,
      ms: Date.now() - t0,
      modelo: health.model || health.spacy_model || null,
      reconocedores: health.recognizers || null,
      entidadesDetectadas: analyzeOk,
    });
  } catch (e) {
    next(e);
  }
});
