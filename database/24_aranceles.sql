-- =====================================================================
-- Aranceles y alícuotas por jurisdicción. Cada fila es un rubro que
-- se calcula sobre el monto de la operación, los honorarios u otro
-- valor base. El frontend los usa para auto-generar items de presupuesto.
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS aranceles (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  jurisdiccion   VARCHAR(40)  NOT NULL,
  categoria      VARCHAR(60)  NOT NULL,
  tipo_acto      VARCHAR(40)  NULL,
  nombre         VARCHAR(160) NOT NULL,
  tipo_calculo   ENUM('porcentaje','fijo','por_unidad','escala') NOT NULL,
  valor          DECIMAL(12,4) NULL,
  escala         JSON         NULL,
  base           ENUM('monto_operacion','honorarios','valor_fiscal') NOT NULL DEFAULT 'monto_operacion',
  quien_paga     ENUM('comprador','vendedor','ambos','escribano','cliente') NOT NULL DEFAULT 'cliente',
  obligatorio    TINYINT(1)   NOT NULL DEFAULT 1,
  orden          SMALLINT     NOT NULL DEFAULT 0,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  vigente_desde  DATE         NULL,
  vigente_hasta  DATE         NULL,
  notas          VARCHAR(300) NULL,
  creado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_aranceles_jurisdiccion (jurisdiccion, tipo_acto, activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: Salta - compraventa de inmuebles (Ley 5134, Ley 6611 Art. 16, Ley 3221)
INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, escala, base, quien_paga, obligatorio, orden, notas) VALUES
('salta', 'honorarios',     'compraventa', 'Honorarios del escribano',      'escala', NULL, '[{"hasta":20000000,"valor":2.0},{"hasta":60000000,"valor":1.5},{"hasta":150000000,"valor":1.2},{"hasta":null,"valor":1.0}]', 'monto_operacion', 'cliente',    1, 10, 'Ley 5134 Art. 2-3, escala indicativa'),
('salta', 'iva_honorarios', 'compraventa', 'IVA sobre honorarios (21%)',     'porcentaje', 21.0000, NULL, 'honorarios', 'cliente',    1, 20, 'IVA general sobre honorarios profesionales'),
('salta', 'sellos',         'compraventa', 'Impuesto de Sellos (2,5%)',      'porcentaje', 2.5000, NULL, 'monto_operacion', 'ambos',  1, 30, 'Ley 6611 Art. 16 inc. 1 — 25‰ derechos reales sobre inmuebles'),
('salta', 'aportes_colegio','compraventa', 'Aporte jubilatorio Colegio (11%)','porcentaje', 11.0000, NULL, 'honorarios', 'escribano', 1, 40, 'Ley 3221 Art. 5.a — Caja de Previsión Social'),
('salta', 'aportes_partes', 'compraventa', 'Aporte de las partes (4%)',      'porcentaje', 4.0000, NULL, 'honorarios', 'ambos',      1, 50, 'Ley 3221 Art. 5.b — otorgantes'),
('salta', 'iti',            'compraventa', 'ITI (1,5%)',                     'porcentaje', 1.5000, NULL, 'monto_operacion', 'vendedor',1, 60, 'Ley 23.905 — Imp. Transferencia Inmuebles'),
('salta', 'inscripcion_dgi','compraventa', 'Inscripción registral DGI',      'porcentaje', 0.3000, NULL, 'monto_operacion', 'comprador',1, 70, 'Dir. Gral. de Inmuebles de Salta'),
('salta', 'certificados',   'compraventa', 'Certificado de dominio',         'fijo', 35000.0000, NULL, 'monto_operacion', 'comprador',1, 80, 'DGI Salta — valor aproximado'),
('salta', 'certificados',   'compraventa', 'Certificado de inhibiciones',    'fijo', 25000.0000, NULL, 'monto_operacion', 'comprador',1, 90, 'DGI Salta — valor aproximado'),
('salta', 'certificados',   'compraventa', 'Informe catastral',              'fijo', 25000.0000, NULL, 'monto_operacion', 'comprador',1, 100, 'DGI Salta — valor aproximado'),
('salta', 'certificados',   'compraventa', 'Libre deuda provincial (DGR)',   'fijo', 15000.0000, NULL, 'monto_operacion', 'comprador',1, 110, 'Dir. Gral. de Rentas — valor aproximado'),
('salta', 'certificados',   'compraventa', 'Libre deuda municipal',          'fijo', 12000.0000, NULL, 'monto_operacion', 'comprador',1, 120, 'Municipalidad — valor aproximado'),
('salta', 'fojas',          'compraventa', 'Fojas de protocolo',             'por_unidad', 300.0000, NULL, 'monto_operacion', 'cliente',0, 130, 'Código Fiscal de Salta — $300/foja');

-- Salta - donación
INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, escala, base, quien_paga, obligatorio, orden, notas) VALUES
('salta', 'honorarios',     'donacion', 'Honorarios del escribano',       'escala', NULL, '[{"hasta":20000000,"valor":2.0},{"hasta":60000000,"valor":1.5},{"hasta":150000000,"valor":1.2},{"hasta":null,"valor":1.0}]', 'monto_operacion', 'cliente',    1, 10, 'Ley 5134'),
('salta', 'iva_honorarios', 'donacion', 'IVA sobre honorarios (21%)',     'porcentaje', 21.0000, NULL, 'honorarios', 'cliente',    1, 20, NULL),
('salta', 'sellos',         'donacion', 'Impuesto de Sellos (2,5%)',      'porcentaje', 2.5000, NULL, 'monto_operacion', 'ambos',  1, 30, 'Ley 6611 Art. 16 inc. 1'),
('salta', 'aportes_colegio','donacion', 'Aporte jubilatorio Colegio (11%)','porcentaje', 11.0000, NULL, 'honorarios', 'escribano', 1, 40, 'Ley 3221'),
('salta', 'aportes_partes', 'donacion', 'Aporte de las partes (4%)',      'porcentaje', 4.0000, NULL, 'honorarios', 'ambos',      1, 50, 'Ley 3221'),
('salta', 'inscripcion_dgi','donacion', 'Inscripción registral DGI',      'porcentaje', 0.3000, NULL, 'monto_operacion', 'cliente',1, 70, NULL),
('salta', 'certificados',   'donacion', 'Certificado de dominio',         'fijo', 35000.0000, NULL, 'monto_operacion', 'cliente', 1, 80, NULL),
('salta', 'certificados',   'donacion', 'Certificado de inhibiciones',    'fijo', 25000.0000, NULL, 'monto_operacion', 'cliente', 1, 90, NULL);

-- Salta - hipoteca
INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, escala, base, quien_paga, obligatorio, orden, notas) VALUES
('salta', 'honorarios',     'hipoteca', 'Honorarios del escribano',       'escala', NULL, '[{"hasta":20000000,"valor":2.0},{"hasta":60000000,"valor":1.5},{"hasta":150000000,"valor":1.2},{"hasta":null,"valor":1.0}]', 'monto_operacion', 'cliente',    1, 10, 'Ley 5134'),
('salta', 'iva_honorarios', 'hipoteca', 'IVA sobre honorarios (21%)',     'porcentaje', 21.0000, NULL, 'honorarios', 'cliente',    1, 20, NULL),
('salta', 'sellos',         'hipoteca', 'Impuesto de Sellos (1,2%)',      'porcentaje', 1.2000, NULL, 'monto_operacion', 'ambos',  1, 30, 'Ley 6611 Art. 16 inc. 3 — hipotecas 12‰'),
('salta', 'aportes_colegio','hipoteca', 'Aporte jubilatorio Colegio (11%)','porcentaje', 11.0000, NULL, 'honorarios', 'escribano', 1, 40, 'Ley 3221'),
('salta', 'aportes_partes', 'hipoteca', 'Aporte de las partes (4%)',      'porcentaje', 4.0000, NULL, 'honorarios', 'ambos',      1, 50, 'Ley 3221'),
('salta', 'inscripcion_dgi','hipoteca', 'Inscripción registral DGI',      'porcentaje', 0.3000, NULL, 'monto_operacion', 'cliente',1, 70, NULL),
('salta', 'certificados',   'hipoteca', 'Certificado de dominio',         'fijo', 35000.0000, NULL, 'monto_operacion', 'cliente', 1, 80, NULL),
('salta', 'certificados',   'hipoteca', 'Certificado de inhibiciones',    'fijo', 25000.0000, NULL, 'monto_operacion', 'cliente', 1, 90, NULL);

-- Salta - poder
INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, escala, base, quien_paga, obligatorio, orden, notas) VALUES
('salta', 'honorarios',     'poder', 'Honorarios del escribano',   'fijo', 50000.0000, NULL, 'monto_operacion', 'cliente', 1, 10, 'Ley 5134 Art. 6 — monto fijo actualizado'),
('salta', 'iva_honorarios', 'poder', 'IVA sobre honorarios (21%)', 'porcentaje', 21.0000, NULL, 'honorarios', 'cliente',    1, 20, NULL),
('salta', 'sellos',         'poder', 'Impuesto de Sellos',         'fijo', 2400.0000, NULL, 'monto_operacion', 'cliente',  1, 30, 'Art. 20 — 20 UT ($120 c/u = $2.400)'),
('salta', 'aportes_colegio','poder', 'Aporte jubilatorio Colegio (11%)','porcentaje', 11.0000, NULL, 'honorarios', 'escribano', 1, 40, 'Ley 3221');

-- Salta - certificación de firmas
INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, escala, base, quien_paga, obligatorio, orden, notas) VALUES
('salta', 'honorarios',     'certificacion_firmas', 'Honorarios del escribano',   'fijo', 30000.0000, NULL, 'monto_operacion', 'cliente', 1, 10, 'Ley 5134 Art. 6'),
('salta', 'iva_honorarios', 'certificacion_firmas', 'IVA sobre honorarios (21%)', 'porcentaje', 21.0000, NULL, 'honorarios', 'cliente',    1, 20, NULL),
('salta', 'sellos',         'certificacion_firmas', 'Impuesto de Sellos',         'fijo', 2400.0000, NULL, 'monto_operacion', 'cliente',  1, 30, 'Art. 20 — 20 UT'),
('salta', 'aportes_colegio','certificacion_firmas', 'Aporte jubilatorio Colegio (11%)','porcentaje', 11.0000, NULL, 'honorarios', 'escribano', 1, 40, 'Ley 3221');
