import multer from "multer";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "El archivo supera el tamano maximo permitido." : err.message;
    return res.status(413).json({ error: { codigo: "ARCHIVO_INVALIDO", mensaje: msg } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message, detalle: err.detalle } });
  }
  logger.error("Error no controlado", { codigo: err.code || err.name });
  return res.status(500).json({ error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrio un error inesperado." } });
}
