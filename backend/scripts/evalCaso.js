/**
 * Corre un caso práctico por el pipeline real de la app (vía HTTP) y verifica
 * qué hallazgos esperados aparecen en el estudio de títulos y la validación.
 *
 * Uso:
 *   node scripts/evalCaso.js [--base http://localhost:8080] [--docx ../ejemplos/caso-practico-caba.docx] [--esperado ../ejemplos/caso-practico-caba.esperado.json]
 *
 * Funciona en modo simulado (para verificar mecánica) y en modo real (para
 * medir calidad). En modo simulado la mayoría de los hallazgos no se detectan:
 * eso es lo esperado, las salidas son fijas.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const base = opt("base", "http://localhost:8080");
const rutaDocx = path.resolve(opt("docx", "../ejemplos/caso-practico-caba.docx"));
const rutaEsperado = path.resolve(opt("esperado", "../ejemplos/caso-practico-caba.esperado.json"));
const esperado = JSON.parse(fs.readFileSync(rutaEsperado, "utf8"));

const salud = await (await fetch(`${base}/api/salud`)).json();
console.log(`Servidor ${base} · modo Claude: ${salud.modo}`);

const fd = new FormData();
fd.append("archivo", new Blob([fs.readFileSync(rutaDocx)]), path.basename(rutaDocx));
const creada = await (await fetch(`${base}/api/sesiones`, { method: "POST", body: fd })).json();
if (!creada.sesionId) {
  console.error("No se pudo crear la sesion:", creada);
  process.exit(1);
}
console.log(`Sesion ${creada.sesionId} · datos presaneados por regex: ${creada.entidadesPresaneadas}`);

// Esperar por polling hasta que termine.
let estado;
const t0 = Date.now();
for (;;) {
  estado = await (await fetch(`${base}/api/sesiones/${creada.sesionId}`)).json();
  const enCurso = estado.skills?.find((s) => s.estado === "en_curso");
  process.stdout.write(`\r  ${Math.round((Date.now() - t0) / 1000)} s · ${enCurso ? enCurso.nombre + ": " + (enCurso.mensaje || "") : estado.estado}          `);
  if (estado.estado !== "en_curso") break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log();
if (estado.estado !== "completada") {
  console.error("Pipeline fallido:", estado.error);
  process.exit(1);
}

const r = estado.resultados;
const ext = r.extractor_antecedentes;
const est = r.analista_estudio_titulos;
const val = r.validador_fiscal_registral;
const red = r.redactor_minuta_escritura;

console.log(`\nActo detectado: ${ext.resumen.tipo_acto} (esperado ${esperado.tipo_acto}) ${ext.resumen.tipo_acto === esperado.tipo_acto ? "✔" : "✘"}`);
console.log(`Entidades anonimizadas: ${estado.entidadesAnonimizadas} · tracto: ${est.continuidad_tracto} · riesgos: ${est.riesgos.length} · certificados: ${val.certificados.length} · apto para firma: ${val.apto_para_firma}`);

// Texto donde buscar: riesgos + requisitos + conclusion + certificados + impuestos + inconsistencias + checklist + minuta.
const corpus = [
  ...est.riesgos.map((x) => `${x.categoria} ${x.descripcion} ${x.fundamento_legal || ""} ${x.recomendacion}`),
  ...est.requisitos_previos,
  est.conclusion,
  ...val.certificados.map((c) => `${c.nombre} ${c.estado} ${c.detalle || ""} ${c.plazo_legal || ""}`),
  ...val.impuestos_y_tasas.map((i) => `${i.concepto} ${i.aplica} ${i.alicuota_o_formula || ""} ${i.observacion || ""}`),
  ...val.regimenes_informacion.map((x) => `${x.nombre} ${x.observacion || ""}`),
  ...val.inconsistencias.map((x) => x.descripcion),
  ...val.checklist_previo_firma.map((x) => x.accion),
  red.texto_escritura,
  ...red.notas_para_escribana,
]
  .join("\n")
  .toLowerCase();

let detectados = 0;
console.log("\nHallazgos esperados:");
for (const h of esperado.hallazgos) {
  const hits = h.claves.filter((k) => corpus.includes(k.toLowerCase()));
  const ok = hits.length >= Math.min(2, h.claves.length) || (hits.length >= 1 && h.claves.length <= 2);
  if (ok) detectados++;
  console.log(`  ${ok ? "✔" : "✘"} ${h.id.padEnd(22)} ${h.descripcion.slice(0, 90)}${hits.length ? `  [${hits.join(", ")}]` : ""}`);
}
console.log(`\nDetectados: ${detectados}/${esperado.hallazgos.length}`);

// Verificación de privacidad: nada del documento original debe aparecer en la respuesta al navegador.
const original = fs.readFileSync(rutaDocx);
const pii = ["Castellanos", "Ibáñez", "Ibanez", "Montenegro", "Zuloaga", "12.876.543", "35.222.111", "20-12876543-4", "FR 6-12345/14", "Rivadavia 5680", "jibanez@"];
const respuesta = JSON.stringify(estado);
const fugas = pii.filter((p) => respuesta.includes(p));
console.log(`Privacidad: ${fugas.length === 0 ? "✔ sin datos reales en la respuesta al navegador" : "✘ FUGA: " + fugas.join(", ")} (documento de ${original.length} bytes)`);

const salida = rutaEsperado.replace(/\.esperado\.json$/, `.resultado-${salud.modo}.json`);
fs.writeFileSync(salida, JSON.stringify({ modo: salud.modo, fecha: new Date().toISOString(), detectados, total: esperado.hallazgos.length, fugas, resultados: r }, null, 2));
console.log(`Detalle guardado en ${salida}`);
await fetch(`${base}/api/sesiones/${creada.sesionId}`, { method: "DELETE" });
