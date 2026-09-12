-- =====================================================================
-- NOTARIUS 2026 - Esquema MySQL
-- REGLA DE ORO: ninguna tabla almacena datos personales (PII).
-- Solo configuracion de skills, plantillas, y metricas/auditoria
-- operativa (contadores, estados, tiempos, codigos de error).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS notarius
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE notarius;

-- ---------------------------------------------------------------------
-- Configuracion de cada skill (prompt de sistema, modelo, esfuerzo).
-- El orden define la secuencia del pipeline.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  clave           VARCHAR(64)      NOT NULL,          -- ej: extractor_antecedentes
  nombre          VARCHAR(120)     NOT NULL,          -- nombre legible para la UI
  descripcion     VARCHAR(500)     NULL,
  orden           TINYINT UNSIGNED NOT NULL,          -- 1..N, secuencia del pipeline
  modelo          VARCHAR(64)      NOT NULL DEFAULT 'claude-opus-5',
  esfuerzo        ENUM('low','medium','high','xhigh','max') NOT NULL DEFAULT 'high',
  max_tokens      INT UNSIGNED     NOT NULL DEFAULT 32000,
  system_prompt   MEDIUMTEXT       NOT NULL,          -- instrucciones del skill (sin PII)
  activo          TINYINT(1)       NOT NULL DEFAULT 1,
  version         INT UNSIGNED     NOT NULL DEFAULT 1,
  creado_en       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_skills_clave (clave),
  UNIQUE KEY uk_skills_orden (orden)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Plantillas notariales base. El contenido usa placeholders genericos
-- del tipo {{VENDEDOR_1_NOMBRE}} que se completan solo en memoria.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantillas (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  clave           VARCHAR(64)      NOT NULL,          -- ej: compraventa_inmueble
  nombre          VARCHAR(160)     NOT NULL,
  tipo_acto       VARCHAR(80)      NOT NULL,          -- compraventa, donacion, hipoteca...
  jurisdiccion    VARCHAR(80)      NOT NULL DEFAULT 'Argentina',
  contenido       MEDIUMTEXT       NOT NULL,          -- texto con placeholders
  variables       JSON             NULL,              -- lista de placeholders esperados
  activo          TINYINT(1)       NOT NULL DEFAULT 1,
  version         INT UNSIGNED     NOT NULL DEFAULT 1,
  creado_en       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_plantillas_clave (clave),
  KEY ix_plantillas_tipo (tipo_acto, activo)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Ejecuciones del pipeline (una por documento procesado).
-- Solo metadatos operativos. NUNCA nombre de archivo original, texto,
-- ni datos de partes. session_uuid es un identificador aleatorio.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ejecuciones (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_uuid       CHAR(36)        NOT NULL,
  estado             ENUM('en_curso','completada','fallida','cancelada') NOT NULL DEFAULT 'en_curso',
  tipo_acto_detectado VARCHAR(80)    NULL,             -- categoria generica, no PII
  plantilla_id       INT UNSIGNED    NULL,
  bytes_entrada      INT UNSIGNED    NULL,             -- tamano del archivo, no su contenido
  entidades_anonimizadas SMALLINT UNSIGNED NULL,       -- cantidad de tokens de anonimizacion
  tokens_entrada     INT UNSIGNED    NOT NULL DEFAULT 0,
  tokens_salida      INT UNSIGNED    NOT NULL DEFAULT 0,
  duracion_ms        INT UNSIGNED    NULL,
  iniciado_en        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_en      TIMESTAMP       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ejecuciones_session (session_uuid),
  KEY ix_ejecuciones_estado (estado, iniciado_en),
  CONSTRAINT fk_ejecuciones_plantilla FOREIGN KEY (plantilla_id)
    REFERENCES plantillas (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Detalle por skill dentro de una ejecucion (para el pipeline visual
-- y para metricas). Sin contenido de entrada ni de salida.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ejecuciones_skills (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ejecucion_id   BIGINT UNSIGNED NOT NULL,
  skill_clave    VARCHAR(64)     NOT NULL,
  estado         ENUM('pendiente','en_curso','completado','fallido','omitido') NOT NULL DEFAULT 'pendiente',
  modelo         VARCHAR(64)     NULL,
  tokens_entrada INT UNSIGNED    NOT NULL DEFAULT 0,
  tokens_salida  INT UNSIGNED    NOT NULL DEFAULT 0,
  duracion_ms    INT UNSIGNED    NULL,
  codigo_error   VARCHAR(64)     NULL,             -- codigo tecnico, sin mensaje libre
  riesgos_detectados TINYINT UNSIGNED NULL,        -- solo el conteo
  iniciado_en    TIMESTAMP       NULL,
  finalizado_en  TIMESTAMP       NULL,
  PRIMARY KEY (id),
  KEY ix_es_ejecucion (ejecucion_id),
  CONSTRAINT fk_es_ejecucion FOREIGN KEY (ejecucion_id)
    REFERENCES ejecuciones (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Auditoria operativa. `detalle` es JSON con claves controladas
-- (el backend valida que no contenga texto libre del documento).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evento       VARCHAR(64)     NOT NULL,   -- sesion.creada, sesion.destruida, documento.exportado...
  session_uuid CHAR(36)        NULL,
  detalle      JSON            NULL,
  creado_en    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_auditoria_evento (evento, creado_en),
  KEY ix_auditoria_session (session_uuid)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Configuracion general clave/valor (TTL de sesion, limites, etc.).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion (
  clave          VARCHAR(64)  NOT NULL,
  valor          VARCHAR(500) NOT NULL,
  descripcion    VARCHAR(300) NULL,
  actualizado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clave)
) ENGINE=InnoDB;
