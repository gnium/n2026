-- =====================================================================
-- NOTARIUS 2026 - Aislamiento entre usuarios (multi-tenant)
--
-- Hasta ahora la app asumia una sola escribana o escribano: cualquier sesion en memoria
-- era accesible por cualquier cuenta logueada si conocia el UUID, y el
-- consumo/precios/proveedor de IA eran una configuracion global editable
-- por cualquiera. Para dar de alta a varias escribanas y escribanos sin relacion entre
-- si, cada ejecucion queda asociada a quien la genero, y solo una cuenta
-- administradora puede ver el consumo de todas y configurar el proveedor
-- de IA y los precios.
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

-- La primera cuenta registrada (la escribana o el escribano que instala la app, o quien opera el servicio) es administradora.
CALL _agregar_columna_si_falta('usuarios', 'es_admin', '`es_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER activo');
CALL _agregar_columna_si_falta('ejecuciones', 'usuario_id', '`usuario_id` INT UNSIGNED NULL AFTER session_uuid');

-- Si ya existe al menos una cuenta y ninguna es admin (instalaciones previas a este cambio), la mas antigua pasa a serlo.
SET @hay_admin = (SELECT COUNT(*) FROM usuarios WHERE es_admin = 1);
SET @primer_usuario = (SELECT MIN(id) FROM usuarios);
UPDATE usuarios SET es_admin = 1 WHERE id = @primer_usuario AND @hay_admin = 0 AND @primer_usuario IS NOT NULL;

DROP PROCEDURE _agregar_columna_si_falta;
