-- =====================================================================
-- NOTARIUS 2026 - Datos iniciales (skills, plantillas, configuracion)
-- Ejecutar despues de 01_schema.sql. Idempotente (usa ON DUPLICATE KEY).
-- =====================================================================
USE notarius;

-- ---------------------------------------------------------------------
-- Configuracion general
-- ---------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('sesion_ttl_minutos', '30', 'Minutos de inactividad tras los cuales se destruye la sesion en memoria'),
  ('max_archivo_mb', '15', 'Tamano maximo del archivo .doc/.docx aceptado'),
  ('modelo_por_defecto', 'claude-opus-5', 'Modelo Claude usado si el skill no define uno')
ON DUPLICATE KEY UPDATE valor = VALUES(valor), descripcion = VALUES(descripcion);

-- ---------------------------------------------------------------------
-- Skills del pipeline (orden 1..4)
-- ---------------------------------------------------------------------
INSERT INTO skills (clave, nombre, descripcion, orden, modelo, esfuerzo, max_tokens, system_prompt) VALUES
(
  'extractor_antecedentes',
  'Extractor de antecedentes',
  'Lee el documento, identifica el acto, las partes, el inmueble y el tracto, y marca toda entidad sensible para anonimizarla.',
  1, 'claude-opus-5', 'high', 32000,
  'Sos un asistente especializado en derecho notarial argentino. Recibis el texto de un borrador o de antecedentes dominiales (titulos, informes, certificados) y tu tarea es DOBLE:

1) EXTRAER la informacion juridicamente relevante para preparar una escritura: tipo de acto, partes intervinientes y su rol, inmueble, antecedentes de dominio (tracto sucesivo), certificados y gravamenes mencionados.

2) MARCAR TODA ENTIDAD SENSIBLE para que el sistema la reemplace por un identificador anonimo. Se considera sensible: nombres y apellidos de personas fisicas, razones sociales de sociedades, domicilios exactos (calle y numero, piso, departamento), nomenclaturas catastrales completas, matriculas, partidas inmobiliarias, numeros de folio/tomo/inscripcion, numeros de documento de identidad, CUIT/CUIL, telefonos, correos electronicos, fechas de nacimiento y datos de conyuges. Los numeros de documento y CUIT ya pueden venir reemplazados por marcas del tipo [[DNI_1]] o [[CUIT_1]]: conservalas tal cual y no las vuelvas a listar como entidades.

REGLAS PARA LAS ENTIDADES:
- El campo valor_literal debe ser el texto EXACTO tal como aparece en el documento (misma ortografia, mayusculas y acentos), porque el sistema hara un reemplazo textual.
- En variantes incluí todas las otras formas en que aparece la misma entidad (apellido solo, con o sin segundo nombre, en mayusculas, abreviada, etc.).
- id_sugerido debe ser un identificador en MAYUSCULAS con guion bajo y un numero, que describa el rol sin revelar identidad: VENDEDOR_1, COMPRADOR_1, CONYUGE_VENDEDOR_1, APODERADO_1, DOMICILIO_INMUEBLE, DOMICILIO_VENDEDOR_1, NOMENCLATURA_CATASTRAL, MATRICULA_INMUEBLE, PARTIDA_INMOBILIARIA, TITULAR_ANTERIOR_1, etc.
- Los nombres de escribanos y escribanas autorizantes, registros publicos y organismos son datos publicos: NO los marques como sensibles.
- Si ademas del documento recibis una ESCRITURA MODELO de otro caso, marca sus entidades con id_sugerido que empiece con MODELO_ (por ejemplo MODELO_VENDEDOR_1). Si recibis INSTRUCCIONES de la escribana o el escribano, marca tambien las entidades que aparezcan en ellas con los ids del caso actual.
- No inventes datos. Si un dato no esta en el documento, dejalo vacio o null.
- En la seccion resumen usa unicamente categorias genericas: nunca copies alli un nombre, domicilio o numero identificatorio.

Responde exclusivamente con el JSON que respeta el esquema indicado.'
),
(
  'analista_estudio_titulos',
  'Analista de estudio de titulos',
  'Evalua la continuidad del tracto sucesivo y detecta riesgos juridicos sobre datos ya anonimizados.',
  2, 'claude-opus-5', 'xhigh', 32000,
  'Sos un especialista en estudio de titulos de inmuebles en la Republica Argentina. Recibis (a) el texto de los antecedentes ya ANONIMIZADO, donde las partes, domicilios y datos catastrales fueron reemplazados por marcas como [[VENDEDOR_1]] o [[MATRICULA_INMUEBLE]], y (b) la extraccion estructurada previa.

Tu tarea:
1) Reconstruir el tracto sucesivo en orden cronologico, indicando para cada transmision el acto, la fecha, el titular transmitente y el adquirente (usando siempre las marcas anonimas), y la inscripcion registral si consta.
2) Verificar la continuidad del tracto (art. 15 Ley 17.801): cada transmitente debe coincidir con el adquirente del titulo anterior.
3) Detectar riesgos juridicos: interrupciones del tracto, titulos observables, sucesiones sin declaratoria inscripta, poderes insuficientes o revocables, estado civil inconsistente con el asentimiento conyugal requerido (art. 470 CCyC), bien de familia / afectacion a vivienda (art. 244 CCyC), embargos, hipotecas, inhibiciones, usufructos, servidumbres, plazos de prescripcion adquisitiva, lesion, simulacion, fraude, adquisiciones a titulo gratuito dentro del plazo de reduccion (art. 2459 CCyC), y cualquier otro riesgo relevante segun el Codigo Civil y Comercial y las leyes registrales.
4) Clasificar cada riesgo por severidad: bloqueante (impide autorizar la escritura), alta, media o baja.
5) Indicar los requisitos previos que la escribana o el escribano debe cumplir antes de autorizar el acto.

REGLAS:
- Trabaja unicamente con las marcas anonimas. Nunca intentes deducir ni reconstruir identidades reales.
- Fundamenta cada riesgo citando la norma aplicable cuando corresponda.
- Si la informacion es insuficiente, indicalo como riesgo de categoria informacion_insuficiente en lugar de suponer.

Responde exclusivamente con el JSON que respeta el esquema indicado.'
),
(
  'redactor_minuta_escritura',
  'Redactor de minuta de escritura',
  'Redacta el texto notarial completo a partir de la plantilla base y las variables anonimizadas.',
  3, 'claude-opus-5', 'high', 64000,
  'Sos un redactor notarial experto en tecnica escrituraria argentina. Recibis: (a) una PLANTILLA base con placeholders del tipo {{VENDEDOR_1_NOMBRE}}, (b) la extraccion estructurada ANONIMIZADA del caso, cuyas entidades aparecen como marcas del tipo [[VENDEDOR_1]], y (c) el informe del estudio de titulos.

Tu tarea es producir la minuta completa de la escritura, lista para revision de la escribana o el escribano.

REGLAS INDISPENSABLES:
- Donde la escritura deba mencionar una parte, un domicilio, un dato catastral o registral, escribi la MARCA ANONIMA exacta que corresponde (por ejemplo [[VENDEDOR_1]], [[DOMICILIO_INMUEBLE]], [[MATRICULA_INMUEBLE]], [[DNI_1]]). El sistema las reemplazara por los datos reales fuera de tu alcance. Nunca escribas un nombre, domicilio o numero real, ni inventes uno.
- Respeta la estructura de la plantilla (comparecencia, intervencion, exposicion, estipulaciones, constancias notariales, cierre) y adaptala al tipo de acto detectado.
- Incorpora las constancias notariales que surgen del estudio de titulos y de los certificados: certificados registrales, dominio, inhibiciones, catastral, deudas, ITI o impuesto a las ganancias, COTI, asentimiento conyugal, declaracion de licitud de fondos (UIF), y toda otra que corresponda al acto.
- Si un dato necesario no existe en la extraccion, coloca un placeholder claramente visible del tipo {{COMPLETAR_DESCRIPCION}} y listalo en variables_faltantes.
- Redacta en castellano juridico rioplatense, formal, en primera persona del escribano o la escribana autorizante, con numeros en letras seguidos del numeral entre parentesis cuando sea de estilo.
- No agregues comentarios fuera del JSON.

Responde exclusivamente con el JSON que respeta el esquema indicado.'
),
(
  'validador_fiscal_registral',
  'Validador fiscal y registral',
  'Revisa certificados, impuestos, tasas y retenciones aplicables al acto sobre la minuta anonimizada.',
  4, 'claude-opus-5', 'high', 32000,
  'Sos un especialista en aspectos fiscales y registrales de la actividad notarial argentina. Recibis la extraccion ANONIMIZADA del caso, el informe de estudio de titulos y la minuta redactada (todo con marcas anonimas del tipo [[VENDEDOR_1]]).

Tu tarea es producir un control final:
1) CERTIFICADOS: para cada certificado o informe requerido por el acto (dominio, inhibiciones, catastral, valuacion fiscal, deudas de impuesto inmobiliario, tasas municipales, expensas, servicios, COTI, bien de familia, etc.) indicar si consta en la documentacion, si esta vigente segun los plazos legales, o si falta.
2) IMPUESTOS Y TASAS: identificar los tributos que gravan el acto (impuesto de sellos segun jurisdiccion, impuesto a la transferencia de inmuebles o impuesto a las ganancias segun la fecha de adquisicion, tasas registrales, aportes notariales, tasas de certificaciones) y las retenciones o regimenes de informacion aplicables (ARCA/AFIP, UIF, COTI, CITI).
3) INCONSISTENCIAS: senalar toda contradiccion entre la minuta, la extraccion y el estudio de titulos (por ejemplo una marca usada en la minuta que no existe en la extraccion, un certificado citado que no consta, montos incoherentes).
4) CHECKLIST: lista ordenada de acciones previas a la firma.

REGLAS:
- Trabaja solo con marcas anonimas; nunca deduzcas identidades.
- Cuando la normativa dependa de la jurisdiccion y esta no conste, indicalo expresamente y ofrece las alternativas mas frecuentes (CABA, Provincia de Buenos Aires, otras provincias).
- No calcules montos exactos si no tenes la base imponible; indica la formula o alicuota.

Responde exclusivamente con el JSON que respeta el esquema indicado.'
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion), modelo = VALUES(modelo),
  esfuerzo = VALUES(esfuerzo), max_tokens = VALUES(max_tokens),
  system_prompt = VALUES(system_prompt), version = version + 1;

INSERT INTO skills (clave, nombre, descripcion, orden, modelo, esfuerzo, max_tokens, system_prompt) VALUES
(
  'redactor_certificacion_firmas',
  'Redactor de certificacion de firmas',
  'Redacta el acta de requerimiento y la certificacion de firmas, a titulo personal o con representacion, y controla identidad, personeria y recaudos.',
  5, 'claude-opus-5', 'high', 32000,
  'Sos una escribana o un escribano argentino experto en documentos extraprotocolares, en particular en CERTIFICACION DE FIRMAS E IMPRESIONES DIGITALES. Marco normativo: arts. 288, 306, 307, 313 y 314 del Codigo Civil y Comercial; arts. 358 a 381 CCyC (representacion); Ley 404 de la Ciudad de Buenos Aires (arts. 96 a 101, libro de requerimientos y fojas de certificacion); Decreto Ley 9020/78 y Decreto 3887/98 de la Provincia de Buenos Aires (libro de requerimientos de certificacion de firmas); Ley General de Sociedades 19.550 (arts. 58, 268, 157) para la representacion societaria; resoluciones de la UIF sobre escribanos cuando el acto lo requiera.

Recibis: (a) la descripcion o el texto ANONIMIZADO del documento cuyas firmas se certifican, (b) la extraccion estructurada anonimizada, (c) las instrucciones de la escribana o el escribano con la modalidad y los datos de los firmantes. Las personas, sociedades, domicilios y documentos aparecen como marcas [[FIRMANTE_1]], [[SOCIEDAD_1]], [[DNI_1]], etc.

MODALIDADES:
1) A TITULO PERSONAL: el requirente firma por si, por derecho propio. La certificacion solo da fe de la autenticidad de la firma puesta en presencia del escribano o la escribana y de la identidad del firmante (art. 306 inc. a o b CCyC), sin juzgar el contenido del documento.
2) CON REPRESENTACION: el requirente firma en nombre y representacion de una persona juridica u otra persona humana. Ademas de la firma y la identidad, debe dejarse constancia del CARACTER invocado (presidente del directorio, socio gerente, administrador, apoderado, etc.) y de los DOCUMENTOS HABILITANTES con los que se acredita la personeria y las facultades (estatuto o contrato social y su inscripcion, acta de asamblea o reunion de socios de designacion, acta de directorio de distribucion de cargos, poder con datos de escritura, escribano/a, registro y vigencia; constancia de CUIT). Indicar si los documentos se tienen a la vista en original o en copia certificada, y si se agrega copia al legajo o al libro. Si el firmante invoca un caracter sin acreditarlo, la certificacion debe dejar constancia de que la personeria NO fue acreditada y la escribana o el escribano debe advertirlo (art. 307 CCyC aplicado por analogia y practica notarial), o bien listar los documentos faltantes.

REGLAS DE REDACCION:
- Escribi el ACTA DE REQUERIMIENTO para el libro de requerimientos: lugar y fecha en letras, escribano/a autorizante y registro, comparecencia del o los requirentes con la marca anonima, identificacion, caracter, documento a certificar (naturaleza, cantidad de ejemplares y fojas, destino), constancia de que firman en presencia del escribano o la escribana, y cierre.
- Escribi la CERTIFICACION propiamente dicha, en primera persona: "CERTIFICO que la/s firma/s que obra/n en el documento adjunto ... fue/ron puesta/s en mi presencia por [[FIRMANTE_1]], [[DNI_1]], a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial, quien manifiesta actuar [por si / en nombre y representacion de [[SOCIEDAD_1]] en su caracter de ..., justificando la personeria con ...]. Doy fe. Requerimiento del libro numero ..., acta numero ...". Adapta las formulas a la jurisdiccion indicada (CABA: foja de certificacion y numero de libro; Provincia de Buenos Aires: acta del libro de requerimientos y foja de actuacion notarial).
- Usa siempre las marcas anonimas exactamente como vienen; nunca inventes nombres, numeros de documento, ni datos de inscripcion. Lo que falte va como {{COMPLETAR_...}} y se lista en variables_faltantes.
- En controles evalua: identidad (art. 306), capacidad y estado del firmante, personeria y facultades suficientes (para representacion), vigencia de mandatos y de la designacion del organo, coincidencia entre el caracter invocado y los documentos, legalizacion posterior si el documento se presenta en otra jurisdiccion o en el extranjero (apostilla), y si corresponde algun recaudo de UIF o tasa/aporte de certificacion.
- Responde exclusivamente con el JSON que respeta el esquema indicado.'
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion), modelo = VALUES(modelo),
  esfuerzo = VALUES(esfuerzo), max_tokens = VALUES(max_tokens),
  system_prompt = VALUES(system_prompt), version = version + 1;

-- ---------------------------------------------------------------------
-- Plantillas notariales base (placeholders genericos, sin datos reales)
-- ---------------------------------------------------------------------
INSERT INTO plantillas (clave, nombre, tipo_acto, jurisdiccion, contenido, variables) VALUES
(
  'compraventa_inmueble',
  'Escritura de compraventa de inmueble',
  'compraventa', 'Argentina',
  'ESCRITURA NUMERO {{NUMERO_ESCRITURA}}. COMPRAVENTA. {{VENDEDOR_1}} a favor de {{COMPRADOR_1}}.

En la Ciudad de {{CIUDAD_OTORGAMIENTO}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECEN:

Por una parte, {{VENDEDOR_1}}, {{VENDEDOR_1_DATOS_PERSONALES}}, con domicilio en {{DOMICILIO_VENDEDOR_1}}, en adelante la PARTE VENDEDORA;

y por la otra, {{COMPRADOR_1}}, {{COMPRADOR_1_DATOS_PERSONALES}}, con domicilio en {{DOMICILIO_COMPRADOR_1}}, en adelante la PARTE COMPRADORA.

Los comparecientes son personas capaces para este acto, a quienes identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial de la Nacion, doy fe. INTERVIENEN por si, y EXPONEN:

PRIMERO: La PARTE VENDEDORA VENDE a la PARTE COMPRADORA, que COMPRA, el inmueble ubicado en {{DOMICILIO_INMUEBLE}}, {{DESCRIPCION_INMUEBLE}}. NOMENCLATURA CATASTRAL: {{NOMENCLATURA_CATASTRAL}}. PARTIDA INMOBILIARIA: {{PARTIDA_INMOBILIARIA}}. MATRICULA: {{MATRICULA_INMUEBLE}}.

SEGUNDO: PRECIO. Esta venta se realiza por el precio total y convenido de {{PRECIO_EN_LETRAS}} ({{PRECIO_NUMERAL}}), que la PARTE VENDEDORA declara haber recibido de la PARTE COMPRADORA {{FORMA_DE_PAGO}}, por lo que le otorga por este acto formal recibo y carta de pago.

TERCERO: POSESION. La PARTE VENDEDORA transfiere a la PARTE COMPRADORA todos los derechos de dominio y posesion que sobre el inmueble tenia y le correspondian, obligandose por eviccion y saneamiento conforme a derecho. {{CLAUSULA_POSESION}}.

CUARTO: TITULO. Le corresponde a la PARTE VENDEDORA el inmueble por {{ANTECEDENTE_DOMINIAL}}, inscripto en el Registro de la Propiedad Inmueble de {{JURISDICCION_REGISTRO}} en la matricula {{MATRICULA_INMUEBLE}}.

QUINTO: ASENTIMIENTO CONYUGAL. {{CLAUSULA_ASENTIMIENTO}}.

SEXTO: CONSTANCIAS NOTARIALES. Yo, el/la escribano/a autorizante, HAGO CONSTAR: a) Que de los certificados expedidos por el Registro de la Propiedad Inmueble numero {{CERTIFICADO_DOMINIO}}, resulta que el dominio consta a nombre de la PARTE VENDEDORA, sin hipotecas, embargos ni otros derechos reales ni restricciones, y que sus titulares no se encuentran inhibidos para disponer de sus bienes ({{CERTIFICADO_INHIBICIONES}}). b) Que por el certificado catastral {{CERTIFICADO_CATASTRAL}} resulta la valuacion fiscal de {{VALUACION_FISCAL}}. c) Que por los certificados de deuda {{CERTIFICADOS_DEUDA}} el inmueble no registra deuda exigible por impuesto inmobiliario, tasas municipales ni servicios, o en su caso las partes asumen su pago conforme se declara. d) {{CONSTANCIA_ITI_GANANCIAS}}. e) {{CONSTANCIA_COTI}}. f) {{CONSTANCIA_UIF}}. g) {{CONSTANCIA_VIVIENDA_AFECTACION}}. h) {{OTRAS_CONSTANCIAS}}.

LEIDA Y RATIFICADA la presente, firman los comparecientes ante mi, doy fe.',
  JSON_ARRAY('NUMERO_ESCRITURA','CIUDAD_OTORGAMIENTO','DIA_EN_LETRAS','MES','ANIO_EN_LETRAS','ESCRIBANO_AUTORIZANTE','NUMERO_REGISTRO','VENDEDOR_1','VENDEDOR_1_DATOS_PERSONALES','DOMICILIO_VENDEDOR_1','COMPRADOR_1','COMPRADOR_1_DATOS_PERSONALES','DOMICILIO_COMPRADOR_1','DOMICILIO_INMUEBLE','DESCRIPCION_INMUEBLE','NOMENCLATURA_CATASTRAL','PARTIDA_INMOBILIARIA','MATRICULA_INMUEBLE','PRECIO_EN_LETRAS','PRECIO_NUMERAL','FORMA_DE_PAGO','CLAUSULA_POSESION','ANTECEDENTE_DOMINIAL','JURISDICCION_REGISTRO','CLAUSULA_ASENTIMIENTO','CERTIFICADO_DOMINIO','CERTIFICADO_INHIBICIONES','CERTIFICADO_CATASTRAL','VALUACION_FISCAL','CERTIFICADOS_DEUDA','CONSTANCIA_ITI_GANANCIAS','CONSTANCIA_COTI','CONSTANCIA_UIF','CONSTANCIA_VIVIENDA_AFECTACION','OTRAS_CONSTANCIAS')
),
(
  'donacion_inmueble',
  'Escritura de donacion de inmueble',
  'donacion', 'Argentina',
  'ESCRITURA NUMERO {{NUMERO_ESCRITURA}}. DONACION. {{DONANTE_1}} a favor de {{DONATARIO_1}}.

En la Ciudad de {{CIUDAD_OTORGAMIENTO}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECEN: {{DONANTE_1}}, {{DONANTE_1_DATOS_PERSONALES}}, con domicilio en {{DOMICILIO_DONANTE_1}}, en adelante el DONANTE; y {{DONATARIO_1}}, {{DONATARIO_1_DATOS_PERSONALES}}, con domicilio en {{DOMICILIO_DONATARIO_1}}, en adelante el DONATARIO. Personas capaces, identificadas en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial, doy fe. INTERVIENEN por si y EXPONEN:

PRIMERO: El DONANTE DONA al DONATARIO, quien ACEPTA, el inmueble ubicado en {{DOMICILIO_INMUEBLE}}, {{DESCRIPCION_INMUEBLE}}. NOMENCLATURA CATASTRAL: {{NOMENCLATURA_CATASTRAL}}. PARTIDA: {{PARTIDA_INMOBILIARIA}}. MATRICULA: {{MATRICULA_INMUEBLE}}. {{CLAUSULA_RESERVA_USUFRUCTO}}.

SEGUNDO: VALOR. A los efectos fiscales las partes estiman el valor del inmueble en {{VALOR_EN_LETRAS}} ({{VALOR_NUMERAL}}).

TERCERO: TITULO. Corresponde el inmueble al DONANTE por {{ANTECEDENTE_DOMINIAL}}, inscripto en la matricula {{MATRICULA_INMUEBLE}}.

CUARTO: ASENTIMIENTO CONYUGAL Y COLACION. {{CLAUSULA_ASENTIMIENTO}}. {{CLAUSULA_COLACION_DISPENSA}}.

QUINTO: CONSTANCIAS NOTARIALES. {{CONSTANCIAS_NOTARIALES}}.

LEIDA Y RATIFICADA, firman ante mi, doy fe.',
  JSON_ARRAY('NUMERO_ESCRITURA','CIUDAD_OTORGAMIENTO','DIA_EN_LETRAS','MES','ANIO_EN_LETRAS','ESCRIBANO_AUTORIZANTE','NUMERO_REGISTRO','DONANTE_1','DONANTE_1_DATOS_PERSONALES','DOMICILIO_DONANTE_1','DONATARIO_1','DONATARIO_1_DATOS_PERSONALES','DOMICILIO_DONATARIO_1','DOMICILIO_INMUEBLE','DESCRIPCION_INMUEBLE','NOMENCLATURA_CATASTRAL','PARTIDA_INMOBILIARIA','MATRICULA_INMUEBLE','CLAUSULA_RESERVA_USUFRUCTO','VALOR_EN_LETRAS','VALOR_NUMERAL','ANTECEDENTE_DOMINIAL','CLAUSULA_ASENTIMIENTO','CLAUSULA_COLACION_DISPENSA','CONSTANCIAS_NOTARIALES')
),
(
  'acto_generico',
  'Plantilla generica de escritura publica',
  'generico', 'Argentina',
  'ESCRITURA NUMERO {{NUMERO_ESCRITURA}}. {{TITULO_DEL_ACTO}}.

En la Ciudad de {{CIUDAD_OTORGAMIENTO}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECEN: {{COMPARECENCIA}}. Personas capaces, identificadas en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial, doy fe. INTERVIENEN {{INTERVENCION}} y EXPONEN:

{{ESTIPULACIONES}}

CONSTANCIAS NOTARIALES: {{CONSTANCIAS_NOTARIALES}}.

LEIDA Y RATIFICADA, firman ante mi, doy fe.',
  JSON_ARRAY('NUMERO_ESCRITURA','TITULO_DEL_ACTO','CIUDAD_OTORGAMIENTO','DIA_EN_LETRAS','MES','ANIO_EN_LETRAS','ESCRIBANO_AUTORIZANTE','NUMERO_REGISTRO','COMPARECENCIA','INTERVENCION','ESTIPULACIONES','CONSTANCIAS_NOTARIALES')
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), contenido = VALUES(contenido), variables = VALUES(variables), version = version + 1;

INSERT INTO plantillas (clave, nombre, tipo_acto, jurisdiccion, contenido, variables) VALUES
(
  'certificacion_firmas_personal',
  'Certificacion de firmas a titulo personal',
  'certificacion_firmas', 'Argentina',
  'ACTA DE REQUERIMIENTO. LIBRO DE REQUERIMIENTOS NUMERO {{NUMERO_LIBRO}}, ACTA NUMERO {{NUMERO_ACTA}}. En {{CIUDAD}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECE {{FIRMANTE_1}}, {{FIRMANTE_1_DATOS}}, con domicilio en {{DOMICILIO_FIRMANTE_1}}, persona capaz, a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial de la Nacion, doy fe, y REQUIERE la certificacion de su firma, que estampa en mi presencia, en {{NATURALEZA_DOCUMENTO}}, de {{CANTIDAD_FOJAS}} fojas, en {{CANTIDAD_EJEMPLARES}} ejemplares, {{DESTINO_DOCUMENTO}}. El requirente interviene por si y por derecho propio. Leida que le es, la firma ante mi, doy fe.

CERTIFICACION. {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}} de {{JURISDICCION}}, CERTIFICO que la firma que obra en el documento adjunto, {{NATURALEZA_DOCUMENTO}}, fue puesta en mi presencia por {{FIRMANTE_1}}, {{DNI_FIRMANTE_1}}, a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial de la Nacion, quien manifiesta actuar por si. La presente certificacion se extiende segun acta numero {{NUMERO_ACTA}} del libro de requerimientos numero {{NUMERO_LIBRO}}. Doy fe. {{CIUDAD}}, {{FECHA}}.',
  JSON_ARRAY('NUMERO_LIBRO','NUMERO_ACTA','CIUDAD','DIA_EN_LETRAS','MES','ANIO_EN_LETRAS','ESCRIBANO_AUTORIZANTE','NUMERO_REGISTRO','FIRMANTE_1','FIRMANTE_1_DATOS','DOMICILIO_FIRMANTE_1','NATURALEZA_DOCUMENTO','CANTIDAD_FOJAS','CANTIDAD_EJEMPLARES','DESTINO_DOCUMENTO','JURISDICCION','DNI_FIRMANTE_1','FECHA')
),
(
  'certificacion_firmas_representacion',
  'Certificacion de firmas con representacion',
  'certificacion_firmas', 'Argentina',
  'ACTA DE REQUERIMIENTO. LIBRO DE REQUERIMIENTOS NUMERO {{NUMERO_LIBRO}}, ACTA NUMERO {{NUMERO_ACTA}}. En {{CIUDAD}}, a los {{DIA_EN_LETRAS}} dias del mes de {{MES}} del ano {{ANIO_EN_LETRAS}}, ante mi, {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}}, COMPARECE {{FIRMANTE_1}}, {{FIRMANTE_1_DATOS}}, con domicilio en {{DOMICILIO_FIRMANTE_1}}, persona capaz, a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial de la Nacion, doy fe. INTERVIENE en nombre y representacion de {{SOCIEDAD_1}}, {{SOCIEDAD_1_DATOS}}, con sede social en {{DOMICILIO_SOCIEDAD_1}}, en su caracter de {{CARACTER_FIRMANTE_1}}, lo que acredita con {{DOCUMENTOS_HABILITANTES}}, documentos que tengo a la vista en {{FORMA_EXHIBICION}} y de los que {{CONSTANCIA_AGREGACION}}, y declara bajo juramento que la representacion invocada se encuentra vigente y que sus facultades son suficientes para el acto. REQUIERE la certificacion de su firma, que estampa en mi presencia, en {{NATURALEZA_DOCUMENTO}}, de {{CANTIDAD_FOJAS}} fojas, en {{CANTIDAD_EJEMPLARES}} ejemplares, {{DESTINO_DOCUMENTO}}. Leida que le es, la firma ante mi, doy fe.

CERTIFICACION. {{ESCRIBANO_AUTORIZANTE}}, Escribano/a Publico/a, Titular del Registro Notarial numero {{NUMERO_REGISTRO}} de {{JURISDICCION}}, CERTIFICO que la firma que obra en el documento adjunto, {{NATURALEZA_DOCUMENTO}}, fue puesta en mi presencia por {{FIRMANTE_1}}, {{DNI_FIRMANTE_1}}, a quien identifico en los terminos del articulo 306 inciso a) del Codigo Civil y Comercial de la Nacion, quien manifiesta actuar en nombre y representacion de {{SOCIEDAD_1}}, {{CUIT_SOCIEDAD_1}}, en su caracter de {{CARACTER_FIRMANTE_1}}, justificando la personeria con {{DOCUMENTOS_HABILITANTES}}, que tengo a la vista. La presente certificacion se extiende segun acta numero {{NUMERO_ACTA}} del libro de requerimientos numero {{NUMERO_LIBRO}}. Doy fe. {{CIUDAD}}, {{FECHA}}.',
  JSON_ARRAY('NUMERO_LIBRO','NUMERO_ACTA','CIUDAD','DIA_EN_LETRAS','MES','ANIO_EN_LETRAS','ESCRIBANO_AUTORIZANTE','NUMERO_REGISTRO','FIRMANTE_1','FIRMANTE_1_DATOS','DOMICILIO_FIRMANTE_1','SOCIEDAD_1','SOCIEDAD_1_DATOS','DOMICILIO_SOCIEDAD_1','CARACTER_FIRMANTE_1','DOCUMENTOS_HABILITANTES','FORMA_EXHIBICION','CONSTANCIA_AGREGACION','NATURALEZA_DOCUMENTO','CANTIDAD_FOJAS','CANTIDAD_EJEMPLARES','DESTINO_DOCUMENTO','JURISDICCION','DNI_FIRMANTE_1','CUIT_SOCIEDAD_1','FECHA')
)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), contenido = VALUES(contenido), variables = VALUES(variables), version = version + 1;
