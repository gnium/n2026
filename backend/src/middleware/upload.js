import multer from "multer";
import { env } from "../config/env.js";
import { esExtensionValida } from "../services/documentParser.js";
import { AppError } from "../utils/errores.js";

/** memoryStorage: el archivo NUNCA se escribe en disco. */
export const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileBytes, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (!esExtensionValida(file.originalname)) return cb(new AppError("FORMATO_NO_SOPORTADO", "Solo se aceptan archivos .doc o .docx", 415));
    cb(null, true);
  },
});
