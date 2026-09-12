/**
 * Evaluación de conocimiento jurídico: envía cada pregunta de un examen de
 * opción múltiple a Claude y compara con la clave de respuestas.
 *
 * Uso:
 *   node scripts/evalExamen.js [ruta.json] [--modelo claude-opus-5] [--esfuerzo high] [--limite 10] [--paralelo 4]
 *   docker compose exec backend node scripts/evalExamen.js /app/ejemplos/examen-notarios-peru-2024-c.json
 *
 * Requiere ANTHROPIC_API_KEY. No usa la base de datos ni el pipeline de la app:
 * mide el criterio del modelo, no la anonimización. Guarda el detalle en
 * <ruta>.resultado.json y muestra un resumen por materia.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const args = process.argv.slice(2);
const opt = (nombre, def) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const posicionales = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const rutaExamen = posicionales[0] || "../ejemplos/examen-notarios-peru-2024-c.json";
const modelo = opt("modelo", process.env.CLAUDE_MODEL || "claude-opus-5");
const esfuerzo = opt("esfuerzo", "high");
const limite = Number(opt("limite", 0));
const paralelo = Number(opt("paralelo", 4));

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("Falta ANTHROPIC_API_KEY. Esta evaluacion necesita la API real: el modo simulado no puede responder preguntas de derecho.");
  process.exit(2);
}

const examen = JSON.parse(fs.readFileSync(path.resolve(rutaExamen), "utf8"));
const preguntas = limite > 0 ? examen.preguntas.slice(0, limite) : examen.preguntas;

const Respuesta = z.object({
  respuesta: z.enum(["A", "B", "C", "D"]),
  confianza: z.enum(["alta", "media", "baja"]),
  justificacion: z.string(),
});

const SYSTEM = `Sos un jurista experto en derecho ${examen.pais || "peruano"}: notarial, registral, civil, procesal civil, constitucional, laboral, tributario, societario, administrativo, minero y penal. Vas a responder preguntas de un examen oficial de acceso a la función notarial, de opción múltiple con una sola respuesta correcta. Leé con cuidado si se pide la alternativa correcta o la INCORRECTA. Elegí exactamente una letra y justificá en dos o tres oraciones citando la norma aplicable cuando la conozcas.`;

const client = new Anthropic({ timeout: 10 * 60 * 1000 });

async function responder(p) {
  const texto = `Pregunta ${p.n} (${p.codigo}):\n${p.enunciado}\n\nOpciones:\n${Object.entries(p.opciones)
    .map(([l, t]) => `${l}. ${t}`)
    .join("\n")}`;
  const stream = client.messages.stream({
    model: modelo,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: texto }],
    thinking: { type: "adaptive" },
    output_config: { effort: esfuerzo, format: zodOutputFormat(Respuesta) },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") return { error: "refusal" };
  const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = Respuesta.safeParse(JSON.parse(raw));
  if (!parsed.success) return { error: "esquema" };
  return { ...parsed.data, usage: { in: msg.usage.input_tokens, out: msg.usage.output_tokens, cache: msg.usage.cache_read_input_tokens } };
}

const resultados = [];
let indice = 0;
async function trabajador() {
  while (indice < preguntas.length) {
    const p = preguntas[indice++];
    const t0 = Date.now();
    let r;
    try {
      r = await responder(p);
    } catch (e) {
      r = { error: e.constructor?.name || "error", detalle: e.message };
    }
    const acierto = r.respuesta === p.correcta;
    resultados.push({ n: p.n, codigo: p.codigo, area: p.codigo.split(".")[0], esperada: p.correcta, obtenida: r.respuesta ?? null, acierto, confianza: r.confianza ?? null, justificacion: r.justificacion ?? null, error: r.error ?? null, ms: Date.now() - t0, usage: r.usage ?? null });
    console.log(`${acierto ? "✔" : "✘"} ${String(p.n).padStart(2)} ${p.codigo.padEnd(8)} esperada ${p.correcta} · obtenida ${r.respuesta ?? "-"}${r.error ? " (" + r.error + ")" : ""}`);
  }
}
await Promise.all(Array.from({ length: Math.min(paralelo, preguntas.length) }, trabajador));

resultados.sort((a, b) => a.n - b.n);
const total = resultados.length;
const aciertos = resultados.filter((r) => r.acierto).length;
const porArea = {};
for (const r of resultados) {
  porArea[r.area] ??= { total: 0, aciertos: 0 };
  porArea[r.area].total++;
  if (r.acierto) porArea[r.area].aciertos++;
}
const tokensIn = resultados.reduce((s, r) => s + (r.usage?.in || 0) + (r.usage?.cache || 0), 0);
const tokensOut = resultados.reduce((s, r) => s + (r.usage?.out || 0), 0);

console.log("\n=== RESUMEN ===");
console.log(`Modelo: ${modelo} · esfuerzo: ${esfuerzo}`);
console.log(`Aciertos: ${aciertos}/${total} (${((100 * aciertos) / total).toFixed(1)}%)`);
console.log("Por materia:");
for (const [area, v] of Object.entries(porArea).sort()) {
  console.log(`  ${area.padEnd(3)} ${(examen.areas?.[area] || "").padEnd(38)} ${v.aciertos}/${v.total}`);
}
console.log(`Tokens: ${tokensIn} entrada · ${tokensOut} salida`);

let salida = rutaExamen.replace(/\.json$/, ".resultado.json");
const informe = JSON.stringify({ modelo, esfuerzo, fecha: new Date().toISOString(), aciertos, total, porArea, resultados }, null, 2);
try {
  fs.writeFileSync(salida, informe);
} catch {
  salida = path.join(process.cwd(), path.basename(salida)); // p. ej. volumen de solo lectura en Docker
  fs.writeFileSync(salida, informe);
}
console.log(`Detalle guardado en ${salida}`);
