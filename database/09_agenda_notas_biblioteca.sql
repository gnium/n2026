-- =====================================================================
-- NOTARIUS 2026 - Agenda de turnos, notas y biblioteca de modelos
--
-- EXCEPCION SIN CIFRAR a la regla de oro, distinta y menos estricta que
-- las de 07_protocolo.sql y 08_sesiones_guardadas.sql: estas tres tablas
-- guardan datos de gestion de la practica que la escribana o el escribano
-- tipea o sube a mano (titulo de un turno, una nota, una escritura modelo
-- propia), no datos extraidos de un documento por el pipeline de IA. La
-- garantia de "cero PII" del pipeline sigue intacta; esto es una capa
-- aparte, deliberadamente en texto plano para poder buscar y filtrar.
-- Ver docs/PRIVACIDAD.md, seccion "Excepcion sin cifrar: agenda, notas
-- y biblioteca de modelos".
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS turnos (
  id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id                  INT UNSIGNED    NOT NULL,
  titulo                      VARCHAR(200)    NOT NULL,
  notas                       VARCHAR(1000)   NULL,
  fecha_hora                  DATETIME        NOT NULL,
  duracion_min                SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  estado                      ENUM('pendiente','confirmado','cancelado','realizado') NOT NULL DEFAULT 'pendiente',
  recordatorio_minutos_antes  SMALLINT UNSIGNED NOT NULL DEFAULT 1440,
  recordatorio_enviado_en     DATETIME        NULL,
  ejecucion_id                BIGINT UNSIGNED NULL,
  creado_en                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_turnos_usuario_fecha (usuario_id, fecha_hora),
  CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_turnos_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notas (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  contenido      VARCHAR(4000)   NOT NULL,
  compartida     TINYINT(1)      NOT NULL DEFAULT 0,
  ejecucion_id   BIGINT UNSIGNED NULL,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notas_usuario (usuario_id, creado_en),
  KEY ix_notas_compartidas (compartida, creado_en),
  CONSTRAINT fk_notas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_notas_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS modelos_biblioteca (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  nombre         VARCHAR(160)    NOT NULL,
  tipo_acto      VARCHAR(80)     NULL,
  contenido      MEDIUMTEXT      NOT NULL,      -- texto extraido del .doc/.docx original, sin cifrar
  bytes_original INT UNSIGNED    NULL,
  activo         TINYINT(1)      NOT NULL DEFAULT 1,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_modelos_usuario_nombre (usuario_id, nombre),
  CONSTRAINT fk_modelos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;
