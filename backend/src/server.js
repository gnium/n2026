import { app } from "./app.js";
import { env } from "./config/env.js";
import { verificarConexion, pool } from "./config/db.js";
import { destruirTodas, cantidadSesiones } from "./services/sessionStore.js";
import { logger } from "./utils/logger.js";
import { modoClaude } from "./services/claudeClient.js";
import { ejecutarMigraciones } from "./config/migrador.js";
import { asegurarTablasAuth } from "./auth/repositorio.js";
import { cargarConfiguracionIA } from "./services/configuracionIA.js";
import { cargarPrecios } from "./services/precios.js";
import { programarRevision } from "./services/prueba.js";

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
  await ejecutarMigraciones();
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
