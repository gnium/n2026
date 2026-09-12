/**
 * UIF (Res. UIF 242/2023 para escribanos): legajo por cliente, ficha por
 * expediente, eventos de cumplimiento y alertas. Parametros (SMVM, umbral en
 * SMVM) editables: son orientativos y se verifican contra la resolucion vigente.
 * Datos sensibles del legajo cifrados (contexto "uif"); riesgo y fechas en claro.
 */
import { pool } from "../config/db.js";
import { cifrar, descifrar } from "../utils/cifrado.js";
import { AppError } from "../utils/errores.js";
import { hoyLocal, esFechaValida, texto } from "../utils/fechas.js";

export const NIVELES = new Set(["bajo", "medio", "alto"]);
export const DILIGENCIAS = new Set(["simplificada", "media", "reforzada"]);
export const ACTIVIDADES = new Set(["no_alcanzada", "compraventa_inmueble", "persona_juridica", "estructura_juridica", "compraventa_negocio", "otra"]);
export const TIPOS_EVENTO = new Set(["ros", "reporte_mensual", "reporte_anual", "autoevaluacion", "revision_externa", "capacitacion", "otro"]);
const ESTADOS_RECAUDO = new Set(["pendiente", "hecho", "no_aplica"]);
/** Anios entre actualizaciones del legajo segun diligencia (orientativo: media 3, reforzada 1). */
const ANIOS_REVISION = { simplificada: 5, media: 3, reforzada: 1 };
const CAMPOS_CIFRADOS = ["actividad", "origenFondos", "pepDetalle", "nacionalidad", "observaciones"];

const hoy = () => hoyLocal();
const sumarAnios = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
};

// ---------- parametros ----------
export async function parametros() {
  const [rows] = await pool.query("SELECT clave, valor, actualizado_en FROM configuracion WHERE clave IN ('uif_smvm_ars','uif_umbral_smvm')");
  const m = Object.fromEntries(rows.map((r) => [r.clave, r]));
  return {
    smvmArs: Number(m.uif_smvm_ars?.valor || 0),
    umbralSmvm: Number(m.uif_umbral_smvm?.valor || 700),
    umbralArs: Number(m.uif_smvm_ars?.valor || 0) * Number(m.uif_umbral_smvm?.valor || 700),
    actualizadoEn: m.uif_smvm_ars?.actualizado_en || null,
  };
}

export async function guardarParametros({ smvmArs, umbralSmvm }) {
  const s = Number(smvmArs);
  const u = Number(umbralSmvm);
  if (!(s >= 0) || !(u > 0)) throw new AppError("DATOS_INVALIDOS", "SMVM y umbral deben ser numeros positivos.", 400);
  await pool.query("INSERT INTO configuracion (clave, valor, descripcion) VALUES ('uif_smvm_ars', ?, 'Salario minimo vital y movil vigente en pesos') ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [String(s)]);
  await pool.query("INSERT INTO configuracion (clave, valor, descripcion) VALUES ('uif_umbral_smvm', ?, 'Umbral en SMVM para compraventa de inmuebles') ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [String(u)]);
  return parametros();
}

// ---------- legajo por cliente ----------
async function exigirCliente(usuarioId, clienteId) {
  const [[c]] = await pool.query("SELECT id, nombre, tipo FROM clientes WHERE id = ? AND usuario_id = ?", [clienteId, usuarioId]);
  if (!c) throw new AppError("NO_ENCONTRADO", "El cliente no existe.", 404);
  return c;
}

function legajoAVista(r, cliente) {
  let datos = {};
  let legible = true;
  if (r?.datos_cifrado) {
    const t = descifrar(r.datos_cifrado, "uif");
    if (t === null) legible = false;
    else {
      try {
        datos = JSON.parse(t);
      } catch {
        legible = false;
      }
    }
  }
  const vencido = Boolean(r?.proxima_revision && String(r.proxima_revision) < hoy());
  return {
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    clienteTipo: cliente.tipo,
    existe: Boolean(r),
    nivelRiesgo: r?.nivel_riesgo || "bajo",
    diligencia: r?.diligencia || "simplificada",
    esPep: Boolean(r?.es_pep),
    jurisdiccionRiesgo: Boolean(r?.jurisdiccion_riesgo),
    actividad: datos.actividad || "",
    origenFondos: datos.origenFondos || "",
    pepDetalle: datos.pepDetalle || "",
    nacionalidad: datos.nacionalidad || "",
    observaciones: datos.observaciones || "",
    beneficiariosFinales: Array.isArray(datos.beneficiariosFinales) ? datos.beneficiariosFinales : [],
    documentacion: r?.documentacion ? (typeof r.documentacion === "string" ? JSON.parse(r.documentacion) : r.documentacion) : [],
    datosLegibles: legible,
    actualizadoEn: r?.actualizado_en || null,
    proximaRevision: r?.proxima_revision || null,
    vencido,
  };
}

export async function obtenerLegajo(usuarioId, clienteId) {
  const cliente = await exigirCliente(usuarioId, clienteId);
  const [[r]] = await pool.query("SELECT * FROM uif_legajos WHERE cliente_id = ? AND usuario_id = ?", [clienteId, usuarioId]);
  return legajoAVista(r, cliente);
}

export async function guardarLegajo(usuarioId, clienteId, datos) {
  const cliente = await exigirCliente(usuarioId, clienteId);
  if (datos.nivelRiesgo && !NIVELES.has(datos.nivelRiesgo)) throw new AppError("DATOS_INVALIDOS", "nivelRiesgo debe ser bajo, medio o alto.", 400);
  if (datos.diligencia && !DILIGENCIAS.has(datos.diligencia)) throw new AppError("DATOS_INVALIDOS", "diligencia debe ser simplificada, media o reforzada.", 400);
  const cifrados = {};
  for (const k of CAMPOS_CIFRADOS) if (typeof datos[k] === "string" && datos[k].trim()) cifrados[k] = datos[k].trim().slice(0, 500);
  if (Array.isArray(datos.beneficiariosFinales)) {
    cifrados.beneficiariosFinales = datos.beneficiariosFinales
      .map((b) => ({ nombre: String(b?.nombre || "").trim().slice(0, 200), documento: String(b?.documento || "").trim().slice(0, 40), porcentaje: Number(b?.porcentaje) || null }))
      .filter((b) => b.nombre);
  }
  const documentacion = Array.isArray(datos.documentacion)
    ? datos.documentacion.map((d) => ({ item: String(d?.item || "").trim().slice(0, 200), presentado: Boolean(d?.presentado), fecha: d?.fecha || null })).filter((d) => d.item)
    : [];
  const diligencia = datos.diligencia || "simplificada";
  if (datos.actualizadoEn && !esFechaValida(String(datos.actualizadoEn))) throw new AppError("DATOS_INVALIDOS", "actualizadoEn invalido (AAAA-MM-DD).", 400);
  const actualizadoEn = datos.actualizadoEn || hoy();
  const proxima = sumarAnios(actualizadoEn, ANIOS_REVISION[diligencia]);
  await pool.query(
    `INSERT INTO uif_legajos (cliente_id, usuario_id, nivel_riesgo, diligencia, es_pep, jurisdiccion_riesgo, datos_cifrado, documentacion, actualizado_en, proxima_revision)
     VALUES (:clienteId, :usuarioId, :nivel, :diligencia, :pep, :jur, :datos, :doc, :actualizadoEn, :proxima)
     ON DUPLICATE KEY UPDATE nivel_riesgo = VALUES(nivel_riesgo), diligencia = VALUES(diligencia), es_pep = VALUES(es_pep), jurisdiccion_riesgo = VALUES(jurisdiccion_riesgo),
       datos_cifrado = VALUES(datos_cifrado), documentacion = VALUES(documentacion), actualizado_en = VALUES(actualizado_en), proxima_revision = VALUES(proxima_revision)`,
    {
      clienteId: cliente.id,
      usuarioId,
      nivel: datos.nivelRiesgo || "bajo",
      diligencia,
      pep: datos.esPep ? 1 : 0,
      jur: datos.jurisdiccionRiesgo ? 1 : 0,
      datos: Object.keys(cifrados).length ? cifrar(JSON.stringify(cifrados), "uif") : null,
      doc: JSON.stringify(documentacion),
      actualizadoEn,
      proxima,
    },
  );
  return obtenerLegajo(usuarioId, clienteId);
}

// ---------- ficha por expediente ----------
async function exigirExpediente(usuarioId, expedienteId) {
  const [[e]] = await pool.query("SELECT id, caratula, tipo_acto FROM expedientes WHERE id = ? AND usuario_id = ?", [expedienteId, usuarioId]);
  if (!e) throw new AppError("NO_ENCONTRADO", "El expediente no existe.", 404);
  return e;
}

function recaudosDe(r) {
  const v = r?.recaudos;
  if (!v) return [];
  return typeof v === "string" ? JSON.parse(v) : v;
}

function fichaAVista(r, expediente, params) {
  const recaudos = recaudosDe(r);
  return {
    expedienteId: expediente.id,
    caratula: expediente.caratula,
    tipoActo: expediente.tipo_acto,
    existe: Boolean(r),
    actividad: r?.actividad || "no_alcanzada",
    monto: r?.monto != null ? Number(r.monto) : null,
    moneda: r?.moneda || null,
    superaUmbral: Boolean(r?.supera_umbral),
    umbralArs: params.umbralArs,
    recaudos,
    pendientes: recaudos.filter((x) => x.estado === "pendiente").length,
    nivelDiligenciaSugerido: r?.nivel_diligencia_sugerido || null,
    alertas: r?.alertas ? (typeof r.alertas === "string" ? JSON.parse(r.alertas) : r.alertas) : [],
    generadoEn: r?.generado_en || null,
    estado: r?.estado || "pendiente",
    notas: r?.notas || "",
  };
}

export async function obtenerUif(usuarioId, expedienteId) {
  const e = await exigirExpediente(usuarioId, expedienteId);
  const [[r]] = await pool.query("SELECT * FROM uif_expedientes WHERE expediente_id = ? AND usuario_id = ?", [expedienteId, usuarioId]);
  return fichaAVista(r, e, await parametros());
}

function calcularUmbral(actividad, monto, moneda, params) {
  if (actividad !== "compraventa_inmueble" || monto == null) return { supera: false, aviso: null };
  if (moneda !== "ARS") return { supera: false, aviso: "Monto en dolares: convertir a pesos al tipo de cambio de la fecha para comparar con el umbral." };
  if (!params.umbralArs) return { supera: false, aviso: "Cargue el SMVM vigente en Configuracion para calcular el umbral." };
  return { supera: Number(monto) > params.umbralArs, aviso: null };
}

export async function guardarUif(usuarioId, expedienteId, datos) {
  const e = await exigirExpediente(usuarioId, expedienteId);
  if (datos.actividad && !ACTIVIDADES.has(datos.actividad)) throw new AppError("DATOS_INVALIDOS", "actividad UIF invalida.", 400);
  if (datos.moneda && !["ARS", "USD"].includes(datos.moneda)) throw new AppError("DATOS_INVALIDOS", "moneda debe ser ARS o USD.", 400);
  if (datos.estado && !["pendiente", "completo"].includes(datos.estado)) throw new AppError("DATOS_INVALIDOS", "estado invalido.", 400);
  const monto = datos.monto === "" || datos.monto == null ? null : Number(datos.monto);
  if (monto != null && !(Number.isFinite(monto) && monto >= 0)) throw new AppError("DATOS_INVALIDOS", "monto invalido.", 400);
  const recaudos = Array.isArray(datos.recaudos)
    ? datos.recaudos
        .map((x) => ({ item: String(x?.item || "").trim().slice(0, 300), fundamento: String(x?.fundamento || "").trim().slice(0, 300), obligatorio: Boolean(x?.obligatorio), estado: ESTADOS_RECAUDO.has(x?.estado) ? x.estado : "pendiente", origen: x?.origen === "ia" ? "ia" : "manual" }))
        .filter((x) => x.item)
    : null;
  const params = await parametros();
  const actividad = datos.actividad || "no_alcanzada";
  const { supera, aviso } = calcularUmbral(actividad, monto, datos.moneda || null, params);
  const [[actual]] = await pool.query("SELECT alertas FROM uif_expedientes WHERE expediente_id = ?", [expedienteId]);
  const alertasPrevias = actual?.alertas ? (typeof actual.alertas === "string" ? JSON.parse(actual.alertas) : actual.alertas) : [];
  const alertas = [...alertasPrevias.filter((a) => !/umbral|SMVM|dolares/i.test(a)), ...(aviso ? [aviso] : [])];
  await pool.query(
    `INSERT INTO uif_expedientes (expediente_id, usuario_id, actividad, monto, moneda, supera_umbral, recaudos, estado, notas, alertas)
     VALUES (:expedienteId, :usuarioId, :actividad, :monto, :moneda, :supera, :recaudos, :estado, :notas, :alertas)
     ON DUPLICATE KEY UPDATE actividad = VALUES(actividad), monto = VALUES(monto), moneda = VALUES(moneda), supera_umbral = VALUES(supera_umbral),
       recaudos = COALESCE(VALUES(recaudos), recaudos), estado = VALUES(estado), notas = VALUES(notas), alertas = VALUES(alertas)`,
    { expedienteId: e.id, usuarioId, actividad, monto, moneda: datos.moneda || null, supera: supera ? 1 : 0, recaudos: recaudos ? JSON.stringify(recaudos) : null, estado: datos.estado || "pendiente", notas: texto(datos.notas, 1000) || null, alertas: JSON.stringify(alertas) },
  );
  return obtenerUif(usuarioId, expedienteId);
}

/** Persiste recaudos generados por IA sin pisar los manuales ni los ya marcados. */
export async function fusionarRecaudosIA(usuarioId, expedienteId, generado, ejecucionId) {
  const [[r]] = await pool.query("SELECT recaudos FROM uif_expedientes WHERE expediente_id = ? AND usuario_id = ?", [expedienteId, usuarioId]);
  const actuales = recaudosDe(r);
  const vistos = new Set(actuales.map((x) => x.item.toLowerCase()));
  const nuevos = generado.recaudos.filter((x) => !vistos.has(x.item.toLowerCase())).map((x) => ({ ...x, estado: "pendiente", origen: "ia" }));
  const recaudos = [...actuales, ...nuevos];
  await pool.query(
    `INSERT INTO uif_expedientes (expediente_id, usuario_id, recaudos, nivel_diligencia_sugerido, alertas, generado_en, ejecucion_id)
     VALUES (:expedienteId, :usuarioId, :recaudos, :nivel, :alertas, NOW(), :ejecucionId)
     ON DUPLICATE KEY UPDATE recaudos = VALUES(recaudos), nivel_diligencia_sugerido = VALUES(nivel_diligencia_sugerido), alertas = VALUES(alertas), generado_en = NOW(), ejecucion_id = VALUES(ejecucion_id)`,
    { expedienteId, usuarioId, recaudos: JSON.stringify(recaudos), nivel: generado.nivel_diligencia_sugerido, alertas: JSON.stringify([generado.fundamento_diligencia, ...generado.alertas].filter(Boolean)), ejecucionId: ejecucionId || null },
  );
  return { creados: nuevos.length };
}

export async function listarAlcanzados(usuarioId) {
  const [rows] = await pool.query(
    `SELECT u.*, e.caratula, e.tipo_acto, e.estado AS estado_expediente
       FROM uif_expedientes u JOIN expedientes e ON e.id = u.expediente_id
      WHERE u.usuario_id = ? AND u.actividad <> 'no_alcanzada'
      ORDER BY u.supera_umbral DESC, e.actualizado_en DESC`,
    [usuarioId],
  );
  const params = await parametros();
  return rows.map((r) => ({ ...fichaAVista(r, { id: r.expediente_id, caratula: r.caratula, tipo_acto: r.tipo_acto }, params), estadoExpediente: r.estado_expediente }));
}

// ---------- eventos ----------
export async function listarEventos(usuarioId) {
  const [rows] = await pool.query("SELECT ev.*, e.caratula FROM uif_eventos ev LEFT JOIN expedientes e ON e.id = ev.expediente_id WHERE ev.usuario_id = ? ORDER BY ev.fecha DESC, ev.id DESC LIMIT 500", [usuarioId]);
  return rows.map((r) => ({ id: r.id, tipo: r.tipo, periodo: r.periodo, fecha: r.fecha, referencia: r.referencia, expedienteId: r.expediente_id, caratula: r.caratula, notas: r.notas }));
}

export async function crearEvento(usuarioId, datos) {
  if (!TIPOS_EVENTO.has(datos.tipo)) throw new AppError("DATOS_INVALIDOS", `tipo debe ser: ${[...TIPOS_EVENTO].join(", ")}.`, 400);
  if (!esFechaValida(String(datos.fecha || ""))) throw new AppError("DATOS_INVALIDOS", "fecha invalida (AAAA-MM-DD).", 400);
  if (datos.periodo && !/^\d{4}(-\d{2})?$/.test(datos.periodo)) throw new AppError("DATOS_INVALIDOS", "periodo debe ser AAAA o AAAA-MM.", 400);
  let expedienteId = null;
  if (datos.expedienteId) expedienteId = (await exigirExpediente(usuarioId, datos.expedienteId)).id;
  const [r] = await pool.query(
    "INSERT INTO uif_eventos (usuario_id, tipo, periodo, fecha, referencia, expediente_id, notas) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [usuarioId, datos.tipo, datos.periodo || null, datos.fecha, texto(datos.referencia, 120) || null, expedienteId, texto(datos.notas, 500) || null],
  );
  return (await listarEventos(usuarioId)).find((e) => e.id === r.insertId);
}

export async function borrarEvento(usuarioId, id) {
  const [r] = await pool.query("DELETE FROM uif_eventos WHERE id = ? AND usuario_id = ?", [id, usuarioId]);
  if (r.affectedRows === 0) throw new AppError("NO_ENCONTRADO", "El evento no existe.", 404);
}

// ---------- alertas ----------
export async function alertas(usuarioId) {
  const out = [];
  const params = await parametros();
  if (!params.smvmArs) out.push({ nivel: "alta", tipo: "parametros", texto: "Falta cargar el SMVM vigente: no se puede calcular el umbral de compraventa de inmuebles.", accion: "configuracion" });

  const [pend] = await pool.query(
    `SELECT u.expediente_id, e.caratula, u.supera_umbral, u.recaudos FROM uif_expedientes u JOIN expedientes e ON e.id = u.expediente_id
      WHERE u.usuario_id = ? AND u.actividad <> 'no_alcanzada' AND u.estado = 'pendiente' AND e.estado IN ('abierto','en_firma')`,
    [usuarioId],
  );
  for (const r of pend) {
    const pendientes = recaudosDe(r).filter((x) => x.estado === "pendiente").length;
    if (pendientes || !recaudosDe(r).length) out.push({ nivel: r.supera_umbral ? "alta" : "media", tipo: "recaudos", texto: `${r.caratula}: ${pendientes || "sin"} recaudo${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"}${r.supera_umbral ? " (supera el umbral)" : ""}.`, expedienteId: r.expediente_id });
  }

  const [legajos] = await pool.query(
    `SELECT DISTINCT c.id, c.nombre, l.proxima_revision, e.caratula
       FROM uif_expedientes u JOIN expedientes e ON e.id = u.expediente_id
       JOIN expediente_partes p ON p.expediente_id = e.id JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN uif_legajos l ON l.cliente_id = c.id
      WHERE u.usuario_id = ? AND u.actividad <> 'no_alcanzada' AND e.estado IN ('abierto','en_firma') AND (l.cliente_id IS NULL OR l.proxima_revision < CURDATE())`,
    [usuarioId],
  );
  for (const r of legajos) out.push({ nivel: "alta", tipo: "legajo", texto: r.proxima_revision ? `Legajo UIF de ${r.nombre} vencido (${String(r.proxima_revision).slice(0, 10)}) en "${r.caratula}".` : `${r.nombre} no tiene legajo UIF y es parte de "${r.caratula}".`, clienteId: r.id });

  const ahora = new Date();
  const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const periodoMes = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, "0")}`;
  const [[rm]] = await pool.query("SELECT COUNT(*) AS n FROM uif_eventos WHERE usuario_id = ? AND tipo = 'reporte_mensual' AND periodo = ?", [usuarioId, periodoMes]);
  if (!Number(rm.n)) out.push({ nivel: "media", tipo: "reporte_mensual", texto: `Reporte sistemático mensual de ${periodoMes} sin registrar.`, periodo: periodoMes });
  if (ahora.getMonth() <= 2) {
    const anio = String(ahora.getFullYear() - 1);
    const [[ra]] = await pool.query("SELECT COUNT(*) AS n FROM uif_eventos WHERE usuario_id = ? AND tipo = 'reporte_anual' AND periodo = ?", [usuarioId, anio]);
    if (!Number(ra.n)) out.push({ nivel: "media", tipo: "reporte_anual", texto: `Reporte sistemático anual ${anio} sin registrar (ventana enero–marzo).`, periodo: anio });
  }
  const [[ae]] = await pool.query("SELECT MAX(fecha) AS ultima FROM uif_eventos WHERE usuario_id = ? AND tipo = 'autoevaluacion'", [usuarioId]);
  if (!ae.ultima || String(ae.ultima).slice(0, 10) < sumarAnios(hoy(), -2)) out.push({ nivel: "baja", tipo: "autoevaluacion", texto: ae.ultima ? `Última autoevaluación de riesgos: ${String(ae.ultima).slice(0, 10)} (se actualiza cada dos años).` : "Sin autoevaluación de riesgos registrada (informe técnico bienal)." });
  return out;
}
