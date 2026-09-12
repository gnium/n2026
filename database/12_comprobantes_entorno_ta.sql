-- =====================================================================
-- Fase 3, revision de codigo: los comprobantes electronicos guardan en que
-- entorno ARCA se emitieron (homologacion y produccion numeran por separado)
-- y el ticket de acceso WSAA se persiste cifrado para sobrevivir reinicios
-- (WSAA rechaza un nuevo login mientras el TA anterior sigue vigente).
-- =====================================================================
USE notarius;

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

CALL _agregar_columna_si_falta('comprobantes', 'arca_entorno', "`arca_entorno` ENUM('apagado','homologacion','produccion') NOT NULL DEFAULT 'apagado' AFTER `numero`");
CALL _agregar_columna_si_falta('configuracion_fiscal', 'arca_ta_cifrado', '`arca_ta_cifrado` MEDIUMTEXT NULL AFTER `arca_cargado_en`');

DROP PROCEDURE _agregar_columna_si_falta;

SET @existe_uk := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comprobantes' AND INDEX_NAME = 'uk_comprobantes_numero_entorno');
SET @sql := IF(@existe_uk = 0,
  'ALTER TABLE comprobantes DROP INDEX uk_comprobantes_numero, ADD UNIQUE KEY uk_comprobantes_numero_entorno (usuario_id, tipo, punto_venta, arca_entorno, numero)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
