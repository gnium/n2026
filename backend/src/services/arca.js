/**
 * Adaptador ARCA (ex AFIP): autenticacion WSAA (ticket firmado CMS) y factura
 * electronica WSFEv1 (FEDummy, FECompUltimoAutorizado, FECAESolicitar).
 * Solo se usa cuando la cuenta configuro entorno homologacion/produccion y
 * cargo su certificado; el resto del sistema funciona sin el.
 */
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../utils/errores.js";

const URLS = {
  homologacion: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  produccion: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
};
const TIMEOUT_MS = 20000;

/** Codigos ARCA. Tipos de comprobante: Factura A=1, B=6, C=11. Documentos: CUIT=80, DNI=96, consumidor final=99. */
export const CBTE_TIPO = { factura_a: 1, factura_b: 6, factura_c: 11 };
export const DOC_TIPO = { cuit: 80, dni: 96, consumidor_final: 99 };
/** Condicion IVA del receptor (RG 5616): RI=1, exento=4, consumidor final=5, monotributo=6. */
export const COND_IVA_RECEPTOR = { responsable_inscripto: 1, exento: 4, consumidor_final: 5, monotributo: 6 };
const MONEDA = { ARS: "PES", USD: "DOL" };

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

function fechaIsoLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const s = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

/** Ticket de requerimiento de acceso: valido desde 10 minutos antes hasta 10 minutos despues. */
export function construirTra({ service = "wsfe", ahora = new Date() } = {}) {
  const gen = new Date(ahora.getTime() - 10 * 60 * 1000);
  const exp = new Date(ahora.getTime() + 10 * 60 * 1000);
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${fechaIsoLocal(gen)}</generationTime><expirationTime>${fechaIsoLocal(exp)}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
}

/** Firma CMS (PKCS#7, SHA-256) del TRA con el certificado y la clave de la cuenta. Devuelve base64 DER. */
export function firmarCms(tra, certPem, clavePem) {
  let cert, clave;
  try {
    cert = forge.pki.certificateFromPem(certPem);
    clave = forge.pki.privateKeyFromPem(clavePem);
  } catch {
    throw new AppError("CREDENCIALES_INVALIDAS", "No se pudieron leer el certificado o la clave privada (formato PEM).", 400);
  }
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: clave,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

async function soap(url, action, body) {
  const controlador = new AbortController();
  const t = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action },
      body,
      signal: controlador.signal,
    });
    const texto = await r.text();
    if (!r.ok && !texto.includes("<soap")) throw new AppError("ARCA_HTTP", `ARCA respondio HTTP ${r.status}.`, 502);
    return texto;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("ARCA_CONEXION", `No se pudo conectar con ARCA: ${e.name === "AbortError" ? "tiempo de espera agotado (20 s)" : "error de red"}. Si acaba de emitir, verifique en ARCA antes de reintentar.`, 502);
  } finally {
    clearTimeout(t);
  }
}

function faultDe(xml) {
  const j = parser.parse(xml);
  const fault = j?.Envelope?.Body?.Fault;
  if (fault) return fault.faultstring || fault.Reason?.Text || JSON.stringify(fault);
  return null;
}

export function parsearRespuestaWsaa(xml) {
  const falla = faultDe(xml);
  if (falla) throw new AppError("WSAA", `WSAA: ${falla}`, 502);
  const j = parser.parse(xml);
  const interno = j?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;
  if (!interno) throw new AppError("WSAA", "WSAA: respuesta sin ticket de acceso.", 502);
  const ta = parser.parse(interno);
  const token = ta?.loginTicketResponse?.credentials?.token;
  const sign = ta?.loginTicketResponse?.credentials?.sign;
  const expiration = ta?.loginTicketResponse?.header?.expirationTime;
  if (!token || !sign) throw new AppError("WSAA", "WSAA: ticket de acceso incompleto.", 502);
  return { token, sign, expiration: expiration ? new Date(expiration) : new Date(Date.now() + 11 * 3600 * 1000) };
}

/** Fecha de vencimiento del certificado, o null si no se puede leer. No lanza: sirve para avisar antes de que venza. */
export function vencimientoCertificado(certPem) {
  try {
    return forge.pki.certificateFromPem(certPem).validity?.notAfter || null;
  } catch {
    return null;
  }
}

/** Huella SHA-256 del certificado (DER) para indexar el ticket: cada cuenta/certificado tiene su propio TA. */
export function huellaCertificado(certPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return forge.md.sha256.create().update(der).digest().toHex();
}

/**
 * Verifica que el certificado y la clave sean parseables, que la clave corresponda al
 * certificado y que el CUIT del subject (serialNumber "CUIT 20xxxxxxxxx") coincida.
 */
export function validarCredenciales({ certPem, clavePem, cuit }) {
  let cert;
  let clave;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new AppError("DATOS_INVALIDOS", "El certificado no se pudo leer: verifique que sea el .crt emitido por ARCA en formato PEM.", 400);
  }
  try {
    clave = forge.pki.privateKeyFromPem(clavePem);
  } catch {
    throw new AppError("DATOS_INVALIDOS", "La clave privada no se pudo leer (PEM sin contrasena, RSA).", 400);
  }
  if (!cert.publicKey?.n || !clave.n || !cert.publicKey.n.equals(clave.n)) throw new AppError("DATOS_INVALIDOS", "La clave privada no corresponde a ese certificado.", 400);
  const serial = cert.subject.getField({ name: "serialNumber" })?.value || cert.subject.getField({ type: "2.5.4.5" })?.value || "";
  const cuitCert = String(serial).replace(/\D/g, "");
  if (cuit && cuitCert && cuitCert !== String(cuit).replace(/\D/g, "")) throw new AppError("DATOS_INVALIDOS", `El certificado pertenece al CUIT ${cuitCert}, no al CUIT cargado.`, 400);
  if (cert.validity?.notAfter && cert.validity.notAfter.getTime() < Date.now()) throw new AppError("DATOS_INVALIDOS", "El certificado esta vencido.", 400);
  return { cuitCert, vence: cert.validity?.notAfter || null };
}

const tickets = new Map(); // `${usuarioId}:${huella}:${entorno}` -> { token, sign, expiration }
const loginsEnCurso = new Map();
const vigente = (ta) => ta && ta.expiration instanceof Date && ta.expiration.getTime() - Date.now() > 10 * 60 * 1000;

/**
 * Ticket de acceso WSAA. Cache en memoria por cuenta + huella del certificado + entorno;
 * `taGuardado`/`persistirTa` permiten reusar un TA previo tras un reinicio (WSAA rechaza
 * un nuevo login mientras el anterior sigue vigente). Los logins concurrentes se deduplican.
 */
export async function loginWsaa({ usuarioId, cuit, certPem, clavePem, entorno, taGuardado = null, persistirTa = null }) {
  const urls = URLS[entorno];
  if (!urls) throw new AppError("ARCA_ENTORNO", "Entorno ARCA invalido.", 400);
  const clave = `${usuarioId ?? cuit}:${huellaCertificado(certPem)}:${entorno}`;
  const cache = tickets.get(clave);
  if (vigente(cache)) return cache;
  if (taGuardado?.token && taGuardado.sign) {
    const previo = { token: taGuardado.token, sign: taGuardado.sign, expiration: new Date(taGuardado.expiration) };
    if (vigente(previo)) {
      tickets.set(clave, previo);
      return previo;
    }
  }
  if (loginsEnCurso.has(clave)) return loginsEnCurso.get(clave);
  const login = (async () => {
    const cms = firmarCms(construirTra({ service: "wsfe" }), certPem, clavePem);
    const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
    const xml = await soap(urls.wsaa, "", envelope);
    const ta = parsearRespuestaWsaa(xml);
    tickets.set(clave, ta);
    if (persistirTa) await persistirTa(ta).catch(() => {});
    return ta;
  })();
  loginsEnCurso.set(clave, login);
  try {
    return await login;
  } finally {
    loginsEnCurso.delete(clave);
  }
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function envolverWsfe(metodo, cuerpo) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soapenv:Header/><soapenv:Body><ar:${metodo}>${cuerpo}</ar:${metodo}></soapenv:Body></soapenv:Envelope>`;
}
const auth = (ta, cuit) => `<ar:Auth><ar:Token>${ta.token}</ar:Token><ar:Sign>${ta.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;

function erroresDe(resultado) {
  const errs = resultado?.Errors?.Err;
  if (!errs) return [];
  return (Array.isArray(errs) ? errs : [errs]).map((e) => `${e.Code}: ${e.Msg}`);
}

export async function dummy(entorno) {
  const urls = URLS[entorno];
  if (!urls) throw new AppError("ARCA_ENTORNO", "Entorno ARCA invalido.", 400);
  const xml = await soap(urls.wsfe, "http://ar.gov.afip.dif.FEV1/FEDummy", envolverWsfe("FEDummy", ""));
  const falla = faultDe(xml);
  if (falla) throw new AppError("WSFE", `WSFE: ${falla}`, 502);
  const r = parser.parse(xml)?.Envelope?.Body?.FEDummyResponse?.FEDummyResult || {};
  return { appServer: r.AppServer, dbServer: r.DbServer, authServer: r.AuthServer };
}

export async function ultimoAutorizado({ ta, cuit, entorno, puntoVenta, cbteTipo }) {
  const xml = await soap(URLS[entorno].wsfe, "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado", envolverWsfe("FECompUltimoAutorizado", `${auth(ta, cuit)}<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`));
  const falla = faultDe(xml);
  if (falla) throw new AppError("WSFE", `WSFE: ${falla}`, 502);
  const r = parser.parse(xml)?.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;
  const errores = erroresDe(r);
  if (errores.length) throw new AppError("WSFE", `WSFE: ${errores.join(" | ")}`, 502);
  return Number(r?.CbteNro || 0);
}

const fechaArca = (f) => String(f).slice(0, 10).replace(/-/g, "");

/**
 * Solicita el CAE de un comprobante (concepto 2 = servicios). Importes: en Factura C
 * (monotributo/exento) todo es neto sin IVA; en A/B se discrimina IVA 21%.
 */
/** Tratamiento de IVA por item. `id` es el codigo de alicuota de WSFEv1 (FEParamGetTiposIva). */
export const IVA_ITEM = {
  gravado_21: { id: 5, tasa: 0.21, nombre: "IVA 21%" },
  gravado_10_5: { id: 4, tasa: 0.105, nombre: "IVA 10,5%" },
  gravado_27: { id: 6, tasa: 0.27, nombre: "IVA 27%" },
  exento: { id: null, tasa: 0, nombre: "Exento" },
  no_gravado: { id: null, tasa: 0, nombre: "No gravado" },
};
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Totales fiscales a partir de items { monto (neto), iva }. Para un emisor que no discrimina
 * IVA (monotributo/exento → Factura C) todo va como neto sin alicuotas.
 */
export function calcularImportes(items, discriminaIva) {
  const out = { neto: 0, noGravado: 0, exento: 0, iva: 0, total: 0, alicuotas: {} };
  for (const it of items) {
    const monto = r2(it.monto);
    const trat = discriminaIva ? IVA_ITEM[it.iva] || IVA_ITEM.gravado_21 : null;
    if (!trat) {
      out.neto = r2(out.neto + monto);
    } else if (it.iva === "no_gravado") {
      out.noGravado = r2(out.noGravado + monto);
    } else if (it.iva === "exento") {
      out.exento = r2(out.exento + monto);
    } else {
      const imp = r2(monto * trat.tasa);
      out.neto = r2(out.neto + monto);
      out.iva = r2(out.iva + imp);
      const a = (out.alicuotas[trat.id] ||= { id: trat.id, base: 0, importe: 0 });
      a.base = r2(a.base + monto);
      a.importe = r2(a.importe + imp);
    }
  }
  out.total = r2(out.neto + out.noGravado + out.exento + out.iva);
  return out;
}

export function docReceptor(receptor) {
  const docTipo = receptor?.cuit ? DOC_TIPO.cuit : receptor?.documento ? DOC_TIPO.dni : DOC_TIPO.consumidor_final;
  const docNro = receptor?.cuit ? String(receptor.cuit).replace(/\D/g, "") : receptor?.documento ? String(receptor.documento).replace(/\D/g, "") : "0";
  return { docTipo, docNro };
}

/** Cotizacion oficial del dia habil anterior (FEParamGetCotizacion). */
export async function cotizacionArca({ ta, cuit, entorno, moneda }) {
  const monId = MONEDA[moneda];
  if (!monId || monId === "PES") return 1;
  const xml = await soap(URLS[entorno].wsfe, "http://ar.gov.afip.dif.FEV1/FEParamGetCotizacion", envolverWsfe("FEParamGetCotizacion", `${auth(ta, cuit)}<ar:MonId>${monId}</ar:MonId>`));
  const falla = faultDe(xml);
  if (falla) throw new AppError("WSFE", `WSFE: ${falla}`, 502);
  const r = parser.parse(xml)?.Envelope?.Body?.FEParamGetCotizacionResponse?.FEParamGetCotizacionResult;
  const errores = erroresDe(r);
  if (errores.length) throw new AppError("WSFE", `WSFE: ${errores.join(" | ")}`, 502);
  const c = Number(r?.ResultGet?.MonCotiz);
  if (!(c > 0)) throw new AppError("WSFE", "ARCA no devolvio la cotizacion de la moneda.", 502);
  return c;
}

/**
 * Solicita el CAE de un comprobante (concepto 2 = servicios). `importes` viene de calcularImportes:
 * en Factura C todo es neto sin IVA; en A/B se informan neto gravado, no gravado, exento y alicuotas.
 */
export async function solicitarCae({ ta, cuit, entorno, puntoVenta, tipo, numero, fecha, receptor, importes, moneda, cotizacion }) {
  const cbteTipo = CBTE_TIPO[tipo];
  if (!cbteTipo) throw new AppError("DATOS_INVALIDOS", "Tipo de comprobante no electronico.", 400);
  const { docTipo, docNro } = docReceptor(receptor);
  if (receptor.condicionIva && !Object.hasOwn(COND_IVA_RECEPTOR, receptor.condicionIva)) throw new AppError("DATOS_INVALIDOS", `condicionIva del receptor invalida: ${Object.keys(COND_IVA_RECEPTOR).join(", ")}.`, 400);
  const condReceptor = Object.hasOwn(COND_IVA_RECEPTOR, receptor.condicionIva) ? COND_IVA_RECEPTOR[receptor.condicionIva] : COND_IVA_RECEPTOR.consumidor_final;
  if (moneda === "USD" && !(Number(cotizacion) > 0)) throw new AppError("DATOS_INVALIDOS", "Para facturar en dolares hace falta la cotizacion.", 400);
  const f = fechaArca(fecha);
  // CanMisMonExt (RG 5616, WSFEv1 v4): en moneda extranjera se declara si se cancela en esa moneda ("N": se cobra en pesos).
  const monExt = moneda === "USD" ? "<ar:CanMisMonExt>N</ar:CanMisMonExt>" : "";
  const alic = Object.values(importes.alicuotas || {});
  const ivaXml = alic.length ? `<ar:Iva>${alic.map((a) => `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${a.base.toFixed(2)}</ar:BaseImp><ar:Importe>${a.importe.toFixed(2)}</ar:Importe></ar:AlicIva>`).join("")}</ar:Iva>` : "";
  const det = `<ar:FECAEDetRequest><ar:Concepto>2</ar:Concepto><ar:DocTipo>${docTipo}</ar:DocTipo><ar:DocNro>${docNro}</ar:DocNro>
    <ar:CbteDesde>${numero}</ar:CbteDesde><ar:CbteHasta>${numero}</ar:CbteHasta><ar:CbteFch>${f}</ar:CbteFch>
    <ar:ImpTotal>${importes.total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>${importes.noGravado.toFixed(2)}</ar:ImpTotConc><ar:ImpNeto>${importes.neto.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>${importes.exento.toFixed(2)}</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${importes.iva.toFixed(2)}</ar:ImpIVA>
    <ar:FchServDesde>${f}</ar:FchServDesde><ar:FchServHasta>${f}</ar:FchServHasta><ar:FchVtoPago>${f}</ar:FchVtoPago>
    <ar:MonId>${MONEDA[moneda] || "PES"}</ar:MonId><ar:MonCotiz>${moneda === "USD" ? Number(cotizacion).toFixed(4) : "1"}</ar:MonCotiz>${monExt}
    <ar:CondicionIVAReceptorId>${condReceptor}</ar:CondicionIVAReceptorId>
    ${ivaXml}
  </ar:FECAEDetRequest>`;
  const cuerpo = `${auth(ta, cuit)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>${det}</ar:FeDetReq></ar:FeCAEReq>`;
  const xml = await soap(URLS[entorno].wsfe, "http://ar.gov.afip.dif.FEV1/FECAESolicitar", envolverWsfe("FECAESolicitar", cuerpo));
  const falla = faultDe(xml);
  if (falla) throw new AppError("WSFE", `WSFE: ${falla}`, 502);
  const r = parser.parse(xml)?.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;
  const errores = erroresDe(r);
  const detResp = r?.FeDetResp?.FECAEDetResponse;
  const obs = detResp?.Observaciones?.Obs;
  const observaciones = obs ? (Array.isArray(obs) ? obs : [obs]).map((o) => `${o.Code}: ${o.Msg}`) : [];
  if (errores.length || r?.FeCabResp?.Resultado !== "A" || !detResp?.CAE) {
    throw new AppError("ARCA_RECHAZO", `ARCA rechazo el comprobante: ${[...errores, ...observaciones].join(" | ") || "sin detalle"}`, 502);
  }
  const v = String(detResp.CAEFchVto || "");
  return { cae: String(detResp.CAE), caeVencimiento: v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null, observaciones, resultado: r };
}

/**
 * Flujo completo: login → ultimo autorizado → CAE. Devuelve el numero definitivo que asigno ARCA.
 * `ultimoLocal`: ultimo numero guardado en la base para (tipo, punto de venta, entorno). Si ARCA
 * tiene mas comprobantes que la base, hay uno emitido que no se registro (por ejemplo, un timeout
 * despues de que ARCA otorgo el CAE): se aborta para no facturar dos veces.
 */
export async function emitirComprobante({ cred, tipo, fecha, receptor, importes, moneda, cotizacion, ultimoLocal = null }) {
  const ta = await loginWsaa(cred);
  const cbteTipo = CBTE_TIPO[tipo];
  const ultimo = await ultimoAutorizado({ ta, cuit: cred.cuit, entorno: cred.entorno, puntoVenta: cred.puntoVenta, cbteTipo });
  if (ultimoLocal != null && ultimo > ultimoLocal) {
    throw new AppError("ARCA_DESINCRONIZADO", `ARCA ya tiene ${ultimo} comprobante(s) de este tipo en el punto de venta ${cred.puntoVenta} y la app registra ${ultimoLocal}: hay una emision sin guardar (numero ${ultimo}). Consultela en ARCA y registrela antes de emitir otra.`, 409);
  }
  const numero = ultimo + 1;
  // Sin cotizacion explicita se usa la oficial de ARCA (dia habil anterior), que es la que WSFE valida.
  const cotiz = moneda === "USD" ? (Number(cotizacion) > 0 ? Number(cotizacion) : await cotizacionArca({ ta, cuit: cred.cuit, entorno: cred.entorno, moneda })) : 1;
  const cae = await solicitarCae({ ta, cuit: cred.cuit, entorno: cred.entorno, puntoVenta: cred.puntoVenta, tipo, numero, fecha, receptor, importes, moneda, cotizacion: cotiz });
  return { numero, cotizacion: cotiz, cbteTipo, ...docReceptor(receptor), ...cae };
}

/**
 * URL del codigo QR obligatorio en comprobantes electronicos (RG 4892/2020):
 * JSON del comprobante en base64 detras de https://www.afip.gob.ar/fe/qr/.
 */
export function urlQr({ fecha, cuit, puntoVenta, cbteTipo, numero, total, moneda, cotizacion, docTipo, docNro, cae }) {
  const datos = {
    ver: 1,
    fecha: String(fecha).slice(0, 10),
    cuit: Number(String(cuit).replace(/\D/g, "")),
    ptoVta: Number(puntoVenta),
    tipoCmp: Number(cbteTipo),
    nroCmp: Number(numero),
    importe: Number(Number(total).toFixed(2)),
    moneda: MONEDA[moneda] || "PES",
    ctz: Number(Number(cotizacion || 1).toFixed(4)),
    tipoDocRec: Number(docTipo),
    nroDocRec: Number(docNro || 0),
    tipoCodAut: "E",
    codAut: Number(cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos), "utf8").toString("base64")}`;
}

export async function probarConexion(cred) {
  const estado = await dummy(cred.entorno);
  const ta = await loginWsaa(cred);
  return { ok: true, mensaje: `ARCA ${cred.entorno}: servicios ${estado.appServer}/${estado.dbServer}/${estado.authServer}; ticket valido hasta ${ta.expiration.toISOString()}.` };
}
