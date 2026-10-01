import { Router } from "express";
import { requerirAdmin } from "../middleware/auth.js";
import { parametros, guardarParametros, obtenerLegajo, guardarLegajo, obtenerUif, guardarUif, listarAlcanzados, listarEventos, crearEvento, borrarEvento, alertas } from "../services/uif.js";
import { generarRecaudos } from "../services/uifIA.js";

export const rutasUif = Router();
const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasUif.get("/alerts", manejar(async (req, res) => res.json(await alertas(req.usuario.id))));
rutasUif.get("/parameters", manejar(async (_req, res) => res.json(await parametros())));
rutasUif.put("/parameters", requerirAdmin, manejar(async (req, res) => res.json(await guardarParametros(req.body || {}))));
rutasUif.get("/cases", manejar(async (req, res) => res.json(await listarAlcanzados(req.usuario.id))));
rutasUif.get("/records/:clienteId", manejar(async (req, res) => res.json(await obtenerLegajo(req.usuario.id, req.params.clienteId))));
rutasUif.put("/records/:clienteId", manejar(async (req, res) => res.json(await guardarLegajo(req.usuario.id, req.params.clienteId, req.body || {}))));
rutasUif.get("/cases/:id", manejar(async (req, res) => res.json(await obtenerUif(req.usuario.id, req.params.id))));
rutasUif.put("/cases/:id", manejar(async (req, res) => res.json(await guardarUif(req.usuario.id, req.params.id, req.body || {}))));
rutasUif.post("/cases/:id/generate", manejar(async (req, res) => res.json(await generarRecaudos(req.usuario.id, req.params.id))));
rutasUif.get("/events", manejar(async (req, res) => res.json(await listarEventos(req.usuario.id))));
rutasUif.post("/events", manejar(async (req, res) => res.status(201).json(await crearEvento(req.usuario.id, req.body || {}))));
rutasUif.delete("/events/:id", manejar(async (req, res) => {
  await borrarEvento(req.usuario.id, req.params.id);
  res.status(204).end();
}));
