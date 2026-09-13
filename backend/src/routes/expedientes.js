import { Router } from "express";
import { listar, obtener, crear, actualizar, actualizarEstado, borrar, reemplazarPartes, crearTarea, actualizarTarea, actualizarEstadoTarea, borrarTarea, crearTareasDesdeSesion, listarColaboradores, compartir, dejarDeCompartir, misTareas } from "../services/expedientes.js";
import { obtenerSesionDeUsuario } from "../services/sessionStore.js";
import { AppError } from "../utils/errores.js";

export const rutasExpedientes = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasExpedientes.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, req.query.estado))));
// Antes de "/:id": si no, la ruta dinamica se quedaria con esta.
rutasExpedientes.get("/mis-tareas", manejar(async (req, res) => res.json(await misTareas(req.usuario.id))));
rutasExpedientes.get("/:id", manejar(async (req, res) => res.json(await obtener(req.usuario.id, req.params.id))));
rutasExpedientes.post("/", manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body || {}))));
rutasExpedientes.put("/:id", manejar(async (req, res) => res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}))));
rutasExpedientes.patch("/:id/estado", manejar(async (req, res) => res.json(await actualizarEstado(req.usuario.id, req.params.id, req.body?.estado))));
rutasExpedientes.delete("/:id", manejar(async (req, res) => {
  await borrar(req.usuario.id, req.params.id);
  res.status(204).end();
}));

rutasExpedientes.put("/:id/partes", manejar(async (req, res) => res.json(await reemplazarPartes(req.usuario.id, req.params.id, req.body?.partes))));

// Compartir puntual con integrantes del equipo (solo la cuenta duena del expediente).
rutasExpedientes.get("/:id/colaboradores", manejar(async (req, res) => res.json(await listarColaboradores(req.usuario.id, req.params.id))));
rutasExpedientes.post("/:id/colaboradores", manejar(async (req, res) => res.status(201).json(await compartir(req.usuario.id, req.params.id, req.body || {}))));
rutasExpedientes.delete("/:id/colaboradores/:usuarioId", manejar(async (req, res) => res.json(await dejarDeCompartir(req.usuario.id, req.params.id, req.params.usuarioId))));

rutasExpedientes.post("/:id/tareas", manejar(async (req, res) => res.status(201).json(await crearTarea(req.usuario.id, req.params.id, req.body || {}))));
rutasExpedientes.put("/:id/tareas/:tareaId", manejar(async (req, res) => res.json(await actualizarTarea(req.usuario.id, req.params.id, req.params.tareaId, req.body || {}))));
rutasExpedientes.patch("/:id/tareas/:tareaId/estado", manejar(async (req, res) => res.json(await actualizarEstadoTarea(req.usuario.id, req.params.id, req.params.tareaId, req.body?.estado))));
rutasExpedientes.delete("/:id/tareas/:tareaId", manejar(async (req, res) => {
  await borrarTarea(req.usuario.id, req.params.id, req.params.tareaId);
  res.status(204).end();
}));

/** Crea tareas a partir del checklist de una sesion viva (solo texto anonimizado) y vincula la ejecucion al expediente. */
rutasExpedientes.post("/:id/tareas/desde-sesion/:sesionId", manejar(async (req, res) => {
  const sesion = obtenerSesionDeUsuario(req.params.sesionId, req.usuario.id);
  if (!sesion) throw new AppError("SESION_INEXISTENTE", "La sesion no existe o ya fue cerrada (los datos se borran al exportar o por inactividad).", 404);
  res.json(await crearTareasDesdeSesion(req.usuario.id, req.params.id, sesion));
}));
