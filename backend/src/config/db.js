import mysql from "mysql2/promise";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const { reintentos: _reintentos, ...conexion } = env.db;
export const pool = mysql.createPool({
  ...conexion,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
  namedPlaceholders: true,
  dateStrings: ["DATE"], // las columnas DATE viajan como "YYYY-MM-DD": sin corrimiento de un dia por zona horaria
});

export async function verificarConexion() {
  const conn = await pool.getConnection();
  try {
    await conn.query("SELECT 1");
    logger.info("MySQL conectado", { host: env.db.host, db: env.db.database });
  } finally {
    conn.release();
  }
}
