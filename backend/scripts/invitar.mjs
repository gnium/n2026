#!/usr/bin/env node
/**
 * Crea una invitación de plataforma manualmente y muestra el link de registro.
 *
 * Uso:
 *   railway run -- node scripts/invitar.js <email> [nombre] [escribanía] [díasPrueba]
 *
 * Ejemplo:
 *   railway run -- node scripts/invitar.js juan@ejemplo.com "Juan Pérez" "Escribanía Pérez" 60
 */
import { randomBytes, createHash } from "node:crypto";
import mysql from "mysql2/promise";

const [, , email, nombre, escribania, diasArg] = process.argv;
if (!email) {
  console.error("Uso: railway run -- node scripts/invitar.js <email> [nombre] [escribanía] [díasPrueba]");
  process.exit(1);
}

const diasPrueba = Number(diasArg) || 60;
const DIAS_INVITACION = 14;
const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const appUrl = (process.env.APP_URL || process.env.FRONTEND_ORIGIN || "https://app.doyfegestion.com").replace(/\/$/, "");

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || process.env.MYSQLHOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || "root",
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
  database: "notarius",
});

const token = randomBytes(32).toString("base64url");
await conn.query(
  `INSERT INTO invitaciones_plataforma (email, nombre, escribania, token_hash, dias_prueba, invitado_por, expira_en)
   VALUES (?, ?, ?, ?, ?, 1, DATE_ADD(NOW(), INTERVAL ? DAY))`,
  [email.toLowerCase().trim(), nombre || null, escribania || null, sha256(token), diasPrueba, DIAS_INVITACION],
);

const enlace = `${appUrl}/?alta=${token}`;

console.log("\n========================================");
console.log("  INVITACIÓN CREADA");
console.log("========================================");
console.log(`  Email:       ${email}`);
console.log(`  Nombre:      ${nombre || "(sin nombre)"}`);
console.log(`  Escribanía:  ${escribania || "(sin nombre)"}`);
console.log(`  Prueba:      ${diasPrueba} días`);
console.log(`  Vence en:    ${DIAS_INVITACION} días`);
console.log("----------------------------------------");
console.log(`  LINK DE REGISTRO:`);
console.log(`  ${enlace}`);
console.log("========================================\n");

await conn.end();
