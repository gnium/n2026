/** Acceso a la configuracion de skills y plantillas en MySQL (sin PII). */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

export async function listarSkills() {
  const [rows] = await pool.query(
    "SELECT id, clave, nombre, descripcion, orden, modelo, esfuerzo, max_tokens, system_prompt, activo, version, actualizado_en FROM skills ORDER BY orden",
  );
  return rows;
}

export async function skillsActivos() {
  const todos = await listarSkills();
  const activos = todos.filter((s) => s.activo);
  if (activos.length === 0) throw new AppError("SIN_SKILLS", "No hay skills activos configurados. Ejecute el seed de la base de datos.", 500);
  return activos;
}

export async function actualizarSkill(clave, { system_prompt, modelo, esfuerzo, max_tokens, activo }) {
  const [r] = await pool.query(
    `UPDATE skills SET
       system_prompt = COALESCE(:system_prompt, system_prompt),
       modelo = COALESCE(:modelo, modelo),
       esfuerzo = COALESCE(:esfuerzo, esfuerzo),
       max_tokens = COALESCE(:max_tokens, max_tokens),
       activo = COALESCE(:activo, activo),
       version = version + 1
     WHERE clave = :clave`,
    { clave, system_prompt: system_prompt ?? null, modelo: modelo ?? null, esfuerzo: esfuerzo ?? null, max_tokens: max_tokens ?? null, activo: activo ?? null },
  );
  if (r.affectedRows === 0) throw new AppError("SKILL_INEXISTENTE", `No existe el skill ${clave}`, 404);
}

export async function listarPlantillas() {
  const [rows] = await pool.query("SELECT id, clave, nombre, tipo_acto, jurisdiccion, variables, activo, version FROM plantillas WHERE activo = 1 ORDER BY nombre");
  return rows;
}

export async function obtenerPlantilla(clave) {
  const [rows] = await pool.query("SELECT * FROM plantillas WHERE clave = ? AND activo = 1 LIMIT 1", [clave]);
  return rows[0] || null;
}

/** Elige la plantilla segun el tipo de acto detectado; cae en la generica. */
export async function plantillaParaActo(tipoActo) {
  const [rows] = await pool.query("SELECT * FROM plantillas WHERE tipo_acto = ? AND activo = 1 ORDER BY version DESC LIMIT 1", [tipoActo]);
  if (rows[0]) return rows[0];
  const generica = await obtenerPlantilla("acto_generico");
  if (!generica) throw new AppError("SIN_PLANTILLA", "No hay plantillas cargadas.", 500);
  return generica;
}
