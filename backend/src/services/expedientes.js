/**
 * Expedientes (carpetas) con partes, tareas y vinculo a la ejecucion del
 * pipeline y a la entrada del protocolo. Texto plano (caratula, observaciones,
 * descripcion de tareas): ver docs/PRIVACIDAD.md, excepcion mixta.
 *
 * Compartir puntual (fase 4): el dueno puede dar acceso a otra cuenta del
 * equipo sobre UN expediente concreto.
 *   lectura -> ve el expediente, sus partes (solo nombre y rol), tareas y presupuestos.
 *   edicion -> ademas edita caratula, observaciones, estado y tareas.
 * Nunca se comparten: las partes (alta/baja), el borrado, el vinculo con el
 * protocolo, los comprobantes ni la ficha UIF, que siguen siendo del dueno.
 */
import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";
import { exigirClientes } from "./clientes.js";
import { idsDelEquipo } from "./equipo.js";

const ESTADOS = new Set(["abierto", "en_firma", "cerrado", "archivado"]);
const TIPOS_ACTO = new Set(["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"]);
const ESTADOS_TAREA = new Set(["pendiente", "hecha"]);
const PERMISOS = new Set(["lectura", "edicion"]);

function expedienteAVista(r) {
  return {
    id: r.id,
    caratula: r.caratula,
    tipoActo: r.tipo_acto,
    estado: r.estado,
    ejecucionId: r.ejecucion_id,
    protocoloId: r.protocolo_id,
    observaciones: r.observaciones,
    partes: r.partes || undefined,
    tareasPendientes: r.tareas_pendientes != null ? Number(r.tareas_pendientes) : undefined,
    esPropio: r.es_propio === undefined ? true : Boolean(Number(r.es_propio)),
    permiso: r.es_propio !== undefined && !Number(r.es_propio) ? r.permiso || "lectura" : null,
    duenoNombre: r.dueno_nombre ?? null,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

function tareaAVista(t) {
  return {
    id: t.id,
    descripcion: t.descripcion,
    responsable: t.responsable,
    responsableUsuarioId: t.responsable_usuario_id ?? null,
    responsableNombre: t.responsable_nombre || t.responsable_email || null,
    venceEn: t.vence_en,
    estado: t.estado,
    origen: t.origen,
    orden: t.orden,
    completadaEn: t.completada_en,
  };
}

const SELECT_TAREA = `SELECT t.*, u.nombre AS responsable_nombre, u.email AS responsable_email
                        FROM tareas t LEFT JOIN usuarios u ON u.id = t.responsable_usuario_id`;

/**
 * Exige acceso al expediente: propio o compartido. Con `edicion` pide que el
 * permiso compartido sea de edicion; con `soloDueno`, que sea propio.
 */
async function exigirExpediente(usuarioId, id, { edicion = false, soloDueno = false } = {}) {
  const [[fila]] = await pool.query(
    `SELECT e.*, (e.usuario_id = :usuarioId) AS es_propio,
            (SELECT ec.permiso FROM expediente_colaboradores ec WHERE ec.expediente_id = e.id AND ec.usuario_id = :usuarioId) AS permiso
       FROM expedientes e WHERE e.id = :id`,
    { id, usuarioId },
  );
  if (!fila || (!Number(fila.es_propio) && !fila.permiso)) throw new AppError("NO_ENCONTRADO", "El expediente no existe.", 404);
  const propio = Boolean(Number(fila.es_propio));
  if (soloDueno && !propio) throw new AppError("SOLO_EL_DUENO", "Esta accion la hace la cuenta duena del expediente.", 403);
  if (edicion && !propio && fila.permiso !== "edicion") throw new AppError("SOLO_LECTURA", "Este expediente se compartio solo para lectura.", 403);
  return fila;
}

export async function listar(usuarioId, estado) {
  const [rows] = await pool.query(
    `SELECT e.*, (e.usuario_id = :usuarioId) AS es_propio, ec.permiso, du.nombre AS dueno_nombre,
            (SELECT GROUP_CONCAT(c.nombre ORDER BY c.nombre SEPARATOR ', ') FROM expediente_partes p JOIN clientes c ON c.id = p.cliente_id WHERE p.expediente_id = e.id) AS partes,
            (SELECT COUNT(*) FROM tareas t WHERE t.expediente_id = e.id AND t.estado = 'pendiente') AS tareas_pendientes
       FROM expedientes e
       LEFT JOIN expediente_colaboradores ec ON ec.expediente_id = e.id AND ec.usuario_id = :usuarioId
       LEFT JOIN usuarios du ON du.id = e.usuario_id
      WHERE (e.usuario_id = :usuarioId OR ec.usuario_id IS NOT NULL) AND (:estado IS NULL OR e.estado = :estado)
      ORDER BY e.actualizado_en DESC
      LIMIT 300`,
    { usuarioId, estado: ESTADOS.has(estado) ? estado : null },
  );
  return rows.map((r) => expedienteAVista({ ...r, dueno_nombre: Number(r.es_propio) ? null : r.dueno_nombre }));
}

export async function obtener(usuarioId, id) {
  const fila = await exigirExpediente(usuarioId, id);
  const propio = Boolean(Number(fila.es_propio));
  const [partes] = await pool.query(
    "SELECT p.cliente_id AS clienteId, p.rol, c.nombre, c.tipo FROM expediente_partes p JOIN clientes c ON c.id = p.cliente_id WHERE p.expediente_id = ? ORDER BY c.nombre",
    [id],
  );
  const [tareas] = await pool.query(`${SELECT_TAREA} WHERE t.expediente_id = ? ORDER BY t.estado, t.orden, t.id`, [id]);
  const [presupuestos] = await pool.query(
    "SELECT p.id, p.numero, p.fecha, p.moneda, p.total, p.estado, p.cliente_id AS clienteId, c.nombre AS clienteNombre FROM presupuestos p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.expediente_id = ? ORDER BY p.numero DESC",
    [id],
  );
  let ejecucion = null;
  if (fila.ejecucion_id) {
    const [[e]] = await pool.query("SELECT id, estado, tipo_acto_detectado AS tipoActo, iniciado_en AS iniciadoEn FROM ejecuciones WHERE id = ?", [fila.ejecucion_id]);
    ejecucion = e || null;
  }
  let protocolo = null;
  if (fila.protocolo_id && propio) {
    const [[p]] = await pool.query("SELECT id, anio, numero_orden AS numeroOrden, fecha_otorgamiento AS fechaOtorgamiento, estado FROM protocolo_escrituras WHERE id = ?", [fila.protocolo_id]);
    protocolo = p || null;
  }
  const [dueno] = propio ? [[]] : await pool.query("SELECT nombre, email FROM usuarios WHERE id = ?", [fila.usuario_id]);
  return {
    ...expedienteAVista(fila),
    duenoNombre: propio ? null : dueno?.[0]?.nombre || dueno?.[0]?.email || null,
    partes,
    tareas: tareas.map(tareaAVista),
    presupuestos,
    ejecucion,
    protocolo,
    colaboradores: propio ? await listarColaboradores(usuarioId, id) : [],
  };
}

function validarDatos(datos) {
  if (typeof datos.caratula !== "string" || !datos.caratula.trim()) throw new AppError("DATOS_INVALIDOS", "El expediente necesita una caratula.", 400);
  if (datos.tipoActo !== undefined && !TIPOS_ACTO.has(datos.tipoActo)) throw new AppError("DATOS_INVALIDOS", `tipoActo invalido. Opciones: ${[...TIPOS_ACTO].join(", ")}.`, 400);
}

export async function crear(usuarioId, datos) {
  validarDatos(datos);
  if (Array.isArray(datos.partes) && datos.partes.length) await exigirClientes(usuarioId, datos.partes.map((p) => p?.clienteId));
  const [r] = await pool.query(
    "INSERT INTO expedientes (usuario_id, caratula, tipo_acto, observaciones) VALUES (:usuarioId, :caratula, :tipoActo, :observaciones)",
    { usuarioId, caratula: datos.caratula.trim().slice(0, 200), tipoActo: datos.tipoActo || "otro", observaciones: datos.observaciones?.trim().slice(0, 1000) || null },
  );
  if (Array.isArray(datos.partes) && datos.partes.length) await reemplazarPartes(usuarioId, r.insertId, datos.partes);
  return obtener(usuarioId, r.insertId);
}

export async function actualizar(usuarioId, id, datos) {
  validarDatos(datos);
  const fila = await exigirExpediente(usuarioId, id, { edicion: true });
  const propio = Boolean(Number(fila.es_propio));
  let protocoloId = fila.protocolo_id; // el vinculo con el protocolo solo lo cambia el dueno
  if (datos.protocoloId !== undefined && propio) {
    protocoloId = null;
    if (datos.protocoloId) {
      const [[p]] = await pool.query("SELECT id FROM protocolo_escrituras WHERE id = ? AND usuario_id = ?", [datos.protocoloId, usuarioId]);
      if (!p) throw new AppError("PROTOCOLO_INVALIDO", "La entrada del protocolo no existe o no pertenece a esta cuenta.", 400);
      protocoloId = p.id;
    }
  }
  await pool.query(
    "UPDATE expedientes SET caratula = :caratula, tipo_acto = :tipoActo, observaciones = :observaciones, protocolo_id = :protocoloId WHERE id = :id",
    { id, caratula: datos.caratula.trim().slice(0, 200), tipoActo: datos.tipoActo || "otro", observaciones: datos.observaciones?.trim().slice(0, 1000) || null, protocoloId },
  );
  return obtener(usuarioId, id);
}

export async function actualizarEstado(usuarioId, id, estado) {
  if (!ESTADOS.has(estado)) throw new AppError("DATOS_INVALIDOS", `estado debe ser: ${[...ESTADOS].join(", ")}.`, 400);
  await exigirExpediente(usuarioId, id, { edicion: true });
  await pool.query("UPDATE expedientes SET estado = ? WHERE id = ?", [estado, id]);
  return obtener(usuarioId, id);
}

export async function borrar(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM expedientes WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El expediente no existe.", 404);
}

/** Reemplaza la lista completa de partes: [{ clienteId, rol }]. Solo el dueno. */
export async function reemplazarPartes(usuarioId, id, partes) {
  await exigirExpediente(usuarioId, id, { soloDueno: true });
  if (!Array.isArray(partes)) throw new AppError("DATOS_INVALIDOS", "partes debe ser una lista.", 400);
  const ids = await exigirClientes(usuarioId, partes.map((p) => p?.clienteId));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM expediente_partes WHERE expediente_id = ?", [id]);
    for (const p of partes) {
      const clienteId = Number(p.clienteId);
      if (!ids.includes(clienteId)) continue;
      await conn.query("INSERT IGNORE INTO expediente_partes (expediente_id, cliente_id, rol) VALUES (?, ?, ?)", [id, clienteId, p.rol?.trim().slice(0, 40) || null]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return obtener(usuarioId, id);
}

// ---------- compartir con el equipo ----------

export async function listarColaboradores(usuarioId, expedienteId) {
  await exigirExpediente(usuarioId, expedienteId, { soloDueno: true });
  const [rows] = await pool.query(
    `SELECT ec.usuario_id, ec.permiso, ec.creado_en, u.nombre, u.email
       FROM expediente_colaboradores ec JOIN usuarios u ON u.id = ec.usuario_id
      WHERE ec.expediente_id = ? ORDER BY u.nombre, u.email`,
    [expedienteId],
  );
  return rows.map((r) => ({ usuarioId: r.usuario_id, nombre: r.nombre, email: r.email, permiso: r.permiso, desde: r.creado_en }));
}

/** Comparte el expediente con otra cuenta del mismo equipo. Solo el dueno. */
export async function compartir(usuarioId, expedienteId, { conUsuarioId, permiso = "lectura" }) {
  await exigirExpediente(usuarioId, expedienteId, { soloDueno: true });
  if (!PERMISOS.has(permiso)) throw new AppError("DATOS_INVALIDOS", "permiso debe ser lectura o edicion.", 400);
  const destino = Number(conUsuarioId);
  if (!destino || destino === Number(usuarioId)) throw new AppError("DATOS_INVALIDOS", "Elija a otra cuenta del equipo.", 400);
  const equipo = await idsDelEquipo(usuarioId);
  if (!equipo.includes(destino)) throw new AppError("FUERA_DEL_EQUIPO", "Solo se comparte con integrantes del equipo.", 400);
  await pool.query(
    "INSERT INTO expediente_colaboradores (expediente_id, usuario_id, permiso, compartido_por) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE permiso = VALUES(permiso)",
    [expedienteId, destino, permiso, usuarioId],
  );
  return listarColaboradores(usuarioId, expedienteId);
}

export async function dejarDeCompartir(usuarioId, expedienteId, conUsuarioId) {
  await exigirExpediente(usuarioId, expedienteId, { soloDueno: true });
  await pool.query("DELETE FROM expediente_colaboradores WHERE expediente_id = ? AND usuario_id = ?", [expedienteId, conUsuarioId]);
  return listarColaboradores(usuarioId, expedienteId);
}

// ---------- tareas ----------

function validarTarea(datos) {
  if (typeof datos.descripcion !== "string" || !datos.descripcion.trim()) throw new AppError("DATOS_INVALIDOS", "La tarea necesita una descripcion.", 400);
  if (datos.venceEn && Number.isNaN(Date.parse(datos.venceEn))) throw new AppError("DATOS_INVALIDOS", "venceEn invalida.", 400);
}

/** El responsable debe ser una cuenta del equipo (o ninguna). */
async function validarResponsable(usuarioId, responsableUsuarioId) {
  if (responsableUsuarioId === undefined || responsableUsuarioId === null || responsableUsuarioId === "") return null;
  const destino = Number(responsableUsuarioId);
  const equipo = await idsDelEquipo(usuarioId);
  if (!equipo.includes(destino)) throw new AppError("DATOS_INVALIDOS", "El responsable debe ser una cuenta del equipo.", 400);
  return destino;
}

async function siguienteOrden(expedienteId) {
  const [[r]] = await pool.query("SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM tareas WHERE expediente_id = ?", [expedienteId]);
  return Number(r.n);
}

async function tarea(id) {
  const [[t]] = await pool.query(`${SELECT_TAREA} WHERE t.id = ?`, [id]);
  return tareaAVista(t);
}

export async function crearTarea(usuarioId, expedienteId, datos) {
  await exigirExpediente(usuarioId, expedienteId, { edicion: true });
  validarTarea(datos);
  const responsableUsuarioId = await validarResponsable(usuarioId, datos.responsableUsuarioId);
  const [r] = await pool.query(
    `INSERT INTO tareas (usuario_id, expediente_id, descripcion, responsable, responsable_usuario_id, vence_en, orden)
     VALUES (:usuarioId, :expedienteId, :descripcion, :responsable, :responsableUsuarioId, :venceEn, :orden)`,
    {
      usuarioId,
      expedienteId,
      descripcion: datos.descripcion.trim().slice(0, 300),
      responsable: datos.responsable?.trim().slice(0, 80) || null,
      responsableUsuarioId,
      venceEn: datos.venceEn || null,
      orden: await siguienteOrden(expedienteId),
    },
  );
  return tarea(r.insertId);
}

export async function actualizarTarea(usuarioId, expedienteId, tareaId, datos) {
  await exigirExpediente(usuarioId, expedienteId, { edicion: true });
  validarTarea(datos);
  const responsableUsuarioId = await validarResponsable(usuarioId, datos.responsableUsuarioId);
  const [r] = await pool.query(
    "UPDATE tareas SET descripcion = :descripcion, responsable = :responsable, responsable_usuario_id = :responsableUsuarioId, vence_en = :venceEn WHERE id = :tareaId AND expediente_id = :expedienteId",
    {
      tareaId,
      expedienteId,
      descripcion: datos.descripcion.trim().slice(0, 300),
      responsable: datos.responsable?.trim().slice(0, 80) || null,
      responsableUsuarioId,
      venceEn: datos.venceEn || null,
    },
  );
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La tarea no existe.", 404);
  return tarea(tareaId);
}

export async function actualizarEstadoTarea(usuarioId, expedienteId, tareaId, estado) {
  if (!ESTADOS_TAREA.has(estado)) throw new AppError("DATOS_INVALIDOS", "estado debe ser pendiente o hecha.", 400);
  await exigirExpediente(usuarioId, expedienteId, { edicion: true });
  const [r] = await pool.query(
    "UPDATE tareas SET estado = :estado, completada_en = IF(:estado = 'hecha', NOW(), NULL) WHERE id = :tareaId AND expediente_id = :expedienteId",
    { estado, tareaId, expedienteId },
  );
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La tarea no existe.", 404);
  return tarea(tareaId);
}

export async function borrarTarea(usuarioId, expedienteId, tareaId) {
  await exigirExpediente(usuarioId, expedienteId, { edicion: true });
  const [r] = await pool.query("DELETE FROM tareas WHERE id = ? AND expediente_id = ?", [tareaId, expedienteId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "La tarea no existe.", 404);
}

/** Tareas pendientes asignadas a esta cuenta en cualquier expediente propio o compartido. */
export async function misTareas(usuarioId) {
  const [rows] = await pool.query(
    `${SELECT_TAREA}
       JOIN expedientes e ON e.id = t.expediente_id
       LEFT JOIN expediente_colaboradores ec ON ec.expediente_id = e.id AND ec.usuario_id = :usuarioId
      WHERE t.estado = 'pendiente' AND t.responsable_usuario_id = :usuarioId
        AND (e.usuario_id = :usuarioId OR ec.usuario_id IS NOT NULL)
      ORDER BY t.vence_en IS NULL, t.vence_en, t.id LIMIT 100`,
    { usuarioId },
  );
  return rows.map((t) => ({ ...tareaAVista(t), expedienteId: t.expediente_id }));
}

/**
 * Convierte el checklist previo a la firma (skill 4) y los requisitos previos
 * (skill 2) de una sesion viva en tareas. Ambos se producen sobre datos
 * anonimizados, asi que no traen nombres ni identificadores de las partes.
 */
export async function crearTareasDesdeSesion(usuarioId, expedienteId, sesion) {
  const fila = await exigirExpediente(usuarioId, expedienteId, { edicion: true });
  const checklist = sesion.resultados?.validador_fiscal_registral?.checklist_previo_firma || [];
  const requisitos = sesion.resultados?.analista_estudio_titulos?.requisitos_previos || [];
  const candidatas = [
    ...checklist.map((c) => ({ descripcion: String(c.accion || "").trim(), responsable: c.responsable ? String(c.responsable).trim() : null })),
    ...requisitos.map((r) => ({ descripcion: String(r || "").trim(), responsable: null })),
  ].filter((c) => c.descripcion);
  const [existentes] = await pool.query("SELECT descripcion FROM tareas WHERE expediente_id = ?", [expedienteId]);
  const vistas = new Set(existentes.map((e) => e.descripcion.toLowerCase()));
  let orden = await siguienteOrden(expedienteId);
  let creadas = 0;
  for (const c of candidatas) {
    const clave = c.descripcion.toLowerCase().slice(0, 300);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    await pool.query(
      "INSERT INTO tareas (usuario_id, expediente_id, descripcion, responsable, origen, orden) VALUES (?, ?, ?, ?, 'checklist', ?)",
      [usuarioId, expedienteId, c.descripcion.slice(0, 300), c.responsable?.slice(0, 80) || null, orden++],
    );
    creadas++;
  }
  if (sesion.ejecucionId && Number(fila.es_propio)) await pool.query("UPDATE expedientes SET ejecucion_id = ? WHERE id = ? AND usuario_id = ?", [sesion.ejecucionId, expedienteId, usuarioId]);
  return { creadas, expediente: await obtener(usuarioId, expedienteId) };
}
