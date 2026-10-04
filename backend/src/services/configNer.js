import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { descifrar } from "../utils/cifrado.js";

const CLAVES = {
  endpoint: "ner_endpoint",
  apiKey: "ner_api_key_enc",
  timeoutMs: "ner_timeout_ms",
};

export async function configNerEfectiva() {
  let m = {};
  try {
    const [rows] = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN (?)", [Object.values(CLAVES)]);
    m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  } catch { /* DB not available — fall through to env */ }

  const apiKeyEnc = m[CLAVES.apiKey] || "";
  const apiKey = apiKeyEnc ? descifrar(apiKeyEnc) : "";

  return {
    endpoint: m[CLAVES.endpoint] || env.ner.endpoint || "",
    apiKey: apiKey || env.ner.apiKey || "",
    timeoutMs: Number(m[CLAVES.timeoutMs]) || env.ner.timeoutMs || 30000,
  };
}
