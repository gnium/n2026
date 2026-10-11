-- =====================================================================
-- Migración 29: Drive para todos los documentos generados.
--
-- Antes solo se subían comprobantes y presupuestos a Drive. Ahora se
-- sube todo: certificaciones, DDJJ, custodia. Se agrega un toggle
-- general `subir_documentos` que reemplaza a `subir_comprobantes`.
-- =====================================================================
USE notarius;
SET NAMES utf8mb4;

DELIMITER $$
CREATE PROCEDURE _agregar_columna_si_falta(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = p_tabla AND column_name = p_columna
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN ', p_definicion);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- Toggle general: reemplaza subir_comprobantes.
-- Los usuarios que ya tenían subir_comprobantes=1 quedan con subir_documentos=1.
CALL _agregar_columna_si_falta('google_cuentas', 'subir_documentos', '`subir_documentos` TINYINT(1) NOT NULL DEFAULT 0 AFTER `subir_comprobantes`');
UPDATE google_cuentas SET subir_documentos = 1 WHERE subir_comprobantes = 1 AND subir_documentos = 0;

-- Drive columns en certificaciones.
CALL _agregar_columna_si_falta('certificaciones', 'drive_archivo_id', '`drive_archivo_id` VARCHAR(120) NULL');
CALL _agregar_columna_si_falta('certificaciones', 'drive_enlace', '`drive_enlace` VARCHAR(400) NULL');

-- Drive columns en ddjj.
CALL _agregar_columna_si_falta('ddjj', 'drive_archivo_id', '`drive_archivo_id` VARCHAR(120) NULL');
CALL _agregar_columna_si_falta('ddjj', 'drive_enlace', '`drive_enlace` VARCHAR(400) NULL');

DROP PROCEDURE _agregar_columna_si_falta;
