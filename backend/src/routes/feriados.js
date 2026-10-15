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

rutasFeriados.get("/", manejar(async (req, res) => res.json(await listar(req.query.anio, req.query.jurisdiccion, req.usuario.id))));

rutasFeriados.post("/", manejar(async (req, res) => {
  const datos = req.body || {};
  const tipo = datos.tipo || "propio";
  if (tipo !== "propio" && !req.usuario.esAdmin) {
    return res.status(403).json({ error: "Solo administradores pueden crear feriados nacionales o provinciales." });
  }
  const uid = tipo === "propio" ? req.usuario.id : null;
  res.status(201).json(await crear(datos, uid));
}));

rutasFeriados.delete("/:id", manejar(async (req, res) => {
  if (req.usuario.esAdmin) {
    await borrar(req.params.id);
  } else {
    await borrar(req.params.id, req.usuario.id);
  }
  res.status(204).end();
}));
