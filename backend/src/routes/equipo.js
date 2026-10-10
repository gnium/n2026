/** Equipo de la escribania: integrantes, invitaciones, roles y metricas. Montado bajo requerirAuth. */
import { Router } from "express";
import { obtener, crear, renombrar, cambiarJurisdiccion, cambiarCondicionFiscal, invitar, cancelarInvitacion, aceptarInvitacion, cambiarRol, cambiarEstado, quitarMiembro, metricas, companeros } from "../services/equipo.js";

export const rutasEquipo = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasEquipo.get("/", manejar(async (req, res) => res.json(await obtener(req.usuario.id))));
rutasEquipo.get("/colleagues", manejar(async (req, res) => res.json(await companeros(req.usuario.id))));
rutasEquipo.get("/metrics", manejar(async (req, res) => res.json(await metricas(req.usuario.id, req.query.dias))));
rutasEquipo.post("/", manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body?.nombre, req.body?.jurisdiccion))));
rutasEquipo.put("/", manejar(async (req, res) => res.json(await renombrar(req.usuario.id, req.body?.nombre))));
rutasEquipo.patch("/jurisdiccion", manejar(async (req, res) => res.json(await cambiarJurisdiccion(req.usuario.id, req.body?.jurisdiccion))));
rutasEquipo.patch("/condicion-fiscal", manejar(async (req, res) => res.json(await cambiarCondicionFiscal(req.usuario.id, req.body?.condicionFiscal))));
rutasEquipo.post("/invitations", manejar(async (req, res) => res.status(201).json(await invitar(req.usuario.id, req.body || {}))));
rutasEquipo.delete("/invitations/:id", manejar(async (req, res) => res.json(await cancelarInvitacion(req.usuario.id, req.params.id))));
rutasEquipo.post("/invitations/accept", manejar(async (req, res) => res.json(await aceptarInvitacion(req.usuario.id, req.body?.token))));
rutasEquipo.patch("/members/:id/role", manejar(async (req, res) => res.json(await cambiarRol(req.usuario.id, req.params.id, req.body?.rol))));
rutasEquipo.patch("/members/:id/status", manejar(async (req, res) => res.json(await cambiarEstado(req.usuario.id, req.params.id, req.body?.estado))));
rutasEquipo.delete("/members/:id", manejar(async (req, res) => res.json(await quitarMiembro(req.usuario.id, req.params.id))));
