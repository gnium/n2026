/**
 * Integraciones con Google. El callback de OAuth es publico (lo abre el
 * navegador al volver de Google) y se autentica con el `state` firmado; el
 * resto de las rutas exigen sesion. La configuracion del proyecto de Google
 * Cloud (client_id/secret) la edita solo la titular.
 */
import { Router } from "express";
import {
  estado,
  urlAutorizacion,
  verificarEstado,
  conectar,
  desconectar,
  guardarPreferencias,
  configuracionOAuth,
  guardarConfiguracionOAuth,
  subirADrive,
  subeADrive,
} from "../services/google.js";
import { obtenerParaPdf as presupuestoParaPdf } from "../services/presupuestos.js";
import { construirPresupuestoPdf } from "../services/presupuestoPdf.js";
import { obtenerParaPdf as comprobanteParaPdf } from "../services/comprobantes.js";
import { construirComprobantePdf } from "../services/comprobantePdf.js";
import { obtenerParaPdf as certificacionParaPdf } from "../services/certificaciones.js";
import { construirCertificacionPdf } from "../services/certificacionPdf.js";
import { obtenerParaPdf as ddjjParaPdf } from "../services/ddjj.js";
import { construirDdjjPdf } from "../services/ddjjPdf.js";
import { generarPdf as custodiaPdf } from "../services/custodia.js";
import { requerirAdmin, leerCookies } from "../middleware/auth.js";
import { contexto, alcanza } from "../services/equipo.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errores.js";
import { logger } from "../utils/logger.js";
import { pool } from "../config/db.js";

export const rutasGoogle = Router();
export const rutasGoogleCallback = Router();

const manejar = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

// Cookie de correlacion: ata el `state` al navegador que inicio el flujo y lo hace de un solo uso.
const COOKIE_OAUTH = "doyfe_google_oauth";
const opcionesCookieOauth = { httpOnly: true, sameSite: "lax", secure: env.auth.cookieSegura, path: "/" };

/** Vuelta de Google: la cuenta sale del `state` firmado, validado contra la cookie de correlacion. */
rutasGoogleCallback.get("/", async (req, res) => {
  const volver = (resultado) => {
    res.clearCookie(COOKIE_OAUTH, opcionesCookieOauth);
    return res.redirect(`${env.appUrl}/?google=${resultado}`);
  };
  try {
    if (req.query.error) return volver("cancelado");
    const st = verificarEstado(req.query.state);
    const nonce = leerCookies(req)[COOKIE_OAUTH];
    if (!st || !nonce || nonce !== st.nonce) return volver("estado_invalido");
    await conectar(st.usuarioId, String(req.query.code || ""));
    return volver("conectado");
  } catch (e) {
    logger.warn("Fallo la conexion con Google", { codigo: e.codigo || e.code });
    return volver("error");
  }
});

rutasGoogle.get("/status", manejar(async (req, res) => res.json(await estado(req.usuario.id))));
rutasGoogle.get(
  "/authorize",
  manejar(async (req, res) => {
    const { url, nonce } = await urlAutorizacion(req.usuario.id);
    res.cookie(COOKIE_OAUTH, nonce, { ...opcionesCookieOauth, maxAge: 10 * 60 * 1000 });
    res.json({ url });
  }),
);
rutasGoogle.post("/disconnect", manejar(async (req, res) => res.json(await desconectar(req.usuario.id))));
rutasGoogle.put("/preferences", manejar(async (req, res) => res.json(await guardarPreferencias(req.usuario.id, req.body || {}))));

// Credenciales del proyecto de Google Cloud: comunes a la instalacion.
rutasGoogle.get("/config", requerirAdmin, manejar(async (_req, res) => res.json(await configuracionOAuth())));
rutasGoogle.put("/config", requerirAdmin, manejar(async (req, res) => res.json(await guardarConfiguracionOAuth(req.body || {}))));

const TABLA_DRIVE = { presupuesto: "presupuestos", comprobante: "comprobantes", certificacion: "certificaciones", ddjj: "ddjj" };

/** Arma el PDF del documento y devuelve nombre, tipo y contenido. */
async function documento(usuarioId, tipo, id) {
  if (tipo === "presupuesto") {
    const datos = await presupuestoParaPdf(usuarioId, id);
    return {
      nombre: `presupuesto-${datos.presupuesto.numero}.pdf`,
      tipo: "application/pdf",
      contenido: await construirPresupuestoPdf(datos),
    };
  }
  if (tipo === "comprobante") {
    const ctx = await contexto(usuarioId);
    if (!alcanza(ctx.rol, "escribano")) throw new AppError("PROHIBIDO", "Los comprobantes están reservados a la escribana o el escribano.", 403);
    const datos = await comprobanteParaPdf(usuarioId, id);
    return {
      nombre: `${datos.comprobante.tipo}-${datos.comprobante.numeroCompleto}.pdf`,
      tipo: "application/pdf",
      contenido: await construirComprobantePdf(datos),
    };
  }
  if (tipo === "certificacion") {
    const datos = await certificacionParaPdf(usuarioId, id);
    return {
      nombre: `certificacion-${datos.cert.anio}-${datos.cert.numero}.pdf`,
      tipo: "application/pdf",
      contenido: construirCertificacionPdf(datos),
    };
  }
  if (tipo === "ddjj") {
    const datos = await ddjjParaPdf(usuarioId, id);
    return {
      nombre: `ddjj-${datos.ddjj.numero}.pdf`,
      tipo: "application/pdf",
      contenido: construirDdjjPdf(datos),
    };
  }
  if (tipo === "custodia") {
    const subtipo = String(id).includes(":") ? String(id).split(":")[1] : "recepcion";
    const realId = String(id).includes(":") ? String(id).split(":")[0] : id;
    const contenido = await custodiaPdf(usuarioId, realId, subtipo);
    return {
      nombre: `custodia-${subtipo}-${realId}.pdf`,
      tipo: "application/pdf",
      contenido,
    };
  }
  throw new AppError("DATOS_INVALIDOS", "tipo debe ser presupuesto, comprobante, certificacion, ddjj o custodia.", 400);
}

/** POST /drive {tipo, id} - sube el PDF a la carpeta de la escribanía en Drive. */
rutasGoogle.post(
  "/drive",
  manejar(async (req, res) => {
    const { tipo, id } = req.body || {};
    if (!(await subeADrive(req.usuario.id))) {
      throw new AppError("DRIVE_APAGADO", 'Active "Copiar documentos a Drive" en Integraciones antes de subir documentos.', 400);
    }
    const doc = await documento(req.usuario.id, tipo, id);
    const r = await subirADrive(req.usuario.id, { nombre: doc.nombre, tipo: doc.tipo, contenido: doc.contenido });
    const tabla = TABLA_DRIVE[tipo];
    if (tabla) {
      const realId = tipo === "custodia" && String(id).includes(":") ? String(id).split(":")[0] : id;
      await pool.query(`UPDATE ${tabla} SET drive_archivo_id = ?, drive_enlace = ? WHERE id = ? AND usuario_id = ?`, [r.id, r.enlace, realId, req.usuario.id]);
    }
    res.json(r);
  }),
);
