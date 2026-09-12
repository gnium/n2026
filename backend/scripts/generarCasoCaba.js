/**
 * Genera ejemplos/caso-practico-caba.docx: un caso práctico al estilo del
 * examen escrito del Concurso de Oposición del Colegio de Escribanos de la
 * Ciudad de Buenos Aires (caso + antecedentes; el aspirante debe redactar la
 * escritura completa). Datos FICTICIOS. Los vicios del título están tomados
 * de consultas reales del CAN 121 (Colescba) y se listan en
 * ejemplos/caso-practico-caba.esperado.json para evaluar al analista.
 *
 * Uso: node scripts/generarCasoCaba.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(aqui, "../../ejemplos");
const P = (t, bold = false) => new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: t, bold, font: "Times New Roman", size: 24 })] });
const H = (t, l = HeadingLevel.HEADING_2) => new Paragraph({ text: t, heading: l });

const doc = new Document({
  sections: [
    {
      children: [
        H("CASO PRÁCTICO - EXAMEN ESCRITO (SIMULACRO)", HeadingLevel.HEADING_1),
        P("Consigna: con los antecedentes que se acompañan, redacte íntegramente la escritura de compraventa, con los actos pre y post escriturarios, y fundamente las observaciones al título. Escribana autorizante: Laura Beatriz Ferrari, titular del Registro Notarial 1523 de la Ciudad Autónoma de Buenos Aires. Fecha de otorgamiento: 25 de septiembre de 2026.", true),
        H("I. Partes"),
        P("Parte vendedora: Osvaldo Rubén Castellanos, argentino, nacido el 9 de mayo de 1958, DNI 12.876.543, CUIT 20-12876543-4, casado en primeras nupcias con Graciela Inés Montenegro, DNI 13.456.789, CUIL 27-13456789-2, con domicilio real en Avenida Rivadavia 5680 piso 7 departamento C, Ciudad Autónoma de Buenos Aires. El inmueble que se vende es la sede del hogar conyugal desde 2003."),
        P("Parte compradora: Julieta Soledad Ibáñez, argentina, nacida el 14 de febrero de 1990, soltera, DNI 35.222.111, CUIT 27-35222111-6, con domicilio en Calle Gurruchaga 1150, Ciudad Autónoma de Buenos Aires. Correo: jibanez@correo-ficticio.com. Teléfono (011) 4771-2233."),
        H("II. Inmueble"),
        P("Unidad funcional número 14, ubicada en el piso 7, departamento C, del edificio sito en Avenida Rivadavia 5680, entre Campichuelo y Pedro Goyena, Ciudad Autónoma de Buenos Aires. Superficie cubierta 74,20 m2, porcentual 3,15 %. Nomenclatura Catastral: Circunscripción 6, Sección 40, Manzana 38, Parcela 12. Partida 2.345.678. Matrícula FR 6-12345/14. Valuación fiscal 2026: $ 61.400.000. Se acompaña certificado catastral vigente."),
        H("III. Título y antecedentes dominiales"),
        P("Antecedente 1 (título del vendedor): corresponde a Osvaldo Rubén Castellanos por DONACIÓN que le efectuaron los cónyuges Ernesto Aníbal Zuloaga y Nélida Rosa Ferreyra, según escritura número 412 del 18 de octubre de 2001, pasada ante el escribano Héctor Manuel Ruiz, titular del Registro 402 de esta Ciudad, inscripta en el Registro de la Propiedad Inmueble de la Capital Federal el 3 de diciembre de 2001 en la matrícula FR 6-12345/14. El donatario no es pariente de los donantes. Los donantes tenían a esa fecha dos hijos: Ernesto Aníbal Zuloaga (h) y Marina Zuloaga. Ernesto Aníbal Zuloaga falleció el 20 de marzo de 2019; Nélida Rosa Ferreyra vive. No consta renuncia a la acción de reducción por parte de los herederos."),
        P("Antecedente 2: correspondía a los cónyuges Zuloaga-Ferreyra por compra que efectuaron a Amadeo Pereyra según escritura número 88 del 5 de abril de 1987, pasada ante el escribano Jorge Balbín, Registro 155, inscripta el 20 de mayo de 1987."),
        P("Antecedente 3: a Amadeo Pereyra le correspondía por adjudicación en la sucesión de su madre, Rosa Bianchi de Pereyra, según declaratoria de herederos dictada el 2 de agosto de 1979 por el Juzgado Nacional en lo Civil N° 22; la declaratoria NO fue inscripta en el Registro de la Propiedad Inmueble y la venta de 1987 se otorgó sin invocar el tracto abreviado ni acompañar la declaratoria."),
        H("IV. Certificados y gravámenes"),
        P("Certificado de dominio N° 887.541 expedido el 2 de septiembre de 2026 (plazo de 15 días): informa el dominio a nombre de Osvaldo Rubén Castellanos. Gravámenes: EMBARGO por $ 180.000 en autos 'Cooperativa de Crédito La Unión Ltda. c/ Castellanos Osvaldo Rubén s/ ejecutivo', Juzgado Nacional en lo Comercial N° 9, con toma de razón el 14 de agosto de 2019; no consta reinscripción. HIPOTECA en primer grado a favor del Banco Ciudad de Buenos Aires por USD 45.000 constituida el 10 de junio de 2004, escritura 233, Registro 402; se acompaña recibo de cancelación total del banco de fecha 30 de abril de 2015, sin escritura de cancelación ni inscripción del levantamiento."),
        P("Certificado de inhibiciones: NO se acompaña."),
        P("Informe de deuda de AGIP (ABL) al 1 de septiembre de 2026: sin deuda. Aysa: sin deuda. Expensas: certificado del administrador con deuda de $ 420.000 correspondiente a los meses de julio y agosto de 2026."),
        P("No consta afectación al régimen de vivienda (art. 244 CCyC) ni bien de familia. No consta COTI."),
        H("V. Condiciones de la operación"),
        P("Precio: dólares estadounidenses ciento ochenta y cinco mil (USD 185.000). La compradora entregó USD 18.500 en concepto de seña y a cuenta de precio por boleto de compraventa del 1 de agosto de 2026 con firmas certificadas; el saldo se paga en el acto de escritura mediante transferencia bancaria. Posesión: se entrega en el acto de escritura. La vendedora declara que adquirió el inmueble antes del 1 de enero de 2018 y que no es su única vivienda. La compradora destina el inmueble a vivienda propia. Graciela Inés Montenegro concurrirá al acto."),
      ],
    },
  ],
});

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "caso-practico-caba.docx"), await Packer.toBuffer(doc));

const esperado = {
  descripcion: "Hallazgos que el estudio de títulos y la validación fiscal/registral deberían detectar sobre ejemplos/caso-practico-caba.docx. Cada hallazgo lista palabras clave; se considera detectado si el informe menciona alguna combinación razonable.",
  tipo_acto: "compraventa",
  hallazgos: [
    { id: "donacion_extrano", severidad_minima: "alta", descripcion: "Título antecedente: donación a extraño (2001) con herederos forzosos vivos; acción de reducción no prescripta ni renunciada (art. 2459 CCyC, diez años desde la posesión; art. 2386). Título observable.", claves: ["donaci", "reducci", "observable", "2459", "herederos forzosos", "legítima", "legitima"] },
    { id: "tracto_interrumpido", severidad_minima: "alta", descripcion: "Declaratoria de herederos de 1979 no inscripta y venta de 1987 sin tracto abreviado: interrupción del tracto (art. 15/16 ley 17.801).", claves: ["tracto", "declaratoria", "17.801", "17801", "inscripta"] },
    { id: "asentimiento_conyugal", severidad_minima: "alta", descripcion: "Vendedor casado y el inmueble es sede del hogar conyugal: asentimiento del cónyuge (arts. 456 y 470 CCyC).", claves: ["asentimiento", "456", "470", "cónyuge", "conyuge", "vivienda familiar", "hogar"] },
    { id: "embargo_caducado", severidad_minima: "media", descripcion: "Embargo con toma de razón en agosto de 2019 sin reinscripción: caducidad de pleno derecho a los cinco años (art. 37 ley 17.801). Corresponde solicitar el levantamiento por caducidad o dejar constancia.", claves: ["caduc", "37", "embargo", "cinco años", "5 años"] },
    { id: "hipoteca_no_cancelada", severidad_minima: "alta", descripcion: "Hipoteca del Banco Ciudad con recibo de cancelación pero sin escritura de cancelación ni levantamiento inscripto: debe otorgarse la cancelación e inscribirse antes o simultáneamente.", claves: ["hipoteca", "cancelaci", "levantamiento"] },
    { id: "inhibiciones_faltante", severidad_minima: "alta", descripcion: "No se acompaña certificado de inhibiciones del vendedor (art. 23 ley 17.801).", claves: ["inhibici"] },
    { id: "expensas_deuda", severidad_minima: "media", descripcion: "Deuda de expensas de julio y agosto de 2026: retención o pago previo; obligación propter rem (art. 2049/2050 CCyC).", claves: ["expensas"] },
    { id: "iti_ganancias", severidad_minima: "media", descripcion: "Vendedor persona humana que adquirió antes de 2018: aplica ITI 1,5 % (ley 23.905), salvo reemplazo de vivienda única; no es única vivienda.", claves: ["ITI", "23.905", "23905", "transferencia de inmuebles", "1,5", "1.5"] },
    { id: "coti", severidad_minima: "baja", descripcion: "Precio en USD superior al mínimo vigente: se requiere COTI.", claves: ["COTI"] },
    { id: "sellos_caba", severidad_minima: "baja", descripcion: "Impuesto de sellos CABA sobre el mayor valor entre precio y valuación fiscal; verificar exención vivienda única de la compradora.", claves: ["sellos"] },
    { id: "uif", severidad_minima: "baja", descripcion: "Declaración jurada de licitud y origen de fondos (UIF, Res. 242/2023 para escribanos).", claves: ["UIF", "licitud", "origen de los fondos", "origen de fondos", "lavado"] },
  ],
};
fs.writeFileSync(path.join(dir, "caso-practico-caba.esperado.json"), JSON.stringify(esperado, null, 2));
console.log("Generados: caso-practico-caba.docx y caso-practico-caba.esperado.json en", dir);
