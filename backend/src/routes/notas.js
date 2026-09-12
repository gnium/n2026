import { Router } from "express";
import { listar, crear, actualizar, borrar } from "../services/notas.js";

export const rutasNotas = Router();

rutasNotas.get("/", async (req, res, next) => {
  try {
    res.json(await listar(req.usuario.id));
  } catch (e) {
    next(e);
  }
});

rutasNotas.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await crear(req.usuario.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasNotas.put("/:id", async (req, res, next) => {
  try {
    res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasNotas.delete("/:id", async (req, res, next) => {
  try {
    await borrar(req.usuario.id, req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
