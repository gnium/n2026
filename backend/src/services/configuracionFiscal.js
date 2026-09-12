/**
 * Datos del emisor y credenciales ARCA por cuenta. Certificado y clave privada
 * se guardan cifrados (contexto "fiscal") y nunca se devuelven al navegador.
 */
import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";
import { probarConexion, validarCredenciales } from "./arca.js";
import { texto } from "../utils/fechas.js";

const CONDICIONES = new Set(["monotributo", "responsable_inscripto", "exento"]);
const ENTORNOS = new Set(["apagado", "homologacion", "produccion"]);

export function normalizarCuit(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length !== 11) throw new AppError("DATOS_INVALIDOS", "El CUIT debe tener 11 digitos.", 400);
  return d;
}

function vista(r) {
  return {
    cuit: r?.cuit || "",
    razonSocial: r?.razon_social || "",
    domicilioFiscal: r?.domicilio_fiscal || "",
    condicionIva: r?.condicion_iva || "monotributo",
    inicioActividades: r?.inicio_actividades || null,
    puntoVenta: r?.punto_venta ?? 1,
    arcaEntorno: r?.arca_entorno || "apagado",
    tieneCredenciales: Boolean(r?.arca_cert_cifrado && r?.arca_clave_cifrado),
    arcaCargadoEn: r?.arca_cargado_en || null,
  };
}

export async function obtener(usuarioId) {
  const [[r]] = await pool.query("SELECT * FROM configuracion_fiscal WHERE usuario_id = ?", [usuarioId]);
  return vista(r);
}

export async function guardar(usuarioId, datos) {
  if (datos.condicionIva && !CONDICIONES.has(datos.condicionIva)) throw new AppError("DATOS_INVALIDOS", "condicionIva invalida.", 400);
  if (datos.arcaEntorno && !ENTORNOS.has(datos.arcaEntorno)) throw new AppError("DATOS_INVALIDOS", "arcaEntorno invalido.", 400);
  const cuit = normalizarCuit(datos.cuit);
  const puntoVenta = datos.puntoVenta === undefined ? 1 : Number(datos.puntoVenta);
  if (!(Number.isInteger(puntoVenta) && puntoVenta >= 1 && puntoVenta <= 99999)) throw new AppError("DATOS_INVALIDOS", "puntoVenta debe ser un entero entre 1 y 99999.", 400);
  const tieneNuevasCredenciales = Boolean(datos.certificadoPem && datos.clavePem);
  if ((datos.certificadoPem && !datos.clavePem) || (!datos.certificadoPem && datos.clavePem)) throw new AppError("DATOS_INVALIDOS", "Cargue el certificado y la clave privada juntos.", 400);
  if (tieneNuevasCredenciales && !/-----BEGIN CERTIFICATE-----/.test(datos.certificadoPem)) throw new AppError("DATOS_INVALIDOS", "El certificado no esta en formato PEM.", 400);
  if (tieneNuevasCredenciales && !/-----BEGIN (RSA |EC |ENCRYPTED |)PRIVATE KEY-----/.test(datos.clavePem)) throw new AppError("DATOS_INVALIDOS", "La clave privada no esta en formato PEM.", 400);
  if (tieneNuevasCredenciales) validarCredenciales({ certPem: datos.certificadoPem, clavePem: datos.clavePem, cuit });
  if (datos.inicioActividades && !/^\d{4}-\d{2}-\d{2}$/.test(String(datos.inicioActividades))) throw new AppError("DATOS_INVALIDOS", "inicioActividades invalido (AAAA-MM-DD).", 400);
  const [[actual]] = await pool.query("SELECT arca_cert_cifrado, arca_clave_cifrado, cuit FROM configuracion_fiscal WHERE usuario_id = ?", [usuarioId]);
  const entorno = datos.arcaEntorno || "apagado";
  if (entorno !== "apagado" && !tieneNuevasCredenciales && !actual?.arca_cert_cifrado) throw new AppError("SIN_CREDENCIALES", "Para activar ARCA cargue primero el certificado y la clave privada.", 400);
  if (entorno !== "apagado" && !cuit) throw new AppError("DATOS_INVALIDOS", "Para activar ARCA cargue el CUIT del emisor.", 400);
  if (!tieneNuevasCredenciales && actual?.arca_cert_cifrado && cuit && actual.cuit && cuit !== actual.cuit) {
    const certPem = descifrar(actual.arca_cert_cifrado, "fiscal");
    if (certPem) validarCredenciales({ certPem, clavePem: descifrar(actual.arca_clave_cifrado, "fiscal") || "", cuit });
  }
  // Un certificado nuevo invalida el ticket de acceso guardado.
  await pool.query(
    `INSERT INTO configuracion_fiscal (usuario_id, cuit, razon_social, domicilio_fiscal, condicion_iva, inicio_actividades, punto_venta, arca_entorno, arca_cert_cifrado, arca_clave_cifrado, arca_cargado_en, arca_ta_cifrado)
     VALUES (:usuarioId, :cuit, :razonSocial, :domicilio, :condicionIva, :inicio, :puntoVenta, :entorno, :cert, :clave, :cargadoEn, NULL)
     ON DUPLICATE KEY UPDATE cuit = VALUES(cuit), razon_social = VALUES(razon_social), domicilio_fiscal = VALUES(domicilio_fiscal), condicion_iva = VALUES(condicion_iva),
       inicio_actividades = VALUES(inicio_actividades), punto_venta = VALUES(punto_venta), arca_entorno = VALUES(arca_entorno),
       arca_cert_cifrado = COALESCE(VALUES(arca_cert_cifrado), arca_cert_cifrado), arca_clave_cifrado = COALESCE(VALUES(arca_clave_cifrado), arca_clave_cifrado),
       arca_cargado_en = COALESCE(VALUES(arca_cargado_en), arca_cargado_en),
       arca_ta_cifrado = IF(VALUES(arca_cert_cifrado) IS NULL, arca_ta_cifrado, NULL)`,
    {
      usuarioId,
      cuit,
      razonSocial: texto(datos.razonSocial, 200) || null,
      domicilio: texto(datos.domicilioFiscal, 300) || null,
      condicionIva: datos.condicionIva || "monotributo",
      inicio: datos.inicioActividades || null,
      puntoVenta,
      entorno,
      cert: tieneNuevasCredenciales ? cifrar(datos.certificadoPem, "fiscal") : null,
      clave: tieneNuevasCredenciales ? cifrar(datos.clavePem, "fiscal") : null,
      cargadoEn: tieneNuevasCredenciales ? new Date() : null,
    },
  );
  return obtener(usuarioId);
}

export async function borrarCredenciales(usuarioId) {
  await pool.query("UPDATE configuracion_fiscal SET arca_cert_cifrado = NULL, arca_clave_cifrado = NULL, arca_cargado_en = NULL, arca_ta_cifrado = NULL, arca_entorno = 'apagado' WHERE usuario_id = ?", [usuarioId]);
  return obtener(usuarioId);
}

/** Credenciales descifradas para el adaptador ARCA (uso interno; nunca salen por la API). */
export async function credencialesArca(usuarioId) {
  const [[r]] = await pool.query("SELECT * FROM configuracion_fiscal WHERE usuario_id = ?", [usuarioId]);
  if (!r) throw new AppError("SIN_CONFIGURACION_FISCAL", "Cargue los datos fiscales en Configuracion.", 400);
  if (r.arca_entorno === "apagado") throw new AppError("ARCA_APAGADO", "ARCA esta apagado en la configuracion fiscal.", 400);
  const certPem = r.arca_cert_cifrado ? descifrar(r.arca_cert_cifrado, "fiscal") : null;
  const clavePem = r.arca_clave_cifrado ? descifrar(r.arca_clave_cifrado, "fiscal") : null;
  if (!certPem || !clavePem) throw new AppError("CREDENCIALES_ILEGIBLES", "No se pudieron leer las credenciales ARCA (¿cambio JWT_SECRET?). Vuelva a cargarlas.", 410);
  let taGuardado = null;
  if (r.arca_ta_cifrado) {
    try {
      const t = descifrar(r.arca_ta_cifrado, "fiscal");
      const ta = t ? JSON.parse(t) : null;
      if (ta?.entorno === r.arca_entorno) taGuardado = ta;
    } catch {
      taGuardado = null;
    }
  }
  const persistirTa = (ta) => pool.query("UPDATE configuracion_fiscal SET arca_ta_cifrado = ? WHERE usuario_id = ?", [cifrar(JSON.stringify({ token: ta.token, sign: ta.sign, expiration: ta.expiration, entorno: r.arca_entorno }), "fiscal"), usuarioId]);
  return { usuarioId, cuit: r.cuit, certPem, clavePem, entorno: r.arca_entorno, puntoVenta: r.punto_venta, condicionIva: r.condicion_iva, razonSocial: r.razon_social, domicilioFiscal: r.domicilio_fiscal, taGuardado, persistirTa };
}

export async function probarArca(usuarioId) {
  const [[r]] = await pool.query("SELECT arca_entorno FROM configuracion_fiscal WHERE usuario_id = ?", [usuarioId]);
  if (!r || r.arca_entorno === "apagado") return { ok: false, mensaje: "ARCA esta apagado: elija homologacion o produccion y cargue las credenciales." };
  const cred = await credencialesArca(usuarioId);
  return probarConexion(cred);
}
