/**
 * Comprobantes: internos (recibo, nota de honorarios; no fiscales) y facturas
 * electronicas con CAE cuando la cuenta activo ARCA. El receptor se guarda como
 * foto cifrada (contexto "comprobante") para que el comprobante sobreviva al
 * borrado del cliente.
 */
import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";
import { credencialesArca } from "./configuracionFiscal.js";
import { emitirComprobante as emitirEnArca, COND_IVA_RECEPTOR, IVA_ITEM, calcularImportes, urlQr, docReceptor, CBTE_TIPO } from "./arca.js";
import { cargoDesdeComprobante, quitarCargoDeComprobante, cargoDesdePresupuesto } from "./movimientos.js";
import { logger } from "../utils/logger.js";
import { hoyLocal, esFechaValida, texto } from "../utils/fechas.js";

export const TIPOS = new Set(["recibo", "nota_honorarios", "factura_a", "factura_b", "factura_c"]);
const ELECTRONICOS = new Set(["factura_a", "factura_b", "factura_c"]);
const MONEDAS = new Set(["ARS", "USD"]);

// Emision serializada por cuenta: evita que dos pedidos simultaneos calculen el mismo "ultimo + 1".
const colas = new Map();
function enSerie(usuarioId, fn) {
  const previa = colas.get(usuarioId) || Promise.resolve();
  const propia = previa.catch(() => {}).then(fn);
  colas.set(usuarioId, propia);
  propia.finally(() => colas.get(usuarioId) === propia && colas.delete(usuarioId)).catch(() => {});
  return propia;
}
export const NOMBRE_TIPO = { recibo: "Recibo", nota_honorarios: "Nota de honorarios", factura_a: "Factura A", factura_b: "Factura B", factura_c: "Factura C" };

function receptorDesde(blob) {
  if (!blob) return { receptor: null, legible: true };
  const t = descifrar(blob, "comprobante");
  if (t === null) return { receptor: null, legible: false };
  try {
    return { receptor: JSON.parse(t), legible: true };
  } catch {
    return { receptor: null, legible: false };
  }
}

function filaAVista(r) {
  const { receptor, legible } = receptorDesde(r.receptor_cifrado);
  let arcaRes = null;
  if (r.arca_resultado) {
    try {
      arcaRes = typeof r.arca_resultado === "string" ? JSON.parse(r.arca_resultado) : r.arca_resultado;
    } catch {
      arcaRes = null;
    }
  }
  return {
    id: r.id,
    tipo: r.tipo,
    tipoNombre: NOMBRE_TIPO[r.tipo],
    esFiscal: ELECTRONICOS.has(r.tipo),
    puntoVenta: r.punto_venta,
    numero: r.numero,
    numeroCompleto: `${String(r.punto_venta).padStart(5, "0")}-${String(r.numero).padStart(8, "0")}`,
    arcaEntorno: r.arca_entorno || "apagado",
    esPrueba: r.arca_entorno === "homologacion",
    fecha: r.fecha,
    clienteId: r.cliente_id,
    expedienteId: r.expediente_id,
    expedienteCaratula: r.expediente_caratula ?? null,
    presupuestoId: r.presupuesto_id,
    receptor,
    receptorLegible: legible,
    receptorNombre: receptor?.nombre ?? r.cliente_nombre ?? null,
    items: typeof r.items === "string" ? JSON.parse(r.items) : r.items,
    total: Number(r.total),
    moneda: r.moneda,
    estado: r.estado,
    motivoAnulacion: r.motivo_anulacion,
    cae: r.cae,
    caeVencimiento: r.cae_vencimiento,
    arcaResultado: arcaRes,
    importes: arcaRes?.importes || null,
    urlQr: r.cae && arcaRes?.cbteTipo ? urlQr({ fecha: r.fecha, cuit: arcaRes.cuitEmisor, puntoVenta: r.punto_venta, cbteTipo: arcaRes.cbteTipo, numero: r.numero, total: r.total, moneda: r.moneda, cotizacion: arcaRes.cotizacion, docTipo: arcaRes.docTipo, docNro: arcaRes.docNro, cae: r.cae }) : null,
    creadoEn: r.creado_en,
  };
}

const SELECT = `SELECT c.*, cl.nombre AS cliente_nombre, e.caratula AS expediente_caratula
                  FROM comprobantes c
                  LEFT JOIN clientes cl ON cl.id = c.cliente_id
                  LEFT JOIN expedientes e ON e.id = c.expediente_id`;

/**
 * Items { concepto, monto, iva }. `monto` es el importe del item sin IVA. `iva` solo cuenta cuando el
 * emisor discrimina IVA (Factura A/B): gravado_21 (defecto), gravado_10_5, gravado_27, exento, no_gravado.
 */
function normalizarItems(items, discriminaIva) {
  if (!Array.isArray(items) || !items.length) throw new AppError("DATOS_INVALIDOS", "El comprobante necesita al menos un item.", 400);
  const limpios = items.map((it) => ({ concepto: texto(it?.concepto, 200), monto: Number(it?.monto), iva: discriminaIva ? it?.iva || "gravado_21" : "no_aplica" }));
  for (const it of limpios) {
    if (!it.concepto) throw new AppError("DATOS_INVALIDOS", "Cada item necesita un concepto.", 400);
    if (!Number.isFinite(it.monto) || it.monto < 0) throw new AppError("DATOS_INVALIDOS", `Monto invalido en "${it.concepto}".`, 400);
    if (discriminaIva && !Object.hasOwn(IVA_ITEM, it.iva)) throw new AppError("DATOS_INVALIDOS", `iva invalido en "${it.concepto}": ${Object.keys(IVA_ITEM).join(", ")}.`, 400);
    it.monto = Math.round(it.monto * 100) / 100; // centavos exactos
  }
  return limpios;
}

async function obtenerCon(db, usuarioId, id) {
  const [[r]] = await db.query(`${SELECT} WHERE c.id = ? AND c.usuario_id = ?`, [id, usuarioId]);
  if (!r) throw new AppError("NO_ENCONTRADO", "El comprobante no existe.", 404);
  return filaAVista(r);
}

async function fotoReceptor(usuarioId, clienteId, condicionIvaReceptor) {
  if (!clienteId) return null;
  const [[c]] = await pool.query("SELECT nombre, tipo, datos_cifrado FROM clientes WHERE id = ? AND usuario_id = ?", [clienteId, usuarioId]);
  if (!c) throw new AppError("CLIENTE_INVALIDO", "El cliente no existe o no pertenece a esta cuenta.", 400);
  let datos = {};
  const t = c.datos_cifrado ? descifrar(c.datos_cifrado, "cliente") : null;
  if (t) {
    try {
      datos = JSON.parse(t);
    } catch {
      datos = {};
    }
  }
  if (condicionIvaReceptor && !Object.hasOwn(COND_IVA_RECEPTOR, condicionIvaReceptor)) throw new AppError("DATOS_INVALIDOS", `condicionIvaReceptor debe ser: ${Object.keys(COND_IVA_RECEPTOR).join(", ")}.`, 400);
  // Sin condicion explicita no se adivina por el CUIT (monotributistas y exentos tambien lo tienen): consumidor final.
  return { nombre: c.nombre, tipo: c.tipo, documento: datos.documento || null, cuit: datos.cuit || null, domicilio: datos.domicilio || null, condicionIva: condicionIvaReceptor || "consumidor_final" };
}

export async function listar(usuarioId, { clienteId, expedienteId, desde, hasta } = {}) {
  const [rows] = await pool.query(
    `${SELECT} WHERE c.usuario_id = :usuarioId AND (:clienteId IS NULL OR c.cliente_id = :clienteId) AND (:expedienteId IS NULL OR c.expediente_id = :expedienteId)
        AND (:desde IS NULL OR c.fecha >= :desde) AND (:hasta IS NULL OR c.fecha <= :hasta)
      ORDER BY c.fecha DESC, c.id DESC LIMIT 1000`,
    { usuarioId, clienteId: clienteId || null, expedienteId: expedienteId || null, desde: desde || null, hasta: hasta || null },
  );
  return rows.map(filaAVista);
}

export async function obtener(usuarioId, id) {
  const [[r]] = await pool.query(`${SELECT} WHERE c.id = ? AND c.usuario_id = ?`, [id, usuarioId]);
  if (!r) throw new AppError("NO_ENCONTRADO", "El comprobante no existe.", 404);
  return filaAVista(r);
}

export function emitir(usuarioId, datos) {
  return enSerie(usuarioId, () => emitirInterno(usuarioId, datos));
}

async function emitirInterno(usuarioId, datos) {
  if (!TIPOS.has(datos.tipo)) throw new AppError("DATOS_INVALIDOS", `tipo debe ser: ${[...TIPOS].join(", ")}.`, 400);
  if (datos.moneda && !MONEDAS.has(datos.moneda)) throw new AppError("DATOS_INVALIDOS", "moneda debe ser ARS o USD.", 400);
  if (datos.fecha && !esFechaValida(String(datos.fecha))) throw new AppError("DATOS_INVALIDOS", "fecha invalida (AAAA-MM-DD).", 400);
  if (ELECTRONICOS.has(datos.tipo) && datos.tipo !== "factura_c" && !datos.condicionIvaReceptor) throw new AppError("DATOS_INVALIDOS", "Las facturas A y B necesitan la condicion frente al IVA del receptor.", 400);
  let presupuesto = null;
  if (datos.presupuestoId) {
    const [[p]] = await pool.query("SELECT * FROM presupuestos WHERE id = ? AND usuario_id = ?", [datos.presupuestoId, usuarioId]);
    if (!p) throw new AppError("PRESUPUESTO_INVALIDO", "El presupuesto no existe o no pertenece a esta cuenta.", 400);
    presupuesto = p;
  }
  const clienteId = datos.clienteId || presupuesto?.cliente_id || null;
  const expedienteId = datos.expedienteId || presupuesto?.expediente_id || null;
  if (expedienteId) {
    const [[e]] = await pool.query("SELECT id FROM expedientes WHERE id = ? AND usuario_id = ?", [expedienteId, usuarioId]);
    if (!e) throw new AppError("EXPEDIENTE_INVALIDO", "El expediente no existe o no pertenece a esta cuenta.", 400);
  }
  const [[cfg]] = await pool.query("SELECT punto_venta, arca_entorno, condicion_iva, cuit FROM configuracion_fiscal WHERE usuario_id = ?", [usuarioId]);
  const esElectronico = ELECTRONICOS.has(datos.tipo);
  const discriminaIva = esElectronico && datos.tipo !== "factura_c" && cfg?.condicion_iva === "responsable_inscripto";
  if (esElectronico && datos.tipo !== "factura_c" && cfg?.condicion_iva !== "responsable_inscripto") throw new AppError("DATOS_INVALIDOS", "Solo un emisor responsable inscripto emite Facturas A o B; con monotributo o exento corresponde Factura C.", 400);
  if (datos.tipo === "factura_c" && cfg?.condicion_iva === "responsable_inscripto") throw new AppError("DATOS_INVALIDOS", "Un emisor responsable inscripto emite Factura A o B, no C.", 400);
  const items = normalizarItems(datos.items?.length ? datos.items : presupuesto ? (typeof presupuesto.items === "string" ? JSON.parse(presupuesto.items) : presupuesto.items) : [], discriminaIva);
  const importes = calcularImportes(items, discriminaIva);
  const total = importes.total;
  const moneda = datos.moneda || presupuesto?.moneda || "ARS";
  const fecha = datos.fecha || hoyLocal();
  const receptor = await fotoReceptor(usuarioId, clienteId, datos.condicionIvaReceptor);
  const puntoVenta = cfg?.punto_venta ?? 1;
  const entorno = ELECTRONICOS.has(datos.tipo) ? cfg?.arca_entorno || "apagado" : "apagado";

  let numero = null;
  let cae = null;
  let caeVencimiento = null;
  let arcaResultado = null;
  if (ELECTRONICOS.has(datos.tipo)) {
    if (!cfg || cfg.arca_entorno === "apagado") throw new AppError("ARCA_APAGADO", "Para emitir facturas electronicas active ARCA en Configuracion (datos fiscales).", 400);
    if (!receptor) throw new AppError("DATOS_INVALIDOS", "Una factura electronica necesita un cliente receptor.", 400);
    const cred = await credencialesArca(usuarioId);
    const [[ul]] = await pool.query("SELECT COALESCE(MAX(numero), 0) AS n FROM comprobantes WHERE usuario_id = ? AND tipo = ? AND punto_venta = ? AND arca_entorno = ?", [usuarioId, datos.tipo, puntoVenta, entorno]);
    const r = await emitirEnArca({ cred, tipo: datos.tipo, fecha, receptor, importes, moneda, cotizacion: datos.cotizacion, ultimoLocal: Number(ul.n) });
    numero = r.numero;
    cae = r.cae;
    caeVencimiento = r.caeVencimiento;
    arcaResultado = { observaciones: r.observaciones, cbteTipo: r.cbteTipo, cuitEmisor: cred.cuit, cotizacion: r.cotizacion, docTipo: r.docTipo, docNro: r.docNro, importes, fechaProceso: r.resultado?.FeCabResp?.FchProceso };
  } else if (discriminaIva) {
    arcaResultado = { importes };
  }

  const base = {
    usuarioId,
    tipo: datos.tipo,
    puntoVenta,
    entorno,
    fecha,
    clienteId,
    expedienteId,
    presupuestoId: presupuesto?.id ?? null,
    receptorCifrado: receptor ? cifrar(JSON.stringify(receptor), "comprobante") : null,
    items: JSON.stringify(items),
    total: total.toFixed(2),
    moneda,
    cae,
    caeVencimiento,
    arcaResultado: arcaResultado ? JSON.stringify(arcaResultado) : null,
  };
  for (let intento = 0; intento < 3; intento++) {
    const n = numero ?? (await pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM comprobantes WHERE usuario_id = ? AND tipo = ? AND punto_venta = ? AND arca_entorno = ?", [usuarioId, datos.tipo, puntoVenta, entorno]))[0][0].n;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO comprobantes (usuario_id, tipo, punto_venta, arca_entorno, numero, fecha, cliente_id, expediente_id, presupuesto_id, receptor_cifrado, items, total, moneda, cae, cae_vencimiento, arca_resultado)
         VALUES (:usuarioId, :tipo, :puntoVenta, :entorno, :numero, :fecha, :clienteId, :expedienteId, :presupuestoId, :receptorCifrado, :items, :total, :moneda, :cae, :caeVencimiento, :arcaResultado)`,
        { ...base, numero: Number(n) },
      );
      const c = await obtenerCon(conn, usuarioId, r.insertId);
      await cargoDesdeComprobante(usuarioId, { ...c, descripcion: `${NOMBRE_TIPO[c.tipo]} ${c.numeroCompleto}` }, conn);
      await conn.commit();
      conn.release();
      return c;
    } catch (e) {
      await conn.rollback().catch(() => {});
      conn.release();
      if (cae) {
        // ARCA ya otorgo el CAE y la base no lo guardo: queda registrado para reconciliar a mano (sin datos del receptor).
        logger.error("comprobante_huerfano_arca", { usuarioId, tipo: datos.tipo, puntoVenta, entorno, numero, cae, caeVencimiento, total: base.total, moneda, error: e.code || e.message });
        throw new AppError("CAE_SIN_GUARDAR", `ARCA otorgo el CAE ${cae} para el comprobante ${String(puntoVenta).padStart(5, "0")}-${String(numero).padStart(8, "0")} pero no se pudo guardar en la base. No vuelva a emitir: registre ese numero manualmente o contacte soporte.`, 500);
      }
      if (e.code !== "ER_DUP_ENTRY" || intento === 2) throw e;
    }
  }
}

export async function anular(usuarioId, id, motivo) {
  const c = await obtener(usuarioId, id);
  if (c.estado === "anulado") return c;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE comprobantes SET estado = 'anulado', motivo_anulacion = ? WHERE id = ? AND usuario_id = ?", [texto(motivo, 300) || null, id, usuarioId]);
    await quitarCargoDeComprobante(usuarioId, id, conn);
    // Si el comprobante reemplazaba el cargo de un presupuesto que sigue aceptado, ese cargo vuelve a la cuenta corriente.
    if (c.presupuestoId) {
      const [[p]] = await conn.query("SELECT id, numero, cliente_id AS clienteId, expediente_id AS expedienteId, fecha, total, moneda, estado FROM presupuestos WHERE id = ? AND usuario_id = ?", [c.presupuestoId, usuarioId]);
      if (p?.estado === "aceptado") await cargoDesdePresupuesto(usuarioId, p, conn);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  const out = await obtener(usuarioId, id);
  if (out.esFiscal && out.cae) out.advertencia = "La anulacion fiscal de una factura con CAE requiere emitir una nota de credito en ARCA; aqui solo se marca como anulada y se quita el cargo de la cuenta corriente.";
  return out;
}

export async function obtenerParaPdf(usuarioId, id) {
  const comprobante = await obtener(usuarioId, id);
  const [[emisor]] = await pool.query("SELECT u.nombre, u.email, f.cuit, f.razon_social, f.domicilio_fiscal, f.condicion_iva, f.inicio_actividades FROM usuarios u LEFT JOIN configuracion_fiscal f ON f.usuario_id = u.id WHERE u.id = ?", [usuarioId]);
  return { comprobante, emisor: emisor || {} };
}

export function csv(filas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["fecha", "tipo", "numero", "receptor", "cuit_o_documento", "expediente", "moneda", "total", "estado", "cae", "cae_vencimiento", "entorno_arca"];
  const lineas = filas.map((c) => [c.fecha, c.tipoNombre, c.numeroCompleto, c.receptorNombre, c.receptor?.cuit || c.receptor?.documento || "", c.expedienteCaratula, c.moneda, c.total.toFixed(2).replace(".", ","), c.estado, c.cae, c.caeVencimiento, c.esFiscal ? c.arcaEntorno : ""].map(esc).join(";"));
  return "﻿" + [cab.join(";"), ...lineas].join("\r\n");
}
