import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

function formatoFecha(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function sumarDiasHabiles(fechaOrigen, dias, jurisdiccion) {
  const inicio = new Date(fechaOrigen);
  if (Number.isNaN(inicio.getTime())) throw new AppError("DATOS_INVALIDOS", "fechaOrigen invalida.", 400);
  if (!Number.isInteger(dias) || dias < 0) throw new AppError("DATOS_INVALIDOS", "dias debe ser un entero positivo.", 400);

  const margen = new Date(inicio);
  margen.setDate(margen.getDate() + dias * 3);

  const [rows] = await pool.query(
    `SELECT fecha FROM feriados
      WHERE fecha BETWEEN ? AND ?
        AND (jurisdiccion IS NULL OR jurisdiccion = ?)`,
    [formatoFecha(inicio), formatoFecha(margen), jurisdiccion || null],
  );
  const feriados = new Set(rows.map((r) => formatoFecha(new Date(r.fecha))));

  let contados = 0;
  const actual = new Date(inicio);
  while (contados < dias) {
    actual.setDate(actual.getDate() + 1);
    const dow = actual.getDay();
    if (dow === 0 || dow === 6) continue;
    if (feriados.has(formatoFecha(actual))) continue;
    contados++;
  }
  return formatoFecha(actual);
}

export async function contarDiasHabiles(fechaDesde, fechaHasta, jurisdiccion) {
  const desde = new Date(fechaDesde);
  const hasta = new Date(fechaHasta);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return 0;
  if (hasta <= desde) return 0;

  const [rows] = await pool.query(
    `SELECT fecha FROM feriados
      WHERE fecha BETWEEN ? AND ?
        AND (jurisdiccion IS NULL OR jurisdiccion = ?)`,
    [formatoFecha(desde), formatoFecha(hasta), jurisdiccion || null],
  );
  const feriados = new Set(rows.map((r) => formatoFecha(new Date(r.fecha))));

  let contados = 0;
  const actual = new Date(desde);
  while (actual < hasta) {
    actual.setDate(actual.getDate() + 1);
    const dow = actual.getDay();
    if (dow === 0 || dow === 6) continue;
    if (feriados.has(formatoFecha(actual))) continue;
    contados++;
  }
  return contados;
}

export async function esFeriado(fecha, jurisdiccion) {
  const [[row]] = await pool.query(
    `SELECT 1 AS es FROM feriados
      WHERE fecha = ? AND (jurisdiccion IS NULL OR jurisdiccion = ?)
      LIMIT 1`,
    [fecha, jurisdiccion || null],
  );
  return Boolean(row);
}

export async function listar(anio, jurisdiccion) {
  const where = ["1=1"];
  const params = [];
  if (anio) {
    where.push("YEAR(fecha) = ?");
    params.push(Number(anio));
  }
  if (jurisdiccion) {
    where.push("(jurisdiccion IS NULL OR jurisdiccion = ?)");
    params.push(jurisdiccion);
  }
  const [rows] = await pool.query(
    `SELECT id, fecha, nombre, tipo, jurisdiccion FROM feriados WHERE ${where.join(" AND ")} ORDER BY fecha`,
    params,
  );
  return rows.map((r) => ({ id: r.id, fecha: r.fecha, nombre: r.nombre, tipo: r.tipo, jurisdiccion: r.jurisdiccion }));
}

export async function crear(datos) {
  if (!datos.fecha || !datos.nombre) throw new AppError("DATOS_INVALIDOS", "fecha y nombre son obligatorios.", 400);
  const [r] = await pool.query(
    `INSERT INTO feriados (fecha, nombre, tipo, jurisdiccion)
     VALUES (?, ?, ?, ?)`,
    [datos.fecha, datos.nombre.trim(), datos.tipo || "nacional", datos.jurisdiccion || null],
  );
  return { id: r.insertId, fecha: datos.fecha, nombre: datos.nombre.trim(), tipo: datos.tipo || "nacional", jurisdiccion: datos.jurisdiccion || null };
}

export async function borrar(id) {
  const [r] = await pool.query("DELETE FROM feriados WHERE id = ?", [id]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El feriado no existe.", 404);
}
