import { Router } from "express";
import { subida } from "../middleware/upload.js";
import { extraerTexto } from "../services/documentParser.js";
import { presanear, reemplazarTodo } from "../services/anonymizer.js";
import { crearSesion, obtenerSesionDeUsuario, destruirSesion, vistaPublica } from "../services/sessionStore.js";
import { guardarSesion } from "../services/sesionesGuardadas.js";
import { obtenerContenido as obtenerModeloBiblioteca } from "../services/bibliotecaModelos.js";
import { ejecutarPipeline } from "../services/pipeline.js";
import { construirDocx } from "../services/docxBuilder.js";
import { auditoria } from "../services/auditoria.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { requerirSuscripcionActiva } from "../middleware/suscripcion.js";

export const rutasSesiones = Router();

// Mismo mensaje/codigo tanto si la sesion no existe como si pertenece a otra cuenta:
// no hay que confirmarle a nadie que una sesion ajena existe.
function requerirSesion(req) {
  const s = obtenerSesionDeUsuario(req.params.id, req.usuario.id);
  if (!s) throw new AppError("SESION_INEXISTENTE", "La sesion no existe o ya fue cerrada (los datos se borran al exportar o por inactividad).", 404);
  return s;
}

const MODOS = new Set(["completo", "escritura", "estudio_titulos", "certificacion_firmas"]);

/**
 * Los campos del formulario de certificacion ya vienen etiquetados: se registran en el mapa
 * de forma determinista ANTES de cualquier llamada al modelo (no depende del extractor).
 */
function registrarEntidadesCertificacion(d, mapa) {
  if (!d || typeof d !== "object") return;
  const poner = (id, valor) => {
    const v = String(valor || "").trim();
    if (v.length < 3) return;
    for (const [tok, real] of mapa) if (real === v) return tok; // ya registrado
    let token = `[[${id}]]`;
    let n = 2;
    while (mapa.has(token)) token = `[[${id}_${n++}]]`;
    mapa.set(token, v);
    return token;
  };
  (Array.isArray(d.firmantes) ? d.firmantes : []).slice(0, 10).forEach((f, i) => {
    poner(`FIRMANTE_${i + 1}`, f.nombre);
    poner(`DOMICILIO_FIRMANTE_${i + 1}`, f.domicilio);
  });
  if (d.representada) {
    poner("SOCIEDAD_1", d.representada.denominacion);
    poner("DOMICILIO_SOCIEDAD_1", d.representada.domicilio);
    poner("INSCRIPCION_SOCIEDAD_1", d.representada.inscripcion);
  }
}

/** Convierte los datos estructurados del formulario de certificacion en texto de instrucciones (pasa por la anonimizacion). */
function textoCertificacion(d) {
  if (!d || typeof d !== "object") return "";
  const L = [];
  L.push(`Modalidad: ${d.modalidad === "representacion" ? "con representacion" : "a titulo personal"}.`);
  (Array.isArray(d.firmantes) ? d.firmantes : []).slice(0, 10).forEach((f, i) => {
    L.push(`Firmante ${i + 1}: ${f.nombre || "(sin nombre)"}${f.dni ? `, DNI ${f.dni}` : ""}${f.domicilio ? `, domicilio ${f.domicilio}` : ""}${f.estadoCivil ? `, ${f.estadoCivil}` : ""}${f.nacionalidad ? `, ${f.nacionalidad}` : ""}${d.modalidad === "representacion" && f.caracter ? `, en su caracter de ${f.caracter}` : ""}.`);
  });
  if (d.modalidad === "representacion" && d.representada) {
    const r = d.representada;
    L.push(`Representada: ${r.denominacion || "(sin denominacion)"}${r.cuit ? `, CUIT ${r.cuit}` : ""}${r.domicilio ? `, sede ${r.domicilio}` : ""}${r.inscripcion ? `, inscripcion ${r.inscripcion}` : ""}.`);
    if (r.documentosHabilitantes) L.push(`Documentos habilitantes exhibidos: ${r.documentosHabilitantes}`);
  }
  if (d.documento) {
    const x = d.documento;
    L.push(`Documento a certificar: ${x.naturaleza || "(no indicado)"}${x.ejemplares ? `, ${x.ejemplares} ejemplar/es` : ""}${x.fojas ? `, ${x.fojas} foja/s` : ""}${x.destino ? `, destino: ${x.destino}` : ""}.`);
  }
  if (d.jurisdiccion) L.push(`Jurisdiccion: ${d.jurisdiccion}.`);
  return L.join("\n");
}

/**
 * POST /api/sesiones (multipart)
 *   archivo        .doc/.docx con antecedentes o documento base (opcional si se escriben antecedentes)
 *   antecedentes   texto libre con los antecedentes/hechos del caso, para cuando no hay un borrador
 *                  en un archivo (opcional, max 20000 caracteres; se combina con el archivo si hay ambos)
 *   modelo         .doc/.docx con una escritura modelo de la escribana o el escribano (opcional)
 *   modo           completo | escritura | estudio_titulos | certificacion_firmas (default completo)
 *   instrucciones  texto libre con el pedido de la escribana o el escribano (opcional, max 6000 caracteres)
 * Crea la sesion y lanza el pipeline.
 */
rutasSesiones.post("/", requerirSuscripcionActiva, subida.fields([{ name: "archivo", maxCount: 1 }, { name: "modelo", maxCount: 1 }]), async (req, res, next) => {
  try {
    const archivo = req.files?.archivo?.[0];
    const modeloArchivo = req.files?.modelo?.[0];
    const modo = MODOS.has(req.body?.modo) ? req.body.modo : "completo";
    const antecedentesCrudos = String(req.body?.antecedentes || "").slice(0, 20000).trim();
    let instruccionesCrudas = String(req.body?.instrucciones || "").slice(0, 6000).trim();
    let certificacion = null;
    let datosCertificacion = null;
    let estructuradoCertificacion = "";
    if (modo === "certificacion_firmas") {
      let datos = null;
      try {
        datos = req.body?.datos ? JSON.parse(req.body.datos) : null;
      } catch {
        throw new AppError("DATOS_INVALIDOS", "Los datos de la certificacion no son un JSON valido.", 400);
      }
      certificacion = { modalidad: datos?.modalidad === "representacion" ? "representacion" : "personal" };
      datosCertificacion = datos;
      estructuradoCertificacion = textoCertificacion(datos);
      instruccionesCrudas = [estructuradoCertificacion, instruccionesCrudas].filter(Boolean).join("\n\n").slice(0, 8000);
    }

    let texto = "";
    if (archivo) {
      texto = await extraerTexto(archivo.buffer, archivo.originalname);
      archivo.buffer = null; // liberar el binario cuanto antes
    }
    if (antecedentesCrudos) {
      texto = texto ? `${texto}\n\n--- Antecedentes escritos por la escribana o el escribano ---\n${antecedentesCrudos}` : antecedentesCrudos;
    }
    if (modo === "certificacion_firmas") {
      if (!texto && !estructuradoCertificacion) throw new AppError("SIN_DATOS", "Indique al menos un firmante, escriba los antecedentes o adjunte el documento a certificar.", 400);
    } else if (!texto) {
      throw new AppError("SIN_CONTENIDO", "Debe adjuntar un documento (.doc/.docx) o escribir los antecedentes del caso.", 400);
    }

    let textoModelo = null;
    if (modeloArchivo) {
      textoModelo = await extraerTexto(modeloArchivo.buffer, modeloArchivo.originalname);
      modeloArchivo.buffer = null;
    } else if (req.body?.modeloBibliotecaId) {
      textoModelo = await obtenerModeloBiblioteca(req.usuario.id, req.body.modeloBibliotecaId);
    }
    // Un solo mapa para los tres textos: los mismos datos reciben el mismo token.
    const mapa = new Map();
    registrarEntidadesCertificacion(datosCertificacion, mapa); // nombres/sociedad del formulario, deterministas
    const { texto: saneado } = presanear(reemplazarTodo(texto, mapa), mapa);
    const modeloSaneado = textoModelo ? presanear(reemplazarTodo(textoModelo, mapa), mapa).texto : null;
    const instrucciones = instruccionesCrudas ? presanear(reemplazarTodo(instruccionesCrudas, mapa), mapa).texto : "";
    const bytes = (archivo?.size || 0) + (modeloArchivo?.size || 0) + Buffer.byteLength(antecedentesCrudos, "utf8");
    const sesion = crearSesion({ textoOriginal: saneado, textoModelo: modeloSaneado, instrucciones, modo, certificacion, bytesEntrada: bytes, mapa, usuarioId: req.usuario.id });
    await auditoria.evento("sesion.creada", sesion.id, { bytes, cantidad: mapa.size, motivo: modo });
    // El pipeline corre en segundo plano; el cliente sigue por SSE o polling.
    ejecutarPipeline(sesion).catch((e) => {
      logger.error("Pipeline abortado", { sesionId: sesion.id, codigo: e.codigo || e.name });
      sesion.estado = "fallida";
      sesion.error = { codigo: e.codigo || "ERROR_INESPERADO", mensaje: e.message };
    });
    res.status(202).json({ sesionId: sesion.id, estado: sesion.estado, modo, entidadesPresaneadas: mapa.size });
  } catch (e) {
    next(e);
  }
});

/** GET /api/sesiones/:id -> estado actual (todo anonimizado). */
rutasSesiones.get("/:id", (req, res, next) => {
  try {
    res.json(vistaPublica(requerirSesion(req)));
  } catch (e) {
    next(e);
  }
});

/** GET /api/sesiones/:id/eventos -> Server-Sent Events con el progreso del pipeline. */
rutasSesiones.get("/:id/eventos", (req, res, next) => {
  let sesion;
  try {
    sesion = requerirSesion(req);
  } catch (e) {
    return next(e);
  }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const enviar = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  // Reenvia el historial (por si el cliente se reconecta) y luego lo nuevo.
  for (const ev of sesion.eventos) enviar(ev);
  if (sesion.estado !== "en_curso") {
    enviar({ tipo: "fin", estado: sesion.estado, ts: Date.now() });
    return res.end();
  }
  const onEvento = (ev) => {
    enviar(ev);
    if (ev.tipo === "estado" && ev.estado !== "en_curso") {
      enviar({ tipo: "fin", estado: ev.estado, ts: Date.now() });
      cerrar();
    }
  };
  const onCerrada = () => {
    enviar({ tipo: "fin", estado: "cerrada", ts: Date.now() });
    cerrar();
  };
  const latido = setInterval(() => res.write(": ping\n\n"), 15000);
  function cerrar() {
    clearInterval(latido);
    sesion.emisor.off("evento", onEvento);
    sesion.emisor.off("cerrada", onCerrada);
    res.end();
  }
  sesion.emisor.on("evento", onEvento);
  sesion.emisor.on("cerrada", onCerrada);
  req.on("close", cerrar);
});

/** GET /api/sesiones/:id/documento -> .docx final; destruye la sesion tras enviarlo. */
rutasSesiones.get("/:id/documento", async (req, res, next) => {
  try {
    const sesion = requerirSesion(req);
    if (sesion.estado !== "completada") throw new AppError("SESION_INCOMPLETA", "El proceso aun no termino o fallo; no hay documento para exportar.", 409);
    const buffer = await construirDocx(sesion);
    const nombre = `${sesion.modo === "estudio_titulos" ? "estudio-de-titulos" : sesion.modo === "certificacion_firmas" ? "certificacion-de-firmas-" + (sesion.certificacion?.modalidad || "personal") : "minuta-" + (sesion.plantilla?.clave || "escritura")}-${new Date().toISOString().slice(0, 10)}.docx`;
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Content-Length": buffer.length,
    });
    res.send(buffer);
    // Requisito de privacidad: al exportar se destruye el mapa en memoria.
    destruirSesion(sesion.id, "exportado");
    await auditoria.evento("documento.exportado", sesion.id, { plantilla: sesion.plantilla?.clave || "", bytes: buffer.length });
  } catch (e) {
    next(e);
  }
});

/** POST /api/sesiones/:id/reintentar -> reanuda una sesion fallida desde la etapa que fallo, con el proveedor de IA actual. */
rutasSesiones.post("/:id/reintentar", async (req, res, next) => {
  try {
    const sesion = requerirSesion(req);
    if (sesion.estado !== "fallida") throw new AppError("SESION_NO_FALLIDA", "Solo se puede reintentar una sesion que fallo.", 409);
    if (!sesion.mapa || (!sesion.textoOriginal && !sesion.textoAnonimizado && !sesion.instrucciones && !sesion.instruccionesAnonimizadas)) {
      throw new AppError("SESION_SIN_DATOS", "La sesion ya no conserva los datos necesarios; vuelva a cargar el documento.", 410);
    }
    sesion.estado = "en_curso";
    sesion.error = null;
    sesion.eventos = []; // el historial anterior ya fue mostrado; el SSE nuevo empieza limpio
    await auditoria.evento("sesion.reintento", sesion.id, { motivo: "manual" });
    ejecutarPipeline(sesion, { reintento: true }).catch((e) => {
      logger.error("Pipeline abortado en reintento", { sesionId: sesion.id, codigo: e.codigo || e.name });
      sesion.estado = "fallida";
      sesion.error = { codigo: e.codigo || "ERROR_INESPERADO", mensaje: e.message };
    });
    res.status(202).json({ sesionId: sesion.id, estado: sesion.estado });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/sesiones/:id/iterar  { feedback? }
 * Genera una nueva version del resultado ya completado, incorporando el pedido
 * de mejora de la escribana o el escribano. No hace falta volver a cargar el documento: se
 * conserva la extraccion y se vuelven a correr los demas skills.
 */
rutasSesiones.post("/:id/iterar", async (req, res, next) => {
  try {
    const sesion = requerirSesion(req);
    if (sesion.estado !== "completada") throw new AppError("SESION_NO_COMPLETADA", "Solo se puede pedir una mejora sobre un resultado ya terminado.", 409);
    if (!sesion.mapa) throw new AppError("SESION_SIN_DATOS", "La sesion ya no conserva los datos necesarios (se descargo o cerro); vuelva a cargar el documento.", 410);
    const feedback = String(req.body?.feedback || "").slice(0, 4000).trim();
    sesion.numeroIteracion = (sesion.numeroIteracion || 1) + 1;
    sesion.estado = "en_curso";
    sesion.error = null;
    sesion.eventos = []; // el historial anterior ya fue mostrado; el SSE nuevo empieza limpio
    await auditoria.evento("sesion.iteracion", sesion.id, { motivo: sesion.modo, cantidad: sesion.numeroIteracion });
    ejecutarPipeline(sesion, { iteracionFeedback: feedback }).catch((e) => {
      logger.error("Pipeline abortado en iteracion", { sesionId: sesion.id, codigo: e.codigo || e.name });
      sesion.estado = "fallida";
      sesion.error = { codigo: e.codigo || "ERROR_INESPERADO", mensaje: e.message };
    });
    res.status(202).json({ sesionId: sesion.id, estado: sesion.estado, numeroIteracion: sesion.numeroIteracion });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/sesiones/:id/guardar -> cifra y persiste la sesion (completada o fallida)
 * para poder reanudarla despues, y libera la memoria. No se puede guardar una sesion
 * "en_curso": el pipeline mantiene una referencia viva y la sigue mutando.
 */
rutasSesiones.post("/:id/guardar", async (req, res, next) => {
  try {
    const sesion = requerirSesion(req);
    if (sesion.estado === "en_curso") throw new AppError("SESION_EN_CURSO", "No se puede guardar una sesion mientras el pipeline la esta procesando.", 409);
    const guardada = await guardarSesion(sesion);
    await auditoria.evento("sesion.guardada", sesion.id, { motivo: sesion.modo });
    res.status(201).json(guardada);
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/sesiones/:id -> cierra la sesion y borra los datos en memoria. */
rutasSesiones.delete("/:id", async (req, res) => {
  // Idempotente: si la sesion no existe o es de otra cuenta, el resultado deseado
  // ("esta sesion ya no esta") ya se cumple, asi que no hace falta avisar de nada.
  let sesion;
  try {
    sesion = requerirSesion(req);
  } catch {
    return res.status(204).end();
  }
  destruirSesion(sesion.id, "manual");
  await auditoria.evento("sesion.destruida", sesion.id, { motivo: "manual" });
  res.status(204).end();
});
