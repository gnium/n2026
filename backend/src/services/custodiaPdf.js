import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const TINTA = "#1b1f24";
const GRIS = "#566069";
const LINEA = "#dadcd6";
const ACENTO = "#24466b";
const ORO = "#c9a84c";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fecha(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()}, ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")} hs`;
}

export async function construirCustodiaPdf({ registro, cliente, escribano, tipo, urlVerificacion }) {
  const titulo = tipo === "recepcion" ? "COMPROBANTE DE RECEPCIÓN" : tipo === "entrega" ? "COMPROBANTE DE ENTREGA" : "COMPROBANTE DE DEVOLUCIÓN";
  const esRecepcion = tipo === "recepcion";
  const qrPng = await QRCode.toBuffer(urlVerificacion, { errorCorrectionLevel: "M", margin: 1, width: 280 });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `${titulo} — ${registro.codigo}`, Author: escribano?.nombre || "Doy Fe", Creator: "Doy Fe" } });
    const chunks = [];
    doc.on("data", (x) => chunks.push(x));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const izq = doc.page.margins.left;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Header
    doc.rect(izq - 20, 36, ancho + 40, 60).fillColor(ACENTO).fill();
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#ffffff").text("DOY FE", izq, 48, { width: ancho, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#d0dce8").text("Gestión Notarial con Inteligencia Artificial", { width: ancho, align: "center" });
    doc.moveDown(2);

    // Title
    doc.font("Helvetica-Bold").fontSize(16).fillColor(ACENTO).text(titulo, izq, doc.y, { width: ancho, align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(ORO).text(`Código: ${registro.codigo}`, { width: ancho, align: "center" });
    doc.moveDown(1.5);

    // Separator
    doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(ORO).lineWidth(2).stroke();
    doc.moveDown(1);

    // Escribanía
    if (escribano?.nombre) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("ESCRIBANÍA");
      doc.font("Helvetica-Bold").fontSize(12).fillColor(TINTA).text(escribano.nombre);
      doc.moveDown(0.8);
    }

    // Cliente
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("CLIENTE");
    doc.font("Helvetica-Bold").fontSize(12).fillColor(TINTA).text(cliente.nombre);
    const detalles = [cliente.documento && `DNI ${cliente.documento}`, cliente.cuit && `CUIT ${cliente.cuit}`].filter(Boolean).join("  ·  ");
    if (detalles) doc.font("Helvetica").fontSize(10).fillColor(GRIS).text(detalles);
    doc.moveDown(1);

    // Documentación
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("DOCUMENTACIÓN");
    doc.moveDown(0.2);
    doc.rect(izq, doc.y, ancho, 0).strokeColor(LINEA);
    const yBox = doc.y;
    doc.rect(izq, yBox - 4, ancho, 1).fillColor(LINEA).fill();
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(registro.descripcion, izq + 8, doc.y, { width: ancho - 16 });
    const yEnd = doc.y + 8;
    doc.rect(izq, yEnd, ancho, 1).fillColor(LINEA).fill();
    doc.y = yEnd + 12;

    // Fechas
    if (registro.recibidoEn) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("FECHA DE RECEPCIÓN");
      doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(fecha(registro.recibidoEn));
      doc.moveDown(0.5);
    }

    if (!esRecepcion && registro.devueltoEn) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("FECHA DE DEVOLUCIÓN");
      doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(fecha(registro.devueltoEn));
      doc.moveDown(0.5);
    }

    if (registro.entregadoEn) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(GRIS).text("FECHA DE ENTREGA");
      doc.font("Helvetica").fontSize(11).fillColor(TINTA).text(fecha(registro.entregadoEn));
      doc.moveDown(0.5);
    }

    // Estado
    doc.moveDown(0.5);
    const estadoTexto = registro.estado === "en_custodia" ? "EN CUSTODIA" : registro.estado === "entregado" ? "ENTREGADO" : "DEVUELTO";
    const estadoColor = registro.estado === "en_custodia" ? ACENTO : "#2d7a3a";
    doc.rect(izq + ancho / 2 - 80, doc.y - 4, 160, 28).fillColor(estadoColor).fill();
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").text(estadoTexto, izq, doc.y, { width: ancho, align: "center" });
    doc.moveDown(2);

    // QR
    doc.moveTo(izq, doc.y).lineTo(izq + ancho, doc.y).strokeColor(LINEA).lineWidth(0.5).stroke();
    doc.moveDown(1);

    const qrSize = 120;
    const xQr = izq + ancho / 2 - qrSize / 2;
    doc.image(qrPng, xQr, doc.y, { width: qrSize });
    doc.y += qrSize + 8;

    doc.font("Helvetica").fontSize(9).fillColor(GRIS).text("Escanee el código QR o visite el siguiente enlace para verificar el estado de su documentación:", izq, doc.y, { width: ancho, align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor(ACENTO).text(urlVerificacion, { width: ancho, align: "center", link: urlVerificacion });
    doc.moveDown(2);

    // Footer
    doc.font("Helvetica").fontSize(8).fillColor(GRIS).text(
      `Comprobante generado automáticamente por Doy Fe. Código de verificación: ${registro.codigo}. Este documento acredita la ${tipo === "recepcion" ? "recepción" : tipo === "entrega" ? "entrega" : "devolución"} de la documentación descripta.`,
      izq, doc.y, { width: ancho, align: "center" },
    );

    doc.end();
  });
}
