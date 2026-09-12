import PDFDocument from "pdfkit";

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
export function construirComprobantePdf({ comprobante: c, emisor }) {
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

    // Items
    const colMonto = izq + ancho - 120;
    const yCab = doc.y;
    doc.rect(izq, yCab - 4, ancho, 20).fillColor("#f3f4f1").fill();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("CONCEPTO", izq + 8, yCab).text("IMPORTE", colMonto, yCab, { width: 112, align: "right" });
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(11).fillColor(TINTA);
    for (const it of c.items) {
      const y = doc.y;
      doc.text(it.concepto, izq + 8, y, { width: colMonto - izq - 20 });
      const yFin = doc.y;
      doc.text(moneda(it.monto, c.moneda), colMonto, y, { width: 112, align: "right" });
      doc.y = Math.max(yFin, doc.y) + 6;
      doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(TINTA).text("Total", izq + 8, doc.y, { continued: true }).text(moneda(c.total, c.moneda), { align: "right" });
    doc.moveDown(1.2);

    if (c.esFiscal && c.cae) {
      doc.font("Helvetica").fontSize(10).fillColor(TINTA).text(`CAE: ${c.cae}   ·   Vencimiento CAE: ${c.caeVencimiento ? String(c.caeVencimiento).slice(0, 10).split("-").reverse().join("/") : "—"}`, izq);
      doc.moveDown(0.8);
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
