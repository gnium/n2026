import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";

const ESTADOS = new Set(["borrador", "certificada", "entregada"]);
const TRANSICIONES = { borrador: "certificada", certificada: "entregada" };
const MODALIDADES = new Set(["personal", "representacion"]);

const SELECT = `SELECT c.*, e.caratula AS expediente_caratula
                  FROM certificaciones c
                  LEFT JOIN expedientes e ON e.id = c.expediente_id`;

function cifrarFirmantes(lista) {
  return cifrar(JSON.stringify(lista), "certificacion");
}

function descifrarFirmantes(blob) {
  const texto = descifrar(blob, "certificacion");
  if (texto === null) return { firmantes: [], legible: false };
  try {
    return { firmantes: JSON.parse(texto), legible: true };
  } catch {
    return { firmantes: [], legible: false };
  }
}

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === "string") try { return JSON.parse(val); } catch { return null; }
  return val;
}

function filaAVista(r) {
  const { firmantes, legible } = descifrarFirmantes(r.firmantes_cifrado);
  return {
    id: r.id,
    usuarioId: r.usuario_id,
    anio: r.anio,
    numero: r.numero,
    modalidad: r.modalidad,
    firmantes,
    firmantesLegible: legible,
    representada: parseJson(r.representada),
    documento: parseJson(r.documento),
    jurisdiccion: r.jurisdiccion,
    estado: r.estado,
    fechaCertificacion: r.fecha_certificacion,
    fechaEntrega: r.fecha_entrega,
    expedienteId: r.expediente_id,
    expedienteCaratula: r.expediente_caratula ?? null,
    ejecucionId: r.ejecucion_id,
    observaciones: r.observaciones,
    acta: r.acta,
    folio: r.folio,
    libro: r.libro,
    libroFirmas: r.libro_firmas,
    fojaActuacion: r.foja_actuacion,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export async function listar(usuarioId, { estado, anio, q } = {}) {
  let sql = `${SELECT} WHERE c.usuario_id = ?`;
  const params = [usuarioId];
  if (estado && ESTADOS.has(estado)) {
    sql += " AND c.estado = ?";
    params.push(estado);
  }
  if (anio) {
    sql += " AND c.anio = ?";
    params.push(Number(anio));
  }
  if (q && q.trim()) {
    sql += " AND (c.acta LIKE ? OR c.folio LIKE ? OR c.libro LIKE ? OR c.libro_firmas LIKE ? OR c.documento LIKE ? OR c.observaciones LIKE ?)";
    const patron = `%${q.trim()}%`;
    params.push(patron, patron, patron, patron, patron, patron);
  }
  sql += " ORDER BY c.anio DESC, c.numero DESC LIMIT 300";
  const [rows] = await pool.query(sql, params);
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[fila]] = await pool.query(`${SELECT} WHERE c.id = ? AND c.usuario_id = ?`, [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "La certificación no existe.", 404);
  return filaAVista(fila);
}

export async function listarAniosDisponibles(usuarioId) {
  const [rows] = await pool.query("SELECT DISTINCT anio FROM certificaciones WHERE usuario_id = ? ORDER BY anio DESC", [usuarioId]);
  return rows.map((r) => r.anio);
}

export async function proximoNumero(usuarioId, anio) {
  const [[r]] = await pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM certificaciones WHERE usuario_id = ? AND anio = ?", [usuarioId, Number(anio)]);
  return { numeroSugerido: r.siguiente };
}

function validarDatos(datos) {
  if (!MODALIDADES.has(datos.modalidad)) throw new AppError("DATOS_INVALIDOS", "modalidad debe ser personal o representacion.", 400);
  if (!Array.isArray(datos.firmantes) || datos.firmantes.length === 0) throw new AppError("DATOS_INVALIDOS", "Debe indicar al menos un firmante.", 400);
  for (const f of datos.firmantes) {
    if (!f?.nombre?.trim()) throw new AppError("DATOS_INVALIDOS", "Cada firmante necesita nombre y apellido.", 400);
  }
  if (!datos.documento?.naturaleza?.trim()) throw new AppError("DATOS_INVALIDOS", "El documento necesita una naturaleza.", 400);
  if (datos.modalidad === "representacion" && !datos.representada?.denominacion?.trim()) {
    throw new AppError("DATOS_INVALIDOS", "En modalidad con representación, debe indicar la persona representada.", 400);
  }
}

export async function crear(usuarioId, datos) {
  validarDatos(datos);
  const anio = new Date().getFullYear();

  const base = {
    usuarioId,
    anio,
    modalidad: datos.modalidad,
    firmantesCifrado: cifrarFirmantes(datos.firmantes),
    representada: datos.modalidad === "representacion" && datos.representada ? JSON.stringify(datos.representada) : null,
    documento: JSON.stringify(datos.documento),
    jurisdiccion: datos.jurisdiccion || null,
    expedienteId: datos.expedienteId || null,
    ejecucionId: datos.ejecucionId || null,
    observaciones: datos.observaciones?.trim().slice(0, 500) || null,
    acta: datos.acta?.trim().slice(0, 80) || null,
    folio: datos.folio?.trim().slice(0, 80) || null,
    libro: datos.libro?.trim().slice(0, 80) || null,
    libroFirmas: datos.libroFirmas?.trim().slice(0, 80) || null,
    fojaActuacion: datos.fojaActuacion?.trim().slice(0, 120) || null,
  };

  for (let intento = 0; intento < 3; intento++) {
    const [[n]] = await pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS sig FROM certificaciones WHERE usuario_id = ? AND anio = ?", [usuarioId, anio]);
    try {
      const [r] = await pool.query(
        `INSERT INTO certificaciones (usuario_id, anio, numero, modalidad, firmantes_cifrado, representada, documento, jurisdiccion, expediente_id, ejecucion_id, observaciones, acta, folio, libro, libro_firmas, foja_actuacion)
         VALUES (:usuarioId, :anio, :numero, :modalidad, :firmantesCifrado, :representada, :documento, :jurisdiccion, :expedienteId, :ejecucionId, :observaciones, :acta, :folio, :libro, :libroFirmas, :fojaActuacion)`,
        { ...base, numero: n.sig },
      );
      return obtener(usuarioId, r.insertId);
    } catch (e) {
      if (e.code !== "ER_DUP_ENTRY" || intento === 2) throw e;
    }
  }
}

export async function actualizar(usuarioId, id, datos) {
  const actual = await obtener(usuarioId, id);
  if (actual.estado !== "borrador") throw new AppError("ESTADO_INVALIDO", "Solo se pueden editar certificaciones en estado borrador.", 400);
  validarDatos(datos);

  await pool.query(
    `UPDATE certificaciones SET modalidad = ?, firmantes_cifrado = ?, representada = ?, documento = ?, jurisdiccion = ?, expediente_id = ?, observaciones = ?,
            acta = ?, folio = ?, libro = ?, libro_firmas = ?, foja_actuacion = ?
     WHERE id = ? AND usuario_id = ?`,
    [
      datos.modalidad,
      cifrarFirmantes(datos.firmantes),
      datos.modalidad === "representacion" && datos.representada ? JSON.stringify(datos.representada) : null,
      JSON.stringify(datos.documento),
      datos.jurisdiccion || null,
      datos.expedienteId || null,
      datos.observaciones?.trim().slice(0, 500) || null,
      datos.acta?.trim().slice(0, 80) || null,
      datos.folio?.trim().slice(0, 80) || null,
      datos.libro?.trim().slice(0, 80) || null,
      datos.libroFirmas?.trim().slice(0, 80) || null,
      datos.fojaActuacion?.trim().slice(0, 120) || null,
      id,
      usuarioId,
    ],
  );
  return obtener(usuarioId, id);
}

export async function actualizarEstado(usuarioId, id, nuevoEstado) {
  if (!ESTADOS.has(nuevoEstado)) throw new AppError("DATOS_INVALIDOS", `Estado inválido. Valores posibles: ${[...ESTADOS].join(", ")}.`, 400);
  const actual = await obtener(usuarioId, id);
  if (TRANSICIONES[actual.estado] !== nuevoEstado) {
    throw new AppError("TRANSICION_INVALIDA", `No se puede pasar de "${actual.estado}" a "${nuevoEstado}".`, 400);
  }

  if (nuevoEstado === "certificada") {
    await pool.query("UPDATE certificaciones SET estado = ?, fecha_certificacion = CURDATE() WHERE id = ? AND usuario_id = ?", [nuevoEstado, id, usuarioId]);
  } else if (nuevoEstado === "entregada") {
    await pool.query("UPDATE certificaciones SET estado = ?, fecha_entrega = NOW() WHERE id = ? AND usuario_id = ?", [nuevoEstado, id, usuarioId]);
  }
  return obtener(usuarioId, id);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM certificaciones WHERE id = ? AND usuario_id = ? AND estado = 'borrador'", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La certificación no existe o no está en estado borrador.", 404);
}

export async function obtenerParaPdf(usuarioId, id) {
  const cert = await obtener(usuarioId, id);
  const [[esc]] = await pool.query(
    `SELECT u.nombre, u.email, e.jurisdiccion AS equipo_jurisdiccion, e.nombre AS equipo_nombre
       FROM usuarios u
       LEFT JOIN equipo_miembros m ON m.usuario_id = u.id
       LEFT JOIN equipos e ON e.id = m.equipo_id
      WHERE u.id = ?`,
    [usuarioId],
  );
  return {
    cert,
    escribano: {
      nombre: esc?.nombre || "",
      email: esc?.email || "",
      escribania: esc?.equipo_nombre || "",
      jurisdiccion: esc?.equipo_jurisdiccion || cert.jurisdiccion || "",
    },
  };
}
