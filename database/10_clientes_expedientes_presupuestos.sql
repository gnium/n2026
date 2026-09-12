-- =====================================================================
-- DOY FE - Clientes, expedientes, tareas y presupuestos
--
-- EXCEPCION MIXTA a la regla de oro (ver docs/PRIVACIDAD.md, seccion
-- "Excepcion mixta: clientes, expedientes y presupuestos"):
--   - clientes.nombre / observaciones: texto plano, para buscar y listar.
--   - clientes.datos_cifrado: DNI/CUIT, domicilio, telefono, correo y demas
--     identificadores, cifrados AES-256-GCM con el contexto "cliente"
--     (backend/src/utils/cifrado.js). Un dump de la base no los expone.
--   - expedientes.caratula / observaciones y presupuestos.items: texto plano
--     (montos y titulos de carpeta; el nombre del cliente NO se copia al
--     presupuesto, se lee del cliente al generar el PDF).
-- Son datos de gestion que la escribana o el escribano carga a mano; la
-- garantia del pipeline de IA (cero PII de documentos) no cambia.
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS clientes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  tipo           ENUM('persona','sociedad') NOT NULL DEFAULT 'persona',
  nombre         VARCHAR(200)    NOT NULL,
  observaciones  VARCHAR(500)    NULL,
  datos_cifrado  MEDIUMTEXT      NULL,   -- AES-256-GCM, contexto "cliente": JSON {documento, cuit, domicilio, telefono, email, estadoCivil, nacionalidad}
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_clientes_usuario_nombre (usuario_id, nombre),
  CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expedientes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  caratula       VARCHAR(200)    NOT NULL,
  tipo_acto      VARCHAR(40)     NOT NULL DEFAULT 'otro',
  estado         ENUM('abierto','en_firma','cerrado','archivado') NOT NULL DEFAULT 'abierto',
  ejecucion_id   BIGINT UNSIGNED NULL,   -- ultima ejecucion del pipeline vinculada
  protocolo_id   BIGINT UNSIGNED NULL,   -- entrada del protocolo si ya se firmo
  observaciones  VARCHAR(1000)   NULL,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_expedientes_usuario_estado (usuario_id, estado, actualizado_en),
  CONSTRAINT fk_expedientes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_expedientes_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL,
  CONSTRAINT fk_expedientes_protocolo FOREIGN KEY (protocolo_id) REFERENCES protocolo_escrituras (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expediente_partes (
  expediente_id  BIGINT UNSIGNED NOT NULL,
  cliente_id     BIGINT UNSIGNED NOT NULL,
  rol            VARCHAR(40)     NULL,   -- vendedor, comprador, poderdante, apoderado...
  PRIMARY KEY (expediente_id, cliente_id),
  KEY ix_partes_cliente (cliente_id),
  CONSTRAINT fk_partes_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE CASCADE,
  CONSTRAINT fk_partes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tareas (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  expediente_id  BIGINT UNSIGNED NOT NULL,
  descripcion    VARCHAR(300)    NOT NULL,
  responsable    VARCHAR(80)     NULL,
  vence_en       DATE            NULL,
  estado         ENUM('pendiente','hecha') NOT NULL DEFAULT 'pendiente',
  origen         ENUM('manual','checklist') NOT NULL DEFAULT 'manual',
  orden          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completada_en  DATETIME        NULL,
  PRIMARY KEY (id),
  KEY ix_tareas_expediente (expediente_id, estado, orden),
  CONSTRAINT fk_tareas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_tareas_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS presupuestos (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  numero         INT UNSIGNED    NOT NULL,   -- correlativo por cuenta
  expediente_id  BIGINT UNSIGNED NULL,
  cliente_id     BIGINT UNSIGNED NULL,
  fecha          DATE            NOT NULL,
  moneda         ENUM('ARS','USD') NOT NULL DEFAULT 'ARS',
  items          JSON            NOT NULL,   -- [{concepto, monto}]
  total          DECIMAL(14,2)   NOT NULL,
  validez_dias   SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  notas          VARCHAR(500)    NULL,
  estado         ENUM('borrador','enviado','aceptado','rechazado') NOT NULL DEFAULT 'borrador',
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_presupuestos_numero (usuario_id, numero),
  KEY ix_presupuestos_expediente (expediente_id),
  KEY ix_presupuestos_cliente (cliente_id),
  CONSTRAINT fk_presupuestos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_presupuestos_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_presupuestos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE SET NULL
) ENGINE=InnoDB;
