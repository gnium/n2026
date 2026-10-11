USE notarius;

CREATE TABLE IF NOT EXISTS certificaciones (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id           INT UNSIGNED    NOT NULL,
  anio                 SMALLINT UNSIGNED NOT NULL,
  numero               INT UNSIGNED    NOT NULL,
  modalidad            ENUM('personal','representacion') NOT NULL DEFAULT 'personal',
  firmantes_cifrado    MEDIUMTEXT      NOT NULL,
  representada         JSON            NULL,
  documento            JSON            NOT NULL,
  jurisdiccion         VARCHAR(60)     NULL,
  estado               ENUM('borrador','certificada','entregada') NOT NULL DEFAULT 'borrador',
  fecha_certificacion  DATE            NULL,
  fecha_entrega        DATETIME        NULL,
  expediente_id        BIGINT UNSIGNED NULL,
  ejecucion_id         BIGINT UNSIGNED NULL,
  observaciones        VARCHAR(500)    NULL,
  creado_en            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cert_numero (usuario_id, anio, numero),
  KEY ix_cert_usuario_estado (usuario_id, estado),
  CONSTRAINT fk_cert_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_cert_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_cert_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
