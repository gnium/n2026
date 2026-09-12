/**
 * Evaluación con consultas notariales argentinas de respuesta abierta.
 *
 * Para cada consulta: (1) Claude responde como asesor notarial argentino;
 * (2) un segundo llamado actúa de juez y compara con el dictamen esperado,
 * calificando 2 = coincide en lo sustancial, 1 = parcial, 0 = contradice u omite.
 * El juez recibe la advertencia de equivalencias CC (Vélez) -> CCyC.
 *
 * Uso:
 *   node scripts/evalConsultas.js [ruta.json] [--modelo claude-opus-5] [--esfuerzo high] [--limite 5] [--paralelo 3]
 *   docker compose exec backend node scripts/evalConsultas.js /app/ejemplos/consultas-notariales-pba-can121.json
 *
 * Requiere ANTHROPIC_API_KEY.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const posicionales = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const ruta = posicionales[0] || "../ejemplos/consultas-notariales-pba-can121.json";
const modelo = opt("modelo", process.env.CLAUDE_MODEL || "claude-opus-5");
const esfuerzo = opt("esfuerzo", "high");
const limite = Number(opt("limite", 0));
const paralelo = Number(opt("paralelo", 3));

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("Falta ANTHROPIC_API_KEY. Esta evaluacion necesita la API real.");
  process.exit(2);
}

const set = JSON.parse(fs.readFileSync(path.resolve(ruta), "utf8"));
const consultas = limite > 0 ? set.consultas.slice(0, limite) : set.consultas;
const client = new Anthropic({ timeout: 10 * 60 * 1000 });

const SYSTEM_ASESOR = `Sos asesor notarial del Colegio de Escribanos de la Provincia de Buenos Aires, Argentina. Un escribano te plantea una consulta de práctica notarial. Respondé como un dictamen breve (no vinculante): qué corresponde hacer, con fundamento en el Código Civil y Comercial de la Nación, la ley 17.801, el decreto ley 9020/78, las DTR del Registro de la Propiedad Inmueble de la Provincia de Buenos Aires y la doctrina notarial. Si el consultante razona sobre el Código Civil de Vélez, indicá la norma equivalente vigente. Sé concreto: dos a cinco oraciones.`;

const Dictamen = z.object({ dictamen: z.string(), normas_citadas: z.array(z.string()) });

const SYSTEM_JUEZ = `Sos un jurado de concurso notarial argentino. Vas a comparar la respuesta de un candidato con el dictamen de referencia de la Asesoría Notarial del Colegio de Escribanos de la Provincia de Buenos Aires. Calificá con 2 si el candidato llega a la misma conclusión práctica y fundamento sustancial (aunque cite la norma equivalente del CCyC en lugar del Código de Vélez); 1 si acierta parcialmente u omite un punto relevante; 0 si contradice la conclusión o responde otra cosa. Sé exigente con la conclusión práctica y tolerante con diferencias de estilo o de numeración de artículos equivalentes.\n\n${set.advertencia || ""}`;

const Veredicto = z.object({ puntaje: z.enum(["0", "1", "2"]), motivo: z.string() });

async function llamar(system, texto, esquema, maxTokens) {
  const stream = client.messages.stream({
    model: modelo,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: texto }],
    thinking: { type: "adaptive" },
    output_config: { effort: esfuerzo, format: zodOutputFormat(esquema) },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { datos: esquema.parse(JSON.parse(raw)), uso: msg.usage };
}

const resultados = [];
let i = 0;
async function trabajador() {
  while (i < consultas.length) {
    const c = consultas[i++];
    const t0 = Date.now();
    try {
      const { datos: resp, uso: u1 } = await llamar(SYSTEM_ASESOR, `CONSULTA (${c.id} - ${c.tema}):\n${c.consulta}`, Dictamen, 6000);
      const { datos: ver, uso: u2 } = await llamar(
        SYSTEM_JUEZ,
        `CONSULTA:\n${c.consulta}\n\nDICTAMEN DE REFERENCIA (${c.autor}, 2015):\n${c.respuesta_esperada}\n\nPUNTOS CLAVE ESPERADOS: ${(c.claves || []).join("; ")}\n\nRESPUESTA DEL CANDIDATO:\n${resp.dictamen}\nNormas citadas: ${resp.normas_citadas.join(", ")}`,
        Veredicto,
        3000,
      );
      const puntaje = Number(ver.puntaje);
      resultados.push({ id: c.id, tema: c.tema, puntaje, motivo: ver.motivo, respuesta: resp.dictamen, normas: resp.normas_citadas, ms: Date.now() - t0, tokens: { in: (u1.input_tokens || 0) + (u2.input_tokens || 0) + (u1.cache_read_input_tokens || 0) + (u2.cache_read_input_tokens || 0), out: (u1.output_tokens || 0) + (u2.output_tokens || 0) } });
      console.log(`${["✘", "◐", "✔"][puntaje]} ${c.id.padEnd(5)} ${c.tema.slice(0, 60).padEnd(60)} ${puntaje}/2`);
    } catch (e) {
      resultados.push({ id: c.id, tema: c.tema, puntaje: 0, error: e.message, ms: Date.now() - t0 });
      console.log(`✘ ${c.id.padEnd(5)} ${c.tema.slice(0, 60).padEnd(60)} error: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(paralelo, consultas.length) }, trabajador));

resultados.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const total = resultados.length * 2;
const obtenido = resultados.reduce((s, r) => s + r.puntaje, 0);
const tokensIn = resultados.reduce((s, r) => s + (r.tokens?.in || 0), 0);
const tokensOut = resultados.reduce((s, r) => s + (r.tokens?.out || 0), 0);
console.log("\n=== RESUMEN ===");
console.log(`Modelo: ${modelo} · esfuerzo: ${esfuerzo}`);
console.log(`Puntaje: ${obtenido}/${total} (${((100 * obtenido) / total).toFixed(1)}%) · coincide: ${resultados.filter((r) => r.puntaje === 2).length} · parcial: ${resultados.filter((r) => r.puntaje === 1).length} · falla: ${resultados.filter((r) => r.puntaje === 0).length}`);
console.log(`Tokens: ${tokensIn} entrada · ${tokensOut} salida`);

let salida = ruta.replace(/\.json$/, ".resultado.json");
const informe = JSON.stringify({ modelo, esfuerzo, fecha: new Date().toISOString(), obtenido, total, resultados }, null, 2);
try {
  fs.writeFileSync(salida, informe);
} catch {
  salida = path.join(process.cwd(), path.basename(salida));
  fs.writeFileSync(salida, informe);
}
console.log(`Detalle guardado en ${salida}`);
