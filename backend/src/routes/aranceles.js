import { Router } from "express";
import { listar, calcular, obtener, actualizar, crear } from "../services/aranceles.js";

export const rutasAranceles = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasAranceles.get("/", manejar(async (req, res) => res.json(await listar(req.query.jurisdiccion, req.query.tipoActo))));

rutasAranceles.post("/calcular", manejar(async (req, res) => {
  const { jurisdiccion, tipoActo, montoOperacion, condicionFiscal } = req.body || {};
  res.json(await calcular(jurisdiccion, tipoActo, Number(montoOperacion), { condicionFiscal }));
}));

rutasAranceles.get("/:id", manejar(async (req, res) => res.json(await obtener(req.params.id))));

rutasAranceles.put("/:id", manejar(async (req, res) => {
  if (!req.usuario.esAdmin) throw new (await import("../utils/errores.js")).AppError("PROHIBIDO", "Solo el administrador puede editar aranceles.", 403);
  res.json(await actualizar(req.params.id, req.body || {}));
}));

rutasAranceles.post("/", manejar(async (req, res) => {
  if (!req.usuario.esAdmin) throw new (await import("../utils/errores.js")).AppError("PROHIBIDO", "Solo el administrador puede crear aranceles.", 403);
  res.status(201).json(await crear(req.body || {}));
}));
