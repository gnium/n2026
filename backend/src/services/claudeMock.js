/**
 * MODO SIMULADO. Sustituye a la API de Claude cuando no hay clave configurada
 * (CLAUDE_MODE=mock o auto sin ANTHROPIC_API_KEY). Sirve para probar el flujo
 * completo: anonimizacion, pipeline, SSE, vista previa y generacion del .docx.
 * Las salidas son plausibles pero NO tienen valor juridico.
 */
import { TOKEN_REGEX } from "./anonymizer.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set(["Ciudad", "Registro", "Escritura", "Provincia", "Buenos", "Aires", "Codigo", "Código", "Civil", "Comercial", "Nacion", "Nación", "Republica", "República", "Argentina", "Propiedad", "Inmueble", "Escribana", "Escribano", "Notarial", "Nomenclatura", "Catastral", "Matricula", "Matrícula", "Partida", "Avenida", "Calle", "Ley", "Capital", "Federal", "Autonoma", "Autónoma", "Compraventa", "Donacion", "Donación", "Hipoteca", "Titular", "Vendedor", "Comprador", "Parte", "Vendedora", "Compradora", "Documento", "Nacional", "Identidad", "Clave", "Unica", "Única", "Identificacion", "Identificación", "Tributaria", "Banco", "Sucursal", "Comparece", "Comparecen", "Vende", "Venden", "Compra", "Compran", "Dona", "Otorga", "Otorgan", "Por", "En", "El", "La", "Los", "Las", "Ante", "Que", "Con", "Del", "De", "Segun", "Según", "Titulo", "Título", "Antecedente", "Antecedentes", "Certificado", "Certificados", "Inhibiciones", "Dominio", "Escribania", "Escribanía", "Sellos", "Impuesto", "Precio", "Dolares", "Dólares", "Estadounidenses", "Pesos", "Doy", "Fe", "Leida", "Leída", "Ratificada", "Firman", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Circ", "Secc", "Manz", "Parc"]);

function personas(texto) {
  const re = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})\b/g;
  const vistos = [];
  let m;
  while ((m = re.exec(texto)) && vistos.length < 10) {
    // Quita palabras iniciales que no son nombre (verbos/conectores capitalizados) y descarta el resto si alguna sigue siendo stop.
    const partes = m[1].split(/\s+/);
    while (partes.length && STOP.has(partes[0])) partes.shift();
    if (partes.length < 2 || partes.some((p) => STOP.has(p))) continue;
    const nombre = partes.join(" ");
    if (!vistos.includes(nombre)) vistos.push(nombre);
  }
  return vistos;
}

function primero(texto, re) {
  const m = texto.match(re);
  return m ? m[1].trim() : null;
}

function tokensDe(entrada) {
  return [...new Set([...entrada.matchAll(TOKEN_REGEX)].map((m) => m[0]))].filter((t) => !t.startsWith("[[MODELO_"));
}

const ROLES = ["VENDEDOR_1", "COMPRADOR_1", "TITULAR_ANTERIOR_1", "CONYUGE_VENDEDOR_1", "TITULAR_ANTERIOR_2", "TITULAR_ANTERIOR_3", "TITULAR_ANTERIOR_4", "TITULAR_ANTERIOR_5", "PERSONA_9", "PERSONA_10"];

function extractor(entrada) {
  const texto = entrada.replace(/<[^>]+>/g, " ");
  const entidades = personas(texto).map((nombre, i) => ({
    id_sugerido: ROLES[i] || `PERSONA_${i + 1}`,
    categoria: "persona",
    rol: ["vendedor", "comprador", "titular anterior", "conyuge"][i] || "titular anterior",
    valor_literal: nombre,
    variantes: [nombre.split(/\s+/).slice(-1)[0]],
    atributos: { estado_civil: i === 0 ? "casado/a" : null, nacionalidad: "argentina", caracter: "por si", observaciones: null },
  }));
  const dom = primero(texto, /(?:sito|ubicado|ubicada)\s+en\s+((?:Av\.|Avenida|Calle|Ruta)\s+[^,.\n]{3,40}?\s+\d{1,5})\b/i) || primero(texto, /\b((?:Av\.|Avenida|Calle|Ruta)\s+[^,.\n]{3,40}?\s+\d{1,5})\b/);
  if (dom) entidades.push({ id_sugerido: "DOMICILIO_INMUEBLE", categoria: "domicilio", rol: "inmueble objeto del acto", valor_literal: dom, variantes: [], atributos: { estado_civil: null, nacionalidad: null, caracter: null, observaciones: null } });
  const mat = primero(texto, /[Mm]atr[ií]cula\s*(?:n[°ºo]?\.?\s*)?([A-Za-z0-9./-]{2,}[A-Za-z0-9])/);
  if (mat) entidades.push({ id_sugerido: "MATRICULA_INMUEBLE", categoria: "registral", rol: "matricula", valor_literal: mat, variantes: [], atributos: { estado_civil: null, nacionalidad: null, caracter: null, observaciones: null } });
  const nom = primero(texto, /[Nn]omenclatura\s+[Cc]atastral:?\s*([^\n;]{5,80}?)\.?(?=\s*(?:\n|;|$)|\.\s+[A-Z])/);
  if (nom) entidades.push({ id_sugerido: "NOMENCLATURA_CATASTRAL", categoria: "catastro", rol: "nomenclatura", valor_literal: nom, variantes: [], atributos: { estado_civil: null, nacionalidad: null, caracter: null, observaciones: null } });

  const tipo = /compraventa/i.test(texto) ? "compraventa" : /donaci[oó]n/i.test(texto) ? "donacion" : /hipoteca/i.test(texto) ? "hipoteca" : "compraventa";
  return {
    resumen: { tipo_acto: tipo, descripcion_generica: `${tipo} de inmueble entre dos partes (simulado)`, cantidad_partes: Math.min(entidades.filter((e) => e.categoria === "persona").length, 2) || 2, jurisdiccion_probable: "Provincia de Buenos Aires", idioma: "es" },
    entidades,
    inmueble: { tipo: "unidad funcional", descripcion_generica: "inmueble urbano", superficie: null, tokens_relacionados: ["DOMICILIO_INMUEBLE", "MATRICULA_INMUEBLE"] },
    antecedentes_dominiales: [
      { orden: 1, tipo_acto: "compraventa", fecha: "1998-06-15", escribano_o_registro: "Escribano autorizante, Registro 120", inscripcion: "inscripta", transmitente_id: "TITULAR_ANTERIOR_1", adquirente_id: "VENDEDOR_1", observaciones: null },
    ],
    certificados_mencionados: [{ nombre: "certificado de dominio", fecha: null, numero_o_referencia: null, vigencia: "a verificar" }],
    gravamenes: [],
    datos_economicos: { precio_o_valor: "USD 120.000", moneda: "USD", forma_de_pago: "contado" },
  };
}

function analista(entrada) {
  const t = tokensDe(entrada);
  const v = t.find((x) => x.includes("VENDEDOR")) || "[[VENDEDOR_1]]";
  const c = t.find((x) => x.includes("COMPRADOR")) || "[[COMPRADOR_1]]";
  const ant = t.find((x) => x.includes("TITULAR_ANTERIOR")) || "[[TITULAR_ANTERIOR_1]]";
  return {
    tracto_sucesivo: [
      { orden: 1, acto: "compraventa", fecha: "1998-06-15", transmitente: ant, adquirente: v, inscripcion: "inscripta", observacion: null },
      { orden: 2, acto: "compraventa (acto proyectado)", fecha: null, transmitente: v, adquirente: c, inscripcion: null, observacion: "acto a autorizar" },
    ],
    continuidad_tracto: "continuo",
    riesgos: [
      { severidad: "media", categoria: "asentimiento_conyugal", descripcion: `${v} declara estado civil casado/a; se requiere asentimiento del conyuge para disponer del inmueble si es ganancial o sede del hogar.`, fundamento_legal: "art. 470 y 456 CCyC", recomendacion: "Requerir comparecencia del conyuge o asentimiento por escritura separada." },
      { severidad: "baja", categoria: "informacion_insuficiente", descripcion: "No consta certificado de dominio vigente en la documentacion analizada.", fundamento_legal: "art. 23 Ley 17.801", recomendacion: "Solicitar certificado de dominio e inhibiciones con reserva de prioridad." },
    ],
    requisitos_previos: ["Certificado de dominio e inhibiciones vigente", "Asentimiento conyugal", "Verificar afectacion a vivienda (art. 244 CCyC)"],
    conclusion: "El tracto es continuo. Con los certificados vigentes y el asentimiento conyugal, el titulo es apto para autorizar el acto. (Salida simulada, sin valor juridico.)",
  };
}

function redactor(entrada) {
  const t = tokensDe(entrada);
  const g = (p, d) => t.find((x) => x.includes(p)) || d;
  const v = g("VENDEDOR", "[[VENDEDOR_1]]"), c = g("COMPRADOR", "[[COMPRADOR_1]]"), dom = g("DOMICILIO_INMUEBLE", "{{COMPLETAR_DOMICILIO_INMUEBLE}}"), mat = g("MATRICULA", "{{COMPLETAR_MATRICULA}}"), nom = g("NOMENCLATURA", "{{COMPLETAR_NOMENCLATURA}}");
  const dni1 = g("DNI_1", "{{COMPLETAR_DNI_VENDEDOR}}"), dni2 = g("DNI_2", "{{COMPLETAR_DNI_COMPRADOR}}");
  return {
    titulo: "ESCRITURA DE COMPRAVENTA (MINUTA SIMULADA)",
    plantilla_utilizada: "compraventa_inmueble",
    texto_escritura: `ESCRITURA NUMERO {{NUMERO_ESCRITURA}}. COMPRAVENTA. ${v} a favor de ${c}.

En la Ciudad de {{CIUDAD_OTORGAMIENTO}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECEN: por una parte ${v}, argentino/a, casado/a, ${dni1}, con domicilio en {{DOMICILIO_VENDEDOR_1}}, en adelante la PARTE VENDEDORA; y por la otra ${c}, argentino/a, ${dni2}, con domicilio en {{DOMICILIO_COMPRADOR_1}}, en adelante la PARTE COMPRADORA. Personas capaces, identificadas conforme al articulo 306 inciso a) del Codigo Civil y Comercial, doy fe. INTERVIENEN por si y EXPONEN:

PRIMERO: La PARTE VENDEDORA VENDE a la PARTE COMPRADORA, que COMPRA, el inmueble ubicado en ${dom}. NOMENCLATURA CATASTRAL: ${nom}. MATRICULA: ${mat}.

SEGUNDO: PRECIO. Esta venta se realiza por el precio total de DOLARES ESTADOUNIDENSES CIENTO VEINTE MIL (USD 120.000), que la PARTE VENDEDORA declara recibir en este acto de contado, otorgando recibo y carta de pago.

TERCERO: POSESION. La PARTE VENDEDORA transfiere todos los derechos de dominio y posesion, obligandose por eviccion y saneamiento conforme a derecho, y entrega la posesion en este acto.

CUARTO: TITULO. Corresponde a la PARTE VENDEDORA por compra que efectuo a [[TITULAR_ANTERIOR_1]] segun escritura del 15 de junio de 1998, inscripta en la matricula ${mat}.

QUINTO: ASENTIMIENTO CONYUGAL. Presente en este acto {{CONYUGE_VENDEDOR_1}} presta el asentimiento previsto en los articulos 456 y 470 del Codigo Civil y Comercial.

SEXTO: CONSTANCIAS NOTARIALES. HAGO CONSTAR: a) Certificado de dominio {{CERTIFICADO_DOMINIO}} e inhibiciones {{CERTIFICADO_INHIBICIONES}}. b) Certificado catastral {{CERTIFICADO_CATASTRAL}}, valuacion fiscal {{VALUACION_FISCAL}}. c) {{CONSTANCIA_ITI_GANANCIAS}}. d) COTI {{CONSTANCIA_COTI}}. e) Declaracion jurada de licitud de fondos (UIF). f) El inmueble no se encuentra afectado al regimen de vivienda.

LEIDA Y RATIFICADA, firman los comparecientes ante mi, doy fe.`,
    variables_faltantes: [
      { placeholder: "{{NUMERO_ESCRITURA}}", descripcion: "Numero de escritura del protocolo" },
      { placeholder: "{{CIUDAD_OTORGAMIENTO}}", descripcion: "Ciudad donde se otorga" },
      { placeholder: "{{ESCRIBANO_AUTORIZANTE}}", descripcion: "Nombre de la escribana o el escribano y numero de registro" },
      { placeholder: "{{DOMICILIO_VENDEDOR_1}}", descripcion: "Domicilio real de la parte vendedora (no consta en los antecedentes)" },
      { placeholder: "{{CERTIFICADO_DOMINIO}}", descripcion: "Numero y fecha del certificado de dominio" },
    ],
    notas_para_escribana: ["Salida generada en MODO SIMULADO: no es una minuta valida.", "Verificar fecha de adquisicion para determinar ITI o Ganancias."],
  };
}

function validador() {
  return {
    certificados: [
      { nombre: "Certificado de dominio", estado: "faltante", detalle: "No consta en la documentacion.", plazo_legal: "15/25/30 dias segun distancia (art. 24 Ley 17.801)" },
      { nombre: "Certificado de inhibiciones", estado: "faltante", detalle: "Solicitar junto con el de dominio.", plazo_legal: "idem" },
      { nombre: "Certificado catastral", estado: "presente_verificar", detalle: "Se menciona; verificar vigencia.", plazo_legal: "segun jurisdiccion" },
      { nombre: "COTI", estado: "no_aplica", detalle: "Solo si el precio supera el minimo vigente de ARCA.", plazo_legal: null },
    ],
    impuestos_y_tasas: [
      { concepto: "Impuesto de sellos", aplica: "si", jurisdiccion: "Provincia de Buenos Aires", alicuota_o_formula: "alicuota general sobre precio o valuacion fiscal, la mayor", sujeto_obligado: "ambas partes por mitades", observacion: "Verificar exencion vivienda unica." },
      { concepto: "ITI (Ley 23.905)", aplica: "depende", jurisdiccion: "Nacional", alicuota_o_formula: "1,5% del precio", sujeto_obligado: "vendedor", observacion: "Aplica si el inmueble fue adquirido antes del 1/1/2018; caso contrario Ganancias cedular 15%." },
      { concepto: "Tasa de inscripcion registral", aplica: "si", jurisdiccion: "Provincia de Buenos Aires", alicuota_o_formula: "segun escala del Registro", sujeto_obligado: "comprador", observacion: null },
    ],
    regimenes_informacion: [{ nombre: "UIF - Resolucion escribanos", aplica: "si", observacion: "Declaracion de licitud y origen de fondos." }, { nombre: "CITI Escribanos", aplica: "si", observacion: "Informacion mensual a ARCA." }],
    inconsistencias: [{ severidad: "baja", descripcion: "La minuta cita un certificado de dominio que no consta en los antecedentes.", sugerencia: "Completar con el certificado una vez obtenido." }],
    checklist_previo_firma: [
      { orden: 1, accion: "Solicitar certificados de dominio e inhibiciones", responsable: "escribania" },
      { orden: 2, accion: "Obtener asentimiento conyugal", responsable: "parte vendedora" },
      { orden: 3, accion: "Verificar fecha de adquisicion para ITI/Ganancias", responsable: "escribania" },
      { orden: 4, accion: "Liquidar impuesto de sellos", responsable: "escribania" },
    ],
    apto_para_firma: false,
    resumen: "Faltan certificados registrales y el asentimiento conyugal. (Salida simulada.)",
  };
}

function certificacion(entrada) {
  const t = tokensDe(entrada);
  const representacion = /MODALIDAD: CON REPRESENTACION/.test(entrada);
  const firmantes = t.filter((x) => x.includes("FIRMANTE") && !x.includes("DOMICILIO"));
  const f1 = firmantes[0] || "[[FIRMANTE_1]]";
  const soc = t.find((x) => x.includes("SOCIEDAD") && !x.includes("DOMICILIO")) || "[[SOCIEDAD_1]]";
  // DNI/CUIT asociados por cercania a la marca del firmante / la sociedad en las instrucciones.
  const cerca = (marca, tipo) => {
    const m = entrada.match(new RegExp(marca.replace(/[[\]]/g, "\\$&") + String.raw`[^\n]{0,40}?(\[\[` + tipo + String.raw`_\d+(?:_\d+)?\]\])`));
    return m ? m[1] : null;
  };
  const dni = cerca(f1, "DNI") || t.find((x) => x.startsWith("[[DNI_")) || "{{COMPLETAR_DNI_FIRMANTE_1}}";
  const cuit = cerca(soc, "CUIT") || t.find((x) => x.startsWith("[[CUIT_")) || "{{COMPLETAR_CUIT_SOCIEDAD_1}}";
  const dom = t.find((x) => x.includes("DOMICILIO_FIRMANTE")) || "{{COMPLETAR_DOMICILIO_FIRMANTE_1}}";
  const caracter = representacion ? "presidente del directorio" : "por si";
  const acta = `ACTA DE REQUERIMIENTO. LIBRO DE REQUERIMIENTOS NUMERO {{NUMERO_LIBRO}}, ACTA NUMERO {{NUMERO_ACTA}}. En {{CIUDAD}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECE ${f1}, ${dni}, con domicilio en ${dom}, persona capaz, a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial de la Nacion, doy fe. ${representacion ? `INTERVIENE en nombre y representacion de ${soc}, ${cuit}, en su caracter de ${caracter}, lo que acredita con estatuto social inscripto, acta de asamblea de designacion de autoridades y acta de directorio de distribucion de cargos, que tengo a la vista en copia certificada y de los que agrego copia al legajo, declarando bajo juramento que la representacion se encuentra vigente.` : "El requirente interviene por si y por derecho propio."} REQUIERE la certificacion de su firma, que estampa en mi presencia, en {{NATURALEZA_DOCUMENTO}}, de {{CANTIDAD_FOJAS}} fojas, en {{CANTIDAD_EJEMPLARES}} ejemplares. Leida que le es, la firma ante mi, doy fe.`;
  const cert = `CERTIFICO que la firma que obra en el documento adjunto fue puesta en mi presencia por ${f1}, ${dni}, a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial, quien manifiesta actuar ${representacion ? `en nombre y representacion de ${soc}, ${cuit}, en su caracter de ${caracter}, justificando la personeria con los documentos habilitantes que tengo a la vista` : "por si"}. Acta numero {{NUMERO_ACTA}} del libro de requerimientos numero {{NUMERO_LIBRO}}. Doy fe. (SIMULADO)`;
  return {
    modalidad: representacion ? "representacion" : "personal",
    documento_certificado: { naturaleza: "instrumento privado", ejemplares: null, fojas: null, destino: null },
    firmantes: [{ marca: f1, caracter, representa_a: representacion ? soc : null, documentos_habilitantes: representacion ? ["estatuto social inscripto", "acta de asamblea de designacion", "acta de directorio de distribucion de cargos", "constancia de CUIT"] : [], identificacion: "art. 306 inc. a) CCyC" }],
    acta_requerimiento: acta,
    certificacion: cert,
    documentos_habilitantes_requeridos: representacion
      ? [
          { documento: "Estatuto o contrato social con constancia de inscripcion", estado: "verificar", detalle: "Tener a la vista original o copia certificada." },
          { documento: "Acta de asamblea/reunion de socios de designacion de autoridades", estado: "verificar", detalle: "Verificar vigencia del mandato." },
          { documento: "Acta de directorio de distribucion de cargos", estado: "faltante", detalle: "No mencionada en las instrucciones." },
          { documento: "Constancia de CUIT", estado: "verificar", detalle: null },
        ]
      : [{ documento: "Documento de identidad del firmante", estado: "verificar", detalle: "Exhibir DNI vigente." }],
    controles: [
      { control: "Identificacion del firmante", resultado: "ok", fundamento: "art. 306 CCyC", detalle: "Por exhibicion de DNI (inc. a)." },
      { control: "Facultades suficientes para el acto", resultado: representacion ? "atencion" : "ok", fundamento: "arts. 358 y 375 CCyC; art. 58 LGS", detalle: representacion ? "Confirmar que el estatuto no requiere firma conjunta." : null },
      { control: "Legalizacion posterior", resultado: "atencion", fundamento: "Ley 404 / dec. ley 9020/78", detalle: "Si el documento se presenta en otra jurisdiccion, legalizar en el Colegio." },
    ],
    variables_faltantes: [
      { placeholder: "{{NUMERO_LIBRO}}", descripcion: "Numero del libro de requerimientos" },
      { placeholder: "{{NUMERO_ACTA}}", descripcion: "Numero de acta" },
      { placeholder: "{{NATURALEZA_DOCUMENTO}}", descripcion: "Naturaleza del documento cuya firma se certifica" },
    ],
    notas_para_escribana: ["Salida generada en MODO SIMULADO: no es una certificacion valida."],
  };
}

const GENERADORES = { extractor_antecedentes: extractor, analista_estudio_titulos: analista, redactor_minuta_escritura: redactor, validador_fiscal_registral: validador, redactor_certificacion_firmas: certificacion };

export async function ejecutarSkillSimulado({ clave, entrada, esquema, onProgreso }) {
  const gen = GENERADORES[clave];
  if (!gen) throw new Error(`Sin simulacion para ${clave}`);
  // Simula la generacion progresiva para que el pipeline visual se aprecie.
  for (let i = 1; i <= 5; i++) {
    await dormir(400);
    onProgreso?.(i * 600);
  }
  const datos = esquema.parse(gen(entrada));
  return { datos, uso: { modelo: "simulado", tokensEntrada: Math.round(entrada.length / 4), tokensSalida: 1500, cacheLeido: 0 } };
}
