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

rutasUif.get("/alertas", manejar(async (req, res) => res.json(await alertas(req.usuario.id))));
rutasUif.get("/parametros", manejar(async (_req, res) => res.json(await parametros())));
rutasUif.put("/parametros", requerirAdmin, manejar(async (req, res) => res.json(await guardarParametros(req.body || {}))));
rutasUif.get("/expedientes", manejar(async (req, res) => res.json(await listarAlcanzados(req.usuario.id))));
rutasUif.get("/legajos/:clienteId", manejar(async (req, res) => res.json(await obtenerLegajo(req.usuario.id, req.params.clienteId))));
rutasUif.put("/legajos/:clienteId", manejar(async (req, res) => res.json(await guardarLegajo(req.usuario.id, req.params.clienteId, req.body || {}))));
rutasUif.get("/expedientes/:id", manejar(async (req, res) => res.json(await obtenerUif(req.usuario.id, req.params.id))));
rutasUif.put("/expedientes/:id", manejar(async (req, res) => res.json(await guardarUif(req.usuario.id, req.params.id, req.body || {}))));
rutasUif.post("/expedientes/:id/generar", manejar(async (req, res) => res.json(await generarRecaudos(req.usuario.id, req.params.id))));
rutasUif.get("/eventos", manejar(async (req, res) => res.json(await listarEventos(req.usuario.id))));
rutasUif.post("/eventos", manejar(async (req, res) => res.status(201).json(await crearEvento(req.usuario.id, req.body || {}))));
rutasUif.delete("/eventos/:id", manejar(async (req, res) => {
  await borrarEvento(req.usuario.id, req.params.id);
  res.status(204).end();
}));
