/**
 * Prueba rapida sin red ni base de datos: anonimizador, esquemas y generador docx.
 * Uso: node scripts/smokeTest.js
 */
import assert from "node:assert/strict";
import { presanear, aplicarEntidades, anonimizarProfundo, rehidratar, contieneDatosReales } from "../src/services/anonymizer.js";
import { ESQUEMAS } from "../src/skills/schemas.js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { construirDocx } from "../src/services/docxBuilder.js";

// --- Fase A ---
const original = "Comparece Juan Perez, DNI 12.345.678, CUIT 20-12345678-3, correo juan@mail.com, con domicilio en Av. Siempreviva 742, Springfield. Vende a Maria Gomez, D.N.I. N° 30.111.222.";
const { texto, mapa } = presanear(original);
assert.ok(!texto.includes("12.345.678"), "DNI 1 no saneado");
assert.ok(!texto.includes("30.111.222"), "DNI 2 no saneado");
assert.ok(!texto.includes("20-12345678-3"), "CUIT no saneado");
assert.ok(!texto.includes("juan@mail.com"), "email no saneado");
assert.equal(mapa.size, 4);
{
  const { texto: t2, mapa: m2 } = presanear("Matrícula FR 6-12345/14. Partida 2.345.678. matricula 55-98765/12 (La Plata). Partida inmobiliaria 055-123456-7. Matrícula N° 12345.");
  for (const real of ["FR 6-12345/14", "2.345.678", "55-98765/12", "055-123456-7"]) assert.ok(!t2.includes(real), `no saneado: ${real}`);
  assert.equal([...m2.keys()].filter((k) => k.startsWith("[[MATRICULA")).length, 3);
  assert.equal([...m2.keys()].filter((k) => k.startsWith("[[PARTIDA")).length, 2);
}

{
  const m3 = new Map();
  presanear("DNI 12.345.678 y CUIT 20-12345678-3", m3);
  const { texto: t3 } = presanear("Instrucciones: el vendedor tiene DNI 12.345.678 y CUIT 20-12345678-3; el comprador DNI 30.111.222", m3);
  assert.ok(t3.includes("[[DNI_1]]") && t3.includes("[[CUIT_1]]") && t3.includes("[[DNI_2]]"), `tokens reutilizados: ${t3}`);
  assert.equal(m3.size, 3);
}

// --- Fase B ---
const entidades = [
  { id_sugerido: "VENDEDOR_1", valor_literal: "Juan Perez", variantes: ["Perez"] },
  { id_sugerido: "COMPRADOR_1", valor_literal: "Maria Gomez", variantes: [] },
  { id_sugerido: "DOMICILIO_INMUEBLE", valor_literal: "Av. Siempreviva 742, Springfield", variantes: ["Av. Siempreviva 742"] },
];
const anon = aplicarEntidades(texto, entidades, mapa);
assert.ok(anon.includes("[[VENDEDOR_1]]") && anon.includes("[[COMPRADOR_1]]") && anon.includes("[[DOMICILIO_INMUEBLE]]"));
assert.ok(!contieneDatosReales(anon, mapa), "quedaron datos reales");
const copia = anonimizarProfundo({ entidades, nota: "Juan Perez vende" }, mapa);
assert.equal(copia.nota, "[[VENDEDOR_1]] vende");
assert.ok(!("valor_literal" in copia.entidades[0]));

// --- contieneDatosReales: sin falsos positivos por substring, detecta variantes de mayuscula ---
{
  const m2 = new Map([["[[DOMICILIO_1]]", "salta"], ["[[VENDEDOR_2]]", "Ana Diaz"]]);
  assert.ok(!contieneDatosReales("Conviene resaltar la clausula de posesion.", m2), "falso positivo: 'salta' dentro de 'resaltar'");
  assert.ok(contieneDatosReales("La escribana o el escribano esta en Salta.", m2), "no detecto 'Salta' con mayuscula distinta a la registrada");
  assert.ok(contieneDatosReales("Firma Ana Diaz ante mi.", m2), "no detecto el nombre real completo");
}

// --- Fase C ---
assert.equal(rehidratar("Vende [[VENDEDOR_1]] a [[COMPRADOR_1]] ([[DNI_2]])", mapa), "Vende Juan Perez a Maria Gomez (30.111.222)");

// --- Esquemas -> JSON Schema para salida estructurada ---
for (const [clave, esquema] of Object.entries(ESQUEMAS)) {
  const f = zodOutputFormat(esquema);
  assert.ok(f && typeof f === "object", `formato invalido para ${clave}`);
}

// --- DOCX ---
const buf = await construirDocx({
  mapa,
  plantilla: { clave: "compraventa_inmueble" },
  resultados: {
    redactor_minuta_escritura: { titulo: "COMPRAVENTA", texto_escritura: "Comparece [[VENDEDOR_1]], [[DNI_1]].\n\nVende a [[COMPRADOR_1]].", variables_faltantes: [{ placeholder: "{{PRECIO}}", descripcion: "Precio" }], notas_para_escribana: [] },
    analista_estudio_titulos: { tracto_sucesivo: [], continuidad_tracto: "continuo", riesgos: [], requisitos_previos: [], conclusion: "Sin observaciones." },
    validador_fiscal_registral: { certificados: [], impuestos_y_tasas: [], regimenes_informacion: [], inconsistencias: [], checklist_previo_firma: [], apto_para_firma: true, resumen: "OK" },
    extractor_antecedentes: null,
  },
});
assert.ok(buf.length > 1000, "docx vacio");

console.log("Smoke test OK: anonimizador, esquemas y docx funcionan.");
