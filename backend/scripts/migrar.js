/**
 * Aplica los archivos de `database/` una sola vez cada uno.
 *
 * Por que hace falta: con Docker Compose los .sql se cargan solos, porque MySQL
 * ejecuta todo lo que encuentra en /docker-entrypoint-initdb.d durante el primer
 * arranque. Un MySQL administrado (Railway, Render, PlanetScale) no tiene ese
 * gancho, y repetir los archivos no es inofensivo: los seeds insertan sin IGNORE
 * y chocarian contra la clave unica en el segundo despliegue. Por eso se lleva
 * registro de lo aplicado en la tabla `migraciones`.
 *
 * Instalacion que ya existe: si la base tiene tablas pero todavia no el registro,
 * los archivos se adoptan como aplicados en vez de volver a ejecutarse. Asi este
 * script se puede correr sobre la base local sin tocar un solo dato.
 *
 * Uso:  npm run db:migrar        (toma DB_* del entorno)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { dividirSentencias } from "./sqlLote.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// En el repo los .sql estan en ../../database; en la imagen de Docker se copian
// a /app/database, al lado de scripts/. Se prueba en ese orden.
const candidatos = [
  process.env.DIR_MIGRACIONES,
  path.resolve(aqui, "../../database"),
  path.resolve(aqui, "../database"),
].filter(Boolean);
const dirSql = candidatos.find((d) => fs.existsSync(d));

// Los .sql hacen `USE notarius` por su cuenta: el nombre no es configurable de
// verdad, pero se lee del entorno para que el registro viva en la misma base.
const baseDatos = process.env.DB_NAME || "notarius";

const reintentos = Number(process.env.DB_CONNECT_RETRIES || 20);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const huellaDe = (sql) => createHash("sha256").update(sql).digest("hex");

async function conectar() {
  const opciones = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_ROOT_USER || process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_ROOT_PASSWORD ?? process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? "",
    // Cada archivo se manda sentencia por sentencia (ver sqlLote.js), asi que no
    // hace falta permitir lotes; dejarlo apagado hace que un error de division
    // salte como error de sintaxis en vez de ejecutarse a medias.
    multipleStatements: false,
    charset: "utf8mb4",
  };
  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      return await mysql.createConnection(opciones);
    } catch (e) {
      if (intento === reintentos) throw e;
      console.log(`MySQL no disponible (intento ${intento}/${reintentos}, ${e.code || e.message}); reintento en 3 s`);
      await espera(3000);
    }
  }
}

async function principal() {
  if (!dirSql) {
    console.error(`No se encontro el directorio de migraciones. Probe: ${candidatos.join(", ")}`);
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_]+$/.test(baseDatos)) {
    console.error(`DB_NAME invalido: ${baseDatos}`);
    process.exit(1);
  }

  const archivos = fs.readdirSync(dirSql).filter((f) => f.endsWith(".sql")).sort();
  if (!archivos.length) {
    console.error(`No hay archivos .sql en ${dirSql}`);
    process.exit(1);
  }

  const conn = await conectar();
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${baseDatos}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.query(`CREATE TABLE IF NOT EXISTS \`${baseDatos}\`.migraciones (
      archivo     VARCHAR(160) NOT NULL,
      huella      CHAR(64)     NOT NULL,
      aplicada_en DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (archivo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [filas] = await conn.query(`SELECT archivo, huella FROM \`${baseDatos}\`.migraciones`);
    const aplicadas = new Map(filas.map((f) => [f.archivo, f.huella]));

    // Base que ya estaba en uso antes de existir el registro: se adopta tal cual.
    if (aplicadas.size === 0) {
      const [[{ n }]] = await conn.query(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'skills'",
        [baseDatos],
      );
      if (n > 0) {
        for (const archivo of archivos) {
          const sql = fs.readFileSync(path.join(dirSql, archivo), "utf8");
          await conn.query(
            `INSERT INTO \`${baseDatos}\`.migraciones (archivo, huella) VALUES (?, ?)`,
            [archivo, huellaDe(sql)],
          );
          aplicadas.set(archivo, huellaDe(sql));
        }
        console.log(`Base ya existente: se adoptaron ${archivos.length} archivos como aplicados, sin ejecutarlos.`);
        return;
      }
    }

    let nuevas = 0;
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(dirSql, archivo), "utf8");
      const huella = huellaDe(sql);
      const anterior = aplicadas.get(archivo);
      if (anterior) {
        // Cambiar un archivo ya aplicado no vuelve a ejecutarlo: se avisa y sigue.
        if (anterior !== huella) console.warn(`AVISO: ${archivo} cambio despues de aplicarse; no se vuelve a ejecutar.`);
        continue;
      }
      const sentencias = dividirSentencias(sql);
      process.stdout.write(`Aplicando ${archivo} (${sentencias.length} sentencias)... `);
      for (const sentencia of sentencias) {
        try {
          await conn.query(sentencia);
        } catch (e) {
          console.log("FALLO");
          e.message = `${archivo}: ${e.sqlMessage || e.message}\n  en: ${sentencia.slice(0, 120).replace(/\s+/g, " ")}...`;
          throw e;
        }
      }
      await conn.query(`INSERT INTO \`${baseDatos}\`.migraciones (archivo, huella) VALUES (?, ?)`, [archivo, huella]);
      console.log("ok");
      nuevas++;
    }
    console.log(nuevas === 0 ? "Base al dia: no habia migraciones pendientes." : `Listo: ${nuevas} migracion(es) aplicada(s).`);
  } finally {
    await conn.end();
  }
}

principal().catch((e) => {
  console.error("Fallo la migracion:", e.sqlMessage || e.message);
  process.exit(1);
});
