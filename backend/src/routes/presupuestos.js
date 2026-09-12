import { Router } from "express";
import { listar, obtener, crear, actualizar, actualizarEstado, borrar, obtenerParaPdf } from "../services/presupuestos.js";
import { construirPresupuestoPdf } from "../services/presupuestoPdf.js";

export const rutasPresupuestos = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasPresupuestos.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, { expedienteId: req.query.expedienteId, clienteId: req.query.clienteId }))));
rutasPresupuestos.get("/:id", manejar(async (req, res) => res.json(await obtener(req.usuario.id, req.params.id))));
rutasPresupuestos.post("/", manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body || {}))));
rutasPresupuestos.put("/:id", manejar(async (req, res) => res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}))));
rutasPresupuestos.patch("/:id/estado", manejar(async (req, res) => res.json(await actualizarEstado(req.usuario.id, req.params.id, req.body?.estado))));
rutasPresupuestos.delete("/:id", manejar(async (req, res) => {
  await borrar(req.usuario.id, req.params.id);
  res.status(204).end();
}));

rutasPresupuestos.get("/:id/pdf", manejar(async (req, res) => {
  const datos = await obtenerParaPdf(req.usuario.id, req.params.id);
  const buffer = await construirPresupuestoPdf(datos);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="presupuesto-${datos.presupuesto.numero}.pdf"`,
    "Content-Length": buffer.length,
  });
  res.send(buffer);
}));
