/**
 * Rutas del canal de consultas de soporte.
 *
 * Dos conjuntos:
 *   - /api/consultas: las de la cuenta logueada (suscriptora)
 *   - /api/soporte/consultas: las del operador (ve todas, responde, cierra)
 *
 * Este archivo exporta ambos routers; se montan en server.js.
 */
import { Router } from "express";
import * as svc from "../services/consultasSoporte.js";

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

// --- Rutas de la cuenta suscriptora ---
export const rutasConsultas = Router();

rutasConsultas.get("/", manejar(async (req, res) => res.json(await svc.listarMias(req.usuario.id))));
rutasConsultas.get("/sin-leer", manejar(async (req, res) => res.json({ sinLeer: await svc.contarSinLeer(req.usuario.id) })));
rutasConsultas.get("/:id", manejar(async (req, res) => res.json(await svc.obtener(Number(req.params.id), req.usuario.id, false))));
rutasConsultas.post("/", manejar(async (req, res) => res.status(201).json(await svc.crear(req.usuario.id, req.body || {}))));
rutasConsultas.post("/:id/mensajes", manejar(async (req, res) => res.json(await svc.responder(Number(req.params.id), req.usuario.id, false, req.body || {}))));

// --- Rutas del operador (se montan bajo /api/soporte/consultas con requerirAdmin) ---
export const rutasConsultasAdmin = Router();

rutasConsultasAdmin.get("/", manejar(async (req, res) => res.json(await svc.listarTodas({ estado: req.query.estado, q: req.query.q }))));
rutasConsultasAdmin.get("/abiertas", manejar(async (_req, res) => res.json({ abiertas: await svc.contarAbiertas() })));
rutasConsultasAdmin.get("/:id", manejar(async (req, res) => res.json(await svc.obtener(Number(req.params.id), req.usuario.id, true))));
rutasConsultasAdmin.post("/:id/mensajes", manejar(async (req, res) => res.json(await svc.responder(Number(req.params.id), req.usuario.id, true, req.body || {}))));
rutasConsultasAdmin.post("/:id/cerrar", manejar(async (req, res) => res.json(await svc.cerrar(Number(req.params.id)))));
rutasConsultasAdmin.post("/:id/reabrir", manejar(async (req, res) => res.json(await svc.reabrir(Number(req.params.id)))));
