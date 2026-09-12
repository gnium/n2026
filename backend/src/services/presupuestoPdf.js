import PDFDocument from "pdfkit";

const TINTA = "#1b1f24";
const GRIS = "#566069";
const LINEA = "#dadcd6";
const ACENTO = "#24466b";

function moneda(n, codigo) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: codigo, minimumFractionDigits: 2 }).format(Number(n));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fecha(d) {
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia} de ${MESES[Number(m) - 1]} de ${a}`;
}

/** Genera el PDF A4 de un presupuesto. Devuelve un Buffer. */
export function construirPresupuestoPdf({ presupuesto: p, cliente, emisor }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Presupuesto N° ${p.numero}`, Author: emisor.nombre || "Doy Fe", Creator: "Doy Fe" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const izq = doc.page.margins.left;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Cabecera
    doc.font("Helvetica-Bold").fontSize(18).fillColor(TINTA).text(emisor.nombre || "Escribanía", izq, 56);
    if (emisor.email) doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(emisor.email);
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(ACENTO).text(`Presupuesto N° ${p.numero}`);
    doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(`Fecha: ${fecha(p.fecha)}   ·   Validez: ${p.validezDias} días   ·   Moneda: ${p.moneda}`);
    if (p.expedienteCaratula) doc.text(`Expediente: ${p.expedienteCaratula}`);
    doc.moveDown(0.8);
    doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(1).stroke();
    doc.moveDown(0.8);

    // Cliente
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GRIS).text("PRESUPUESTO PARA");
    doc.moveDown(0.2);
    if (cliente) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(TINTA).text(cliente.nombre);
      const linea2 = [cliente.tipo === "sociedad" ? (cliente.cuit ? `CUIT ${cliente.cuit}` : null) : cliente.documento ? `DNI ${cliente.documento}` : cliente.cuit ? `CUIT ${cliente.cuit}` : null, cliente.domicilio].filter(Boolean).join("  ·  ");
      if (linea2) doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(linea2);
    } else {
      doc.font("Helvetica").fontSize(11).fillColor(TINTA).text("—");
    }
    doc.moveDown(1.2);

    // Tabla de items
    const colMonto = izq + ancho - 120;
    const yCab = doc.y;
    doc.rect(izq, yCab - 4, ancho, 20).fillColor("#f3f4f1").fill();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("CONCEPTO", izq + 8, yCab).text("MONTO", colMonto, yCab, { width: 112, align: "right" });
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(11).fillColor(TINTA);
    for (const it of p.items) {
      const y = doc.y;
      doc.text(it.concepto, izq + 8, y, { width: colMonto - izq - 20 });
      const yFin = doc.y;
      doc.text(moneda(it.monto, p.moneda), colMonto, y, { width: 112, align: "right" });
      doc.y = Math.max(yFin, doc.y) + 6;
      doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(TINTA).text("Total", izq + 8, doc.y, { continued: true }).text(moneda(p.total, p.moneda), { align: "right" });
    doc.moveDown(1.2);

    if (p.notas) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(GRIS).text("NOTAS", izq);
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor(TINTA).text(p.notas, { width: ancho });
      doc.moveDown(1);
    }

    doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(
      "Este presupuesto no incluye impuestos, tasas ni aportes que se determinen al momento de la firma, salvo los detallados. Los valores en pesos pueden ajustarse si el otorgamiento se produce después del plazo de validez.",
      izq,
      doc.y,
      { width: ancho },
    );
    doc.end();
  });
}
