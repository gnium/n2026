/**
 * Crea la base de datos y carga el seed sin necesidad del cliente `mysql`.
 * Uso: npm run db:init   (usa DB_* de .env; DB_USER debe poder crear la BD)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { dividirSentencias } from "./sqlLote.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirSql = path.resolve(aqui, "../../database");

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_ROOT_USER || process.env.DB_USER || "root",
  password: process.env.DB_ROOT_PASSWORD ?? process.env.DB_PASSWORD ?? "",
  multipleStatements: false, // se manda sentencia por sentencia: ver sqlLote.js
  charset: "utf8mb4",
});

for (const archivo of fs.readdirSync(dirSql).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(dirSql, archivo), "utf8");
  process.stdout.write(`Ejecutando ${archivo}... `);
  for (const sentencia of dividirSentencias(sql)) await conn.query(sentencia);
  console.log("ok");
}
const [[{ skills }]] = await conn.query("SELECT COUNT(*) AS skills FROM notarius.skills");
const [[{ plantillas }]] = await conn.query("SELECT COUNT(*) AS plantillas FROM notarius.plantillas");
console.log(`Base lista: ${skills} skills, ${plantillas} plantillas.`);
await conn.end();
