import { pool } from "../config/db.js";
import { AppError } from "../utils/errores.js";

export async function listar(jurisdiccion, tipoActo) {
  const [rows] = await pool.query(
    `SELECT * FROM aranceles
      WHERE jurisdiccion = ? AND activo = 1
        AND (tipo_acto IS NULL OR tipo_acto = ?)
        AND (vigente_hasta IS NULL OR vigente_hasta >= CURDATE())
      ORDER BY orden`,
    [jurisdiccion, tipoActo || null],
  );
  return rows.map(filaAVista);
}

export async function calcular(jurisdiccion, tipoActo, montoOperacion, { condicionFiscal } = {}) {
  if (!jurisdiccion) throw new AppError("DATOS_INVALIDOS", "Falta la jurisdicción.", 400);
  if (!tipoActo) throw new AppError("DATOS_INVALIDOS", "Falta el tipo de acto.", 400);
  if (!Number.isFinite(montoOperacion) || montoOperacion < 0) throw new AppError("DATOS_INVALIDOS", "El monto de la operación debe ser un número positivo.", 400);

  let aranceles = await listar(jurisdiccion, tipoActo);
  if (!aranceles.length) throw new AppError("SIN_ARANCELES", `No hay aranceles configurados para ${jurisdiccion} / ${tipoActo}.`, 404);

  if (condicionFiscal && condicionFiscal !== "responsable_inscripto") {
    aranceles = aranceles.filter((a) => !a.categoria.startsWith("iva"));
  }

  let honorarios = 0;
  const items = [];

  for (const a of aranceles) {
    if (a.base === "honorarios") continue;
    const monto = calcularMonto(a, montoOperacion);
    if (a.categoria === "honorarios") honorarios = monto;
    items.push({ concepto: a.nombre, monto: redondear(monto), categoria: a.categoria, quienPaga: a.quienPaga, obligatorio: a.obligatorio, arancelId: a.id });
  }

  for (const a of aranceles) {
    if (a.base !== "honorarios") continue;
    const monto = calcularMonto(a, honorarios);
    items.push({ concepto: a.nombre, monto: redondear(monto), categoria: a.categoria, quienPaga: a.quienPaga, obligatorio: a.obligatorio, arancelId: a.id });
  }

  items.sort((a, b) => {
    const oa = aranceles.find((x) => x.id === a.arancelId)?.orden ?? 999;
    const ob = aranceles.find((x) => x.id === b.arancelId)?.orden ?? 999;
    return oa - ob;
  });

  const totalComprador = items.reduce((s, i) => {
    if (i.quienPaga === "ambos") return s + i.monto / 2;
    if (["comprador", "cliente"].includes(i.quienPaga)) return s + i.monto;
    return s;
  }, 0);
  const totalVendedor = items.reduce((s, i) => {
    if (i.quienPaga === "ambos") return s + i.monto / 2;
    if (i.quienPaga === "vendedor") return s + i.monto;
    return s;
  }, 0);
  const total = items.reduce((s, i) => s + i.monto, 0);

  return { items, totalComprador: redondear(totalComprador), totalVendedor: redondear(totalVendedor), total: redondear(total) };
}

function calcularMonto(arancel, base) {
  switch (arancel.tipoCalculo) {
    case "porcentaje":
      return base * (arancel.valor / 100);
    case "fijo":
      return arancel.valor;
    case "por_unidad":
      return arancel.valor;
    case "escala": {
      const escala = arancel.escala;
      if (!Array.isArray(escala) || !escala.length) return 0;
      for (const tramo of escala) {
        if (tramo.hasta === null || base <= tramo.hasta) {
          return base * (tramo.valor / 100);
        }
      }
      return base * (escala[escala.length - 1].valor / 100);
    }
    default:
      return 0;
  }
}

function redondear(n) {
  return Math.round(n * 100) / 100;
}

function filaAVista(r) {
  return {
    id: r.id,
    jurisdiccion: r.jurisdiccion,
    categoria: r.categoria,
    tipoActo: r.tipo_acto,
    nombre: r.nombre,
    tipoCalculo: r.tipo_calculo,
    valor: r.valor != null ? Number(r.valor) : null,
    escala: typeof r.escala === "string" ? JSON.parse(r.escala) : r.escala,
    base: r.base,
    quienPaga: r.quien_paga,
    obligatorio: Boolean(r.obligatorio),
    orden: r.orden,
    activo: Boolean(r.activo),
    vigenteDesde: r.vigente_desde,
    vigenteHasta: r.vigente_hasta,
    notas: r.notas,
  };
}

export async function obtener(id) {
  const [[r]] = await pool.query("SELECT * FROM aranceles WHERE id = ?", [id]);
  if (!r) throw new AppError("NO_ENCONTRADO", "El arancel no existe.", 404);
  return filaAVista(r);
}

export async function actualizar(id, datos) {
  const campos = {};
  if (datos.nombre !== undefined) campos.nombre = String(datos.nombre).trim().slice(0, 160);
  if (datos.valor !== undefined) campos.valor = datos.valor;
  if (datos.escala !== undefined) campos.escala = datos.escala ? JSON.stringify(datos.escala) : null;
  if (datos.activo !== undefined) campos.activo = datos.activo ? 1 : 0;
  if (datos.quienPaga !== undefined) campos.quien_paga = datos.quienPaga;
  if (datos.notas !== undefined) campos.notas = datos.notas?.slice(0, 300) || null;
  if (!Object.keys(campos).length) throw new AppError("DATOS_INVALIDOS", "No hay campos para actualizar.", 400);

  const sets = Object.keys(campos).map((k) => `${k} = ?`).join(", ");
  const [r] = await pool.query(`UPDATE aranceles SET ${sets} WHERE id = ?`, [...Object.values(campos), id]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El arancel no existe.", 404);
  return obtener(id);
}

export async function crear(datos) {
  const { jurisdiccion, categoria, tipoActo, nombre, tipoCalculo, valor, escala, base, quienPaga, obligatorio, orden, notas } = datos;
  if (!jurisdiccion || !categoria || !nombre || !tipoCalculo) throw new AppError("DATOS_INVALIDOS", "Faltan campos obligatorios.", 400);
  const [r] = await pool.query(
    `INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, escala, base, quien_paga, obligatorio, orden, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [jurisdiccion, categoria, tipoActo || null, nombre, tipoCalculo, valor ?? null, escala ? JSON.stringify(escala) : null, base || "monto_operacion", quienPaga || "cliente", obligatorio ? 1 : 0, orden || 0, notas?.slice(0, 300) || null],
  );
  return obtener(r.insertId);
}
