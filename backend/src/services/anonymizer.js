/**
 * Anonimizacion de datos en transito.
 *
 * Fase A (regex, antes de cualquier llamada a Claude): DNI, CUIT/CUIL, correos,
 *   telefonos, matriculas y partidas. Son patrones deterministas que no requieren comprension del texto.
 * Fase B (tras el skill extractor): nombres, domicilios, datos catastrales y
 *   registrales identificados por el modelo. Se reemplazan por tokens [[ID]]
 *   y a partir de ahi ningun skill vuelve a ver un dato real.
 * Fase C (solo al exportar): rehidratacion token -> valor real, en memoria.
 */

export const TOKEN_REGEX = /\[\[([A-Z0-9_]+)\]\]/g;

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tokenUnico(mapa, base) {
  let id = base;
  let n = 2;
  while (mapa.has(`[[${id}]]`)) id = `${base}_${n++}`;
  return `[[${id}]]`;
}

const PATRONES_FASE_A = [
  // CUIT / CUIL: 20-12345678-3, 20123456783, 20 12345678 3
  { tipo: "CUIT", re: /\b(?:2[0-7]|3[0-4])[-\s]?\d{8}[-\s]?\d\b/g },
  // DNI / LC / LE precedidos de la sigla: DNI 12.345.678 / D.N.I. N° 12345678
  { tipo: "DNI", re: /\b(?:D\.?\s?N\.?\s?I\.?|L\.?\s?C\.?|L\.?\s?E\.?|documento(?:\s+nacional)?(?:\s+de\s+identidad)?)\s*(?:n[°ºo]?\.?\s*)?:?\s*(\d{1,2}\.?\d{3}\.?\d{3})\b/gi, grupo: 1 },
  { tipo: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  // Matricula registral: "Matrícula FR 6-12345/14", "matricula 55-98765/12", "Matrícula N° 12345"
  { tipo: "MATRICULA", re: /\b[Mm]atr[ií]cula(?:\s+(?:[Nn][°ºo]?\.?|registral|inmobiliaria))?\s*:?\s*((?:[A-Z]{1,3}\s?)?\d[\d./-]{2,}\d(?:\/\d{1,3})?)/g, grupo: 1 },
  // Partida inmobiliaria: "Partida 2.345.678", "Partida inmobiliaria 055-123456-7"
  { tipo: "PARTIDA", re: /\b[Pp]artida(?:\s+inmobiliaria)?\s*(?:[Nn][°ºo]?\.?)?\s*:?\s*(\d[\d./-]{3,}\d)/g, grupo: 1 },
  { tipo: "TEL", re: /(?:\+54\s?)?(?:\(?0?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}\b(?=\s*(?:\)|,|\.|;|$))/g },
];

/** Fase A. Devuelve el texto saneado y llena el mapa token -> valor. */
export function presanear(texto, mapa = new Map()) {
  let salida = texto;
  const contadores = {};
  // Valores ya registrados en el mapa (por ejemplo, en otro texto de la misma sesion) conservan su token.
  const inverso = new Map([...mapa.entries()].map(([token, real]) => [real, token]));
  for (const token of mapa.keys()) {
    const m = token.match(/^\[\[([A-Z]+)_(\d+)\]\]$/);
    if (m) contadores[m[1]] = Math.max(contadores[m[1]] || 0, Number(m[2]));
  }
  for (const { tipo, re, grupo } of PATRONES_FASE_A) {
    const vistos = new Map(inverso); // valor -> token (mismo valor, mismo token)
    salida = salida.replace(re, (match, ...args) => {
      const valor = grupo ? args[grupo - 1] : match;
      if (!valor) return match;
      if (!vistos.has(valor)) {
        contadores[tipo] = (contadores[tipo] || 0) + 1;
        const token = tokenUnico(mapa, `${tipo}_${contadores[tipo]}`);
        mapa.set(token, valor);
        vistos.set(valor, token);
      }
      return grupo ? match.replace(valor, vistos.get(valor)) : vistos.get(valor);
    });
  }
  return { texto: salida, mapa };
}

/**
 * Fase B. Recibe las entidades detectadas por el extractor:
 * [{ id_sugerido, valor_literal, variantes: [] }]
 * Reemplaza en el texto todas las formas por su token y devuelve el texto anonimizado.
 */
export function aplicarEntidades(texto, entidades, mapa) {
  const reemplazos = []; // { forma, token }
  for (const ent of entidades) {
    const literal = (ent.valor_literal || "").trim();
    if (!literal || literal.length < 2) continue;
    const base = (ent.id_sugerido || "ENTIDAD").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const token = tokenUnico(mapa, base);
    mapa.set(token, literal);
    ent.token = token;
    const formas = new Set([literal, ...(ent.variantes || []).map((v) => (v || "").trim()).filter((v) => v.length >= 3)]);
    for (const forma of formas) reemplazos.push({ forma, token });
  }
  // Las formas mas largas primero, para no partir un nombre completo por su apellido.
  reemplazos.sort((a, b) => b.forma.length - a.forma.length);
  let salida = texto;
  for (const { forma, token } of reemplazos) {
    salida = salida.replace(new RegExp(escapar(forma), "g"), token);
  }
  return salida;
}

/** Reemplaza en un texto todos los valores reales ya registrados en el mapa (mas largos primero). */
export function reemplazarTodo(texto, mapa) {
  if (typeof texto !== "string" || !texto) return texto;
  const pares = [...mapa.entries()].filter(([, real]) => real.length >= 2).sort((a, b) => b[1].length - a[1].length);
  let s = texto;
  for (const [token, real] of pares) if (s.includes(real)) s = s.split(real).join(token);
  return s;
}

/** Reemplaza dentro de cualquier estructura JSON las cadenas que contengan valores reales. */
export function anonimizarProfundo(obj, mapa) {
  const pares = [...mapa.entries()].sort((a, b) => b[1].length - a[1].length);
  const rec = (v) => {
    if (typeof v === "string") {
      let s = v;
      for (const [token, real] of pares) {
        if (real.length >= 2 && s.includes(real)) s = s.split(real).join(token);
      }
      return s;
    }
    if (Array.isArray(v)) return v.map(rec);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, val] of Object.entries(v)) {
        // Los campos que por definicion contienen el valor real se eliminan de la copia anonimizada.
        if (k === "valor_literal" || k === "variantes") continue;
        o[k] = rec(val);
      }
      return o;
    }
    return v;
  };
  return rec(obj);
}

/** Fase C. Solo en memoria, al construir el documento final. */
export function rehidratar(texto, mapa) {
  if (typeof texto !== "string") return texto;
  return texto.replace(TOKEN_REGEX, (m) => (mapa.has(m) ? mapa.get(m) : m));
}

export function rehidratarProfundo(obj, mapa) {
  if (typeof obj === "string") return rehidratar(obj, mapa);
  if (Array.isArray(obj)) return obj.map((x) => rehidratarProfundo(x, mapa));
  if (obj && typeof obj === "object") {
    const o = {};
    for (const [k, v] of Object.entries(obj)) o[k] = rehidratarProfundo(v, mapa);
    return o;
  }
  return obj;
}

/** Comprueba que un texto no contenga ninguno de los valores reales del mapa (defensa en profundidad). */
export function contieneDatosReales(texto, mapa) {
  if (typeof texto !== "string" || !texto) return false;
  for (const real of mapa.values()) {
    if (real.length < 4) continue;
    // Coincidencia por palabra/frase completa, sin distinguir mayusculas: evita
    // falsos positivos por substrings casuales (p. ej. "salta" dentro de
    // "resaltar") a la vez que detecta variantes de capitalizacion que un
    // simple .includes() dejaria pasar. El mapa puede crecer bastante en una
    // sesion con varias iteraciones, asi que las colisiones de substring dejan
    // de ser un caso raro si no se acotan los limites de palabra.
    let patron;
    try {
      patron = new RegExp(`(?<![\\p{L}\\p{N}])${escapar(real)}(?![\\p{L}\\p{N}])`, "iu");
    } catch {
      patron = null; // motor de regex sin soporte de lookbehind/unicode: cae al chequeo simple
    }
    if (patron ? patron.test(texto) : texto.toLowerCase().includes(real.toLowerCase())) return true;
  }
  return false;
}
