/**
 * Almacen de sesiones EN MEMORIA.
 *
 * Aqui vive lo unico que contiene datos personales: el texto del documento
 * y el mapa token -> valor real. Nada de esto toca la base de datos ni el disco.
 * La sesion se destruye: (a) al exportar el documento final, (b) al cerrarla
 * explicitamente, (c) por inactividad (TTL), (d) al apagar el servidor.
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const sesiones = new Map();

export function crearSesion({ textoOriginal, textoModelo = null, instrucciones = "", modo = "completo", certificacion = null, bytesEntrada, mapa, usuarioId }) {
  const id = randomUUID();
  const sesion = {
    id,
    usuarioId, // dueña de la sesion: solo esta cuenta puede verla u operarla
    creadaEn: Date.now(),
    ultimoUso: Date.now(),
    bytesEntrada,
    estado: "en_curso", // en_curso | completada | fallida | cancelada
    modo, // completo | escritura | estudio_titulos | certificacion_firmas
    certificacion, // { modalidad: personal | representacion } (sin PII)
    numeroIteracion: 1, // se incrementa en cada "generar otra version"
    // --- datos sensibles (solo memoria) ---
    textoOriginal, // antecedentes/documento base, ya pre-saneado por regex
    textoModelo, // escritura modelo de la escribana o el escribano (opcional), pre-saneada
    instrucciones, // prompt libre de la escribana o el escribano, pre-saneado
    mapa, // Map<token, valorReal>
    // --- datos ya anonimizados (pueden mostrarse en la UI) ---
    textoAnonimizado: null,
    modeloAnonimizado: null,
    instruccionesAnonimizadas: null,
    resultados: {}, // { extractor_antecedentes: {...}, analista_estudio_titulos: {...}, ... }
    skills: [], // [{ clave, nombre, estado, mensaje, progreso, duracionMs }]
    plantilla: null, // { clave, nombre }
    error: null,
    eventos: [], // historial para reconexion SSE
    emisor: new EventEmitter(),
    ejecucionId: null, // id numerico en tabla ejecuciones (sin PII)
  };
  sesiones.set(id, sesion);
  logger.info("Sesion creada", { sesionId: id, bytesEntrada });
  return sesion;
}

export function obtenerSesion(id) {
  const s = sesiones.get(id);
  if (s) s.ultimoUso = Date.now();
  return s || null;
}

/**
 * Devuelve la sesion solo si pertenece a `usuarioId`; null en cualquier otro caso
 * (no existe o es de otra cuenta). Un caller no debe distinguir entre esos dos casos
 * al responder (mismo 404 generico), para no confirmarle a nadie que una sesion ajena existe.
 */
export function obtenerSesionDeUsuario(id, usuarioId) {
  const s = obtenerSesion(id);
  if (!s || s.usuarioId !== usuarioId) return null;
  return s;
}

/** Copia sobre una sesion recien creada los campos restaurados de un guardado (ver sesionesGuardadas.js). */
export function restaurarCamposEnSesion(sesion, payload) {
  sesion.estado = payload.estado;
  sesion.numeroIteracion = payload.numeroIteracion;
  sesion.textoAnonimizado = payload.textoAnonimizado;
  sesion.modeloAnonimizado = payload.modeloAnonimizado;
  sesion.instruccionesAnonimizadas = payload.instruccionesAnonimizadas;
  sesion.resultados = payload.resultados;
  sesion.skills = payload.skills;
  sesion.plantilla = payload.plantilla;
  sesion.ejecucionId = payload.ejecucionId;
  return sesion;
}

export function emitir(sesion, evento) {
  const e = { ...evento, ts: Date.now() };
  sesion.eventos.push(e);
  sesion.emisor.emit("evento", e);
}

/** Borra de forma agresiva las referencias a datos sensibles y elimina la sesion. */
export function destruirSesion(id, motivo = "manual") {
  const s = sesiones.get(id);
  if (!s) return false;
  if (s.mapa) s.mapa.clear();
  s.mapa = null;
  s.textoOriginal = null;
  s.textoModelo = null;
  s.instrucciones = null;
  s.textoAnonimizado = null;
  s.modeloAnonimizado = null;
  s.instruccionesAnonimizadas = null;
  s.resultados = null;
  s.eventos = [];
  s.emisor.emit("cerrada", { motivo });
  s.emisor.removeAllListeners();
  sesiones.delete(id);
  logger.info("Sesion destruida", { sesionId: id, motivo });
  return true;
}

/** Vista publica de la sesion: nunca incluye el mapa ni el texto original. */
export function vistaPublica(s) {
  return {
    id: s.id,
    estado: s.estado,
    modo: s.modo,
    certificacion: s.certificacion,
    numeroIteracion: s.numeroIteracion,
    creadaEn: s.creadaEn,
    skills: s.skills,
    plantilla: s.plantilla,
    error: s.error,
    entidadesAnonimizadas: s.mapa ? s.mapa.size : 0,
    resultados: s.resultados,
    textoAnonimizado: s.textoAnonimizado,
    instruccionesAnonimizadas: s.instruccionesAnonimizadas,
    tieneModelo: Boolean(s.textoModelo || s.modeloAnonimizado),
  };
}

// Barrido periodico por inactividad
const intervalo = setInterval(() => {
  const ahora = Date.now();
  for (const [id, s] of sesiones) {
    if (ahora - s.ultimoUso > env.sessionTtlMs) destruirSesion(id, "ttl");
  }
}, 60 * 1000);
intervalo.unref();

export function destruirTodas(motivo = "apagado") {
  for (const id of [...sesiones.keys()]) destruirSesion(id, motivo);
}

export function cantidadSesiones() {
  return sesiones.size;
}
