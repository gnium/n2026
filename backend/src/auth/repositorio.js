import { createHash } from "node:crypto";
import { pool } from "../config/db.js";

/** Crea las tablas de autenticacion si faltan (para instalaciones ya sembradas) y agrega columnas nuevas si hace falta. */
export async function asegurarTablasAuth() {
  await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT, email VARCHAR(190) NOT NULL, nombre VARCHAR(120) NULL,
    password_hash VARCHAR(255) NOT NULL, activo TINYINT(1) NOT NULL DEFAULT 1, es_admin TINYINT(1) NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ultimo_acceso TIMESTAMP NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_usuarios_email (email)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tokens_recuperacion (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, usuario_id INT UNSIGNED NOT NULL, token_hash CHAR(64) NOT NULL,
    expira_en TIMESTAMP NOT NULL, usado_en TIMESTAMP NULL, creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_tokens_hash (token_hash), KEY ix_tokens_usuario (usuario_id),
    CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE) ENGINE=InnoDB`);
  const [[{ existe }]] = await pool.query("SELECT COUNT(*) AS existe FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'es_admin'");
  if (!existe) await pool.query("ALTER TABLE usuarios ADD COLUMN es_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER activo");
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM usuarios WHERE es_admin = 1");
  if (n === 0) await pool.query("UPDATE usuarios SET es_admin = 1 WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM usuarios) t)");
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export async function contarUsuarios() {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM usuarios");
  return n;
}

export async function buscarPorEmail(email) {
  const [rows] = await pool.query("SELECT id, email, nombre, password_hash, activo, es_admin FROM usuarios WHERE email = ? LIMIT 1", [email]);
  return rows[0] || null;
}

export async function buscarPorId(id) {
  const [rows] = await pool.query(
    "SELECT id, email, nombre, activo, es_admin, plan_id, mp_preapproval_id, estado_suscripcion, proximo_cobro_en, creado_en, ultimo_acceso FROM usuarios WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] || null;
}

export async function actualizarSuscripcion(id, { planId, mpPreapprovalId, estadoSuscripcion, proximoCobroEn }) {
  await pool.query(
    `UPDATE usuarios SET plan_id = COALESCE(:planId, plan_id), mp_preapproval_id = COALESCE(:mpPreapprovalId, mp_preapproval_id),
       estado_suscripcion = COALESCE(:estadoSuscripcion, estado_suscripcion), proximo_cobro_en = COALESCE(:proximoCobroEn, proximo_cobro_en)
     WHERE id = :id`,
    { id, planId: planId ?? null, mpPreapprovalId: mpPreapprovalId ?? null, estadoSuscripcion: estadoSuscripcion ?? null, proximoCobroEn: proximoCobroEn ?? null },
  );
}

export async function buscarPorPreapprovalId(mpPreapprovalId) {
  const [rows] = await pool.query("SELECT id, email, es_admin FROM usuarios WHERE mp_preapproval_id = ? LIMIT 1", [mpPreapprovalId]);
  return rows[0] || null;
}

/** El primer usuario registrado en la instalacion queda como administrador. */
export async function crearUsuario({ email, nombre, passwordHash }) {
  const cantidad = await contarUsuarios();
  const [r] = await pool.query("INSERT INTO usuarios (email, nombre, password_hash, es_admin) VALUES (?, ?, ?, ?)", [email, nombre || null, passwordHash, cantidad === 0 ? 1 : 0]);
  return r.insertId;
}

export async function registrarAcceso(id) {
  await pool.query("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?", [id]);
}

export async function actualizarPassword(id, passwordHash) {
  await pool.query("UPDATE usuarios SET password_hash = ? WHERE id = ?", [passwordHash, id]);
}

export async function crearTokenRecuperacion(usuarioId, token, minutos) {
  await pool.query("UPDATE tokens_recuperacion SET usado_en = NOW() WHERE usuario_id = ? AND usado_en IS NULL", [usuarioId]);
  await pool.query("INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))", [usuarioId, sha256(token), minutos]);
}

export async function consumirTokenRecuperacion(token) {
  const hash = sha256(token);
  const [rows] = await pool.query("SELECT id, usuario_id FROM tokens_recuperacion WHERE token_hash = ? AND usado_en IS NULL AND expira_en > NOW() LIMIT 1", [hash]);
  if (!rows[0]) return null;
  await pool.query("UPDATE tokens_recuperacion SET usado_en = NOW() WHERE id = ?", [rows[0].id]);
  return rows[0].usuario_id;
}
