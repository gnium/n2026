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
  enviarPorGmail,
  subirADrive,
  subeADrive,
} from "../services/google.js";
import { obtenerParaPdf as presupuestoParaPdf } from "../services/presupuestos.js";
import { construirPresupuestoPdf } from "../services/presupuestoPdf.js";
import { obtenerParaPdf as comprobanteParaPdf } from "../services/comprobantes.js";
import { construirComprobantePdf } from "../services/comprobantePdf.js";
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

rutasGoogle.get("/estado", manejar(async (req, res) => res.json(await estado(req.usuario.id))));
rutasGoogle.get(
  "/autorizar",
  manejar(async (req, res) => {
    const { url, nonce } = await urlAutorizacion(req.usuario.id);
    res.cookie(COOKIE_OAUTH, nonce, { ...opcionesCookieOauth, maxAge: 10 * 60 * 1000 });
    res.json({ url });
  }),
);
rutasGoogle.post("/desconectar", manejar(async (req, res) => res.json(await desconectar(req.usuario.id))));
rutasGoogle.put("/preferencias", manejar(async (req, res) => res.json(await guardarPreferencias(req.usuario.id, req.body || {}))));

// Credenciales del proyecto de Google Cloud: comunes a la instalacion.
rutasGoogle.get("/configuracion", requerirAdmin, manejar(async (_req, res) => res.json(await configuracionOAuth())));
rutasGoogle.put("/configuracion", requerirAdmin, manejar(async (req, res) => res.json(await guardarConfiguracionOAuth(req.body || {}))));

/** Arma el PDF del presupuesto o del comprobante y devuelve nombre, tipo y contenido. */
async function documento(usuarioId, tipo, id) {
  if (tipo === "presupuesto") {
    const datos = await presupuestoParaPdf(usuarioId, id);
    return {
      nombre: `presupuesto-${datos.presupuesto.numero}.pdf`,
      tipo: "application/pdf",
      contenido: await construirPresupuestoPdf(datos),
      asunto: `Presupuesto N° ${datos.presupuesto.numero}`,
      correoCliente: datos.cliente?.email || null,
    };
  }
  if (tipo === "comprobante") {
    // Mismo criterio que /api/comprobantes: el rol empleado no accede a comprobantes,
    // ni siquiera por esta puerta (el PDF trae receptor, CUIT, importes y CAE).
    const ctx = await contexto(usuarioId);
    if (!alcanza(ctx.rol, "escribano")) throw new AppError("PROHIBIDO", "Los comprobantes están reservados a la escribana o el escribano.", 403);
    const datos = await comprobanteParaPdf(usuarioId, id);
    return {
      nombre: `${datos.comprobante.tipo}-${datos.comprobante.numeroCompleto}.pdf`,
      tipo: "application/pdf",
      contenido: await construirComprobantePdf(datos),
      asunto: `${datos.comprobante.tipoNombre} ${datos.comprobante.numeroCompleto}`,
      correoCliente: null, // la foto del receptor no guarda correo
    };
  }
  throw new AppError("DATOS_INVALIDOS", "tipo debe ser presupuesto o comprobante.", 400);
}

/** POST /enviar {tipo, id, para?, mensaje?} - manda el PDF por Gmail desde la cuenta del escribano. */
rutasGoogle.post(
  "/enviar",
  manejar(async (req, res) => {
    const { tipo, id, para, mensaje } = req.body || {};
    const doc = await documento(req.usuario.id, tipo, id);
    const destino = String(para || doc.correoCliente || "").trim();
    if (!destino) throw new AppError("DATOS_INVALIDOS", "Indique el correo del destinatario.", 400);
    const r = await enviarPorGmail(req.usuario.id, {
      para: destino,
      asunto: doc.asunto,
      texto: String(mensaje || `Adjunto ${doc.asunto.toLowerCase()}.\n\nSaludos cordiales.`).slice(0, 5000),
      adjunto: { nombre: doc.nombre, tipo: doc.tipo, contenido: doc.contenido },
      tipo,
      referenciaId: Number(id) || null,
    });
    res.json(r);
  }),
);

/** POST /drive {tipo, id} - sube el PDF a la carpeta de la escribania en Drive. */
rutasGoogle.post(
  "/drive",
  manejar(async (req, res) => {
    const { tipo, id } = req.body || {};
    if (!(await subeADrive(req.usuario.id, "comprobantes"))) {
      throw new AppError("DRIVE_APAGADO", 'Active "Copiar comprobantes y presupuestos a Drive" en Integraciones antes de subir documentos.', 400);
    }
    const doc = await documento(req.usuario.id, tipo, id);
    const r = await subirADrive(req.usuario.id, { nombre: doc.nombre, tipo: doc.tipo, contenido: doc.contenido });
    const tabla = tipo === "presupuesto" ? "presupuestos" : "comprobantes";
    await pool.query(`UPDATE ${tabla} SET drive_archivo_id = ?, drive_enlace = ? WHERE id = ? AND usuario_id = ?`, [r.id, r.enlace, id, req.usuario.id]);
    res.json(r);
  }),
);
