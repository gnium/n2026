import { Router } from "express";
import { listar, crear, borrar } from "../services/feriados.js";

export const rutasFeriados = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasFeriados.get("/", manejar(async (req, res) => res.json(await listar(req.query.anio, req.query.jurisdiccion))));

rutasFeriados.post("/", manejar(async (req, res) => {
  if (!req.usuario.esAdmin) return res.status(403).json({ error: "Solo administradores pueden crear feriados." });
  res.status(201).json(await crear(req.body || {}));
}));

rutasFeriados.delete("/:id", manejar(async (req, res) => {
  if (!req.usuario.esAdmin) return res.status(403).json({ error: "Solo administradores pueden borrar feriados." });
  await borrar(req.params.id);
  res.status(204).end();
}));
