import { Router } from "express";
import { subida } from "../middleware/upload.js";
import { listar, crear, borrar } from "../services/bibliotecaModelos.js";

export const rutasBibliotecaModelos = Router();

rutasBibliotecaModelos.get("/", async (req, res, next) => {
  try {
    res.json(await listar(req.usuario.id));
  } catch (e) {
    next(e);
  }
});

rutasBibliotecaModelos.post("/", subida.single("archivo"), async (req, res, next) => {
  try {
    res.status(201).json(await crear(req.usuario.id, { nombre: req.body?.nombre, tipoActo: req.body?.tipoActo, archivo: req.file }));
  } catch (e) {
    next(e);
  }
});

rutasBibliotecaModelos.delete("/:id", async (req, res, next) => {
  try {
    await borrar(req.usuario.id, req.params.id);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
