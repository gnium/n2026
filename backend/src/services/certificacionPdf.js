import PDFDocument from "pdfkit";

const TINTA = "#1b1f24";
const GRIS = "#566069";
const LINEA = "#dadcd6";
const ACENTO = "#24466b";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fecha(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia} de ${MESES[Number(m) - 1]} de ${a}`;
}

function seccion(doc, izq, titulo) {
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text(titulo.toUpperCase(), izq);
  doc.moveDown(0.3);
}

function campo(doc, izq, label, valor, y) {
  doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(label, izq, y);
  doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(valor || "—", izq, y + 12);
}

export function construirCertificacionPdf({ cert: c, escribano: esc }) {
  return new Promise((resolve, reject) => {
    const firmantes = c.firmantes || [];
    const doc = c.documento || {};
    const rep = c.representada;

    const pdf = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Certificación N° ${c.numero}/${c.anio}`, Author: esc.nombre || "Doy Fe", Creator: "Doy Fe" } });
    const chunks = [];
    pdf.on("data", (ch) => chunks.push(ch));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const izq = pdf.page.margins.left;
    const ancho = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const col2 = izq + ancho / 2;

    // Cabecera
    if (esc.escribania) {
      pdf.font("Helvetica-Bold").fontSize(11).fillColor(TINTA).text(esc.escribania, izq, 56);
      pdf.moveDown(0.2);
    }
    pdf.font("Helvetica-Bold").fontSize(16).fillColor(TINTA).text("CERTIFICACIÓN DE FIRMAS", izq);
    pdf.font("Helvetica").fontSize(10).fillColor(GRIS).text(`Libro de Requerimientos — ${c.modalidad === "representacion" ? "Con representación" : "A título personal"}`);
    pdf.moveDown(0.4);
    pdf.font("Helvetica-Bold").fontSize(12).fillColor(ACENTO).text(`N° ${c.numero} / ${c.anio}`);
    if (esc.jurisdiccion) pdf.font("Helvetica").fontSize(10).fillColor(GRIS).text(esc.jurisdiccion);
    pdf.moveDown(0.6);
    pdf.moveTo(izq, pdf.y).lineTo(izq + ancho, pdf.y).strokeColor(LINEA).lineWidth(1).stroke();

    // Firmantes
    seccion(pdf, izq, "FIRMANTES");
    const colNom = izq;
    const colDni = izq + ancho * 0.4;
    const colDom = izq + ancho * 0.6;
    const yCab = pdf.y;
    pdf.rect(izq, yCab - 4, ancho, 18).fillColor("#f3f4f1").fill();
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(GRIS);
    pdf.text("NOMBRE Y APELLIDO", colNom + 8, yCab);
    pdf.text("DNI", colDni, yCab);
    if (c.modalidad === "representacion") {
      pdf.text("CARÁCTER", colDom, yCab);
    } else {
      pdf.text("DOMICILIO", colDom, yCab);
    }
    pdf.moveDown(1);
    pdf.font("Helvetica").fontSize(10).fillColor(TINTA);
    for (const f of firmantes) {
      const y = pdf.y;
      pdf.text(f.nombre || "—", colNom + 8, y, { width: colDni - colNom - 16 });
      pdf.text(f.dni || "—", colDni, y);
      if (c.modalidad === "representacion") {
        pdf.text(f.caracter || "—", colDom, y);
      } else {
        pdf.text(f.domicilio || "—", colDom, y, { width: izq + ancho - colDom });
      }
      pdf.y = Math.max(pdf.y, y + 14) + 4;
      pdf.moveTo(izq, pdf.y).lineTo(izq + ancho, pdf.y).strokeColor(LINEA).lineWidth(0.5).stroke();
      pdf.moveDown(0.3);
    }

    // Representada
    if (c.modalidad === "representacion" && rep) {
      seccion(pdf, izq, "PERSONA REPRESENTADA");
      const yRep = pdf.y;
      campo(pdf, izq, "Denominación", rep.denominacion, yRep);
      campo(pdf, col2, "CUIT", rep.cuit, yRep);
      pdf.y = yRep + 32;
      if (rep.domicilio) {
        campo(pdf, izq, "Sede social", rep.domicilio, pdf.y);
        campo(pdf, col2, "Inscripción", rep.inscripcion, pdf.y);
        pdf.y += 32;
      }
      if (rep.documentosHabilitantes) {
        pdf.font("Helvetica").fontSize(9).fillColor(GRIS).text("Documentos habilitantes", izq, pdf.y);
        pdf.moveDown(0.2);
        pdf.font("Helvetica").fontSize(10).fillColor(TINTA).text(rep.documentosHabilitantes, izq, pdf.y, { width: ancho });
      }
    }

    // Documento
    seccion(pdf, izq, "DOCUMENTO CERTIFICADO");
    const yDoc = pdf.y;
    campo(pdf, izq, "Naturaleza", doc.naturaleza, yDoc);
    campo(pdf, col2, "Ejemplares", doc.ejemplares, yDoc);
    pdf.y = yDoc + 32;
    campo(pdf, izq, "Fojas", doc.fojas, pdf.y);
    campo(pdf, col2, "Destino", doc.destino, pdf.y);
    pdf.y += 32;

    // Estado y fechas
    seccion(pdf, izq, "ESTADO");
    const yEst = pdf.y;
    const estados = { borrador: "Borrador", certificada: "Certificada", entregada: "Entregada" };
    campo(pdf, izq, "Estado", estados[c.estado] || c.estado, yEst);
    if (c.fechaCertificacion) campo(pdf, col2, "Fecha de certificación", fecha(c.fechaCertificacion), yEst);
    pdf.y = yEst + 32;
    if (c.fechaEntrega) {
      campo(pdf, izq, "Fecha de entrega", fecha(c.fechaEntrega), pdf.y);
      pdf.y += 32;
    }

    if (c.observaciones) {
      pdf.moveDown(0.3);
      pdf.font("Helvetica").fontSize(9).fillColor(GRIS).text("Observaciones", izq);
      pdf.font("Helvetica").fontSize(10).fillColor(TINTA).text(c.observaciones, izq, pdf.y + 4, { width: ancho });
    }

    // Separador + firma
    pdf.moveDown(1.5);
    pdf.moveTo(izq, pdf.y).lineTo(izq + ancho, pdf.y).strokeColor(LINEA).lineWidth(1).stroke();
    pdf.moveDown(2.5);
    const xFirma = izq + ancho / 2 - 80;
    pdf.moveTo(xFirma, pdf.y).lineTo(xFirma + 160, pdf.y).strokeColor(TINTA).lineWidth(0.5).stroke();
    pdf.moveDown(0.3);
    pdf.font("Helvetica").fontSize(9).fillColor(GRIS).text("Firma y sello del escribano", xFirma, pdf.y, { width: 160, align: "center" });
    pdf.moveDown(2);

    // Disclaimer
    pdf.font("Helvetica").fontSize(8).fillColor(GRIS).text(
      "Certificación generada por Doy Fe. La presente constancia no suple el acta notarial correspondiente.",
      izq, pdf.y, { width: ancho },
    );

    pdf.end();
  });
}
