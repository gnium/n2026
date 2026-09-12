import { Router } from "express";
import { listar, obtener, emitir, anular, obtenerParaPdf, csv } from "../services/comprobantes.js";
import { construirComprobantePdf } from "../services/comprobantePdf.js";

export const rutasComprobantes = Router();
const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
const q = (v) => (typeof v === "string" && v ? v : null);
const filtros = (req) => ({ clienteId: q(req.query.clienteId), expedienteId: q(req.query.expedienteId), desde: q(req.query.desde), hasta: q(req.query.hasta) });

rutasComprobantes.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, filtros(req)))));
rutasComprobantes.get("/csv", manejar(async (req, res) => {
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="comprobantes.csv"` });
  res.send(csv(await listar(req.usuario.id, filtros(req))));
}));
rutasComprobantes.get("/:id", manejar(async (req, res) => res.json(await obtener(req.usuario.id, req.params.id))));
rutasComprobantes.post("/", manejar(async (req, res) => res.status(201).json(await emitir(req.usuario.id, req.body || {}))));
rutasComprobantes.post("/:id/anular", manejar(async (req, res) => res.json(await anular(req.usuario.id, req.params.id, req.body?.motivo))));
rutasComprobantes.get("/:id/pdf", manejar(async (req, res) => {
  const datos = await obtenerParaPdf(req.usuario.id, req.params.id);
  const buffer = await construirComprobantePdf(datos);
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${datos.comprobante.tipo}-${datos.comprobante.numeroCompleto}.pdf"`, "Content-Length": buffer.length });
  res.send(buffer);
}));
