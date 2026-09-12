/**
 * Orquestador secuencial de los skills.
 *
 *  1. extractor_antecedentes   -> ve el texto PRE-SANEADO (sin DNI/CUIT/mail/tel).
 *                                 Devuelve entidades; el servidor construye el mapa
 *                                 y anonimiza el texto y la propia extraccion.
 *  2. analista_estudio_titulos -> solo datos anonimizados.
 *  3. redactor_minuta_escritura / redactor_certificacion_firmas -> plantilla + datos anonimizados.
 *  4. validador_fiscal_registral -> solo datos anonimizados.
 *
 * Los resultados guardados en la sesion estan anonimizados y pueden mostrarse
 * en la UI. Los valores reales solo viven en sesion.mapa.
 *
 * Tres formas de correr esta funcion sobre una misma sesion:
 *  - normal (primera vez): corre todos los skills del modo.
 *  - reintento: una etapa fallo; se conservan las que ya completaron y se
 *    continua desde ahi, con el proveedor de IA que este configurado ahora.
 *  - iteracion: la sesion ya termino con exito y la escribana o el escribano pidio mejorarla.
 *    Se conserva solo la extraccion (para no volver a anonimizar el documento)
 *    y se vuelven a correr los demas skills, cada uno viendo su propio
 *    resultado anterior mas el pedido de mejora, para refinar en vez de
 *    empezar de cero.
 */
import { ejecutarSkill, modoClaude } from "./claudeClient.js";
import { aplicarEntidades, anonimizarProfundo, contieneDatosReales, reemplazarTodo, presanear } from "./anonymizer.js";
import { emitir } from "./sessionStore.js";
import { ESQUEMAS } from "../skills/schemas.js";
import { skillsActivos, plantillaParaActo, obtenerPlantilla } from "../skills/repositorio.js";
import { auditoria } from "./auditoria.js";
import { calcularCosto, proveedorDeModo } from "./precios.js";
import { registrarCargoUso } from "./facturacion.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errores.js";

/** Skills que corren en cada modo (el extractor es obligatorio: sin el no hay anonimizacion). */
const SKILLS_POR_MODO = {
  completo: ["extractor_antecedentes", "analista_estudio_titulos", "redactor_minuta_escritura", "validador_fiscal_registral"],
  escritura: ["extractor_antecedentes", "redactor_minuta_escritura", "validador_fiscal_registral"],
  estudio_titulos: ["extractor_antecedentes", "analista_estudio_titulos"],
  certificacion_firmas: ["extractor_antecedentes", "redactor_certificacion_firmas"],
};
const NOMBRE_MODO = { completo: "analisis completo", escritura: "redaccion de escritura", estudio_titulos: "estudio de titulos", certificacion_firmas: "certificacion de firmas" };
const NOMBRE_PROVEEDOR_LEGIBLE = { real: "Claude", gemini: "Gemini", local: "la IA local", simulado: "el modo simulado" };

function setSkill(sesion, clave, cambios) {
  const s = sesion.skills.find((x) => x.clave === clave);
  Object.assign(s, cambios);
  emitir(sesion, { tipo: "skill", skill: { ...s } });
}

function mensaje(sesion, texto, nivel = "info") {
  emitir(sesion, { tipo: "mensaje", nivel, texto });
}

export async function ejecutarPipeline(sesion, { reintento = false, iteracionFeedback = null } = {}) {
  const inicio = Date.now();
  let totalCosto = 0;
  let costoIncompleto = false;
  const iterando = iteracionFeedback !== null;
  let skills;
  try {
    skills = await skillsActivos();
  } catch (e) {
    sesion.estado = "fallida";
    sesion.error = { codigo: e.codigo || "ERROR_BD", mensaje: e.message };
    emitir(sesion, { tipo: "estado", estado: "fallida", error: sesion.error });
    return;
  }

  const permitidos = SKILLS_POR_MODO[sesion.modo] || SKILLS_POR_MODO.completo;
  skills = skills.filter((s) => permitidos.includes(s.clave));

  // Que skills se saltan (se conserva su resultado anterior tal cual):
  //  - reintento: todos los que ya habian completado.
  //  - iteracion: solo el extractor (para no volver a anonimizar ni gastar en eso).
  //  - corrida normal: ninguno.
  let completados;
  if (reintento) completados = new Set(Object.keys(sesion.resultados || {}));
  else if (iterando) completados = new Set(sesion.resultados?.extractor_antecedentes ? ["extractor_antecedentes"] : []);
  else completados = new Set();

  sesion.skills = skills.map((s) => ({ clave: s.clave, nombre: s.nombre, descripcion: s.descripcion, estado: completados.has(s.clave) ? "completado" : "pendiente", mensaje: completados.has(s.clave) ? "Completado (conservado)" : null, progreso: completados.has(s.clave) ? 100 : 0, duracionMs: null }));
  emitir(sesion, { tipo: "estado", estado: "en_curso", skills: sesion.skills });
  if (!reintento && !iterando) sesion.ejecucionId = await auditoria.iniciarEjecucion(sesion.id, sesion.bytesEntrada, sesion.usuarioId);
  if (reintento) mensaje(sesion, `Reintentando con ${NOMBRE_PROVEEDOR_LEGIBLE[modoClaude()] || modoClaude()} desde la etapa que fallo.`);
  if (iterando) mensaje(sesion, `Generando la version ${sesion.numeroIteracion || 2} con ${NOMBRE_PROVEEDOR_LEGIBLE[modoClaude()] || modoClaude()}${iteracionFeedback ? ", a partir de su pedido de mejora" : ""}.`);
  if (modoClaude() === "simulado") mensaje(sesion, "MODO SIMULADO: no hay clave de Claude ni IA local configurada. Los resultados son de prueba y no tienen valor juridico.", "alerta");
  if (modoClaude() === "local") mensaje(sesion, "Procesando con la IA local de la oficina: los datos no salen de esta maquina.");
  if (!reintento && !iterando) mensaje(sesion, `Modo: ${NOMBRE_MODO[sesion.modo] || sesion.modo}${sesion.textoModelo ? ", con escritura modelo propia" : ""}${sesion.instrucciones ? ", con instrucciones" : ""}. Se detectaron y ocultaron ${sesion.mapa.size} datos identificatorios (DNI, CUIT, correos, telefonos, matriculas, partidas) antes de cualquier analisis.`);

  const contexto = {}; // salidas anonimizadas por skill
  let plantilla = null;
  if (reintento || iterando) for (const k of completados) contexto[k] = sesion.resultados[k];

  // ---- Iteracion: anonimizar el pedido de mejora antes de usarlo en ningun prompt ----
  // El extractor no vuelve a correr sobre el documento, asi que si la escribana o el escribano
  // escribio un dato nuevo (no presente en el caso original) en su pedido, nadie
  // mas lo revisaria. Se lo pasa por un mini-analisis con el mismo skill extractor
  // (entrada corta: solo el pedido) para detectar y anonimizar entidades nuevas,
  // ademas del saneo por regex y el reemplazo de entidades ya conocidas.
  let feedbackAnonimizado = "";
  if (iterando) {
    const feedbackCrudo = String(iteracionFeedback || "").trim();
    if (feedbackCrudo) {
      let feedbackSaneado = presanear(reemplazarTodo(feedbackCrudo, sesion.mapa), sesion.mapa).texto;
      const skillExtractor = skills.find((s) => s.clave === "extractor_antecedentes");
      if (skillExtractor && contieneDatosReales(feedbackSaneado, sesion.mapa) === false) {
        const t0 = Date.now();
        const filaId = await auditoria.registrarSkill(sesion.ejecucionId, "extractor_antecedentes", { modelo: skillExtractor.modelo, proveedor: proveedorDeModo(modoClaude()) });
        try {
          const { datos, uso } = await ejecutarSkill({
            clave: "extractor_antecedentes",
            modelo: skillExtractor.modelo,
            systemPrompt: skillExtractor.system_prompt,
            entrada: `DOCUMENTO A ANALIZAR (fragmento breve: es el pedido de mejora que la escribana o el escribano escribio sobre un resultado ya generado, no el antecedente completo). Identifica UNICAMENTE entidades sensibles NUEVAS que no fueran ya conocidas: nombres de personas o sociedades, domicilios particulares, documentos de identidad, CUIT/CUIL, o datos catastrales/registrales de un inmueble concreto. NO marques como sensibles ciudades, provincias o jurisdicciones mencionadas en general (por ejemplo, donde se otorga el acto o donde esta la escribana): eso es dato publico, igual que el nombre de una escribana, un escribano o de un registro. Si no hay ninguna entidad nueva que cumpla estos criterios, devolve la lista de entidades vacia.\n\n<documento>\n${feedbackSaneado}\n</documento>`,
            esquema: ESQUEMAS.extractor_antecedentes,
            esfuerzo: skillExtractor.esfuerzo,
            maxTokens: skillExtractor.max_tokens,
          });
          const nuevasEntidades = (datos.entidades || []).filter((e) => (e.valor_literal || "").length >= 2);
          feedbackAnonimizado = aplicarEntidades(feedbackSaneado, nuevasEntidades, sesion.mapa);
          const { costo, precioEncontrado } = calcularCosto({ proveedor: proveedorDeModo(modoClaude()), modelo: uso.modelo, tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, cacheLeido: uso.cacheLeido });
          totalCosto += costo ?? 0;
          if (!precioEncontrado) costoIncompleto = true;
          await auditoria.actualizarSkill(filaId, { estado: "completado", modelo: uso.modelo, proveedor: proveedorDeModo(modoClaude()), tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, costoUsd: costo, duracionMs: Date.now() - t0, finalizadoEn: new Date() });
          if (nuevasEntidades.length) mensaje(sesion, `Se detectaron y ocultaron ${nuevasEntidades.length} dato(s) nuevo(s) en el pedido de mejora.`);
        } catch (e) {
          await auditoria.actualizarSkill(filaId, { estado: "fallido", codigoError: e.codigo || "ERROR_INESPERADO", duracionMs: Date.now() - t0, finalizadoEn: new Date() });
          // Si el mini-analisis falla, no se arriesga a usar el pedido sin revisar: se descarta y se avisa.
          feedbackAnonimizado = "";
          mensaje(sesion, "No se pudo analizar el pedido de mejora por seguridad; se genero una nueva version sin tenerlo en cuenta.", "alerta");
        }
      } else {
        feedbackAnonimizado = "";
        mensaje(sesion, "El pedido de mejora parecia contener datos ya conocidos sin anonimizar; se genero una nueva version sin tenerlo en cuenta.", "alerta");
      }
      if (feedbackAnonimizado && contieneDatosReales(feedbackAnonimizado, sesion.mapa)) {
        feedbackAnonimizado = "";
        mensaje(sesion, "El pedido de mejora no pudo anonimizarse por completo; se genero una nueva version sin tenerlo en cuenta.", "alerta");
      }
    }
  }

  for (const skill of skills) {
    const clave = skill.clave;
    if (completados.has(clave)) continue;
    const esquema = ESQUEMAS[clave];
    if (!esquema) {
      setSkill(sesion, clave, { estado: "omitido", mensaje: "Skill sin esquema de salida definido en el codigo." });
      continue;
    }
    const t0 = Date.now();
    setSkill(sesion, clave, { estado: "en_curso", mensaje: "Analizando...", progreso: 0 });
    const proveedorSkill = proveedorDeModo(modoClaude());
    const filaId = await auditoria.registrarSkill(sesion.ejecucionId, clave, { modelo: skill.modelo, proveedor: proveedorSkill });

    try {
      // ---- construir entrada segun el skill ----
      let entrada;
      const instr = (anon) => {
        const t = anon ? sesion.instruccionesAnonimizadas : sesion.instrucciones;
        return t ? `\n\n<instrucciones_de_la_escribana>\n${t}\n</instrucciones_de_la_escribana>` : "";
      };
      if (clave === "extractor_antecedentes") {
        entrada = `DOCUMENTO A ANALIZAR (los numeros de documento, CUIT, correos, telefonos, matriculas y partidas ya fueron reemplazados por marcas [[...]]):\n\n<documento>\n${sesion.textoOriginal || "(no se adjunto documento; los datos vienen en las instrucciones)"}\n</documento>`;
        if (sesion.modo === "certificacion_firmas") {
          entrada = `Se trata de una CERTIFICACION DE FIRMAS (tipo_acto = certificacion_firmas), modalidad ${sesion.certificacion?.modalidad || "personal"}. El documento adjunto es el instrumento privado cuyas firmas se certifican. Marca a los firmantes con id_sugerido FIRMANTE_1, FIRMANTE_2...; a la persona juridica representada con SOCIEDAD_1 (categoria sociedad); a los domicilios con DOMICILIO_FIRMANTE_1 / DOMICILIO_SOCIEDAD_1; a otras personas mencionadas en el documento con PARTE_1, PARTE_2...\n\n` + entrada;
        }
        if (sesion.textoModelo) {
          entrada += `\n\nESCRITURA MODELO de la escribana o el escribano (pertenece a OTRO caso anterior; sus partes, domicilios y datos catastrales tambien son sensibles: marcalos como entidades con id_sugerido que empiece con MODELO_, por ejemplo MODELO_VENDEDOR_1, MODELO_DOMICILIO_INMUEBLE):\n\n<modelo_de_escritura>\n${sesion.textoModelo}\n</modelo_de_escritura>`;
        }
        if (sesion.instrucciones) {
          entrada += `\n\nINSTRUCCIONES de la escribana o el escribano (pueden contener nombres o datos de las partes: marcalos tambien como entidades):${instr(false)}`;
        }
      } else if (clave === "analista_estudio_titulos") {
        entrada = `<documento_anonimizado>\n${sesion.textoAnonimizado}\n</documento_anonimizado>\n\n<extraccion>\n${JSON.stringify(contexto.extractor_antecedentes, null, 2)}\n</extraccion>${instr(true)}`;
      } else if (clave === "redactor_minuta_escritura") {
        const tipo = contexto.extractor_antecedentes?.resumen?.tipo_acto || "otro";
        let bloquePlantilla;
        if (sesion.modeloAnonimizado) {
          plantilla = { id: null, clave: "modelo_de_la_escribana", nombre: "Escritura modelo de la escribana o el escribano", tipo_acto: tipo, contenido: sesion.modeloAnonimizado };
          bloquePlantilla = `<modelo_de_escritura_anonimizado>\n${sesion.modeloAnonimizado}\n</modelo_de_escritura_anonimizado>\n\nUsa este modelo como base de estilo y estructura. Sus marcas [[MODELO_...]] corresponden a un caso anterior: reemplazalas por las marcas del caso actual (por ejemplo [[MODELO_VENDEDOR_1]] -> [[VENDEDOR_1]]) y nunca las copies en la minuta.`;
        } else {
          plantilla = await plantillaParaActo(tipo);
          bloquePlantilla = `<plantilla clave="${plantilla.clave}" tipo_acto="${plantilla.tipo_acto}">\n${plantilla.contenido}\n</plantilla>`;
        }
        sesion.plantilla = { clave: plantilla.clave, nombre: plantilla.nombre, tipo_acto: plantilla.tipo_acto };
        emitir(sesion, { tipo: "plantilla", plantilla: sesion.plantilla });
        const estudio = contexto.analista_estudio_titulos ? JSON.stringify(contexto.analista_estudio_titulos, null, 2) : "No se realizo estudio de titulos en esta sesion; incorpora las constancias habituales y lista en variables_faltantes los certificados que deban verificarse.";
        const marcasActuales = [...sesion.mapa.keys()].filter((k) => !k.startsWith("[[MODELO_"));
        entrada = `${bloquePlantilla}\n\n<extraccion_anonimizada>\n${JSON.stringify(contexto.extractor_antecedentes, null, 2)}\n</extraccion_anonimizada>\n\n<estudio_de_titulos>\n${estudio}\n</estudio_de_titulos>${instr(true)}\n\nMarcas anonimas del caso actual (usalas exactamente asi): ${marcasActuales.join(", ")}`;
      } else if (clave === "redactor_certificacion_firmas") {
        const modalidad = sesion.certificacion?.modalidad === "representacion" ? "representacion" : "personal";
        plantilla = await obtenerPlantilla(`certificacion_firmas_${modalidad}`);
        if (!plantilla) throw new AppError("SIN_PLANTILLA", "Faltan las plantillas de certificacion de firmas. Vuelva a ejecutar el seed de la base.", 500);
        sesion.plantilla = { clave: plantilla.clave, nombre: plantilla.nombre, tipo_acto: plantilla.tipo_acto };
        emitir(sesion, { tipo: "plantilla", plantilla: sesion.plantilla });
        entrada = `MODALIDAD: ${modalidad === "representacion" ? "CON REPRESENTACION (el firmante actua en nombre de una persona juridica u otra persona)" : "A TITULO PERSONAL (el firmante actua por si)"}\n\n<plantilla clave="${plantilla.clave}">\n${plantilla.contenido}\n</plantilla>\n\n<documento_a_certificar_anonimizado>\n${sesion.textoAnonimizado || "(no se adjunto el documento)"}\n</documento_a_certificar_anonimizado>\n\n<extraccion_anonimizada>\n${JSON.stringify(contexto.extractor_antecedentes, null, 2)}\n</extraccion_anonimizada>${instr(true)}\n\nMarcas anonimas del caso (usalas exactamente asi): ${[...sesion.mapa.keys()].filter((k) => !k.startsWith("[[MODELO_")).join(", ")}`;
      } else if (clave === "validador_fiscal_registral") {
        entrada = `<extraccion_anonimizada>\n${JSON.stringify(contexto.extractor_antecedentes, null, 2)}\n</extraccion_anonimizada>\n\n<estudio_de_titulos>\n${contexto.analista_estudio_titulos ? JSON.stringify(contexto.analista_estudio_titulos, null, 2) : "No se realizo estudio de titulos en esta sesion."}\n</estudio_de_titulos>\n\n<minuta>\n${contexto.redactor_minuta_escritura?.texto_escritura || ""}\n</minuta>${instr(true)}\n\nMarcas anonimas validas: ${[...sesion.mapa.keys()].join(", ")}`;
      } else {
        throw new AppError("SKILL_DESCONOCIDO", `El pipeline no sabe construir la entrada del skill ${clave}`, 500);
      }

      // ---- iteracion: pedirle a este paso una version mejorada de su propio resultado anterior ----
      if (iterando) {
        const anterior = sesion.resultados?.[clave];
        entrada += `\n\n<version_anterior_de_este_paso>\n${anterior ? JSON.stringify(anterior, null, 2) : "(este paso no se habia ejecutado antes)"}\n</version_anterior_de_este_paso>\n\n<pedido_de_mejora_de_la_escribana>\n${feedbackAnonimizado || "(sin comentarios especificos: genera una version alternativa, revisando redaccion, completitud y posibles errores)"}\n</pedido_de_mejora_de_la_escribana>\n\nGenera una VERSION MEJORADA de este paso incorporando el pedido de la escribana o el escribano. Si el pedido no aplica a este paso en particular, mantene un contenido equivalente al de la version anterior, corrigiendo solo lo que corresponda.`;
      }

      // Defensa en profundidad: a partir del skill 2 la entrada no puede contener valores reales.
      if (clave !== "extractor_antecedentes" && contieneDatosReales(entrada, sesion.mapa)) {
        throw new AppError("FUGA_DATOS", "Se detectaron datos reales en la entrada de un skill posterior al extractor. Proceso abortado por seguridad.", 500);
      }

      // ---- llamada al proveedor de IA ----
      const { datos, uso } = await ejecutarSkill({
        clave,
        modelo: skill.modelo,
        systemPrompt: skill.system_prompt,
        entrada,
        esquema,
        esfuerzo: skill.esfuerzo,
        maxTokens: skill.max_tokens,
        onProgreso: (chars, texto) => setSkill(sesion, clave, { progreso: chars, mensaje: texto || (chars ? `Generando (${chars.toLocaleString("es-AR")} caracteres)...` : "Analizando...") }),
      });
      const { costo: costoUsd, aproximado: costoAproximado, precioEncontrado } = calcularCosto({ proveedor: proveedorSkill, modelo: uso.modelo, tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, cacheLeido: uso.cacheLeido });
      totalCosto += costoUsd ?? 0;
      if (!precioEncontrado) costoIncompleto = true;

      // ---- post-proceso ----
      let salida = datos;
      let riesgos = null;
      if (clave === "extractor_antecedentes") {
        sesion.textoAnonimizado = aplicarEntidades(sesion.textoOriginal, datos.entidades, sesion.mapa);
        // El mismo mapa se aplica al modelo y a las instrucciones (ya tienen sus tokens registrados).
        if (sesion.textoModelo) sesion.modeloAnonimizado = reemplazarTodo(sesion.textoModelo, sesion.mapa);
        if (sesion.instrucciones) sesion.instruccionesAnonimizadas = reemplazarTodo(sesion.instrucciones, sesion.mapa);
        salida = anonimizarProfundo(datos, sesion.mapa);
        salida.entidades = salida.entidades.map((e) => ({ ...e, token: datos.entidades.find((d) => d.id_sugerido === e.id_sugerido)?.token || null }));
        // Los textos originales ya no se necesitan: se liberan.
        sesion.textoOriginal = null;
        sesion.textoModelo = null;
        sesion.instrucciones = null;
        if (sesion.modeloAnonimizado && contieneDatosReales(sesion.modeloAnonimizado, sesion.mapa)) throw new AppError("FUGA_DATOS", "El modelo anonimizado contiene datos reales. Abortado.", 500);
        if (sesion.instruccionesAnonimizadas && contieneDatosReales(sesion.instruccionesAnonimizadas, sesion.mapa)) throw new AppError("FUGA_DATOS", "Las instrucciones anonimizadas contienen datos reales. Abortado.", 500);
        mensaje(sesion, `Extraccion completa: ${datos.entidades.length} entidades sensibles anonimizadas. Acto detectado: ${datos.resumen.tipo_acto}.`);
      } else if (clave === "analista_estudio_titulos") {
        riesgos = datos.riesgos.length;
        const bloqueantes = datos.riesgos.filter((r) => r.severidad === "bloqueante").length;
        mensaje(sesion, `Estudio de titulos: tracto ${datos.continuidad_tracto}, ${riesgos} riesgos detectados${bloqueantes ? ` (${bloqueantes} bloqueantes)` : ""}.`, bloqueantes ? "alerta" : "info");
      } else if (clave === "redactor_minuta_escritura") {
        if (contieneDatosReales(datos.texto_escritura, sesion.mapa)) throw new AppError("FUGA_DATOS", "La minuta contiene datos reales. Abortado.", 500);
        const marcasModelo = [...new Set(datos.texto_escritura.match(/\[\[MODELO_[A-Z0-9_]+\]\]/g) || [])];
        if (marcasModelo.length) {
          // Nunca deben llegar al documento final: se convierten en campos a completar.
          for (const m of marcasModelo) {
            const ph = `{{COMPLETAR_${m.slice(2, -2).replace(/^MODELO_/, "")}}}`;
            datos.texto_escritura = datos.texto_escritura.split(m).join(ph);
            datos.variables_faltantes.push({ placeholder: ph, descripcion: "Dato tomado del modelo de otro caso: completar con el dato del caso actual." });
          }
          mensaje(sesion, `La minuta usaba ${marcasModelo.length} marcas del modelo de otro caso; se reemplazaron por campos a completar.`, "alerta");
        }
        mensaje(sesion, `Minuta ${iterando ? "actualizada" : "redactada"} con la plantilla "${plantilla.nombre}". Faltan ${datos.variables_faltantes.length} datos por completar.`);
      } else if (clave === "redactor_certificacion_firmas") {
        for (const campo of ["acta_requerimiento", "certificacion"]) {
          if (contieneDatosReales(datos[campo], sesion.mapa)) throw new AppError("FUGA_DATOS", "La certificacion contiene datos reales. Abortado.", 500);
        }
        const faltantes = datos.documentos_habilitantes_requeridos.filter((d) => d.estado === "faltante").length;
        const atencion = datos.controles.filter((c) => c.resultado !== "ok").length;
        mensaje(sesion, `Certificacion de firmas (${datos.modalidad}) ${iterando ? "actualizada" : "redactada"}: ${datos.firmantes.length} firmante/s${faltantes ? `, ${faltantes} documento/s habilitante/s faltante/s` : ""}${atencion ? `, ${atencion} control/es a revisar` : ""}.`, faltantes || atencion ? "alerta" : "info");
      } else if (clave === "validador_fiscal_registral") {
        const faltantes = datos.certificados.filter((c) => c.estado === "faltante").length;
        mensaje(sesion, `Validacion fiscal y registral: ${faltantes} certificados faltantes, ${datos.inconsistencias.length} inconsistencias. ${datos.apto_para_firma ? "Apto para firma segun el control automatico." : "Requiere acciones previas a la firma."}`, datos.apto_para_firma ? "ok" : "alerta");
      }

      contexto[clave] = salida;
      sesion.resultados[clave] = salida;
      const duracionMs = Date.now() - t0;
      setSkill(sesion, clave, { estado: "completado", mensaje: "Completado", progreso: 100, duracionMs, proveedor: proveedorSkill, modelo: uso.modelo, costoUsd, costoAproximado });
      await auditoria.actualizarSkill(filaId, { estado: "completado", modelo: uso.modelo, proveedor: proveedorSkill, tokensEntrada: uso.tokensEntrada, tokensSalida: uso.tokensSalida, costoUsd, duracionMs, riesgos, finalizadoEn: new Date() });
    } catch (e) {
      const duracionMs = Date.now() - t0;
      const codigo = e.codigo || "ERROR_INESPERADO";
      logger.error("Skill fallido", { sesionId: sesion.id, skill: clave, codigo });
      setSkill(sesion, clave, { estado: "fallido", mensaje: e.message, duracionMs });
      await auditoria.actualizarSkill(filaId, { estado: "fallido", codigoError: codigo, duracionMs, finalizadoEn: new Date() });
      for (const s of sesion.skills) if (s.estado === "pendiente") s.estado = "omitido";
      sesion.estado = "fallida";
      sesion.error = { codigo, mensaje: e.message, skill: clave };
      emitir(sesion, { tipo: "estado", estado: "fallida", error: sesion.error, skills: sesion.skills });
      const totales = (await auditoria.totalesEjecucion(sesion.ejecucionId)) || {};
      await auditoria.finalizarEjecucion(sesion.ejecucionId, { estado: "fallida", entidades: sesion.mapa?.size, tokensEntrada: totales.tokensEntrada, tokensSalida: totales.tokensSalida, costoUsd: totales.costoUsd, duracionMs: Date.now() - inicio });
      return;
    }
  }

  sesion.estado = "completada";
  emitir(sesion, { tipo: "estado", estado: "completada", skills: sesion.skills });
  const totales = (await auditoria.totalesEjecucion(sesion.ejecucionId)) || {};
  const costoTexto =
    totales.costoUsd != null
      ? `Costo estimado de esta sesion: ${formatoUsd(totales.costoUsd)}${totalCosto === 0 && !costoIncompleto ? " (sin costo: modo simulado o IA local)" : ""}.`
      : "No se pudo estimar el costo completo de esta sesion: falta el precio de algun modelo usado (cargarlo en Configuracion → Precios).";
  const finalTexto = iterando
    ? `Nueva version generada (version ${sesion.numeroIteracion || 2}). Puede revisarla, pedir otro ajuste o descargar el documento. ${costoTexto}`
    : `${sesion.modo === "estudio_titulos" ? "Estudio de titulos terminado" : "Proceso terminado"}. Puede revisar los resultados, pedir mejoras o descargar el documento .docx. Al descargarlo, los datos reales se insertan en el archivo y la sesion se borra de la memoria del servidor. ${costoTexto}`;
  mensaje(sesion, finalTexto, "ok");
  await registrarCargoUso({ usuarioId: sesion.usuarioId, ejecucionId: sesion.ejecucionId, costoIaUsd: totales.costoUsd });
  await auditoria.finalizarEjecucion(sesion.ejecucionId, {
    estado: "completada",
    tipoActo: contexto.extractor_antecedentes?.resumen?.tipo_acto,
    plantillaId: plantilla?.id,
    entidades: sesion.mapa.size,
    tokensEntrada: totales.tokensEntrada,
    tokensSalida: totales.tokensSalida,
    costoUsd: totales.costoUsd,
    duracionMs: Date.now() - inicio,
  });
}

function formatoUsd(n) {
  const v = Number(n) || 0;
  return `US$ ${v < 0.01 && v > 0 ? v.toFixed(6) : v.toFixed(4)}`;
}
