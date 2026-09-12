-- =====================================================================
-- NOTARIUS 2026 - Indice de protocolo
--
-- EXCEPCION EXPLICITA Y ACOTADA a la regla de oro ("ninguna tabla guarda PII"):
-- el Codigo Civil y Comercial (arts. 299-307) exige numerar correlativamente
-- y foliar cada escritura/acta del protocolo anual, y el indice de fin de
-- año debe listar los comparecientes por su nombre real. Es la UNICA tabla
-- de todo el esquema que guarda datos de partes, y lo hace cifrado
-- (AES-256-GCM, contexto "protocolo", ver backend/src/utils/cifrado.js):
-- ni siquiera un dump de la base expone nombres en texto plano.
-- Ver docs/PRIVACIDAD.md, seccion "Excepciones acotadas a la regla de oro".
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS protocolo_escrituras (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id             INT UNSIGNED    NOT NULL,
  anio                   SMALLINT UNSIGNED NOT NULL,
  numero_orden           INT UNSIGNED    NOT NULL,          -- correlativo, unico por (usuario_id, anio); inmutable
  folio_desde            SMALLINT UNSIGNED NULL,
  folio_hasta            SMALLINT UNSIGNED NULL,
  naturaleza             ENUM('escritura','acta') NOT NULL DEFAULT 'escritura',
  tipo_acto              VARCHAR(40)     NOT NULL,          -- compraventa|donacion|hipoteca|permuta|cesion|sucesion|poder|certificacion_firmas|otro
  fecha_otorgamiento     DATE            NOT NULL,          -- fecha real de la firma (la confirma la escribana o el escribano)
  comparecientes_cifrado MEDIUMTEXT      NOT NULL,          -- AES-256-GCM, contexto "protocolo": JSON [{rol, nombre}]
  estado                 ENUM('vigente','revocada','anulada') NOT NULL DEFAULT 'vigente',
  observaciones          VARCHAR(500)    NULL,
  ejecucion_id           BIGINT UNSIGNED NULL,              -- traza opcional al pipeline de IA (NULL = carga manual)
  creado_en              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_protocolo_orden (usuario_id, anio, numero_orden),
  KEY ix_protocolo_usuario_anio (usuario_id, anio),
  CONSTRAINT fk_protocolo_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_protocolo_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL
) ENGINE=InnoDB;
