import { Router } from "express";
import { listar, obtener, crear, completar, borrar, listarRango } from "../services/vencimientos.js";

export const rutasVencimientos = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasVencimientos.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, {
  expedienteId: req.query.expedienteId,
  estado: req.query.estado,
  desde: req.query.desde,
  hasta: req.query.hasta,
}))));

rutasVencimientos.get("/range", manejar(async (req, res) => res.json(await listarRango(req.usuario.id, req.query.desde, req.query.hasta))));

rutasVencimientos.get("/:id", manejar(async (req, res) => res.json(await obtener(req.usuario.id, req.params.id))));

rutasVencimientos.post("/", manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body || {}))));

rutasVencimientos.patch("/:id/status", manejar(async (req, res) => {
  if (req.body?.estado !== "completado") {
    return res.status(400).json({ error: "Solo se puede marcar como completado." });
  }
  res.json(await completar(req.usuario.id, req.params.id));
}));

rutasVencimientos.delete("/:id", manejar(async (req, res) => {
  await borrar(req.usuario.id, req.params.id);
  res.status(204).end();
}));
