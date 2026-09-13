import { Router } from "express";
import { listarRango, crear, actualizar, actualizarEstado, borrar } from "../services/turnos.js";
import { AppError } from "../utils/errores.js";

export const rutasTurnos = Router();

rutasTurnos.get("/", async (req, res, next) => {
  try {
    if (!req.query.desde || !req.query.hasta) throw new AppError("DATOS_INVALIDOS", "Debe indicar desde y hasta.", 400);
    res.json(await listarRango(req.usuario.id, req.query.desde, req.query.hasta, { equipo: req.query.equipo === "1" }));
  } catch (e) {
    next(e);
  }
});

rutasTurnos.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await crear(req.usuario.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasTurnos.put("/:id", async (req, res, next) => {
  try {
    res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasTurnos.patch("/:id/estado", async (req, res, next) => {
  try {
    res.json(await actualizarEstado(req.usuario.id, req.params.id, req.body?.estado));
  } catch (e) {
    next(e);
  }
});

rutasTurnos.delete("/:id", async (req, res, next) => {
  try {
    await borrar(req.usuario.id, req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
