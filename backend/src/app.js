/**
 * Configuracion de la aplicacion Express. Separada de server.js para que
 * los tests E2E puedan importar la app sin arrancar el servidor ni las
 * tareas programadas.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { rutasSesiones } from "./routes/sesiones.js";
import { rutasConfiguracion } from "./routes/configuracion.js";
import { manejadorErrores } from "./middleware/errorHandler.js";
import { rutasAuth } from "./auth/routes.js";
import { rutasConfiguracionIA } from "./routes/configuracionIA.js";
import { rutasPrecios } from "./routes/precios.js";
import { rutasConsumo } from "./routes/consumo.js";
import { requerirAuth, requerirAdmin, requerirRol } from "./middleware/auth.js";
import { rutasEquipo } from "./routes/equipo.js";
import { rutasGoogle, rutasGoogleCallback } from "./routes/google.js";
import { rutasAlertas } from "./routes/alertas.js";
import { rutasSoporte } from "./routes/soporte.js";
import { rutasSuscripcion } from "./routes/suscripcion.js";
import { rutasPlanes } from "./routes/planes.js";
import { rutasWebhookMercadoPago } from "./routes/webhooksMercadoPago.js";
import { rutasProtocolo } from "./routes/protocolo.js";
import { rutasSesionesGuardadas } from "./routes/sesionesGuardadas.js";
import { rutasTurnos } from "./routes/turnos.js";
import { rutasNotas } from "./routes/notas.js";
import { rutasBibliotecaModelos } from "./routes/bibliotecaModelos.js";
import { rutasClientes } from "./routes/clientes.js";
import { rutasExpedientes } from "./routes/expedientes.js";
import { rutasPresupuestos } from "./routes/presupuestos.js";
import { rutasMovimientos } from "./routes/movimientos.js";
import { rutasComprobantes } from "./routes/comprobantes.js";
import { rutasConfiguracionFiscal } from "./routes/configuracionFiscal.js";
import { rutasUif } from "./routes/uif.js";
import { verificarOrigen } from "./middleware/origen.js";
import { rutasConsultas } from "./routes/consultasSoporte.js";
import { cantidadSesiones } from "./services/sessionStore.js";
import { descripcionProveedor } from "./services/claudeClient.js";
import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!env.auth.secreto) {
  if (process.env.NODE_ENV === "production") {
    console.error("Falta JWT_SECRET (obligatorio en produccion).");
    process.exit(1);
  }
  env.auth.secreto = randomBytes(32).toString("hex"); // desarrollo: las sesiones caducan al reiniciar
}

// En produccion la cookie de sesion viaja siempre con Secure: dejarla librada a
// una variable de entorno es dejar abierta la puerta a que la sesion se mande
// en claro por un descuido de configuracion.
if (process.env.NODE_ENV === "production" && !env.auth.cookieSegura) {
  env.auth.cookieSegura = true;
}

// Despliegue de un solo servicio: si la imagen trae la interfaz ya compilada,
// la sirve este mismo proceso. Con docker-compose la sirve nginx y esto no se
// activa. Tener un solo origen evita aflojar la cookie de sesion a SameSite=None.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirPublico = process.env.FRONTEND_DIST || path.resolve(aqui, "../publico");
const hayInterfaz = fs.existsSync(path.join(dirPublico, "index.html"));

function hashesDeScriptsEnLinea(indexHtml) {
  try {
    const html = fs.readFileSync(indexHtml, "utf8");
    const hashes = [];
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      hashes.push(`'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
    }
    return hashes;
  } catch {
    return [];
  }
}

const politicaContenido = {
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...hashesDeScriptsEnLinea(path.join(dirPublico, "index.html"))],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  },
};

export const app = express();
app.disable("x-powered-by");
if (env.confiarProxy) app.set("trust proxy", 1);
app.use(helmet(hayInterfaz ? { contentSecurityPolicy: politicaContenido } : undefined));
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", verificarOrigen);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health/detail", requerirAuth, (_req, res) => {
  const prov = descripcionProveedor();
  res.json({ ok: true, sesionesActivas: cantidadSesiones(), modelo: prov.modelo, modo: prov.modo, proveedor: prov.proveedor, origenClave: prov.origenClave || null, claveIlegible: Boolean(prov.claveIlegible) });
});
app.use("/api/auth", rutasAuth);
app.use("/api/webhooks", rutasWebhookMercadoPago);
app.use("/api/config/ai", requerirAuth, requerirAdmin, rutasConfiguracionIA);
app.use("/api/config/pricing", requerirAuth, requerirAdmin, rutasPrecios);
app.use("/api/config/plans", requerirAuth, requerirAdmin, rutasPlanes);
app.use("/api/usage", requerirAuth, rutasConsumo);
app.use("/api/subscription", requerirAuth, rutasSuscripcion);
app.use("/api/sessions", requerirAuth, rutasSesiones);
app.use("/api/saved-sessions", requerirAuth, rutasSesionesGuardadas);
app.use("/api/team", requerirAuth, rutasEquipo);
app.use("/api/alerts", requerirAuth, rutasAlertas);
app.use("/api/tickets", requerirAuth, rutasConsultas);
app.use("/api/admin", requerirAuth, requerirAdmin, rutasSoporte);
app.use("/api/google/callback", rutasGoogleCallback);
app.use("/api/google", requerirAuth, rutasGoogle);
app.use("/api/protocol", requerirAuth, requerirRol("escribano"), rutasProtocolo);
app.use("/api/appointments", requerirAuth, rutasTurnos);
app.use("/api/notes", requerirAuth, rutasNotas);
app.use("/api/templates", requerirAuth, rutasBibliotecaModelos);
app.use("/api/clients", requerirAuth, rutasClientes);
app.use("/api/cases", requerirAuth, rutasExpedientes);
app.use("/api/quotes", requerirAuth, rutasPresupuestos);
app.use("/api/transactions", requerirAuth, requerirRol("escribano"), rutasMovimientos);
app.use("/api/invoices", requerirAuth, requerirRol("escribano"), rutasComprobantes);
app.use("/api/tax-config", requerirAuth, requerirRol("escribano"), rutasConfiguracionFiscal);
app.use("/api/uif", requerirAuth, requerirRol("escribano"), rutasUif);
app.use("/api", requerirAuth, requerirAdmin, rutasConfiguracion);

if (hayInterfaz) {
  app.use(express.static(dirPublico, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dirPublico, "index.html"));
  });
}

app.use((_req, res) => res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta inexistente" } }));
app.use(manejadorErrores);
