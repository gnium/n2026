/**
 * Recaudos UIF generados con IA a partir del expediente. La entrada NO lleva
 * nombres ni identificadores: solo tipo de acto, actividad, monto, umbral, tipo
 * y riesgo de cada parte, PEP, nacionalidad y origen de fondos declarado (pasados
 * por el saneo por regex). Cada llamada queda registrada en Consumo con su costo.
 */
import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";
import { ejecutarSkill, modoClaude } from "./claudeClient.js";
import { auditoria } from "./auditoria.js";
import { calcularCosto, proveedorDeModo } from "./precios.js";
import { presanear } from "./anonymizer.js";
import { EsquemaUifRecaudos } from "../skills/schemas.js";
import { obtenerUif, obtenerLegajo, fusionarRecaudosIA } from "./uif.js";
import { AppError } from "../utils/errores.js";

const PROMPT_UIF = `Sos oficial de cumplimiento de una escribanía argentina. Los escribanos son sujetos obligados ante la UIF (Ley 25.246, art. 20 inc. 12) y se rigen por la Resolución UIF 242/2023 (enfoque basado en riesgo): actividades específicas alcanzadas (compraventa de inmuebles por encima del umbral en SMVM, constitución y administración de personas y estructuras jurídicas, compraventa de negocios y participaciones), debida diligencia simplificada / media / reforzada, identificación del cliente y del beneficiario final, personas expuestas políticamente, origen y licitud de fondos, conservación de documentación y reportes sistemáticos.
Recibís la descripción anonimizada de una operación (sin nombres ni identificadores). Devolvé la lista de recaudos concretos que la escribanía debe reunir o verificar antes de autorizar el acto, con fundamento breve, indicando cuáles son obligatorios y cuáles recomendados según el nivel de riesgo; sugerí el nivel de debida diligencia y explicá por qué; y listá alertas (por ejemplo, umbral superado, PEP, jurisdicción de riesgo, legajo vencido, monto en moneda extranjera). No inventes montos ni umbrales: usá los que vienen en la entrada. Redactá en español rioplatense, en forma de ítems cortos y accionables, sin encabezados. Recordá que tu salida es orientativa y que la escribanía la contrasta con la resolución vigente y su manual de procedimientos.`;

const NOMBRE_ACTIVIDAD = {
  compraventa_inmueble: "compraventa de inmueble",
  persona_juridica: "constitución/organización de aportes de una persona jurídica",
  estructura_juridica: "creación o administración de una estructura jurídica (fideicomiso u otra)",
  compraventa_negocio: "compraventa de negocio o participaciones societarias",
  otra: "otra actividad alcanzada",
};

/** Checklist base por actividad, usado en modo simulado (sin IA). */
function recaudosBase(actividad, superaUmbral, hayPep) {
  const comunes = [
    { item: "Identificar a cada parte con documento vigente y registrar domicilio real, actividad y nacionalidad", fundamento: "Debida diligencia del cliente (identificación)", obligatorio: true },
    { item: "Obtener declaración jurada sobre condición de persona expuesta políticamente de cada parte", fundamento: "Resolución UIF sobre PEP", obligatorio: true },
    { item: "Documentar origen y licitud de los fondos o bienes involucrados", fundamento: "Debida diligencia media/reforzada", obligatorio: superaUmbral || hayPep },
    { item: "Verificar a las partes contra listados de sanciones y terrorismo (ONU, UIF) y dejar constancia", fundamento: "Prevención de financiamiento del terrorismo", obligatorio: true },
    { item: "Conformar y conservar el legajo del cliente por el plazo legal", fundamento: "Conservación de documentación", obligatorio: true },
  ];
  const porActividad = {
    compraventa_inmueble: [
      { item: "Registrar la forma de pago y los medios bancarizados utilizados, con constancias", fundamento: "Trazabilidad de fondos", obligatorio: true },
      { item: "Identificar al beneficiario final si alguna parte es persona jurídica o fideicomiso", fundamento: "Beneficiario final", obligatorio: true },
      { item: superaUmbral ? "Incluir la operación en el reporte sistemático mensual del período" : "Verificar si la operación debe incluirse en el reporte sistemático mensual", fundamento: "Reporte sistemático (umbral en SMVM)", obligatorio: superaUmbral },
    ],
    persona_juridica: [
      { item: "Estatuto o contrato social, inscripción y acta de designación de autoridades", fundamento: "Identificación de la persona jurídica", obligatorio: true },
      { item: "Identificar a los beneficiarios finales (participación y control) y a las autoridades", fundamento: "Beneficiario final", obligatorio: true },
      { item: "Origen de los aportes de capital", fundamento: "Origen de fondos", obligatorio: true },
    ],
    estructura_juridica: [
      { item: "Contrato constitutivo e identificación de fiduciante, fiduciario, beneficiario y fideicomisario", fundamento: "Identificación de la estructura", obligatorio: true },
      { item: "Beneficiario final de cada posición y origen de los bienes fideicomitidos", fundamento: "Beneficiario final y origen de fondos", obligatorio: true },
    ],
    compraventa_negocio: [
      { item: "Título de las participaciones o del fondo de comercio y últimos estados contables", fundamento: "Identificación del objeto", obligatorio: true },
      { item: "Beneficiario final de comprador y vendedor si son personas jurídicas", fundamento: "Beneficiario final", obligatorio: true },
      { item: "Forma de pago y medios bancarizados con constancias", fundamento: "Trazabilidad de fondos", obligatorio: true },
    ],
    otra: [],
  };
  return {
    nivel_diligencia_sugerido: hayPep ? "reforzada" : superaUmbral ? "media" : "simplificada",
    fundamento_diligencia: hayPep ? "Hay una persona expuesta políticamente entre las partes." : superaUmbral ? "La operación supera el umbral en SMVM." : "Operación de riesgo bajo según los datos cargados.",
    recaudos: [...comunes, ...(porActividad[actividad] || [])],
    alertas: [...(superaUmbral ? ["La operación supera el umbral: reporte sistemático mensual."] : []), ...(hayPep ? ["Parte PEP: debida diligencia reforzada y actualización anual del legajo."] : [])],
  };
}

export async function generarRecaudos(usuarioId, expedienteId) {
  const ficha = await obtenerUif(usuarioId, expedienteId);
  if (ficha.actividad === "no_alcanzada") throw new AppError("UIF_NO_ALCANZADA", "Marque la actividad UIF del expediente (y el monto, si corresponde) antes de generar los recaudos.", 400);
  const [partes] = await pool.query("SELECT p.cliente_id, p.rol, c.tipo FROM expediente_partes p JOIN clientes c ON c.id = p.cliente_id WHERE p.expediente_id = ?", [expedienteId]);
  const mapa = new Map();
  const sanear = (t) => (t ? presanear(String(t), mapa).texto.slice(0, 200) : "");
  const partesResumen = [];
  for (const p of partes) {
    const l = await obtenerLegajo(usuarioId, p.cliente_id);
    partesResumen.push({ rol: p.rol || "parte", tipo: p.tipo, legajo: l.existe, nivelRiesgo: l.nivelRiesgo, diligencia: l.diligencia, pep: l.esPep, jurisdiccionRiesgo: l.jurisdiccionRiesgo, legajoVencido: l.vencido, nacionalidad: sanear(l.nacionalidad), actividadEconomica: sanear(l.actividad), origenFondosDeclarado: sanear(l.origenFondos), beneficiariosFinalesDeclarados: l.beneficiariosFinales.length });
  }
  const hayPep = partesResumen.some((p) => p.pep);
  const entradaObj = {
    tipoActo: ficha.tipoActo,
    actividadUif: NOMBRE_ACTIVIDAD[ficha.actividad] || ficha.actividad,
    monto: ficha.monto,
    moneda: ficha.moneda,
    umbralArs: ficha.umbralArs || null,
    superaUmbral: ficha.superaUmbral,
    partes: partesResumen,
    recaudosYaCargados: ficha.recaudos.map((r) => sanear(r.item)),
    notas: sanear(ficha.notas),
  };
  const entrada = `OPERACIÓN (anonimizada):\n${JSON.stringify(entradaObj, null, 2)}`;

  if (modoClaude() === "simulado") {
    const generado = recaudosBase(ficha.actividad, ficha.superaUmbral, hayPep);
    const { creados } = await fusionarRecaudosIA(usuarioId, expedienteId, generado, null);
    return { creados, simulado: true, costoUsd: 0, ficha: await obtenerUif(usuarioId, expedienteId) };
  }

  const proveedor = proveedorDeModo(modoClaude());
  const ejecucionId = await auditoria.iniciarEjecucion(randomUUID(), Buffer.byteLength(entrada, "utf8"), usuarioId);
  const filaId = await auditoria.registrarSkill(ejecucionId, "uif_recaudos", { proveedor });
  const t0 = Date.now();
  try {
    const { datos, uso } = await ejecutarSkill({ clave: "uif_recaudos", systemPrompt: PROMPT_UIF, entrada, esquema: EsquemaUifRecaudos, esfuerzo: "medium", maxTokens: 8000 });
    const { costo, precioEncontrado } = calcularCosto({ proveedor, modelo: uso.modelo, tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, cacheLeido: uso.cacheLeido });
    await auditoria.actualizarSkill(filaId, { estado: "completado", modelo: uso.modelo, proveedor, tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, costoUsd: costo, duracionMs: Date.now() - t0, finalizadoEn: new Date() });
    await auditoria.finalizarEjecucion(ejecucionId, { estado: "completada", tipoActo: "uif_recaudos", tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, costoUsd: costo, duracionMs: Date.now() - t0 });
    const { creados } = await fusionarRecaudosIA(usuarioId, expedienteId, datos, ejecucionId);
    return { creados, simulado: false, costoUsd: costo, costoAproximado: !precioEncontrado, ficha: await obtenerUif(usuarioId, expedienteId) };
  } catch (e) {
    await auditoria.actualizarSkill(filaId, { estado: "fallido", codigoError: e.codigo || "ERROR_INESPERADO", duracionMs: Date.now() - t0, finalizadoEn: new Date() });
    await auditoria.finalizarEjecucion(ejecucionId, { estado: "fallida", tipoActo: "uif_recaudos", duracionMs: Date.now() - t0 });
    throw e;
  }
}
