import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { AppError } from "../utils/errores.js";

const EXT_PERMITIDAS = new Set([".doc", ".docx"]);

export function extensionDe(nombre = "") {
  const i = nombre.lastIndexOf(".");
  return i >= 0 ? nombre.slice(i).toLowerCase() : "";
}

export function esExtensionValida(nombre) {
  return EXT_PERMITIDAS.has(extensionDe(nombre));
}

/** Convierte el buffer del archivo en texto plano. El buffer nunca se escribe en disco. */
export async function extraerTexto(buffer, nombreOriginal) {
  const ext = extensionDe(nombreOriginal);
  let texto = "";
  try {
    if (ext === ".docx") {
      const r = await mammoth.extractRawText({ buffer });
      texto = r.value || "";
    } else if (ext === ".doc") {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      texto = [doc.getHeaders?.() || "", doc.getBody() || "", doc.getFootnotes?.() || ""].join("\n");
    } else {
      throw new AppError("FORMATO_NO_SOPORTADO", "Solo se aceptan archivos .doc o .docx", 415);
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("ARCHIVO_ILEGIBLE", "No se pudo leer el archivo. Verifique que no este danado ni protegido.", 422);
  }
  texto = texto.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (texto.length < 50) {
    throw new AppError("DOCUMENTO_VACIO", "El documento no contiene texto suficiente para procesar.", 422);
  }
  return texto;
}
