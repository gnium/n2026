USE notarius;

-- ITI derogado (Ley 27.743, julio 2024), COTI (RG ARCA 5697/25) y CITI
-- Escribanos (RG ARCA 5698/25) derogados: los skills y la plantilla de
-- compraventa no deben pedirlos. REPLACE es idempotente: si el texto ya
-- no esta, no cambia nada (y no pisa ediciones posteriores).

UPDATE skills
   SET system_prompt = REPLACE(system_prompt,
         'deudas, ITI o impuesto a las ganancias, COTI, asentimiento conyugal',
         'deudas, impuesto cedular a las ganancias o su exencion segun corresponda (no incluyas ITI, COTI ni CITI: estan derogados), asentimiento conyugal'),
       version = version + 1
 WHERE clave = 'redactor_minuta_escritura'
   AND system_prompt LIKE '%ITI o impuesto a las ganancias, COTI,%';

UPDATE skills
   SET system_prompt = REPLACE(REPLACE(REPLACE(system_prompt,
         'servicios, COTI, bien de familia',
         'servicios, bien de familia'),
         'impuesto a la transferencia de inmuebles o impuesto a las ganancias segun la fecha de adquisicion',
         'impuesto cedular a las ganancias cuando corresponda'),
         '(ARCA/AFIP, UIF, COTI, CITI).',
         '(ARCA, UIF). El ITI (Ley 27.743), el COTI (RG ARCA 5697/25) y el CITI Escribanos (RG ARCA 5698/25) estan derogados: no los exijas ni los marques como faltantes.'),
       version = version + 1
 WHERE clave = 'validador_fiscal_registral'
   AND system_prompt LIKE '%(ARCA/AFIP, UIF, COTI, CITI)%';

UPDATE plantillas
   SET contenido = REPLACE(contenido,
         'd) {{CONSTANCIA_ITI_GANANCIAS}}. e) {{CONSTANCIA_COTI}}. f) {{CONSTANCIA_UIF}}. g) {{CONSTANCIA_VIVIENDA_AFECTACION}}. h) {{OTRAS_CONSTANCIAS}}.',
         'd) {{CONSTANCIA_GANANCIAS}}. e) {{CONSTANCIA_UIF}}. f) {{CONSTANCIA_VIVIENDA_AFECTACION}}. g) {{OTRAS_CONSTANCIAS}}.'),
       variables = JSON_REMOVE(
         JSON_REPLACE(variables, JSON_UNQUOTE(JSON_SEARCH(variables, 'one', 'CONSTANCIA_ITI_GANANCIAS')), 'CONSTANCIA_GANANCIAS'),
         JSON_UNQUOTE(JSON_SEARCH(variables, 'one', 'CONSTANCIA_COTI'))),
       version = version + 1
 WHERE clave = 'compraventa_inmueble'
   AND JSON_SEARCH(variables, 'one', 'CONSTANCIA_COTI') IS NOT NULL
   AND JSON_SEARCH(variables, 'one', 'CONSTANCIA_ITI_GANANCIAS') IS NOT NULL;
