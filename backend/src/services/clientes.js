/**
 * Clientes y contrapartes de la escribania. Excepcion MIXTA a la regla de oro
 * (docs/PRIVACIDAD.md): nombre/observaciones en texto plano para buscar y
 * listar; identificadores y contacto cifrados con el contexto "cliente".
 */
import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";

const TIPOS = new Set(["persona", "sociedad"]);
// Estados civiles del Codigo Civil y Comercial; la union convivencial (arts. 509 y ss.) se incluye por el asentimiento del art. 522.
export const ESTADOS_CIVILES = new Set(["soltero", "casado", "divorciado", "viudo", "union_convivencial"]);
export const CAMPOS_CIFRADOS = ["documento", "cuit", "domicilio", "telefono", "email", "estadoCivil", "estadoCivilObs", "nacionalidad"];

function empaquetar(datos) {
  const obj = {};
  for (const k of CAMPOS_CIFRADOS) {
    const v = datos[k];
    if (typeof v === "string" && v.trim()) obj[k] = v.trim().slice(0, 200);
  }
  return Object.keys(obj).length ? cifrar(JSON.stringify(obj), "cliente") : null;
}

/** Si no se puede descifrar (por ejemplo, cambio JWT_SECRET), no rompe el listado: marca la fila como no legible. */
function desempaquetar(blob) {
  if (!blob) return { datos: {}, legible: true };
  const texto = descifrar(blob, "cliente");
  if (texto === null) return { datos: {}, legible: false };
  try {
    return { datos: JSON.parse(texto), legible: true };
  } catch {
    return { datos: {}, legible: false };
  }
}

function filaAVista(r) {
  const { datos, legible } = desempaquetar(r.datos_cifrado);
  return {
    id: r.id,
    tipo: r.tipo,
    nombre: r.nombre,
    observaciones: r.observaciones,
    ...datos,
    datosLegibles: legible,
    expedientes: r.expedientes != null ? Number(r.expedientes) : undefined,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

function validar(datos) {
  if (typeof datos.nombre !== "string" || !datos.nombre.trim()) throw new AppError("DATOS_INVALIDOS", "El cliente necesita un nombre.", 400);
  if (datos.tipo !== undefined && !TIPOS.has(datos.tipo)) throw new AppError("DATOS_INVALIDOS", "tipo debe ser persona o sociedad.", 400);
  if (datos.estadoCivil && !ESTADOS_CIVILES.has(datos.estadoCivil)) throw new AppError("DATOS_INVALIDOS", `estadoCivil debe ser uno de: ${[...ESTADOS_CIVILES].join(", ")}.`, 400);
}

export async function listar(usuarioId, q = "") {
  const filtro = String(q || "").trim();
  const [rows] = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM expediente_partes p WHERE p.cliente_id = c.id) AS expedientes
       FROM clientes c
      WHERE c.usuario_id = :usuarioId AND (:filtro = '' OR c.nombre LIKE :patron)
      ORDER BY c.nombre
      LIMIT 200`,
    { usuarioId, filtro, patron: `%${filtro}%` },
  );
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[fila]] = await pool.query("SELECT * FROM clientes WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "El cliente no existe.", 404);
  const [expedientes] = await pool.query(
    `SELECT e.id, e.caratula, e.tipo_acto AS tipoActo, e.estado, p.rol, e.actualizado_en AS actualizadoEn
       FROM expediente_partes p JOIN expedientes e ON e.id = p.expediente_id
      WHERE p.cliente_id = ? ORDER BY e.actualizado_en DESC`,
    [id],
  );
  const [presupuestos] = await pool.query(
    "SELECT id, numero, fecha, moneda, total, estado, expediente_id AS expedienteId FROM presupuestos WHERE cliente_id = ? ORDER BY numero DESC",
    [id],
  );
  return { ...filaAVista(fila), expedientes, presupuestos };
}

export async function crear(usuarioId, datos) {
  validar(datos);
  const [r] = await pool.query(
    "INSERT INTO clientes (usuario_id, tipo, nombre, observaciones, datos_cifrado) VALUES (:usuarioId, :tipo, :nombre, :observaciones, :datosCifrado)",
    { usuarioId, tipo: datos.tipo || "persona", nombre: datos.nombre.trim().slice(0, 200), observaciones: datos.observaciones?.trim().slice(0, 500) || null, datosCifrado: empaquetar(datos) },
  );
  const [[fila]] = await pool.query("SELECT * FROM clientes WHERE id = ?", [r.insertId]);
  return filaAVista(fila);
}

export async function actualizar(usuarioId, id, datos) {
  validar(datos);
  const [r] = await pool.query(
    "UPDATE clientes SET tipo = :tipo, nombre = :nombre, observaciones = :observaciones, datos_cifrado = :datosCifrado WHERE id = :id AND usuario_id = :usuarioId",
    { id, usuarioId, tipo: datos.tipo || "persona", nombre: datos.nombre.trim().slice(0, 200), observaciones: datos.observaciones?.trim().slice(0, 500) || null, datosCifrado: empaquetar(datos) },
  );
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El cliente no existe.", 404);
  const [[fila]] = await pool.query("SELECT * FROM clientes WHERE id = ?", [id]);
  return filaAVista(fila);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM clientes WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El cliente no existe.", 404);
}

/** Verifica que todos los ids pertenezcan a la cuenta. Devuelve el conjunto validado. */
export async function exigirClientes(usuarioId, ids) {
  const unicos = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!unicos.length) return unicos;
  const [rows] = await pool.query("SELECT id FROM clientes WHERE usuario_id = ? AND id IN (?)", [usuarioId, unicos]);
  if (rows.length !== unicos.length) throw new AppError("CLIENTE_INVALIDO", "Alguno de los clientes no existe o no pertenece a esta cuenta.", 400);
  return unicos;
}
