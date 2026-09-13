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
import { randomBytes } from "node:crypto";

if (!env.auth.secreto) {
  if (process.env.NODE_ENV === "production") {
    console.error("Falta JWT_SECRET (obligatorio en produccion).");
    process.exit(1);
  }
  env.auth.secreto = randomBytes(32).toString("hex"); // desarrollo: las sesiones caducan al reiniciar
}

const app = express();
app.disable("x-powered-by");
if (env.confiarProxy) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/salud", (_req, res) => {
  const prov = descripcionProveedor();
  res.json({ ok: true, sesionesActivas: cantidadSesiones(), modelo: prov.modelo, modo: prov.modo, proveedor: prov.proveedor, origenClave: prov.origenClave || null, claveIlegible: Boolean(prov.claveIlegible) });
});
app.use("/api/auth", rutasAuth);
app.use("/api/webhooks", rutasWebhookMercadoPago); // publica: la autenticacion es la firma de Mercado Pago, no una cookie
// El proveedor de IA, los precios y las plantillas/skills son configuracion compartida
// por todas las escribanas y escribanos de esta instalacion: solo la cuenta administradora la edita.
app.use("/api/configuracion/ia", requerirAuth, requerirAdmin, rutasConfiguracionIA);
app.use("/api/configuracion/precios", requerirAuth, requerirAdmin, rutasPrecios);
app.use("/api/configuracion/planes", requerirAuth, requerirAdmin, rutasPlanes);
app.use("/api/consumo", requerirAuth, rutasConsumo); // cada cuenta ve su propio consumo; la administradora ve el de todas
app.use("/api/suscripcion", requerirAuth, rutasSuscripcion); // cada cuenta gestiona su propia suscripcion
app.use("/api/sesiones", requerirAuth, rutasSesiones); // cada sesion de trabajo pertenece a quien la creo
app.use("/api/sesiones-guardadas", requerirAuth, rutasSesionesGuardadas); // cada cuenta guarda/reanuda solo las suyas
app.use("/api/equipo", requerirAuth, rutasEquipo); // integrantes, invitaciones, roles y metricas del equipo
app.use("/api/alertas", requerirAuth, rutasAlertas); // novedades: vencimientos y pendientes de la cuenta (segun rol)
app.use("/api/soporte", requerirAuth, requerirAdmin, rutasSoporte); // panel de operacion de la plataforma: solo metadatos y agregados
app.use("/api/google/callback", rutasGoogleCallback); // publica: la vuelta de OAuth se autentica con el state firmado
app.use("/api/google", requerirAuth, rutasGoogle); // Calendar y Drive (apagado hasta configurarlo)
app.use("/api/protocolo", requerirAuth, requerirRol("escribano"), rutasProtocolo); // indice de protocolo: reservado a escribana/escribano
app.use("/api/turnos", requerirAuth, rutasTurnos); // agenda propia de cada cuenta
app.use("/api/notas", requerirAuth, rutasNotas); // notas propias + compartidas con la instalacion
app.use("/api/biblioteca-modelos", requerirAuth, rutasBibliotecaModelos); // escrituras modelo propias, reutilizables entre sesiones
app.use("/api/clientes", requerirAuth, rutasClientes); // CRM propio de cada cuenta (identificadores cifrados)
app.use("/api/expedientes", requerirAuth, rutasExpedientes); // carpetas con partes, tareas y vinculo al pipeline
app.use("/api/presupuestos", requerirAuth, rutasPresupuestos); // presupuestos con PDF
app.use("/api/movimientos", requerirAuth, requerirRol("escribano"), rutasMovimientos); // cuenta corriente: no visible para el rol empleado
app.use("/api/comprobantes", requerirAuth, requerirRol("escribano"), rutasComprobantes); // recibos, notas de honorarios y facturas (ARCA)
app.use("/api/configuracion-fiscal", requerirAuth, requerirRol("escribano"), rutasConfiguracionFiscal); // datos del emisor y credenciales ARCA (cada cuenta la suya)
app.use("/api/uif", requerirAuth, requerirRol("escribano"), rutasUif); // legajos, fichas y eventos UIF (parametros: solo admin)
app.use("/api", requerirAuth, requerirAdmin, rutasConfiguracion);
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
