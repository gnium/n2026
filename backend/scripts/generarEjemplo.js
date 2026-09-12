/**
 * Genera ejemplos/antecedente-ejemplo.docx con datos FICTICIOS para probar la app.
 * Uso: node scripts/generarEjemplo.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const destino = path.resolve(aqui, "../../ejemplos/antecedente-ejemplo.docx");

const P = (t, bold = false) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: t, bold, font: "Times New Roman", size: 24 })] });

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: "ANTECEDENTES PARA ESCRITURA DE COMPRAVENTA", heading: HeadingLevel.HEADING_1 }),
        P("Datos de las partes (ficticios, generados para pruebas).", true),
        P("Parte vendedora: Ricardo Ernesto Balbuena, argentino, nacido el 3 de marzo de 1961, casado en primeras nupcias con Silvia Noemi Arregui, DNI 14.222.333, CUIT 20-14222333-9, con domicilio real en Calle Lavalle 1870 piso 4 departamento B, Ciudad de La Plata, Provincia de Buenos Aires. Telefono (0221) 455-7788. Correo: rbalbuena@correo-ficticio.com."),
        P("Conyuge: Silvia Noemi Arregui, DNI 16.555.666, CUIL 27-16555666-4, quien prestara asentimiento conyugal."),
        P("Parte compradora: Florencia Agustina Quiroga, argentina, soltera, D.N.I. N° 35.888.999, CUIT 27-35888999-1, con domicilio en Avenida Colon 2350, Mar del Plata, Provincia de Buenos Aires."),
        new Paragraph({ text: "Inmueble", heading: HeadingLevel.HEADING_2 }),
        P("Unidad funcional numero 12 del edificio sito en Calle 7 numero 1245 entre 57 y 58, Ciudad de La Plata, Partido de La Plata, Provincia de Buenos Aires. Superficie cubierta 68,40 m2. Nomenclatura Catastral: Circunscripcion I, Seccion F, Manzana 402, Parcela 15, Subparcela 12. Partida inmobiliaria 055-123456-7. Matricula 55-98765/12 (La Plata)."),
        new Paragraph({ text: "Titulo de propiedad y tracto", heading: HeadingLevel.HEADING_2 }),
        P("Corresponde a Ricardo Ernesto Balbuena por compra que efectuo a Hector Omar Villanueva, casado con Marta Beatriz Suarez, segun escritura numero 218 del 15 de junio de 1998, pasada ante el escribano Roberto Diaz, titular del Registro 120 de La Plata, inscripta en el Registro de la Propiedad Inmueble de la Provincia de Buenos Aires el 20 de agosto de 1998 en la matricula 55-98765/12."),
        P("A Hector Omar Villanueva le correspondia por adjudicacion en la sucesion de su padre, Anselmo Villanueva, segun declaratoria de herederos dictada por el Juzgado Civil y Comercial N° 4 de La Plata el 2 de febrero de 1985, inscripta el 10 de mayo de 1985."),
        new Paragraph({ text: "Certificados y gravamenes", heading: HeadingLevel.HEADING_2 }),
        P("Certificado catastral expedido el 12 de julio de 2026, valuacion fiscal $ 48.500.000. Se acompana informe de deuda de ARBA sin deuda exigible. No se acompana certificado de dominio ni de inhibiciones. Consta hipoteca a favor del Banco Provincia por USD 30.000 constituida en 2005, con constancia de cancelacion no inscripta."),
        new Paragraph({ text: "Condiciones de la operacion", heading: HeadingLevel.HEADING_2 }),
        P("Precio convenido: dolares estadounidenses ciento veinte mil (USD 120.000), pagaderos de contado en el acto de escritura. Posesion: se entrega en el acto. Fecha estimada de firma: 30 de septiembre de 2026 en La Plata."),
      ],
    },
  ],
});

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, await Packer.toBuffer(doc));
console.log("Generado:", destino);
