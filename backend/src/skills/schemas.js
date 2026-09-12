/**
 * Esquemas de salida (Zod) de cada skill. Se usan tanto para pedir salida
 * estructurada a Claude como para validar lo recibido.
 * Convencion: campos que pueden faltar se declaran .nullable(), no .optional().
 */
import { z } from "zod";

const texto = z.string();
const textoNull = z.string().nullable();

export const EsquemaExtractor = z.object({
  resumen: z.object({
    tipo_acto: z.enum(["compraventa", "donacion", "hipoteca", "permuta", "cesion", "sucesion", "poder", "certificacion_firmas", "otro"]),
    descripcion_generica: texto, // sin nombres ni domicilios
    cantidad_partes: z.number().int(),
    jurisdiccion_probable: textoNull,
    idioma: textoNull,
  }),
  entidades: z.array(
    z.object({
      id_sugerido: texto,
      categoria: z.enum(["persona", "sociedad", "domicilio", "catastro", "registral", "documento_identidad", "conyuge", "otro"]),
      rol: textoNull, // vendedor, comprador, apoderado, titular anterior...
      valor_literal: texto, // texto exacto en el documento (se elimina de la copia anonimizada)
      variantes: z.array(texto), // otras formas en que aparece
      atributos: z.object({
        estado_civil: textoNull,
        nacionalidad: textoNull,
        caracter: textoNull, // por si, en representacion, apoderado...
        observaciones: textoNull,
      }),
    }),
  ),
  inmueble: z.object({
    tipo: textoNull, // lote, unidad funcional, casa...
    descripcion_generica: textoNull,
    superficie: textoNull,
    tokens_relacionados: z.array(texto), // ids sugeridos de domicilio/catastro/matricula
  }),
  antecedentes_dominiales: z.array(
    z.object({
      orden: z.number().int(),
      tipo_acto: texto,
      fecha: textoNull,
      escribano_o_registro: textoNull,
      inscripcion: textoNull,
      transmitente_id: textoNull, // id sugerido
      adquirente_id: textoNull,
      observaciones: textoNull,
    }),
  ),
  certificados_mencionados: z.array(z.object({ nombre: texto, fecha: textoNull, numero_o_referencia: textoNull, vigencia: textoNull })),
  gravamenes: z.array(z.object({ tipo: texto, detalle: textoNull, vigente: z.boolean().nullable() })),
  datos_economicos: z.object({ precio_o_valor: textoNull, moneda: textoNull, forma_de_pago: textoNull }),
});

export const EsquemaAnalista = z.object({
  tracto_sucesivo: z.array(
    z.object({
      orden: z.number().int(),
      acto: texto,
      fecha: textoNull,
      transmitente: textoNull, // marca anonima
      adquirente: textoNull,
      inscripcion: textoNull,
      observacion: textoNull,
    }),
  ),
  continuidad_tracto: z.enum(["continuo", "interrumpido", "indeterminado"]),
  riesgos: z.array(
    z.object({
      severidad: z.enum(["bloqueante", "alta", "media", "baja"]),
      categoria: texto,
      descripcion: texto,
      fundamento_legal: textoNull,
      recomendacion: texto,
    }),
  ),
  requisitos_previos: z.array(texto),
  conclusion: texto,
});

export const EsquemaRedactor = z.object({
  titulo: texto,
  plantilla_utilizada: texto,
  texto_escritura: texto, // con marcas [[...]] intactas y {{COMPLETAR_...}} para faltantes
  variables_faltantes: z.array(z.object({ placeholder: texto, descripcion: texto })),
  notas_para_escribana: z.array(texto),
});

export const EsquemaValidador = z.object({
  certificados: z.array(
    z.object({
      nombre: texto,
      estado: z.enum(["presente_vigente", "presente_vencido", "presente_verificar", "faltante", "no_aplica"]),
      detalle: textoNull,
      plazo_legal: textoNull,
    }),
  ),
  impuestos_y_tasas: z.array(
    z.object({
      concepto: texto,
      aplica: z.enum(["si", "no", "depende"]),
      jurisdiccion: textoNull,
      alicuota_o_formula: textoNull,
      sujeto_obligado: textoNull,
      observacion: textoNull,
    }),
  ),
  regimenes_informacion: z.array(z.object({ nombre: texto, aplica: z.enum(["si", "no", "depende"]), observacion: textoNull })),
  inconsistencias: z.array(z.object({ severidad: z.enum(["alta", "media", "baja"]), descripcion: texto, sugerencia: textoNull })),
  checklist_previo_firma: z.array(z.object({ orden: z.number().int(), accion: texto, responsable: textoNull })),
  apto_para_firma: z.boolean(),
  resumen: texto,
});

export const EsquemaCertificacion = z.object({
  modalidad: z.enum(["personal", "representacion"]),
  documento_certificado: z.object({ naturaleza: texto, ejemplares: z.number().int().nullable(), fojas: z.number().int().nullable(), destino: textoNull }),
  firmantes: z.array(
    z.object({
      marca: texto, // [[FIRMANTE_1]]
      caracter: texto, // "por si" | "presidente del directorio de [[SOCIEDAD_1]]" ...
      representa_a: textoNull, // marca de la sociedad/persona representada
      documentos_habilitantes: z.array(texto),
      identificacion: texto, // art. 306 inc. a) o b) CCyC
    }),
  ),
  acta_requerimiento: texto, // texto completo para el libro de requerimientos, con marcas [[...]]
  certificacion: texto, // texto de la certificacion (foja/anexo al documento), con marcas
  documentos_habilitantes_requeridos: z.array(z.object({ documento: texto, estado: z.enum(["acreditado", "faltante", "verificar", "no_aplica"]), detalle: textoNull })),
  controles: z.array(z.object({ control: texto, resultado: z.enum(["ok", "atencion", "faltante"]), fundamento: textoNull, detalle: textoNull })),
  variables_faltantes: z.array(z.object({ placeholder: texto, descripcion: texto })),
  notas_para_escribana: z.array(texto),
});

export const ESQUEMAS = {
  extractor_antecedentes: EsquemaExtractor,
  analista_estudio_titulos: EsquemaAnalista,
  redactor_minuta_escritura: EsquemaRedactor,
  validador_fiscal_registral: EsquemaValidador,
  redactor_certificacion_firmas: EsquemaCertificacion,
};
