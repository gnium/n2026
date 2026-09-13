/** Novedades de la cuenta (vencimientos y pendientes). Montado bajo requerirAuth. */
import { Router } from "express";
import { novedades } from "../services/alertas.js";

export const rutasAlertas = Router();

rutasAlertas.get("/", async (req, res, next) => {
  try {
    res.json(await novedades(req.usuario.id));
  } catch (e) {
    next(e);
  }
});
