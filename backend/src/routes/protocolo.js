import { Router } from "express";
import { listarPorAnio, listarAniosDisponibles, proximoNumeroYFolio, crearEntrada, actualizarEntrada, actualizarEstado, borrarUltimaEntrada, obtenerParaExport } from "../services/protocolo.js";
import { construirIndiceProtocoloDocx } from "../services/protocoloDocx.js";
import { obtenerSesionDeUsuario } from "../services/sessionStore.js";
import { AppError } from "../utils/errores.js";

export const rutasProtocolo = Router();

const anioActual = () => new Date().getFullYear();
const anioDesdeQuery = (req) => {
  const n = Number(req.query.anio);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : anioActual();
};

rutasProtocolo.get("/", async (req, res, next) => {
  try {
    res.json(await listarPorAnio(req.usuario.id, anioDesdeQuery(req)));
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.get("/anios", async (req, res, next) => {
  try {
    res.json(await listarAniosDisponibles(req.usuario.id));
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.get("/sugerido", async (req, res, next) => {
  try {
    res.json(await proximoNumeroYFolio(req.usuario.id, anioDesdeQuery(req)));
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/protocolo/desde-sesion/:sesionId
 * Lectura acotada, unica en todo el codigo fuera de docxBuilder.js, que muestra
 * los nombres reales de una sesion viva (antes de descargarla/destruirla) para
 * que la escribana o el escribano los revise/edite antes de registrarlos en
 * el protocolo. No muta ni destruye la sesion.
 */
rutasProtocolo.get("/desde-sesion/:sesionId", (req, res, next) => {
  try {
    const sesion = obtenerSesionDeUsuario(req.params.sesionId, req.usuario.id);
    if (!sesion) throw new AppError("SESION_INEXISTENTE", "La sesion no existe o ya fue cerrada (los datos se borran al exportar o por inactividad).", 404);
    const entidades = sesion.resultados?.extractor_antecedentes?.entidades || [];
    const comparecientes = entidades
      .filter((e) => e.categoria === "persona" || e.categoria === "sociedad")
      .map((e) => ({ rol: e.rol || e.categoria, nombre: sesion.mapa.get(e.token) || null }))
      .filter((c) => c.nombre);
    res.json({
      tipoActo: sesion.resultados?.extractor_antecedentes?.resumen?.tipo_acto || "otro",
      comparecientes,
      ejecucionId: sesion.ejecucionId,
    });
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await crearEntrada(req.usuario.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.put("/:id", async (req, res, next) => {
  try {
    res.json(await actualizarEntrada(req.usuario.id, req.params.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.patch("/:id/estado", async (req, res, next) => {
  try {
    res.json(await actualizarEstado(req.usuario.id, req.params.id, req.body?.estado, req.body?.observaciones));
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.delete("/:id", async (req, res, next) => {
  try {
    await borrarUltimaEntrada(req.usuario.id, req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

rutasProtocolo.get("/:anio/exportar", async (req, res, next) => {
  try {
    const anio = Number(req.params.anio);
    if (!Number.isInteger(anio)) throw new AppError("DATOS_INVALIDOS", "Año invalido.", 400);
    const filas = await obtenerParaExport(req.usuario.id, anio);
    const buffer = await construirIndiceProtocoloDocx(anio, filas);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="indice-protocolo-${anio}.docx"`,
      "Content-Length": buffer.length,
    });
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});
