/**
 * Indice de protocolo: la UNICA tabla del esquema que guarda datos de partes
 * (comparecientes), y solo cifrados (ver docs/PRIVACIDAD.md). Cada fila es
 * una escritura o acta ya firmada e impresa: crearla ES la confirmacion de
 * ese hecho (fecha_otorgamiento + folios + estado='vigente'), no hace falta
 * un flag "firmada" aparte.
 */
import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";

const NATURALEZAS = new Set(["escritura", "acta"]);
const ESTADOS = new Set(["vigente", "revocada", "anulada"]);
const TIPOS_ACTO = new Set(["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"]);

function cifrarComparecientes(lista) {
  return cifrar(JSON.stringify(lista), "protocolo");
}

/** Si no se puede descifrar (por ejemplo, cambio JWT_SECRET), no rompe el listado: marca la fila como no legible. */
function descifrarComparecientes(blob) {
  const texto = descifrar(blob, "protocolo");
  if (texto === null) return { comparecientes: [], legible: false };
  try {
    return { comparecientes: JSON.parse(texto), legible: true };
  } catch {
    return { comparecientes: [], legible: false };
  }
}

function filaAVista(r) {
  const { comparecientes, legible } = descifrarComparecientes(r.comparecientes_cifrado);
  return {
    id: r.id,
    anio: r.anio,
    numeroOrden: r.numero_orden,
    folioDesde: r.folio_desde,
    folioHasta: r.folio_hasta,
    naturaleza: r.naturaleza,
    tipoActo: r.tipo_acto,
    fechaOtorgamiento: r.fecha_otorgamiento,
    comparecientes,
    comparecientesLegible: legible,
    estado: r.estado,
    observaciones: r.observaciones,
    ejecucionId: r.ejecucion_id,
    creadoEn: r.creado_en,
  };
}

export async function listarPorAnio(usuarioId, anio) {
  const [rows] = await pool.query("SELECT * FROM protocolo_escrituras WHERE usuario_id = ? AND anio = ? ORDER BY numero_orden", [usuarioId, anio]);
  return rows.map(filaAVista);
}

export async function listarAniosDisponibles(usuarioId) {
  const [rows] = await pool.query("SELECT DISTINCT anio FROM protocolo_escrituras WHERE usuario_id = ? ORDER BY anio DESC", [usuarioId]);
  return rows.map((r) => r.anio);
}

export async function proximoNumeroYFolio(usuarioId, anio) {
  const [[r]] = await pool.query("SELECT MAX(numero_orden) AS maxOrden, MAX(folio_hasta) AS maxFolio FROM protocolo_escrituras WHERE usuario_id = ? AND anio = ?", [usuarioId, anio]);
  return { numeroOrdenSugerido: Number(r.maxOrden || 0) + 1, folioDesdeSugerido: r.maxFolio != null ? Number(r.maxFolio) + 1 : 1 };
}

function validarDatos(datos, { exigirNumeroOrden }) {
  if (exigirNumeroOrden && !(Number.isInteger(datos.numeroOrden) && datos.numeroOrden > 0)) throw new AppError("DATOS_INVALIDOS", "numeroOrden invalido.", 400);
  if (!Number.isInteger(datos.anio) || datos.anio < 2000 || datos.anio > 2100) throw new AppError("DATOS_INVALIDOS", "anio invalido.", 400);
  if (!NATURALEZAS.has(datos.naturaleza)) throw new AppError("DATOS_INVALIDOS", "naturaleza debe ser escritura o acta.", 400);
  if (!TIPOS_ACTO.has(datos.tipoActo)) throw new AppError("DATOS_INVALIDOS", `tipoActo invalido. Opciones: ${[...TIPOS_ACTO].join(", ")}.`, 400);
  if (!datos.fechaOtorgamiento || Number.isNaN(Date.parse(datos.fechaOtorgamiento))) throw new AppError("DATOS_INVALIDOS", "fechaOtorgamiento invalida.", 400);
  if (!Array.isArray(datos.comparecientes) || datos.comparecientes.length === 0) throw new AppError("DATOS_INVALIDOS", "Debe indicar al menos un compareciente.", 400);
  for (const c of datos.comparecientes) {
    if (!c || typeof c.nombre !== "string" || !c.nombre.trim()) throw new AppError("DATOS_INVALIDOS", "Cada compareciente necesita un nombre.", 400);
  }
}

export async function crearEntrada(usuarioId, datos) {
  validarDatos(datos, { exigirNumeroOrden: false });
  const { numeroOrdenSugerido } = await proximoNumeroYFolio(usuarioId, datos.anio);
  const numeroOrden = Number.isInteger(datos.numeroOrden) && datos.numeroOrden > 0 ? datos.numeroOrden : numeroOrdenSugerido;
  if (datos.ejecucionId) {
    const [[fila]] = await pool.query("SELECT usuario_id FROM ejecuciones WHERE id = ?", [datos.ejecucionId]);
    if (!fila || fila.usuario_id !== usuarioId) throw new AppError("EJECUCION_INVALIDA", "La ejecucion indicada no existe o no pertenece a esta cuenta.", 400);
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO protocolo_escrituras
         (usuario_id, anio, numero_orden, folio_desde, folio_hasta, naturaleza, tipo_acto, fecha_otorgamiento, comparecientes_cifrado, ejecucion_id, observaciones)
       VALUES (:usuarioId, :anio, :numeroOrden, :folioDesde, :folioHasta, :naturaleza, :tipoActo, :fechaOtorgamiento, :comparecientesCifrado, :ejecucionId, :observaciones)`,
      {
        usuarioId,
        anio: datos.anio,
        numeroOrden,
        folioDesde: datos.folioDesde ?? null,
        folioHasta: datos.folioHasta ?? null,
        naturaleza: datos.naturaleza,
        tipoActo: datos.tipoActo,
        fechaOtorgamiento: datos.fechaOtorgamiento,
        comparecientesCifrado: cifrarComparecientes(datos.comparecientes),
        ejecucionId: datos.ejecucionId ?? null,
        observaciones: datos.observaciones ?? null,
      },
    );
    const [[fila]] = await pool.query("SELECT * FROM protocolo_escrituras WHERE id = ?", [r.insertId]);
    return filaAVista(fila);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") throw new AppError("NUMERO_DUPLICADO", `Ya existe una entrada con el numero de orden ${numeroOrden} en ${datos.anio}.`, 409);
    throw e;
  }
}

const CAMPOS_EDITABLES = ["folioDesde", "folioHasta", "comparecientes", "observaciones"];

export async function actualizarEntrada(usuarioId, id, datos) {
  const sets = [];
  const params = { id, usuarioId };
  if (datos.folioDesde !== undefined) {
    sets.push("folio_desde = :folioDesde");
    params.folioDesde = datos.folioDesde;
  }
  if (datos.folioHasta !== undefined) {
    sets.push("folio_hasta = :folioHasta");
    params.folioHasta = datos.folioHasta;
  }
  if (datos.comparecientes !== undefined) {
    if (!Array.isArray(datos.comparecientes) || datos.comparecientes.length === 0) throw new AppError("DATOS_INVALIDOS", "Debe indicar al menos un compareciente.", 400);
    sets.push("comparecientes_cifrado = :comparecientesCifrado");
    params.comparecientesCifrado = cifrarComparecientes(datos.comparecientes);
  }
  if (datos.observaciones !== undefined) {
    sets.push("observaciones = :observaciones");
    params.observaciones = datos.observaciones || null;
  }
  if (!sets.length) throw new AppError("DATOS_INVALIDOS", `Solo se pueden editar: ${CAMPOS_EDITABLES.join(", ")}.`, 400);
  const [r] = await pool.query(`UPDATE protocolo_escrituras SET ${sets.join(", ")} WHERE id = :id AND usuario_id = :usuarioId`, params);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La entrada no existe.", 404);
  const [[fila]] = await pool.query("SELECT * FROM protocolo_escrituras WHERE id = ?", [id]);
  return filaAVista(fila);
}

export async function actualizarEstado(usuarioId, id, estado, observaciones) {
  if (!ESTADOS.has(estado)) throw new AppError("DATOS_INVALIDOS", `estado debe ser: ${[...ESTADOS].join(", ")}.`, 400);
  const [r] = await pool.query("UPDATE protocolo_escrituras SET estado = :estado, observaciones = COALESCE(:observaciones, observaciones) WHERE id = :id AND usuario_id = :usuarioId", {
    id,
    usuarioId,
    estado,
    observaciones: observaciones || null,
  });
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La entrada no existe.", 404);
  const [[fila]] = await pool.query("SELECT * FROM protocolo_escrituras WHERE id = ?", [id]);
  return filaAVista(fila);
}

/**
 * Solo permite borrar la ultima entrada del año (deshacer un error recien cargado);
 * para cualquier otra, hay que usar actualizarEstado(..., "anulada") y no dejar
 * huecos en la correlatividad.
 */
export async function borrarUltimaEntrada(usuarioId, id) {
  const [[fila]] = await pool.query("SELECT anio, numero_orden FROM protocolo_escrituras WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "La entrada no existe.", 404);
  const { numeroOrdenSugerido } = await proximoNumeroYFolio(usuarioId, fila.anio);
  if (fila.numero_orden !== numeroOrdenSugerido - 1) {
    throw new AppError("NO_ES_LA_ULTIMA", "Solo se puede borrar la ultima entrada del año, para no dejar huecos en la correlatividad. Use anular en su lugar.", 409);
  }
  await pool.query("DELETE FROM protocolo_escrituras WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
}

export async function obtenerParaExport(usuarioId, anio) {
  return listarPorAnio(usuarioId, anio);
}
