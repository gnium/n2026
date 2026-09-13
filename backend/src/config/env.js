import "dotenv/config";

const num = (v, def) => (v !== undefined && v !== "" ? Number(v) : def);

const bool = (v, def) => (v === undefined || v === "" ? def : v === "1" || v === "true");

export const env = {
  port: num(process.env.PORT, 3001),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  appUrl: (process.env.APP_URL || process.env.FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/$/, ""),
  confiarProxy: bool(process.env.TRUST_PROXY, false),
  auth: {
    secreto: process.env.JWT_SECRET || "",
    sesionSegundos: num(process.env.SESSION_HOURS, 12) * 3600,
    cookieSegura: bool(process.env.COOKIE_SECURE, false),
    registroAbierto: bool(process.env.REGISTRO_ABIERTO, false),
    codigoRegistro: process.env.CODIGO_REGISTRO || "",
    recuperacionMinutos: num(process.env.RECUPERACION_MINUTOS, 30),
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Doy Fe <no-responder@localhost>",
  },
  // Credenciales del proyecto de Google Cloud (Calendar y Drive). Son de la
  // instalacion, no de cada cuenta. Si estan aca, la app arranca ya configurada;
  // lo que se cargue desde Integraciones tiene prioridad sobre esto.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  },
  llm: {
    proveedor: (process.env.LLM_PROVIDER || "auto").toLowerCase(), // auto | anthropic | gemini | local | mock
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      modelo: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
      baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
      timeoutMs: num(process.env.GEMINI_TIMEOUT_MS, 15 * 60 * 1000),
    },
    local: {
      baseUrl: process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1",
      modelo: process.env.LOCAL_LLM_MODEL || "qwen3:32b",
      apiKey: process.env.LOCAL_LLM_API_KEY || "",
      timeoutMs: num(process.env.LOCAL_LLM_TIMEOUT_MS, 20 * 60 * 1000),
    },
  },
  claude: {
    model: process.env.CLAUDE_MODEL || "claude-opus-5",
    fallbacks: process.env.CLAUDE_FALLBACKS !== "0",
    modo: (process.env.CLAUDE_MODE || "auto").toLowerCase(), // auto | real | mock
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || "notarius",
    password: process.env.DB_PASSWORD || "notarius",
    database: process.env.DB_NAME || "notarius",
    reintentos: num(process.env.DB_CONNECT_RETRIES, 20),
  },
  sessionTtlMs: num(process.env.SESSION_TTL_MINUTES, 30) * 60 * 1000,
  sesionesGuardadasTtlDias: num(process.env.SESIONES_GUARDADAS_TTL_DIAS, 7),
  maxFileBytes: num(process.env.MAX_FILE_MB, 15) * 1024 * 1024,
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN || "",
    webhookSecret: process.env.MP_WEBHOOK_SECRET || "",
  },
};
