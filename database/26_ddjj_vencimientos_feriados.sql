-- =====================================================================
-- Feriados (calculadora de días hábiles), DDJJ (declaraciones juradas)
-- y vencimientos (plazos de certificados, DDJJ, DGI).
-- Seed: feriados nacionales argentinos 2025-2026 + Salta provinciales.
-- =====================================================================
USE notarius;

-- -----------------------------------------------------------------
-- 1. Feriados
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feriados (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha        DATE         NOT NULL,
  nombre       VARCHAR(160) NOT NULL,
  tipo         ENUM('nacional','provincial') NOT NULL DEFAULT 'nacional',
  jurisdiccion VARCHAR(40)  NULL,
  creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_feriados_fecha_jur (fecha, jurisdiccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Feriados nacionales 2025
INSERT IGNORE INTO feriados (fecha, nombre, tipo) VALUES
  ('2025-01-01', 'Año Nuevo', 'nacional'),
  ('2025-03-03', 'Carnaval', 'nacional'),
  ('2025-03-04', 'Carnaval', 'nacional'),
  ('2025-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'nacional'),
  ('2025-04-02', 'Día del Veterano y de los Caídos del Atlántico Sur', 'nacional'),
  ('2025-04-18', 'Viernes Santo', 'nacional'),
  ('2025-05-01', 'Día del Trabajador', 'nacional'),
  ('2025-05-02', 'Feriado con fines turísticos', 'nacional'),
  ('2025-05-25', 'Día de la Revolución de Mayo', 'nacional'),
  ('2025-06-16', 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes', 'nacional'),
  ('2025-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano', 'nacional'),
  ('2025-07-09', 'Día de la Independencia', 'nacional'),
  ('2025-08-15', 'Feriado con fines turísticos', 'nacional'),
  ('2025-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín', 'nacional'),
  ('2025-10-12', 'Día del Respeto a la Diversidad Cultural', 'nacional'),
  ('2025-11-21', 'Feriado con fines turísticos', 'nacional'),
  ('2025-11-24', 'Día de la Soberanía Nacional', 'nacional'),
  ('2025-12-08', 'Inmaculada Concepción de María', 'nacional'),
  ('2025-12-25', 'Navidad', 'nacional');

-- Feriados nacionales 2026
INSERT IGNORE INTO feriados (fecha, nombre, tipo) VALUES
  ('2026-01-01', 'Año Nuevo', 'nacional'),
  ('2026-02-16', 'Carnaval', 'nacional'),
  ('2026-02-17', 'Carnaval', 'nacional'),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'nacional'),
  ('2026-04-02', 'Día del Veterano y de los Caídos del Atlántico Sur', 'nacional'),
  ('2026-04-03', 'Viernes Santo', 'nacional'),
  ('2026-05-01', 'Día del Trabajador', 'nacional'),
  ('2026-05-25', 'Día de la Revolución de Mayo', 'nacional'),
  ('2026-06-15', 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes', 'nacional'),
  ('2026-06-20', 'Paso a la Inmortalidad del Gral. Manuel Belgrano', 'nacional'),
  ('2026-07-09', 'Día de la Independencia', 'nacional'),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín', 'nacional'),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'nacional'),
  ('2026-11-23', 'Día de la Soberanía Nacional', 'nacional'),
  ('2026-12-08', 'Inmaculada Concepción de María', 'nacional'),
  ('2026-12-25', 'Navidad', 'nacional');

-- Feriados provinciales Salta 2025-2026
INSERT IGNORE INTO feriados (fecha, nombre, tipo, jurisdiccion) VALUES
  ('2025-06-17', 'Día del Gral. Güemes (provincial)', 'provincial', 'salta'),
  ('2025-09-15', 'Día de la Batalla de Salta', 'provincial', 'salta'),
  ('2026-06-17', 'Día del Gral. Güemes (provincial)', 'provincial', 'salta'),
  ('2026-09-15', 'Día de la Batalla de Salta', 'provincial', 'salta');

-- -----------------------------------------------------------------
-- 2. Declaraciones Juradas (DDJJ)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ddjj (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED    NOT NULL,
  numero          INT UNSIGNED    NOT NULL,
  expediente_id   BIGINT UNSIGNED NULL,
  presupuesto_id  BIGINT UNSIGNED NULL,
  jurisdiccion    VARCHAR(40)     NOT NULL,
  formulario      VARCHAR(20)     NOT NULL DEFAULT 'F06W',
  tipo_acto       VARCHAR(40)     NOT NULL,
  fecha_acto      DATE            NOT NULL,
  monto_operacion DECIMAL(14,2)   NOT NULL,
  alicuota_sellos DECIMAL(6,4)    NOT NULL,
  monto_sellos    DECIMAL(14,2)   NOT NULL,
  datos_partes    JSON            NULL,
  datos_inmueble  JSON            NULL,
  datos_escribano JSON            NULL,
  estado          ENUM('borrador','generada','presentada') NOT NULL DEFAULT 'borrador',
  presentada_en   DATETIME        NULL,
  notas           VARCHAR(500)    NULL,
  creado_en       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ddjj_numero (usuario_id, numero),
  KEY ix_ddjj_usuario_estado (usuario_id, estado),
  KEY ix_ddjj_expediente (expediente_id),
  CONSTRAINT fk_ddjj_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_ddjj_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_ddjj_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- 3. Vencimientos
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vencimientos (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id             INT UNSIGNED    NOT NULL,
  tipo                   VARCHAR(60)     NOT NULL,
  descripcion            VARCHAR(300)    NOT NULL,
  fecha_origen           DATE            NOT NULL,
  fecha_vencimiento      DATE            NOT NULL,
  estado                 ENUM('vigente','por_vencer','vencido','completado') NOT NULL DEFAULT 'vigente',
  expediente_id          BIGINT UNSIGNED NULL,
  presupuesto_id         BIGINT UNSIGNED NULL,
  ddjj_id                BIGINT UNSIGNED NULL,
  google_evento_id       VARCHAR(190)    NULL,
  google_sincronizado_en DATETIME        NULL,
  notificado             TINYINT(1)      NOT NULL DEFAULT 0,
  completado_en          DATETIME        NULL,
  creado_en              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_venc_usuario_estado (usuario_id, estado, fecha_vencimiento),
  KEY ix_venc_expediente (expediente_id),
  CONSTRAINT fk_venc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_venc_expediente FOREIGN KEY (expediente_id) REFERENCES expedientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_venc_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos (id) ON DELETE SET NULL,
  CONSTRAINT fk_venc_ddjj FOREIGN KEY (ddjj_id) REFERENCES ddjj (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- 4. Preferencia de notificaciones por email
-- -----------------------------------------------------------------
DELIMITER $$
CREATE PROCEDURE _add_col_26(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_def VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = p_tabla AND column_name = p_columna
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN ', p_def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL _add_col_26('usuarios', 'notificaciones_email', '`notificaciones_email` TINYINT(1) NOT NULL DEFAULT 1');
DROP PROCEDURE _add_col_26;
