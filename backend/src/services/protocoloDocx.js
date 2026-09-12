/**
 * Genera el .docx imprimible del indice de protocolo de un año, a partir de
 * filas YA DESCIFRADAS (ver services/protocolo.js). Es un hermano chico de
 * docxBuilder.js (no lo modifica: ese consume una `sesion`, este un array
 * plano) y reutiliza el mismo estilo visual.
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";

const FUENTE = "Times New Roman";

function celda(texto, bold = false) {
  return new TableCell({ width: { size: 100, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: String(texto ?? ""), font: FUENTE, size: 20, bold })] })] });
}

function tabla(filas, encabezados) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: encabezados.map((e) => celda(e, true)) }), ...filas.map((f) => new TableRow({ children: f.map((c) => celda(c)) }))],
  });
}

function textoComparecientes(fila) {
  if (!fila.comparecientesLegible) return "(no se pudo leer: verifique JWT_SECRET)";
  return fila.comparecientes.map((c) => `${c.rol ? `${c.rol}: ` : ""}${c.nombre}`).join("; ");
}

export async function construirIndiceProtocoloDocx(anio, filas) {
  const cuerpo = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: `INDICE DEL PROTOCOLO - AÑO ${anio}`, font: FUENTE, size: 28, bold: true })] }),
  ];
  if (!filas.length) {
    cuerpo.push(new Paragraph({ children: [new TextRun({ text: "No hay entradas registradas para este año.", font: FUENTE, size: 24 })] }));
  } else {
    cuerpo.push(
      tabla(
        filas.map((f) => [
          f.numeroOrden,
          String(f.fechaOtorgamiento).slice(0, 10).split("-").reverse().join("/"),
          f.folioDesde && f.folioHasta ? `${f.folioDesde}-${f.folioHasta}` : "",
          f.naturaleza === "acta" ? "Acta" : "Escritura",
          f.tipoActo,
          textoComparecientes(f),
          f.estado,
          f.observaciones || "",
        ]),
        ["N°", "Fecha", "Folios", "Naturaleza", "Tipo de acto", "Comparecientes", "Estado", "Observaciones"],
      ),
    );
  }
  const doc = new Document({
    creator: "Doy Fe",
    title: `Indice del protocolo - Año ${anio}`,
    styles: { default: { document: { run: { font: FUENTE, size: 24 } } } },
    sections: [{ properties: {}, children: cuerpo }],
  });
  return Packer.toBuffer(doc);
}
