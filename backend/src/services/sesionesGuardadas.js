/**
 * Guardar/reanudar sesiones: puente opt-in y acotado a la regla de "todo en
 * memoria" (ver docs/PRIVACIDAD.md). Solo se persiste si la escribana o el
 * escribano lo pide explicitamente (nunca automatico), cifrado con un
 * contexto propio ("sesion_guardada"), y vence solo.
 */
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { crearSesion, destruirSesion, restaurarCamposEnSesion, vistaPublica } from "./sessionStore.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";

/** Serializa y cifra la sesion viva, la guarda, y libera la memoria. Debe llamarse solo con estado completada|fallida. */
export async function guardarSesion(sesion) {
  const payload = {
    textoOriginal: sesion.textoOriginal,
    textoModelo: sesion.textoModelo,
    instrucciones: sesion.instrucciones,
    mapa: [...(sesion.mapa || new Map()).entries()],
    textoAnonimizado: sesion.textoAnonimizado,
    modeloAnonimizado: sesion.modeloAnonimizado,
    instruccionesAnonimizadas: sesion.instruccionesAnonimizadas,
    resultados: sesion.resultados,
    skills: sesion.skills,
    plantilla: sesion.plantilla,
    certificacion: sesion.certificacion,
    bytesEntrada: sesion.bytesEntrada,
    ejecucionId: sesion.ejecucionId,
    estado: sesion.estado,
    numeroIteracion: sesion.numeroIteracion,
  };
  const cifrado = cifrar(JSON.stringify(payload), "sesion_guardada");
  const expiraEn = new Date(Date.now() + env.sesionesGuardadasTtlDias * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO sesiones_guardadas (id, usuario_id, modo, estado_original, numero_iteracion, payload_cifrado, expira_en)
     VALUES (:id, :usuarioId, :modo, :estado, :numeroIteracion, :payload, :expiraEn)`,
    { id: sesion.id, usuarioId: sesion.usuarioId, modo: sesion.modo, estado: sesion.estado, numeroIteracion: sesion.numeroIteracion || 1, payload: cifrado, expiraEn },
  );
  destruirSesion(sesion.id, "guardada");
  return { guardadaId: sesion.id, expiraEn };
}

export async function listarGuardadas(usuarioId) {
  const [rows] = await pool.query(
    "SELECT id, modo, estado_original AS estadoOriginal, numero_iteracion AS numeroIteracion, creado_en AS creadoEn, expira_en AS expiraEn FROM sesiones_guardadas WHERE usuario_id = ? AND expira_en > NOW() ORDER BY creado_en DESC",
    [usuarioId],
  );
  return rows;
}

export async function reanudarGuardada(usuarioId, id) {
  const [[fila]] = await pool.query("SELECT * FROM sesiones_guardadas WHERE id = ? AND usuario_id = ? AND expira_en > NOW()", [id, usuarioId]);
  if (!fila) throw new AppError("GUARDADA_INEXISTENTE", "La sesion guardada no existe o vencio.", 404);
  const texto = descifrar(fila.payload_cifrado, "sesion_guardada");
  if (texto === null) throw new AppError("GUARDADA_ILEGIBLE", "No se pudo leer la sesion guardada (¿cambio JWT_SECRET?).", 410);
  let payload;
  try {
    payload = JSON.parse(texto);
  } catch {
    throw new AppError("GUARDADA_ILEGIBLE", "La sesion guardada esta corrupta.", 410);
  }
  const mapa = new Map(payload.mapa);
  const nuevaSesion = crearSesion({
    textoOriginal: payload.textoOriginal,
    textoModelo: payload.textoModelo,
    instrucciones: payload.instrucciones,
    modo: fila.modo,
    certificacion: payload.certificacion,
    bytesEntrada: payload.bytesEntrada,
    mapa,
    usuarioId,
  });
  restaurarCamposEnSesion(nuevaSesion, payload);
  await pool.query("DELETE FROM sesiones_guardadas WHERE id = ?", [id]);
  return vistaPublica(nuevaSesion);
}

export async function borrarGuardada(usuarioId, id) {
  await pool.query("DELETE FROM sesiones_guardadas WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
}

// Barrido periodico de sesiones guardadas vencidas (analogo al de sessionStore.js, pero en horas).
const intervalo = setInterval(async () => {
  try {
    await pool.query("DELETE FROM sesiones_guardadas WHERE expira_en < NOW()");
  } catch (e) {
    logger.warn("Fallo el barrido de sesiones guardadas vencidas (ignorado)", { codigo: e.code });
  }
}, 60 * 60 * 1000);
intervalo.unref();
