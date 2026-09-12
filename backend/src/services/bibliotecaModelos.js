/**
 * Biblioteca de escrituras modelo propias, reutilizables entre sesiones sin
 * volver a subir el archivo cada vez. Tabla sin cifrar y con el texto
 * COMPLETO del documento original (ver docs/PRIVACIDAD.md, "Excepcion sin
 * cifrar: agenda, notas y biblioteca de modelos" - es la excepcion mas
 * sensible de las tres, porque puede ser una escritura real de otro cliente).
 */
import { pool } from "../config/db.js";
import { extraerTexto } from "./documentParser.js";
import { AppError } from "../utils/errores.js";

function filaAVista(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    tipoActo: r.tipo_acto,
    bytesOriginal: r.bytes_original,
    creadoEn: r.creado_en,
  };
}

export async function listar(usuarioId) {
  const [rows] = await pool.query(
    "SELECT id, nombre, tipo_acto, bytes_original, creado_en FROM modelos_biblioteca WHERE usuario_id = ? AND activo = 1 ORDER BY nombre",
    [usuarioId],
  );
  return rows.map(filaAVista);
}

export async function crear(usuarioId, { nombre, tipoActo, archivo }) {
  if (typeof nombre !== "string" || !nombre.trim()) throw new AppError("DATOS_INVALIDOS", "El modelo necesita un nombre.", 400);
  if (!archivo) throw new AppError("DATOS_INVALIDOS", "Falta el archivo .doc/.docx.", 400);
  const contenido = await extraerTexto(archivo.buffer, archivo.originalname);
  try {
    const [r] = await pool.query(
      "INSERT INTO modelos_biblioteca (usuario_id, nombre, tipo_acto, contenido, bytes_original) VALUES (:usuarioId, :nombre, :tipoActo, :contenido, :bytesOriginal)",
      { usuarioId, nombre: nombre.trim(), tipoActo: tipoActo?.trim() || null, contenido, bytesOriginal: archivo.size ?? null },
    );
    const [[fila]] = await pool.query("SELECT id, nombre, tipo_acto, bytes_original, creado_en FROM modelos_biblioteca WHERE id = ?", [r.insertId]);
    return filaAVista(fila);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") throw new AppError("NOMBRE_DUPLICADO", `Ya existe un modelo con el nombre "${nombre.trim()}".`, 409);
    throw e;
  }
}

/** Devuelve el texto plano del modelo, validando que pertenezca a la cuenta. Se usa para alimentar el pipeline igual que un archivo recien subido. */
export async function obtenerContenido(usuarioId, id) {
  const [[fila]] = await pool.query("SELECT contenido FROM modelos_biblioteca WHERE id = ? AND usuario_id = ? AND activo = 1", [id, usuarioId]);
  if (!fila) throw new AppError("MODELO_INEXISTENTE", "El modelo de la biblioteca no existe o no le pertenece.", 404);
  return fila.contenido;
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM modelos_biblioteca WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El modelo no existe o no le pertenece.", 404);
}
