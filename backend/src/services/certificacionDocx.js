import { Document, Paragraph, TextRun, AlignmentType, TabStopPosition, TabStopType, Packer } from "docx";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaEnLetras(d) {
  if (!d) return "… días del mes de … del año …";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${Number(dia)} días del mes de ${MESES[Number(m) - 1]} del año ${a}`;
}

function firmantesTexto(firmantes) {
  if (!firmantes.length) return "…";
  return firmantes.map((f) => {
    const nombre = (f.nombre || "").toUpperCase();
    const dni = f.dni || "…";
    return `${nombre}, D.N.I. Nº ${dni}`;
  }).join(" y ");
}

function pluralFirmantes(firmantes) {
  const n = firmantes.length;
  return {
    las: n > 1 ? "las" : "la",
    firmas: n > 1 ? "firmas" : "firma",
    obran: n > 1 ? "obran" : "obra",
    han: n > 1 ? "han" : "ha",
    las2: n > 1 ? "las" : "la",
    personas: n > 1 ? "personas" : "persona",
    cuyos: n > 1 ? "cuyos" : "cuyo",
    nombres: n > 1 ? "nombres" : "nombre",
    documentos: n > 1 ? "documentos" : "documento",
    mencionan: n > 1 ? "mencionan" : "menciona",
    quienes: n > 1 ? "quienes" : "quien",
    exhiben: n > 1 ? "exhiben" : "exhibe",
    dichas: n > 1 ? "dichas" : "dicha",
    manifiestan: n > 1 ? "manifiestan" : "manifiesta",
    los: n > 1 ? "los" : "el",
    requerimientos: n > 1 ? "requerimientos" : "requerimiento",
    respectivos: n > 1 ? "respectivos" : "respectivo",
    quedan: n > 1 ? "quedan" : "queda",
    formalizados: n > 1 ? "formalizados" : "formalizado",
  };
}

export async function construirCertificacionDocx({ cert: c, escribano: esc }) {
  const firmantes = c.firmantes || [];
  const doc = c.documento || {};
  const p = pluralFirmantes(firmantes);

  const parcialmenteEnBlanco = doc.parcialmenteEnBlanco !== false;
  const redactadoPorEscribano = doc.redactadoPorEscribano === true;

  const ciudadTexto = esc.jurisdiccion || "Salta";
  const escribanoNombre = (esc.nombre || "…").toUpperCase();
  const escribaniaTexto = esc.escribania || "…";

  const instrumento = doc.naturaleza || "…";
  const blancoTexto = parcialmenteEnBlanco
    ? " -documento que se encuentra parcialmente en blanco-"
    : " -documento que no se encuentra parcialmente en blanco-";

  const segundoTexto = c.modalidad === "representacion"
    ? `Que ${p.dichas} ${p.personas} ${p.manifiestan} actuar en representación de ${c.representada?.denominacion || "…"}${c.representada?.cuit ? `, C.U.I.T. Nº ${c.representada.cuit}` : ""}${c.representada?.documentosHabilitantes ? `, acreditando su personería con ${c.representada.documentosHabilitantes}` : ""}.`
    : `Que ${p.dichas} ${p.personas} ${p.manifiestan} actuar por sus propios derechos.`;

  const redaccionTexto = redactadoPorEscribano
    ? " El presente instrumento ha sido redactado por el escribano autorizante."
    : "";

  const acta = c.acta || "…";
  const folio = c.folio || "…";
  const libroFirmas = c.libroFirmas || "…";
  const fojaActuacion = c.fojaActuacion || "…";

  const parrafos = [
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 276 },
      children: [
        new TextRun({
          text: `En la Ciudad de ${ciudadTexto}, Capital de la Provincia del mismo nombre, República Argentina, a ${fechaEnLetras(c.fechaCertificacion)}, ante mí, ${escribanoNombre}, ${escribaniaTexto}; `,
          font: "Times New Roman",
          size: 24,
        }),
        new TextRun({
          text: "CERTIFICO: ",
          font: "Times New Roman",
          size: 24,
          bold: true,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 276 },
      children: [
        new TextRun({
          text: "PRIMERO: ",
          font: "Times New Roman",
          size: 24,
          bold: true,
        }),
        new TextRun({
          text: `Que ${p.las} ${p.firmas} que ${p.obran} en el documento que ligo: ${instrumento}${blancoTexto} ${p.han} sido puesta${firmantes.length > 1 ? "s" : ""} en mi presencia por ${p.las2} ${p.personas} ${p.cuyos} ${p.nombres} y ${p.documentos} de identidad que se ${p.mencionan} a continuación: ${firmantesTexto(firmantes)}, ${p.quienes} ${p.exhiben} en este acto ${p.documentos} idóneo${firmantes.length > 1 ? "s" : ""} conforme al inciso a) del artículo 306 del Código Civil y Comercial de la Nación Argentina.`,
          font: "Times New Roman",
          size: 24,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 276 },
      children: [
        new TextRun({
          text: "SEGUNDO: ",
          font: "Times New Roman",
          size: 24,
          bold: true,
        }),
        new TextRun({
          text: segundoTexto,
          font: "Times New Roman",
          size: 24,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 276 },
      children: [
        new TextRun({
          text: "TERCERO: ",
          font: "Times New Roman",
          size: 24,
          bold: true,
        }),
        new TextRun({
          text: `Que ${p.los} ${p.requerimientos} ${p.respectivos} ${p.quedan} ${p.formalizados} simultáneamente por medio de Acta${firmantes.length > 1 ? "s" : ""} Nº ${acta} a fojas ${folio} del Libro de Registro de Firmas Nº ${libroFirmas}.`,
          font: "Times New Roman",
          size: 24,
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 276 },
      children: [
        new TextRun({
          text: "CUARTO: ",
          font: "Times New Roman",
          size: 24,
          bold: true,
        }),
        new TextRun({
          text: `Se agrega al ejemplar FOJA${firmantes.length > 1 ? "S" : ""} DE ACTUACION ESPECIAL PARA CERTIFICACION DE FIRMAS Nº ${fojaActuacion}.${redaccionTexto} La presente certificación se limita a la identificación del firmante.---`,
          font: "Times New Roman",
          size: 24,
        }),
      ],
    }),
  ];

  const documento = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: parrafos,
    }],
  });

  return Packer.toBuffer(documento);
}
