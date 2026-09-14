/**
 * Divide un archivo .sql en sentencias sueltas.
 *
 * Por que hace falta: `DELIMITER $$` no es una sentencia de MySQL sino una
 * directiva del programa de consola `mysql`. El servidor no la entiende. Los
 * archivos de database/ la usan para declarar procedimientos, cuyo cuerpo tiene
 * puntos y coma adentro, asi que mandarlos crudos por el driver falla con un
 * error de sintaxis. Este modulo interpreta la directiva igual que el cliente y
 * entrega las sentencias una por una.
 *
 * Reconoce: cadenas con comillas simples y dobles (con barra invertida y con la
 * comilla duplicada), identificadores entre acentos graves, comentarios `--`,
 * `#` y de bloque, y el cambio de delimitador.
 */

/** @param {string} sql @returns {string[]} sentencias sin el delimitador final */
export function dividirSentencias(sql) {
  const sentencias = [];
  const texto = sql.replace(/\r\n/g, "\n");
  const n = texto.length;
  let delimitador = ";";
  let actual = "";
  let i = 0;

  const guardar = () => {
    const limpia = actual.trim();
    if (limpia) sentencias.push(limpia);
    actual = "";
  };

  while (i < n) {
    const c = texto[i];
    const enInicioDeLinea = i === 0 || texto[i - 1] === "\n";

    // Directiva del cliente: cambia el delimitador y no se envia al servidor.
    if (enInicioDeLinea && /^delimiter[ \t]+\S+/i.test(texto.slice(i))) {
      guardar();
      const m = texto.slice(i).match(/^delimiter[ \t]+(\S+)[^\n]*\n?/i);
      delimitador = m[1];
      i += m[0].length;
      continue;
    }

    // Comentario de linea: `--` exige espacio o fin de linea despues, como MySQL.
    if (c === "-" && texto[i + 1] === "-" && (i + 2 >= n || " \t\n".includes(texto[i + 2]))) {
      const fin = texto.indexOf("\n", i);
      i = fin === -1 ? n : fin + 1;
      actual += "\n";
      continue;
    }
    if (c === "#") {
      const fin = texto.indexOf("\n", i);
      i = fin === -1 ? n : fin + 1;
      actual += "\n";
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      i = fin === -1 ? n : fin + 2;
      actual += " ";
      continue;
    }

    // Cadenas e identificadores: adentro, el delimitador no separa nada.
    if (c === "'" || c === '"' || c === "`") {
      const cierre = c;
      actual += c;
      i++;
      while (i < n) {
        const d = texto[i];
        if (d === "\\" && cierre !== "`" && i + 1 < n) {
          actual += d + texto[i + 1]; // barra invertida: escapa el siguiente
          i += 2;
          continue;
        }
        if (d === cierre) {
          if (texto[i + 1] === cierre) {
            actual += d + d; // comilla duplicada: es un caracter, no el cierre
            i += 2;
            continue;
          }
          actual += d;
          i++;
          break;
        }
        actual += d;
        i++;
      }
      continue;
    }

    if (texto.startsWith(delimitador, i)) {
      guardar();
      i += delimitador.length;
      continue;
    }

    actual += c;
    i++;
  }

  guardar();
  return sentencias;
}
