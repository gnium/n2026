/**
 * Construye el .docx final EN MEMORIA: minuta rehidratada + anexos.
 * Es el unico lugar donde los tokens vuelven a ser datos reales.
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";
import { rehidratar } from "./anonymizer.js";

const FUENTE = "Times New Roman";

const p = (texto, opts = {}) =>
  new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 320 },
    children: [new TextRun({ text: texto, font: FUENTE, size: 24, bold: !!opts.bold, italics: !!opts.italics })],
  });

const h = (texto, nivel = HeadingLevel.HEADING_1) => new Paragraph({ text: texto, heading: nivel, spacing: { before: 320, after: 160 } });

const lista = (items) => items.map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, font: FUENTE, size: 22 })] }));

function tablaBase(filas, encabezados) {
  const celda = (t, bold = false) =>
    new TableCell({ width: { size: Math.floor(100 / encabezados.length), type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ""), font: FUENTE, size: 20, bold })] })] });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: encabezados.map((e) => celda(e, true)) }), ...filas.map((f) => new TableRow({ children: f.map((c) => celda(c)) }))],
  });
}

export async function construirDocx(sesion) {
  // Las marcas [[MODELO_...]] pertenecen a otro caso (la escritura modelo): jamas se rehidratan.
  const mapa = new Map([...sesion.mapa.entries()].filter(([k]) => !k.startsWith("[[MODELO_")));
  const R = (t) => rehidratar(t ?? "", mapa).replace(/\[\[([A-Z0-9_]+)\]\]/g, (_, id) => `{{COMPLETAR_${id.replace(/^MODELO_/, "")}}}`);
  // Toda celda de texto se rehidrata: ningun campo puede quedar con marcas por olvido.
  const tabla = (filas, encabezados) => tablaBase(filas.map((f) => f.map((c) => (typeof c === "string" ? R(c) : c))), encabezados);
  const ext = sesion.resultados.extractor_antecedentes;
  const est = sesion.resultados.analista_estudio_titulos;
  const red = sesion.resultados.redactor_minuta_escritura;
  const val = sesion.resultados.validador_fiscal_registral;

  const cert = sesion.resultados.redactor_certificacion_firmas;
  const cuerpo = [];
  let anexo = 0;
  const tituloAnexo = (t) => `ANEXO ${["I", "II", "III"][anexo++] || anexo} - ${t}`;

  // ---- Certificacion de firmas ----
  if (cert) {
    cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: `CERTIFICACION DE FIRMAS - ${cert.modalidad === "representacion" ? "CON REPRESENTACION" : "A TITULO PERSONAL"}`, font: FUENTE, size: 28, bold: true })] }));
    cuerpo.push(h("Acta de requerimiento", HeadingLevel.HEADING_2));
    for (const parrafo of R(cert.acta_requerimiento).split(/\n{2,}|\n/)) if (parrafo.trim()) cuerpo.push(p(parrafo.trim()));
    cuerpo.push(h("Certificacion", HeadingLevel.HEADING_2));
    for (const parrafo of R(cert.certificacion).split(/\n{2,}|\n/)) if (parrafo.trim()) cuerpo.push(p(parrafo.trim()));
    if (cert.firmantes.length) {
      cuerpo.push(h("Firmantes", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(cert.firmantes.map((f) => [R(f.marca), R(f.caracter), R(f.representa_a), f.documentos_habilitantes.map(R).join("; "), f.identificacion]), ["Firmante", "Caracter", "Representa a", "Documentos habilitantes", "Identificacion"]));
    }
    if (cert.variables_faltantes.length) {
      cuerpo.push(h("Datos a completar por la escribana o el escribano", HeadingLevel.HEADING_2));
      cuerpo.push(...lista(cert.variables_faltantes.map((v) => `${v.placeholder}: ${v.descripcion}`)));
    }
    cuerpo.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    cuerpo.push(h(tituloAnexo("Control de personeria y recaudos")));
    if (cert.documentos_habilitantes_requeridos.length) {
      cuerpo.push(h("Documentos habilitantes", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(cert.documentos_habilitantes_requeridos.map((d) => [R(d.documento), d.estado.replace(/_/g, " "), R(d.detalle)]), ["Documento", "Estado", "Detalle"]));
    }
    if (cert.controles.length) {
      cuerpo.push(h("Controles", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(cert.controles.map((c) => [R(c.control), c.resultado.toUpperCase(), c.fundamento || "", R(c.detalle)]), ["Control", "Resultado", "Fundamento", "Detalle"]));
    }
    if (cert.notas_para_escribana.length) {
      cuerpo.push(h("Notas", HeadingLevel.HEADING_2));
      cuerpo.push(...lista(cert.notas_para_escribana.map(R)));
    }
  }

  // ---- Minuta (si se redacto) ----
  if (red) {
    cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: R(red.titulo || "MINUTA DE ESCRITURA"), font: FUENTE, size: 28, bold: true })] }));
    for (const parrafo of R(red.texto_escritura || "").split(/\n{2,}|\n/)) {
      if (parrafo.trim()) cuerpo.push(p(parrafo.trim()));
    }
  } else if (!cert) {
    cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new TextRun({ text: "INFORME DE ESTUDIO DE TITULOS", font: FUENTE, size: 28, bold: true })] }));
  }

  if (red?.variables_faltantes?.length) {
    cuerpo.push(h("Datos a completar por la escribana o el escribano", HeadingLevel.HEADING_2));
    cuerpo.push(...lista(red.variables_faltantes.map((v) => `${v.placeholder}: ${v.descripcion}`)));
  }
  if (red?.notas_para_escribana?.length) {
    cuerpo.push(h("Notas del redactor", HeadingLevel.HEADING_2));
    cuerpo.push(...lista(red.notas_para_escribana.map(R)));
  }

  // ---- Anexo I: estudio de titulos ----
  if (est) {
    if (red) {
      cuerpo.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      cuerpo.push(h(tituloAnexo("Informe de estudio de titulos")));
    }
    cuerpo.push(p(`Continuidad del tracto sucesivo: ${est.continuidad_tracto.toUpperCase()}.`, { bold: true }));
    cuerpo.push(p(R(est.conclusion)));
    if (est.tracto_sucesivo.length) {
      cuerpo.push(h("Tracto sucesivo", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(est.tracto_sucesivo.map((t) => [t.orden, R(t.acto), t.fecha || "", R(t.transmitente), R(t.adquirente), t.inscripcion || "", R(t.observacion)]), ["#", "Acto", "Fecha", "Transmitente", "Adquirente", "Inscripcion", "Observacion"]));
    }
    if (est.riesgos.length) {
      cuerpo.push(h("Riesgos detectados", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(est.riesgos.map((r) => [r.severidad.toUpperCase(), r.categoria, R(r.descripcion), r.fundamento_legal || "", R(r.recomendacion)]), ["Severidad", "Categoria", "Descripcion", "Fundamento", "Recomendacion"]));
    }
    if (est.requisitos_previos.length) {
      cuerpo.push(h("Requisitos previos", HeadingLevel.HEADING_2));
      cuerpo.push(...lista(est.requisitos_previos.map(R)));
    }
  }

  // ---- Anexo II: validacion fiscal y registral ----
  if (val) {
    cuerpo.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    cuerpo.push(h(tituloAnexo("Validacion fiscal y registral")));
    cuerpo.push(p(`${val.apto_para_firma ? "APTO" : "NO APTO"} para firma segun el control automatico. ${R(val.resumen)}`, { bold: true }));
    if (val.certificados.length) {
      cuerpo.push(h("Certificados", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(val.certificados.map((c) => [c.nombre, c.estado.replace(/_/g, " "), c.plazo_legal || "", R(c.detalle)]), ["Certificado", "Estado", "Plazo legal", "Detalle"]));
    }
    if (val.impuestos_y_tasas.length) {
      cuerpo.push(h("Impuestos y tasas", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(val.impuestos_y_tasas.map((i) => [i.concepto, i.aplica, i.jurisdiccion || "", i.alicuota_o_formula || "", i.sujeto_obligado || "", R(i.observacion)]), ["Concepto", "Aplica", "Jurisdiccion", "Alicuota / formula", "Obligado", "Observacion"]));
    }
    if (val.regimenes_informacion.length) {
      cuerpo.push(h("Regimenes de informacion", HeadingLevel.HEADING_2));
      cuerpo.push(...lista(val.regimenes_informacion.map((r) => `${r.nombre}: ${r.aplica}${r.observacion ? " - " + R(r.observacion) : ""}`)));
    }
    if (val.inconsistencias.length) {
      cuerpo.push(h("Inconsistencias", HeadingLevel.HEADING_2));
      cuerpo.push(...lista(val.inconsistencias.map((i) => `[${i.severidad.toUpperCase()}] ${R(i.descripcion)}${i.sugerencia ? " Sugerencia: " + R(i.sugerencia) : ""}`)));
    }
    if (val.checklist_previo_firma.length) {
      cuerpo.push(h("Checklist previo a la firma", HeadingLevel.HEADING_2));
      cuerpo.push(...lista(val.checklist_previo_firma.sort((a, b) => a.orden - b.orden).map((c) => `${c.orden}. ${R(c.accion)}${c.responsable ? " (" + c.responsable + ")" : ""}`)));
    }
  }

  // ---- Anexo III: resumen de la extraccion ----
  if (ext) {
    cuerpo.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    cuerpo.push(h(tituloAnexo("Datos extraidos de los antecedentes")));
    cuerpo.push(p(`Acto: ${ext.resumen.tipo_acto}. ${R(ext.resumen.descripcion_generica)}`));
    if (ext.entidades.length) {
      cuerpo.push(tabla(ext.entidades.map((e) => [e.categoria, e.rol || "", R(e.token || ""), [e.atributos.estado_civil, e.atributos.nacionalidad, e.atributos.caracter].filter(Boolean).join(", ")]), ["Categoria", "Rol", "Dato", "Atributos"]));
    }
    if (ext.antecedentes_dominiales.length) {
      cuerpo.push(h("Antecedentes dominiales", HeadingLevel.HEADING_2));
      cuerpo.push(tabla(ext.antecedentes_dominiales.map((a) => [a.orden, a.tipo_acto, a.fecha || "", a.escribano_o_registro || "", a.inscripcion || "", R(a.observaciones)]), ["#", "Acto", "Fecha", "Escribano / Registro", "Inscripcion", "Observaciones"]));
    }
  }

  const doc = new Document({
    creator: "Doy Fe",
    title: R(red?.titulo || (cert ? "Certificacion de firmas" : "Informe de estudio de titulos")),
    styles: { default: { document: { run: { font: FUENTE, size: 24 } } } },
    sections: [{ properties: {}, children: cuerpo }],
  });
  return Packer.toBuffer(doc);
}
