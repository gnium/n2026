USE notarius;

-- Campos registrales para certificación de firmas (Libro de Requerimientos)
-- y opciones que modifican la redacción del documento generado.

DELIMITER $$
CREATE PROCEDURE _cert_registrales()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificaciones' AND COLUMN_NAME = 'acta') THEN
    ALTER TABLE certificaciones
      ADD COLUMN acta VARCHAR(80) NULL AFTER observaciones,
      ADD COLUMN folio VARCHAR(80) NULL AFTER acta,
      ADD COLUMN libro VARCHAR(80) NULL AFTER folio,
      ADD COLUMN libro_firmas VARCHAR(80) NULL AFTER libro,
      ADD COLUMN foja_actuacion VARCHAR(120) NULL AFTER libro_firmas;
  END IF;
END$$
DELIMITER ;

CALL _cert_registrales();
DROP PROCEDURE IF EXISTS _cert_registrales;
