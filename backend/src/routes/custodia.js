import { Router } from "express";
import { listar, obtener, recibir, devolver, entregar, verificarPublico, generarPdf } from "../services/custodia.js";

export const rutasCustodia = Router();

const manejar = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

rutasCustodia.get("/", manejar(async (req, res) => {
  res.json(await listar(req.usuario.id, { clienteId: req.query.clienteId, estado: req.query.estado }));
}));

rutasCustodia.get("/:id", manejar(async (req, res) => {
  res.json(await obtener(req.usuario.id, req.params.id));
}));

rutasCustodia.post("/", manejar(async (req, res) => {
  res.status(201).json(await recibir(req.usuario.id, req.body || {}));
}));

rutasCustodia.post("/deliver", manejar(async (req, res) => {
  res.status(201).json(await entregar(req.usuario.id, req.body || {}));
}));

rutasCustodia.post("/:id/return", manejar(async (req, res) => {
  res.json(await devolver(req.usuario.id, req.params.id, req.body || {}));
}));

rutasCustodia.get("/:id/pdf/reception", manejar(async (req, res) => {
  const buffer = await generarPdf(req.usuario.id, req.params.id, "recepcion");
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="recepcion-${req.params.id}.pdf"`, "Content-Length": buffer.length });
  res.send(buffer);
}));

rutasCustodia.get("/:id/pdf/return", manejar(async (req, res) => {
  const buffer = await generarPdf(req.usuario.id, req.params.id, "devolucion");
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="devolucion-${req.params.id}.pdf"`, "Content-Length": buffer.length });
  res.send(buffer);
}));

rutasCustodia.get("/:id/pdf/delivery", manejar(async (req, res) => {
  const buffer = await generarPdf(req.usuario.id, req.params.id, "entrega");
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="entrega-${req.params.id}.pdf"`, "Content-Length": buffer.length });
  res.send(buffer);
}));

/** Verificación pública — sin autenticación. Se registra en app.js fuera del middleware auth. */
export const rutaVerificacion = Router();
rutaVerificacion.get("/:code", manejar(async (req, res) => {
  const datos = await verificarPublico(req.params.code);
  if (!datos) return res.status(404).json({ error: { codigo: "NO_ENCONTRADO", mensaje: "Código de verificación inválido." } });
  res.json(datos);
}));
