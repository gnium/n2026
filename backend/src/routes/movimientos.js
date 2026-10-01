import { Router } from "express";
import { listar, resumen, saldoCliente, registrarPago, crearCargoManual, borrar, csv } from "../services/movimientos.js";

export const rutasMovimientos = Router();
const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
const q = (v) => (typeof v === "string" && v ? v : null);
const filtros = (req) => ({ clienteId: q(req.query.clienteId), desde: q(req.query.desde), hasta: q(req.query.hasta) });

rutasMovimientos.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, filtros(req)))));
rutasMovimientos.get("/summary", manejar(async (req, res) => res.json(await resumen(req.usuario.id, filtros(req)))));
rutasMovimientos.get("/balance/:clienteId", manejar(async (req, res) => res.json(await saldoCliente(req.usuario.id, req.params.clienteId))));
rutasMovimientos.get("/csv", manejar(async (req, res) => {
  const texto = csv(await listar(req.usuario.id, filtros(req)));
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="transactions.csv"` });
  res.send(texto);
}));
rutasMovimientos.post("/payments", manejar(async (req, res) => res.status(201).json(await registrarPago(req.usuario.id, req.body || {}))));
rutasMovimientos.post("/charges", manejar(async (req, res) => res.status(201).json(await crearCargoManual(req.usuario.id, req.body || {}))));
rutasMovimientos.delete("/:id", manejar(async (req, res) => {
  await borrar(req.usuario.id, req.params.id);
  res.status(204).end();
}));
