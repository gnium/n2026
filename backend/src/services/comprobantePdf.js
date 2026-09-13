import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { IVA_ITEM } from "./arca.js";

const TINTA = "#1b1f24";
const GRIS = "#566069";
const LINEA = "#dadcd6";
const ACENTO = "#24466b";
const ROJO = "#a1261f";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const COND_IVA = { monotributo: "Responsable Monotributo", responsable_inscripto: "IVA Responsable Inscripto", exento: "IVA Exento", consumidor_final: "Consumidor Final" };

const moneda = (n, codigo) => new Intl.NumberFormat("es-AR", { style: "currency", currency: codigo, minimumFractionDigits: 2 }).format(Number(n));
function fecha(d) {
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia} de ${MESES[Number(m) - 1]} de ${a}`;
}
const cuitFmt = (c) => (c ? String(c).replace(/\D/g, "").replace(/^(\d{2})(\d{8})(\d)$/, "$1-$2-$3") : null);

/** PDF A4 de un comprobante interno o electronico. Devuelve un Buffer. */
export async function construirComprobantePdf({ comprobante: c, emisor }) {
  const qrPng = c.urlQr ? await QRCode.toBuffer(c.urlQr, { errorCorrectionLevel: "M", margin: 1, width: 220 }) : null;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `${c.tipoNombre} ${c.numeroCompleto}`, Author: emisor.razon_social || emisor.nombre || "Doy Fe", Creator: "Doy Fe" } });
    const chunks = [];
    doc.on("data", (x) => chunks.push(x));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const izq = doc.page.margins.left;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    if (c.estado === "anulado") {
      doc.save().rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] }).font("Helvetica-Bold").fontSize(72).fillColor("#f2c9c6").opacity(0.6).text("ANULADO", 0, doc.page.height / 2 - 40, { width: doc.page.width, align: "center" }).restore();
    }

    // Emisor
    doc.font("Helvetica-Bold").fontSize(16).fillColor(TINTA).text(emisor.razon_social || emisor.nombre || "Escribanía", izq, 56);
    const lineaEmisor = [emisor.domicilio_fiscal, emisor.cuit && `CUIT ${cuitFmt(emisor.cuit)}`, emisor.condicion_iva && COND_IVA[emisor.condicion_iva], emisor.inicio_actividades && `Inicio de actividades: ${String(emisor.inicio_actividades).slice(0, 10).split("-").reverse().join("/")}`].filter(Boolean).join("  ·  ");
    if (lineaEmisor) doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(lineaEmisor, { width: ancho });
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(ACENTO).text(`${c.tipoNombre} N° ${c.numeroCompleto}`);
    doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(`Fecha: ${fecha(c.fecha)}   ·   Moneda: ${c.moneda}${c.expedienteCaratula ? `   ·   Expediente: ${c.expedienteCaratula}` : ""}`, { width: ancho });
    if (!c.esFiscal) doc.font("Helvetica-Bold").fontSize(9).fillColor(ROJO).text("DOCUMENTO NO VÁLIDO COMO FACTURA · comprobante interno");
    if (c.esPrueba) doc.font("Helvetica-Bold").fontSize(9).fillColor(ROJO).text("HOMOLOGACIÓN ARCA · comprobante de prueba, sin valor fiscal");
    doc.moveDown(0.8);
    doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(1).stroke();
    doc.moveDown(0.8);

    // Receptor
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GRIS).text(c.tipo === "recibo" ? "RECIBIMOS DE" : "CLIENTE");
    doc.moveDown(0.2);
    if (c.receptor) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(TINTA).text(c.receptor.nombre);
      const l2 = [c.receptor.cuit ? `CUIT ${cuitFmt(c.receptor.cuit)}` : c.receptor.documento ? `DNI ${c.receptor.documento}` : null, c.receptor.domicilio, COND_IVA[c.receptor.condicionIva]].filter(Boolean).join("  ·  ");
      if (l2) doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(l2, { width: ancho });
    } else {
      doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(c.receptorLegible ? "Consumidor final" : "(receptor no legible)");
    }
    doc.moveDown(1.2);

    // Items (con columna de IVA cuando el emisor discrimina: Factura A/B)
    const discrimina = Boolean(c.importes && c.items.some((it) => it.iva && it.iva !== "no_aplica"));
    const colMonto = izq + ancho - 120;
    const colIva = colMonto - 90;
    const yCab = doc.y;
    doc.rect(izq, yCab - 4, ancho, 20).fillColor("#f3f4f1").fill();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("CONCEPTO", izq + 8, yCab);
    if (discrimina) doc.text("IVA", colIva, yCab, { width: 80, align: "right" });
    doc.text(discrimina ? "NETO" : "IMPORTE", colMonto, yCab, { width: 112, align: "right" });
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(11).fillColor(TINTA);
    for (const it of c.items) {
      const y = doc.y;
      doc.text(it.concepto, izq + 8, y, { width: (discrimina ? colIva : colMonto) - izq - 20 });
      const yFin = doc.y;
      if (discrimina) doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(IVA_ITEM[it.iva]?.nombre || "—", colIva, y + 2, { width: 80, align: "right" }).font("Helvetica").fontSize(11).fillColor(TINTA);
      doc.text(moneda(it.monto, c.moneda), colMonto, y, { width: 112, align: "right" });
      doc.y = Math.max(yFin, doc.y) + 6;
      doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }
    doc.moveDown(0.4);
    if (discrimina) {
      const fila = (etq, val) => { doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(etq, izq + 8, doc.y, { continued: true }).fillColor(TINTA).text(moneda(val, c.moneda), { align: "right" }); doc.moveDown(0.15); };
      if (c.importes.neto) fila("Subtotal neto gravado", c.importes.neto);
      if (c.importes.noGravado) fila("No gravado", c.importes.noGravado);
      if (c.importes.exento) fila("Exento", c.importes.exento);
      for (const a of Object.values(c.importes.alicuotas || {})) fila(`${Object.values(IVA_ITEM).find((x) => x.id === a.id)?.nombre || "IVA"} sobre ${moneda(a.base, c.moneda)}`, a.importe);
      doc.moveDown(0.3);
    }
    doc.font("Helvetica-Bold").fontSize(13).fillColor(TINTA).text("Total", izq + 8, doc.y, { continued: true }).text(moneda(c.total, c.moneda), { align: "right" });
    doc.moveDown(1.2);

    if (c.esFiscal && c.cae) {
      const yCae = doc.y;
      if (qrPng) doc.image(qrPng, izq, yCae, { width: 96 });
      const xTexto = qrPng ? izq + 108 : izq;
      doc.font("Helvetica").fontSize(10).fillColor(TINTA).text(`CAE: ${c.cae}`, xTexto, yCae + 4, { width: ancho - (xTexto - izq) });
      doc.text(`Vencimiento CAE: ${c.caeVencimiento ? String(c.caeVencimiento).slice(0, 10).split("-").reverse().join("/") : "—"}`, xTexto);
      if (c.arcaResultado?.cotizacion && c.moneda !== "ARS") doc.text(`Cotización ${c.moneda}: ${Number(c.arcaResultado.cotizacion).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, xTexto);
      if (qrPng) doc.font("Helvetica").fontSize(8).fillColor(GRIS).text("Código QR según RG 4892/2020 (ARCA): verificá este comprobante escaneándolo.", xTexto, doc.y + 4, { width: ancho - (xTexto - izq) });
      doc.y = Math.max(doc.y, yCae + (qrPng ? 100 : 0)) + 8;
    }
    if (c.estado === "anulado") {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ROJO).text(`ANULADO${c.motivoAnulacion ? ` · ${c.motivoAnulacion}` : ""}`, izq);
      doc.moveDown(0.8);
    }
    doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(
      c.tipo === "recibo" ? "Recibí conforme la suma indicada. Este recibo no reemplaza a la factura correspondiente." : c.esFiscal ? "Comprobante autorizado por ARCA. Conservar por el plazo legal." : "Nota de honorarios: detalle de los trabajos profesionales realizados. No válida como factura.",
      izq,
      doc.y,
      { width: ancho },
    );
    doc.end();
  });
}
