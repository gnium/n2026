/**
 * Panel de operacion de la plataforma. Montado con requerirAuth + requerirAdmin:
 * solo la cuenta operadora (la primera registrada) entra. Devuelve unicamente
 * metadatos y agregados; ver la regla del modulo en services/soporte.js.
 */
import { Router } from "express";
import { resumen, cuentas, cuenta, cambiarActivo } from "../services/soporte.js";

export const rutasSoporte = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasSoporte.get("/resumen", manejar(async (req, res) => res.json(await resumen(req.query.dias))));
rutasSoporte.get("/cuentas", manejar(async (req, res) => res.json(await cuentas({ q: req.query.q, periodo: req.query.dias, soloProblemas: req.query.problemas === "1" }))));
rutasSoporte.get("/cuentas/:id", manejar(async (req, res) => res.json(await cuenta(req.params.id, req.query.dias))));
rutasSoporte.patch("/cuentas/:id/activo", manejar(async (req, res) => res.json(await cambiarActivo(req.usuario.id, req.params.id, req.body?.activo))));
