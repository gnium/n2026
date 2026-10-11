import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";

const JURISDICCION_CON_DDJJ = new Set(["salta"]);
const ESTADOS = new Set(["borrador", "generada", "presentada"]);
const TRANSICIONES = { borrador: "generada", generada: "presentada" };

const SELECT = `SELECT d.*, e.caratula AS expediente_caratula
                  FROM ddjj d
                  LEFT JOIN expedientes e ON e.id = d.expediente_id`;

export function jurisdiccionTieneDdjj(jurisdiccion) {
  return JURISDICCION_CON_DDJJ.has(jurisdiccion);
}

function filaAVista(r) {
  return {
    id: r.id,
    numero: r.numero,
    usuarioId: r.usuario_id,
    expedienteId: r.expediente_id,
    presupuestoId: r.presupuesto_id,
    expedienteCaratula: r.expediente_caratula ?? null,
    jurisdiccion: r.jurisdiccion,
    formulario: r.formulario,
    tipoActo: r.tipo_acto,
    fechaActo: r.fecha_acto,
    montoOperacion: Number(r.monto_operacion),
    alicuotaSellos: Number(r.alicuota_sellos),
    montoSellos: Number(r.monto_sellos),
    datosPartes: typeof r.datos_partes === "string" ? JSON.parse(r.datos_partes) : r.datos_partes,
    datosInmueble: typeof r.datos_inmueble === "string" ? JSON.parse(r.datos_inmueble) : r.datos_inmueble,
    datosEscribano: typeof r.datos_escribano === "string" ? JSON.parse(r.datos_escribano) : r.datos_escribano,
    estado: r.estado,
    presentadaEn: r.presentada_en,
    notas: r.notas,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export async function listar(usuarioId, { estado } = {}) {
  let sql = `${SELECT} WHERE d.usuario_id = ?`;
  const params = [usuarioId];
  if (estado && ESTADOS.has(estado)) {
    sql += " AND d.estado = ?";
    params.push(estado);
  }
  sql += " ORDER BY d.creado_en DESC LIMIT 200";
  const [rows] = await pool.query(sql, params);
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[fila]] = await pool.query(`${SELECT} WHERE d.id = ? AND d.usuario_id = ?`, [id, usuarioId]);
  if (!fila) throw new AppError("NO_ENCONTRADO", "La DDJJ no existe.", 404);
  return filaAVista(fila);
}

export async function pendientes(usuarioId) {
  const [[r]] = await pool.query("SELECT COUNT(*) AS total FROM ddjj WHERE usuario_id = ? AND estado = 'borrador'", [usuarioId]);
  return { total: r.total };
}

export async function crear(usuarioId, datos) {
  if (!jurisdiccionTieneDdjj(datos.jurisdiccion)) {
    throw new AppError("JURISDICCION_SIN_DDJJ", "La jurisdicción seleccionada no tiene DDJJ habilitada.", 400);
  }
  if (!datos.tipoActo) throw new AppError("DATOS_INVALIDOS", "El tipo de acto es obligatorio.", 400);
  if (!datos.fechaActo) throw new AppError("DATOS_INVALIDOS", "La fecha del acto es obligatoria.", 400);
  if (!datos.montoOperacion || Number(datos.montoOperacion) <= 0) throw new AppError("DATOS_INVALIDOS", "El monto de la operación debe ser mayor a cero.", 400);

  const base = {
    usuarioId,
    expedienteId: datos.expedienteId || null,
    presupuestoId: datos.presupuestoId || null,
    jurisdiccion: datos.jurisdiccion,
    tipoActo: datos.tipoActo,
    fechaActo: datos.fechaActo,
    montoOperacion: Number(datos.montoOperacion),
    alicuotaSellos: Number(datos.alicuotaSellos) || 0,
    montoSellos: Number(datos.montoSellos) || 0,
    datosPartes: datos.datosPartes ? JSON.stringify(datos.datosPartes) : null,
    datosInmueble: datos.datosInmueble ? JSON.stringify(datos.datosInmueble) : null,
    datosEscribano: datos.datosEscribano ? JSON.stringify(datos.datosEscribano) : null,
    notas: datos.notas?.trim().slice(0, 500) || null,
  };

  for (let intento = 0; intento < 3; intento++) {
    const [[n]] = await pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS sig FROM ddjj WHERE usuario_id = ?", [usuarioId]);
    try {
      const [r] = await pool.query(
        `INSERT INTO ddjj (usuario_id, numero, expediente_id, presupuesto_id, jurisdiccion, tipo_acto, fecha_acto, monto_operacion, alicuota_sellos, monto_sellos, datos_partes, datos_inmueble, datos_escribano, notas)
         VALUES (:usuarioId, :numero, :expedienteId, :presupuestoId, :jurisdiccion, :tipoActo, :fechaActo, :montoOperacion, :alicuotaSellos, :montoSellos, :datosPartes, :datosInmueble, :datosEscribano, :notas)`,
        { ...base, numero: n.sig },
      );
      const ddjj = await obtener(usuarioId, r.insertId);
      import("./vencimientos.js")
        .then((m) => m.crearDesdeDdjj(usuarioId, ddjj))
        .catch((e) => logger.error("vencimiento-desde-ddjj", { error: e.message }));
      return ddjj;
    } catch (e) {
      if (e.code !== "ER_DUP_ENTRY" || intento === 2) throw e;
    }
  }
}

export async function actualizar(usuarioId, id, datos) {
  const actual = await obtener(usuarioId, id);
  if (actual.estado !== "borrador") throw new AppError("ESTADO_INVALIDO", "Solo se pueden editar DDJJ en estado borrador.", 400);

  const campos = {
    tipo_acto: datos.tipoActo ?? actual.tipoActo,
    fecha_acto: datos.fechaActo ?? actual.fechaActo,
    monto_operacion: datos.montoOperacion != null ? Number(datos.montoOperacion) : actual.montoOperacion,
    alicuota_sellos: datos.alicuotaSellos != null ? Number(datos.alicuotaSellos) : actual.alicuotaSellos,
    monto_sellos: datos.montoSellos != null ? Number(datos.montoSellos) : actual.montoSellos,
    datos_partes: datos.datosPartes !== undefined ? JSON.stringify(datos.datosPartes) : (typeof actual.datosPartes === "object" ? JSON.stringify(actual.datosPartes) : actual.datosPartes),
    datos_inmueble: datos.datosInmueble !== undefined ? JSON.stringify(datos.datosInmueble) : (typeof actual.datosInmueble === "object" ? JSON.stringify(actual.datosInmueble) : actual.datosInmueble),
    notas: datos.notas !== undefined ? (datos.notas?.trim().slice(0, 500) || null) : actual.notas,
  };

  await pool.query(
    `UPDATE ddjj SET tipo_acto = ?, fecha_acto = ?, monto_operacion = ?, alicuota_sellos = ?, monto_sellos = ?, datos_partes = ?, datos_inmueble = ?, notas = ? WHERE id = ? AND usuario_id = ?`,
    [campos.tipo_acto, campos.fecha_acto, campos.monto_operacion, campos.alicuota_sellos, campos.monto_sellos, campos.datos_partes, campos.datos_inmueble, campos.notas, id, usuarioId],
  );
  return obtener(usuarioId, id);
}

export async function actualizarEstado(usuarioId, id, nuevoEstado) {
  if (!ESTADOS.has(nuevoEstado)) throw new AppError("DATOS_INVALIDOS", `Estado inválido. Valores posibles: ${[...ESTADOS].join(", ")}.`, 400);
  const actual = await obtener(usuarioId, id);
  if (TRANSICIONES[actual.estado] !== nuevoEstado) {
    throw new AppError("TRANSICION_INVALIDA", `No se puede pasar de "${actual.estado}" a "${nuevoEstado}".`, 400);
  }

  if (nuevoEstado === "presentada") {
    await pool.query("UPDATE ddjj SET estado = ?, presentada_en = NOW() WHERE id = ? AND usuario_id = ?", [nuevoEstado, id, usuarioId]);
    pool.query("UPDATE vencimientos SET estado = 'completado', completado_en = NOW() WHERE ddjj_id = ? AND estado != 'completado'", [id])
      .catch((e) => logger.error("venc-completar-desde-ddjj", { error: e.message }));
  } else {
    await pool.query("UPDATE ddjj SET estado = ? WHERE id = ? AND usuario_id = ?", [nuevoEstado, id, usuarioId]);
  }
  return obtener(usuarioId, id);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM ddjj WHERE id = ? AND usuario_id = ? AND estado = 'borrador'", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La DDJJ no existe o no está en estado borrador.", 404);
}

export async function obtenerParaPdf(usuarioId, id) {
  const ddjj = await obtener(usuarioId, id);
  return { ddjj };
}
