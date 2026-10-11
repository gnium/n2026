import { Router } from "express";
import { listar, obtener, pendientes, crear, actualizar, actualizarEstado, borrar, obtenerParaPdf } from "../services/ddjj.js";
import { construirDdjjPdf } from "../services/ddjjPdf.js";

export const rutasDdjj = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasDdjj.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, { estado: req.query.estado }))));
rutasDdjj.get("/pending", manejar(async (req, res) => res.json(await pendientes(req.usuario.id))));
rutasDdjj.get("/:id", manejar(async (req, res) => res.json(await obtener(req.usuario.id, req.params.id))));
rutasDdjj.post("/", manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body || {}))));
rutasDdjj.put("/:id", manejar(async (req, res) => res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}))));
rutasDdjj.patch("/:id/status", manejar(async (req, res) => res.json(await actualizarEstado(req.usuario.id, req.params.id, req.body?.estado))));
rutasDdjj.delete("/:id", manejar(async (req, res) => {
  await borrar(req.usuario.id, req.params.id);
  res.status(204).end();
}));

rutasDdjj.get("/:id/pdf", manejar(async (req, res) => {
  const datos = await obtenerParaPdf(req.usuario.id, req.params.id);
  const buffer = await construirDdjjPdf(datos);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="ddjj-${datos.ddjj.numero}.pdf"`,
    "Content-Length": buffer.length,
  });
  res.send(buffer);
}));
