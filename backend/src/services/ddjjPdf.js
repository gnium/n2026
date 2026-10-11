import PDFDocument from "pdfkit";

const TINTA = "#1b1f24";
const GRIS = "#566069";
const LINEA = "#dadcd6";
const ACENTO = "#24466b";

function moneda(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(Number(n));
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fecha(d) {
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia} de ${MESES[Number(m) - 1]} de ${a}`;
}

const NOMBRE_TIPO_ACTO = { compraventa: "Compraventa", donacion: "Donación", hipoteca: "Hipoteca", permuta: "Permuta", cesion: "Cesión", sucesion: "Sucesión", poder: "Poder", certificacion_firmas: "Certificación de firmas", otro: "Otro" };

function seccion(doc, izq, ancho, titulo) {
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text(titulo.toUpperCase(), izq);
  doc.moveDown(0.3);
}

function campo(doc, izq, label, valor, y) {
  doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(label, izq, y);
  doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(valor || "—", izq, y + 12);
}

export function construirDdjjPdf({ ddjj: d }) {
  return new Promise((resolve, reject) => {
    const esc = d.datosEscribano || {};
    const inm = d.datosInmueble || {};
    const partes = d.datosPartes || [];

    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `DDJJ N° ${d.numero}`, Author: esc.nombre || "Doy Fe", Creator: "Doy Fe" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const izq = doc.page.margins.left;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Cabecera
    doc.font("Helvetica-Bold").fontSize(18).fillColor(TINTA).text("DECLARACIÓN JURADA", izq, 56);
    doc.font("Helvetica").fontSize(12).fillColor(GRIS).text("IMPUESTO DE SELLOS — Formulario F06W");
    doc.font("Helvetica").fontSize(10).fillColor(GRIS).text("Provincia de Salta");
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(ACENTO).text(`DDJJ N° ${d.numero}`);
    doc.moveDown(0.6);
    doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(1).stroke();

    // Datos del Escribano
    seccion(doc, izq, ancho, "DATOS DEL ESCRIBANO");
    const yEsc = doc.y;
    const col2 = izq + ancho / 3;
    const col3 = izq + (ancho * 2) / 3;
    campo(doc, izq, "Nombre", esc.nombre, yEsc);
    campo(doc, col2, "Matrícula", esc.matricula, yEsc);
    campo(doc, col3, "CUIT", esc.cuit, yEsc);
    doc.y = yEsc + 32;

    // Datos del Acto
    seccion(doc, izq, ancho, "DATOS DEL ACTO");
    const yActo = doc.y;
    campo(doc, izq, "Tipo de acto", NOMBRE_TIPO_ACTO[d.tipoActo] || d.tipoActo, yActo);
    campo(doc, col2, "Fecha del acto", fecha(d.fechaActo), yActo);
    campo(doc, col3, "Monto de la operación", moneda(d.montoOperacion), yActo);
    doc.y = yActo + 32;

    // Partes
    if (partes.length) {
      seccion(doc, izq, ancho, "PARTES");
      const colNom = izq;
      const colDoc = izq + ancho * 0.35;
      const colCuit = izq + ancho * 0.55;
      const colRol = izq + ancho * 0.78;
      const yCab = doc.y;
      doc.rect(izq, yCab - 4, ancho, 18).fillColor("#f3f4f1").fill();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS);
      doc.text("NOMBRE", colNom + 8, yCab);
      doc.text("DOCUMENTO", colDoc, yCab);
      doc.text("CUIT", colCuit, yCab);
      doc.text("ROL", colRol, yCab);
      doc.moveDown(1);
      doc.font("Helvetica").fontSize(10).fillColor(TINTA);
      for (const p of partes) {
        const y = doc.y;
        doc.text(p.nombre || "—", colNom + 8, y, { width: colDoc - colNom - 16 });
        doc.text(p.documento || "—", colDoc, y);
        doc.text(p.cuit || "—", colCuit, y);
        doc.text(p.rol || "—", colRol, y);
        doc.y = Math.max(doc.y, y + 14) + 4;
        doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(0.5).stroke();
        doc.moveDown(0.3);
      }
    }

    // Datos del Inmueble
    if (inm.matricula || inm.nomenclatura || inm.domicilio) {
      seccion(doc, izq, ancho, "DATOS DEL INMUEBLE");
      const yInm = doc.y;
      campo(doc, izq, "Matrícula", inm.matricula, yInm);
      campo(doc, col2, "Nomenclatura catastral", inm.nomenclatura, yInm);
      doc.y = yInm + 32;
      if (inm.domicilio) {
        campo(doc, izq, "Domicilio", inm.domicilio, doc.y);
        doc.y += 32;
      }
    }

    // Liquidación
    seccion(doc, izq, ancho, "LIQUIDACIÓN");
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(11).fillColor(TINTA);
    doc.text(`Monto de la operación:  ${moneda(d.montoOperacion)}`, izq);
    doc.moveDown(0.3);
    doc.text(`Alícuota de sellos:  ${Number(d.alicuotaSellos)}%`, izq);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(ACENTO);
    doc.text(`Monto del impuesto:  ${moneda(d.montoSellos)}`, izq);
    doc.moveDown(1.5);

    // Separador
    doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(1).stroke();
    doc.moveDown(1);

    // Firma
    doc.moveDown(2);
    const xFirma = izq + ancho / 2 - 80;
    doc.moveTo(xFirma, doc.y).lineTo(xFirma + 160, doc.y).strokeColor(TINTA).lineWidth(0.5).stroke();
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor(GRIS).text("Firma y sello del escribano", xFirma, doc.y, { width: 160, align: "center" });
    doc.moveDown(2);

    // Disclaimer
    doc.font("Helvetica").fontSize(8).fillColor(GRIS).text(
      "Declaración jurada generada por Doy Fe. Los datos consignados revisten carácter de declaración jurada. El escribano es responsable de la veracidad de los datos.",
      izq,
      doc.y,
      { width: ancho },
    );

    doc.end();
  });
}
