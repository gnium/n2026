import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { verificarConexion, pool } from "./config/db.js";
import { rutasSesiones } from "./routes/sesiones.js";
import { rutasConfiguracion } from "./routes/configuracion.js";
import { manejadorErrores } from "./middleware/errorHandler.js";
import { destruirTodas, cantidadSesiones } from "./services/sessionStore.js";
import { logger } from "./utils/logger.js";
import { modoClaude, descripcionProveedor } from "./services/claudeClient.js";
import { rutasAuth } from "./auth/routes.js";
import { rutasConfiguracionIA } from "./routes/configuracionIA.js";
import { cargarConfiguracionIA } from "./services/configuracionIA.js";
import { rutasPrecios } from "./routes/precios.js";
import { rutasConsumo } from "./routes/consumo.js";
import { cargarPrecios } from "./services/precios.js";
import { requerirAuth, requerirAdmin, requerirRol } from "./middleware/auth.js";
import { rutasEquipo } from "./routes/equipo.js";
import { rutasGoogle, rutasGoogleCallback } from "./routes/google.js";
import { rutasAlertas } from "./routes/alertas.js";
import { rutasSoporte } from "./routes/soporte.js";
import { asegurarTablasAuth } from "./auth/repositorio.js";
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
import { programarRevision } from "./services/prueba.js";
import { rutasConsultas } from "./routes/consultasSoporte.js";
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
  logger.warn("COOKIE_SECURE no estaba en 1: en produccion se fuerza igual (la cookie de sesion nunca viaja sin TLS).");
}

// Despliegue de un solo servicio: si la imagen trae la interfaz ya compilada,
// la sirve este mismo proceso. Con docker-compose la sirve nginx y esto no se
// activa. Tener un solo origen evita aflojar la cookie de sesion a SameSite=None.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirPublico = process.env.FRONTEND_DIST || path.resolve(aqui, "../publico");
const hayInterfaz = fs.existsSync(path.join(dirPublico, "index.html"));

// Con nginx delante, helmet solo tocaba respuestas JSON y su CSP por omision
// nunca llegaba a un documento HTML. Sirviendo la interfaz desde aca si llega,
// y hay que declarar lo que las paginas usan de verdad: tipografias de Google,
// un script en linea que fija el tema antes de pintar, y estilos en linea.
// El script en linea que fija el tema antes de pintar se declara por su hash
// sha256, no con 'unsafe-inline': asi la CSP sigue frenando cualquier script
// inyectado, que es justamente de lo que protege.
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

const app = express();
app.disable("x-powered-by");
if (env.confiarProxy) app.set("trust proxy", 1);
app.use(helmet(hayInterfaz ? { contentSecurityPolicy: politicaContenido } : undefined));
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", verificarOrigen); // CSRF: todo pedido que modifica algo debe venir del propio origen

// Publica solo el latido. Que proveedor de IA, que modelo, cuantas sesiones
// hay abiertas o si la clave es ilegible son datos de operacion: los ve la
// interfaz cuando hay sesion, no cualquiera que consulte el endpoint.
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health/detail", requerirAuth, (_req, res) => {
  const prov = descripcionProveedor();
  res.json({ ok: true, sesionesActivas: cantidadSesiones(), modelo: prov.modelo, modo: prov.modo, proveedor: prov.proveedor, origenClave: prov.origenClave || null, claveIlegible: Boolean(prov.claveIlegible) });
});
app.use("/api/auth", rutasAuth);
app.use("/api/webhooks", rutasWebhookMercadoPago); // publica: la autenticacion es la firma de Mercado Pago, no una cookie
// El proveedor de IA, los precios y las plantillas/skills son configuracion compartida
// por todas las escribanas y escribanos de esta instalacion: solo la cuenta administradora la edita.
app.use("/api/config/ai", requerirAuth, requerirAdmin, rutasConfiguracionIA);
app.use("/api/config/pricing", requerirAuth, requerirAdmin, rutasPrecios);
app.use("/api/config/plans", requerirAuth, requerirAdmin, rutasPlanes);
app.use("/api/usage", requerirAuth, rutasConsumo); // cada cuenta ve su propio consumo; la administradora ve el de todas
app.use("/api/subscription", requerirAuth, rutasSuscripcion); // cada cuenta gestiona su propia suscripcion
app.use("/api/sessions", requerirAuth, rutasSesiones); // cada sesion de trabajo pertenece a quien la creo
app.use("/api/saved-sessions", requerirAuth, rutasSesionesGuardadas); // cada cuenta guarda/reanuda solo las suyas
app.use("/api/team", requerirAuth, rutasEquipo); // integrantes, invitaciones, roles y metricas del equipo
app.use("/api/alerts", requerirAuth, rutasAlertas); // novedades: vencimientos y pendientes de la cuenta (segun rol)
app.use("/api/tickets", requerirAuth, rutasConsultas); // canal de consultas de soporte de cada cuenta
app.use("/api/admin", requerirAuth, requerirAdmin, rutasSoporte); // panel de operacion de la plataforma: solo metadatos y agregados
app.use("/api/google/callback", rutasGoogleCallback); // publica: la vuelta de OAuth se autentica con el state firmado
app.use("/api/google", requerirAuth, rutasGoogle); // Calendar y Drive (apagado hasta configurarlo)
app.use("/api/protocol", requerirAuth, requerirRol("escribano"), rutasProtocolo); // indice de protocolo: reservado a escribana/escribano
app.use("/api/appointments", requerirAuth, rutasTurnos); // agenda propia de cada cuenta
app.use("/api/notes", requerirAuth, rutasNotas); // notas propias + compartidas con la instalacion
app.use("/api/templates", requerirAuth, rutasBibliotecaModelos); // escrituras modelo propias, reutilizables entre sesiones
app.use("/api/clients", requerirAuth, rutasClientes); // CRM propio de cada cuenta (identificadores cifrados)
app.use("/api/cases", requerirAuth, rutasExpedientes); // carpetas con partes, tareas y vinculo al pipeline
app.use("/api/quotes", requerirAuth, rutasPresupuestos); // presupuestos con PDF
app.use("/api/transactions", requerirAuth, requerirRol("escribano"), rutasMovimientos); // cuenta corriente: no visible para el rol empleado
app.use("/api/invoices", requerirAuth, requerirRol("escribano"), rutasComprobantes); // recibos, notas de honorarios y facturas (ARCA)
app.use("/api/tax-config", requerirAuth, requerirRol("escribano"), rutasConfiguracionFiscal); // datos del emisor y credenciales ARCA (cada cuenta la suya)
app.use("/api/uif", requerirAuth, requerirRol("escribano"), rutasUif); // legajos, fichas y eventos UIF (parametros: solo admin)
app.use("/api", requerirAuth, requerirAdmin, rutasConfiguracion);

// La interfaz va despues de todas las rutas de API: asi una ruta /api/ que no
// existe sigue respondiendo el JSON de error y no el index.html de la SPA.
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

async function iniciar() {
  let conectado = false;
  for (let intento = 1; intento <= env.db.reintentos && !conectado; intento++) {
    try {
      await verificarConexion();
      conectado = true;
    } catch (e) {
      logger.warn(`MySQL no disponible (intento ${intento}/${env.db.reintentos}), reintentando en 3 s`, { codigo: e.code });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!conectado) {
    logger.error("No se pudo conectar a MySQL. Revise DB_* en .env y ejecute `npm run db:init`.");
    process.exit(1);
  }
  await asegurarTablasAuth();
  await cargarConfiguracionIA();
  await cargarPrecios();
  logger.info(`Proveedor de IA: ${modoClaude()}`);
  programarRevision(); // vencimientos de la prueba, avisos y borrado definitivo
  const servidor = app.listen(env.port, () => logger.info(`Backend escuchando en http://localhost:${env.port}`));

  const apagar = (senal) => {
    logger.info("Apagando", { senal });
    destruirTodas("apagado"); // borra todo dato sensible en memoria
    servidor.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", () => apagar("SIGINT"));
  process.on("SIGTERM", () => apagar("SIGTERM"));
}

iniciar();
