import { Router } from "express";
import { listarPrecios, guardarPrecio, borrarPrecio } from "../services/precios.js";
import { auditoria } from "../services/auditoria.js";
import { AppError } from "../utils/errores.js";

export const rutasPrecios = Router();

rutasPrecios.get("/", async (_req, res, next) => {
  try {
    res.json(await listarPrecios());
  } catch (e) {
    next(e);
  }
});

/** PUT /api/configuracion/precios  { proveedor, modelo, entrada, salida, cache?, aproximado? } -> upsert. */
rutasPrecios.put("/", async (req, res, next) => {
  try {
    const { proveedor, modelo, entrada, salida, cache, aproximado } = req.body || {};
    await guardarPrecio({ proveedor, modelo, entrada: Number(entrada), salida: Number(salida), cache: cache === "" || cache === null || cache === undefined ? null : Number(cache), aproximado: Boolean(aproximado) });
    await auditoria.evento("config.precio_actualizado", null, { motivo: `${proveedor}/${modelo}` });
    res.json(await listarPrecios());
  } catch (e) {
    next(e);
  }
});

rutasPrecios.delete("/:proveedor/:modelo", async (req, res, next) => {
  try {
    if (!["anthropic", "gemini", "local", "mock"].includes(req.params.proveedor)) throw new AppError("PROVEEDOR_INVALIDO", "Proveedor invalido.", 400);
    await borrarPrecio(req.params.proveedor, decodeURIComponent(req.params.modelo));
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
