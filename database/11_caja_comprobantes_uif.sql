-- =====================================================================
-- DOY FE - Caja (cuenta corriente), comprobantes, configuracion fiscal y UIF
--
-- Ver docs/PRIVACIDAD.md, seccion "Cumplimiento y caja":
--   - configuracion_fiscal.arca_cert_cifrado / arca_clave_cifrado: certificado y
--     clave privada para ARCA, cifrados (contexto "fiscal"). Nunca se devuelven.
--   - comprobantes.receptor_cifrado: foto del receptor al emitir (contexto
--     "comprobante"): el comprobante debe conservarse aunque se borre el cliente.
--   - uif_legajos.datos_cifrado: actividad, origen de fondos, PEP, beneficiarios
--     finales (contexto "uif"). Nivel de riesgo y fechas en claro para alertas.
--   - movimientos, comprobantes (montos/conceptos), uif_expedientes.recaudos,
--     uif_eventos: texto plano (no contienen identificadores de personas).
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS configuracion_fiscal (
  usuario_id          INT UNSIGNED    NOT NULL,
  cuit                VARCHAR(13)     NULL,
  razon_social        VARCHAR(200)    NULL,
  domicilio_fiscal    VARCHAR(300)    NULL,
  condicion_iva       ENUM('monotributo','responsable_inscripto','exento') NOT NULL DEFAULT 'monotributo',
  inicio_actividades  DATE            NULL,
  punto_venta         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  arca_entorno        ENUM('apagado','homologacion','produccion') NOT NULL DEFAULT 'apagado',
  arca_cert_cifrado   MEDIUMTEXT      NULL,
  arca_clave_cifrado  MEDIUMTEXT      NULL,
  arca_cargado_en     DATETIME        NULL,
  actualizado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id),
  CONSTRAINT fk_cfgfiscal_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comprobantes (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id         INT UNSIGNED    NOT NULL,
  tipo               ENUM('recibo','nota_honorarios','factura_a','factura_b','factura_c') NOT NULL,
  punto_venta        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  numero             INT UNSIGNED    NOT NULL,
  fecha              DATE            NOT NULL,
  cliente_id         BIGINT UNSIGNED NULL,
  expediente_id      BIGINT UNSIGNED NULL,
  presupuesto_id     BIGINT UNSIGNED NULL,
  receptor_cifrado   MEDIUMTEXT      NULL,   -- {nombre, tipo, documento, cuit, domicilio, condicionIva}
  items              JSON            NOT NULL,
  total              DECIMAL(14,2)   NOT NULL,
  moneda             ENUM('ARS','USD') NOT NULL DEFAULT 'ARS',
  estado             ENUM('emitido','anulado') NOT NULL DEFAULT 'emitido',
  motivo_anulacion   VARCHAR(300)    NULL,
  cae                VARCHAR(20)     NULL,
  cae_vencimiento    DATE            NULL,
  arca_resultado     JSON            NULL,
  creado_en          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_comprobantes_numero (usuario_id, tipo, punto_venta, numero),
  KEY ix_comprobantes_cliente (cliente_id),
  KEY ix_comprobantes_expediente (expediente_id),
  KEY ix_comprobantes_usuario_fecha (usuario_id, fecha),
  CONSTRAINT fk_comprobantes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_comprobantes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_comprobantes_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_comprobantes_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  cliente_id     BIGINT UNSIGNED NOT NULL,
  expediente_id  BIGINT UNSIGNED NULL,
  tipo           ENUM('cargo','pago') NOT NULL,
  origen         ENUM('presupuesto','comprobante','manual') NOT NULL DEFAULT 'manual',
  origen_id      BIGINT UNSIGNED NULL,
  fecha          DATE            NOT NULL,
  concepto       VARCHAR(200)    NOT NULL,
  monto          DECIMAL(14,2)   NOT NULL,
  moneda         ENUM('ARS','USD') NOT NULL DEFAULT 'ARS',
  medio_pago     ENUM('efectivo','transferencia','mercadopago','cheque','otro') NULL,
  referencia     VARCHAR(120)    NULL,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mov_usuario_cliente_fecha (usuario_id, cliente_id, fecha),
  KEY ix_mov_usuario_fecha (usuario_id, fecha),
  KEY ix_mov_origen (origen, origen_id),
  CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS uif_legajos (
  cliente_id          BIGINT UNSIGNED NOT NULL,
  usuario_id          INT UNSIGNED    NOT NULL,
  nivel_riesgo        ENUM('bajo','medio','alto') NOT NULL DEFAULT 'bajo',
  diligencia          ENUM('simplificada','media','reforzada') NOT NULL DEFAULT 'simplificada',
  es_pep              TINYINT(1)      NOT NULL DEFAULT 0,
  jurisdiccion_riesgo TINYINT(1)      NOT NULL DEFAULT 0,
  datos_cifrado       MEDIUMTEXT      NULL,   -- {actividad, origenFondos, pepDetalle, beneficiariosFinales:[{nombre, documento, porcentaje}], nacionalidad, observaciones}
  documentacion       JSON            NULL,   -- [{item, presentado, fecha}]
  actualizado_en      DATE            NULL,
  proxima_revision    DATE            NULL,
  creado_en           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cliente_id),
  KEY ix_uif_legajos_usuario (usuario_id, proxima_revision),
  CONSTRAINT fk_uifleg_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE,
  CONSTRAINT fk_uifleg_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS uif_expedientes (
  expediente_id              BIGINT UNSIGNED NOT NULL,
  usuario_id                 INT UNSIGNED    NOT NULL,
  actividad                  ENUM('no_alcanzada','compraventa_inmueble','persona_juridica','estructura_juridica','compraventa_negocio','otra') NOT NULL DEFAULT 'no_alcanzada',
  monto                      DECIMAL(14,2)   NULL,
  moneda                     ENUM('ARS','USD') NULL,
  supera_umbral              TINYINT(1)      NOT NULL DEFAULT 0,
  recaudos                   JSON            NULL,   -- [{item, fundamento, obligatorio, estado, origen}]
  nivel_diligencia_sugerido  ENUM('simplificada','media','reforzada') NULL,
  alertas                    JSON            NULL,
  generado_en                DATETIME        NULL,
  ejecucion_id               BIGINT UNSIGNED NULL,
  estado                     ENUM('pendiente','completo') NOT NULL DEFAULT 'pendiente',
  notas                      VARCHAR(1000)   NULL,
  actualizado_en             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (expediente_id),
  KEY ix_uif_exp_usuario (usuario_id, actividad, supera_umbral),
  CONSTRAINT fk_uifexp_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE CASCADE,
  CONSTRAINT fk_uifexp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_uifexp_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS uif_eventos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  tipo           ENUM('ros','reporte_mensual','reporte_anual','autoevaluacion','revision_externa','capacitacion','otro') NOT NULL,
  periodo        VARCHAR(7)      NULL,   -- YYYY-MM (mensual) o YYYY (anual)
  fecha          DATE            NOT NULL,
  referencia     VARCHAR(120)    NULL,
  expediente_id  BIGINT UNSIGNED NULL,
  notas          VARCHAR(500)    NULL,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_uif_eventos_usuario (usuario_id, tipo, fecha),
  CONSTRAINT fk_uifev_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_uifev_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Parametros UIF editables desde Configuracion (orientativos: verificar contra la resolucion vigente)
INSERT IGNORE INTO configuracion (clave, valor, descripcion) VALUES
  ('uif_smvm_ars', '0', 'Salario minimo vital y movil vigente en pesos (cargar el valor actual)'),
  ('uif_umbral_smvm', '700', 'Umbral en SMVM para compraventa de inmuebles (Res. UIF 242/2023)');
