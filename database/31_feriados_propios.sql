USE notarius;

-- Permitir feriados propios (vacaciones, dias personales) por usuario.

DELIMITER $$
CREATE PROCEDURE _feriados_usuario_id()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feriados' AND COLUMN_NAME = 'usuario_id') THEN
    ALTER TABLE feriados ADD COLUMN usuario_id INT UNSIGNED NULL AFTER id;
    ALTER TABLE feriados ADD CONSTRAINT fk_feriados_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE;
  END IF;
END$$
DELIMITER ;

CALL _feriados_usuario_id();
DROP PROCEDURE IF EXISTS _feriados_usuario_id;

-- Expandir tipo para incluir 'propio'
ALTER TABLE feriados MODIFY COLUMN tipo ENUM('nacional','provincial','propio') NOT NULL DEFAULT 'nacional';

-- Ajustar unique key para que un usuario pueda tener su propio feriado en la misma fecha que uno nacional
-- La vieja uk no contemplaba usuario_id
DELIMITER $$
CREATE PROCEDURE _feriados_uk()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feriados' AND INDEX_NAME = 'uk_feriados_fecha_jur') THEN
    ALTER TABLE feriados DROP INDEX uk_feriados_fecha_jur;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feriados' AND INDEX_NAME = 'uk_feriados_fecha_usr_jur') THEN
    ALTER TABLE feriados ADD UNIQUE KEY uk_feriados_fecha_usr_jur (fecha, usuario_id, jurisdiccion);
  END IF;
END$$
DELIMITER ;

CALL _feriados_uk();
DROP PROCEDURE IF EXISTS _feriados_uk;
