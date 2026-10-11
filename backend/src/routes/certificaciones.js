import { Router } from "express";
import { listar, obtener, listarAniosDisponibles, proximoNumero, crear, actualizar, actualizarEstado, borrar, obtenerParaPdf } from "../services/certificaciones.js";
import { construirCertificacionPdf } from "../services/certificacionPdf.js";

export const rutasCertificaciones = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

rutasCertificaciones.get("/", manejar(async (req, res) => res.json(await listar(req.usuario.id, { estado: req.query.estado, anio: req.query.anio }))));
rutasCertificaciones.get("/years", manejar(async (req, res) => res.json(await listarAniosDisponibles(req.usuario.id))));
rutasCertificaciones.get("/suggested", manejar(async (req, res) => res.json(await proximoNumero(req.usuario.id, req.query.anio || new Date().getFullYear()))));
rutasCertificaciones.get("/:id", manejar(async (req, res) => res.json(await obtener(req.usuario.id, req.params.id))));
rutasCertificaciones.post("/", manejar(async (req, res) => res.status(201).json(await crear(req.usuario.id, req.body || {}))));
rutasCertificaciones.put("/:id", manejar(async (req, res) => res.json(await actualizar(req.usuario.id, req.params.id, req.body || {}))));
rutasCertificaciones.patch("/:id/status", manejar(async (req, res) => res.json(await actualizarEstado(req.usuario.id, req.params.id, req.body?.estado))));
rutasCertificaciones.delete("/:id", manejar(async (req, res) => {
  await borrar(req.usuario.id, req.params.id);
  res.status(204).end();
}));

rutasCertificaciones.get("/:id/pdf", manejar(async (req, res) => {
  const datos = await obtenerParaPdf(req.usuario.id, req.params.id);
  const buffer = await construirCertificacionPdf(datos);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="certificacion-${datos.cert.anio}-${datos.cert.numero}.pdf"`,
    "Content-Length": buffer.length,
  });
  res.send(buffer);
}));
