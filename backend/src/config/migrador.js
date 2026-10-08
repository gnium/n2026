import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { logger } from "../utils/logger.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../database");

export async function ejecutarMigraciones() {
  await pool.query(`CREATE TABLE IF NOT EXISTS migraciones (
    archivo VARCHAR(120) NOT NULL PRIMARY KEY,
    aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  const [aplicadas] = await pool.query("SELECT archivo FROM migraciones");
  const ya = new Set(aplicadas.map((r) => r.archivo));

  const archivos = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  let corridas = 0;

  for (const archivo of archivos) {
    if (ya.has(archivo)) continue;
    const sql = await readFile(join(DIR, archivo), "utf8");
    const sentencias = sql
      .replace(/DELIMITER\s+\$\$[\s\S]*?DELIMITER\s*;/g, (bloque) => {
        const cuerpo = bloque
          .replace(/^DELIMITER\s+\$\$\s*/, "")
          .replace(/\s*DELIMITER\s*;\s*$/, "");
        return cuerpo.replace(/\$\$/g, ";");
      })
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/^(--|\/\*|USE\s)/i.test(s));

    const conn = await pool.getConnection();
    try {
      for (const s of sentencias) await conn.query(s);
      await conn.query("INSERT INTO migraciones (archivo) VALUES (?)", [archivo]);
      corridas++;
      logger.info(`Migración aplicada: ${archivo}`);
    } catch (e) {
      logger.error(`Migración fallida: ${archivo}`, { error: e.message });
      throw e;
    } finally {
      conn.release();
    }
  }

  if (corridas) logger.info(`Migraciones completadas: ${corridas} nueva(s)`);
}
