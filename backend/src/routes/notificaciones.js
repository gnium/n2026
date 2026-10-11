import { Router } from "express";
import { listar, sinLeer, marcarLeida, marcarTodasLeidas, crear, listarAdmin, borrar } from "../services/notificaciones.js";
import { requerirAdmin } from "../middleware/auth.js";

export const rutasNotificaciones = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasNotificaciones.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id))));
rutasNotificaciones.get("/unread", manejar(async (req, res) => res.json({ sinLeer: await sinLeer(req.usuario.id) })));
rutasNotificaciones.patch("/:id/read", manejar(async (req, res) => { await marcarLeida(req.usuario.id, req.params.id); res.json({ ok: true }); }));
rutasNotificaciones.patch("/read-all", manejar(async (req, res) => { await marcarTodasLeidas(req.usuario.id); res.json({ ok: true }); }));

rutasNotificaciones.post("/", requerirAdmin, manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body || {}))));
rutasNotificaciones.get("/admin", requerirAdmin, manejar(async (req, res) => res.json(await listarAdmin())));
rutasNotificaciones.delete("/:id", requerirAdmin, manejar(async (req, res) => { await borrar(req.params.id); res.status(204).end(); }));
