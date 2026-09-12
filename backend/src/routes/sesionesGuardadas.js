import { Router } from "express";
import { listarGuardadas, reanudarGuardada, borrarGuardada } from "../services/sesionesGuardadas.js";
import { auditoria } from "../services/auditoria.js";

export const rutasSesionesGuardadas = Router();

rutasSesionesGuardadas.get("/", async (req, res, next) => {
  try {
    res.json(await listarGuardadas(req.usuario.id));
  } catch (e) {
    next(e);
  }
});

rutasSesionesGuardadas.post("/:id/reanudar", async (req, res, next) => {
  try {
    const vista = await reanudarGuardada(req.usuario.id, req.params.id);
    await auditoria.evento("sesion.reanudada", vista.id, { motivo: vista.modo });
    res.json(vista);
  } catch (e) {
    next(e);
  }
});

rutasSesionesGuardadas.delete("/:id", async (req, res, next) => {
  try {
    await borrarGuardada(req.usuario.id, req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
