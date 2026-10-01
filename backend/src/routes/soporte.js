/**
 * Panel de operacion de la plataforma. Montado con requerirAuth + requerirAdmin:
 * solo la cuenta operadora (la primera registrada) entra. Devuelve unicamente
 * metadatos y agregados; ver la regla del modulo en services/soporte.js.
 */
import { Router } from "express";
import { resumen, cuentas, cuenta, cambiarActivo, eliminarDefinitivamente, suscripciones } from "../services/soporte.js";
import * as invitaciones from "../services/invitacionesPlataforma.js";
import { revisar } from "../services/prueba.js";
import { rutasConsultasAdmin } from "./consultasSoporte.js";

export const rutasSoporte = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasSoporte.get("/resumen", manejar(async (req, res) => res.json(await resumen(req.query.dias))));
rutasSoporte.get("/suscripciones", manejar(async (req, res) => res.json(await suscripciones(req.query.dias))));
rutasSoporte.get("/cuentas", manejar(async (req, res) => res.json(await cuentas({ q: req.query.q, periodo: req.query.dias, soloProblemas: req.query.problemas === "1" }))));
rutasSoporte.get("/cuentas/:id", manejar(async (req, res) => res.json(await cuenta(req.params.id, req.query.dias))));
rutasSoporte.patch("/cuentas/:id/activo", manejar(async (req, res) => res.json(await cambiarActivo(req.usuario.id, req.params.id, req.body?.activo))));
// Borrado definitivo: irreversible, con el correo de la cuenta como confirmacion.
rutasSoporte.delete("/cuentas/:id", manejar(async (req, res) => res.json(await eliminarDefinitivamente(req.usuario.id, req.params.id, req.body?.email))));

// Altas de escribanias nuevas: invitacion por correo con periodo de prueba.
rutasSoporte.get("/invitaciones", manejar(async (_req, res) => res.json(await invitaciones.listar())));
rutasSoporte.post("/invitaciones", manejar(async (req, res) => res.status(201).json(await invitaciones.invitar(req.usuario.id, req.body || {}))));
rutasSoporte.post("/invitaciones/:id/reenviar", manejar(async (req, res) => res.json(await invitaciones.reenviar(req.usuario.id, req.params.id))));
rutasSoporte.delete("/invitaciones/:id", manejar(async (req, res) => res.json(await invitaciones.cancelar(req.usuario.id, req.params.id))));
rutasSoporte.delete("/invitaciones/:id/definitivo", manejar(async (req, res) => res.json(await invitaciones.eliminar(req.usuario.id, req.params.id))));

// Canal de consultas de soporte (el operador ve todas, responde y cierra).
rutasSoporte.use("/consultas", rutasConsultasAdmin);

// Pasada de vencimientos a pedido (la automatica corre sola cada 6 h).
rutasSoporte.post("/pruebas/revisar", manejar(async (req, res) => res.json(await revisar({ forzarBorrado: req.body?.forzarBorrado === true }))));
