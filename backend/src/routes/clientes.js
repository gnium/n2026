import { Router } from "express";
import { listar, obtener, crear, actualizar, borrar } from "../services/clientes.js";

export const rutasClientes = Router();

rutasClientes.get("/", async (req, res, next) => {
  try {
    res.json(await listar(req.usuario.id, req.query.q));
  } catch (e) {
    next(e);
  }
});

rutasClientes.get("/:id", async (req, res, next) => {
  try {
    res.json(await obtener(req.usuario.id, req.params.id));
  } catch (e) {
    next(e);
  }
});

rutasClientes.post("/", async (req, res, next) => {
  try {
    res.status(201).json(await crear(req.usuario.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasClientes.put("/:id", async (req, res, next) => {
  try {
    res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}));
  } catch (e) {
    next(e);
  }
});

rutasClientes.delete("/:id", async (req, res, next) => {
  try {
    await borrar(req.usuario.id, req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
