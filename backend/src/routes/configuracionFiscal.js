import { Router } from "express";
import { obtener, guardar, borrarCredenciales, probarArca } from "../services/configuracionFiscal.js";

export const rutasConfiguracionFiscal = Router();
const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasConfiguracionFiscal.get("/", manejar(async (req, res) => res.json(await obtener(req.usuario.id))));
rutasConfiguracionFiscal.put("/", manejar(async (req, res) => res.json(await guardar(req.usuario.id, req.body || {}))));
rutasConfiguracionFiscal.delete("/credenciales", manejar(async (req, res) => res.json(await borrarCredenciales(req.usuario.id))));
rutasConfiguracionFiscal.post("/probar", manejar(async (req, res) => res.json(await probarArca(req.usuario.id))));
