-- =====================================================================
-- NOTARIUS 2026 - Planes con modulos y precios concretos
-- =====================================================================
USE notarius;

-- Columna de modulos habilitados por plan (JSON array de claves de modulo).
-- NULL o '[]' = todos los modulos (backwards compatible con planes viejos).
DELIMITER $$
CREATE PROCEDURE _add_col_19(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion VARCHAR(255))
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

CALL _add_col_19('planes', 'modulos', '`modulos` TEXT NULL AFTER `descripcion`');
DROP PROCEDURE _add_col_19;

-- Planes concretos: Inicial, Profesional, Estudio.
INSERT INTO planes (clave, nombre, precio_mensual_ars, descripcion, modulos, activo) VALUES
  ('inicial', 'Inicial', 40000.00,
   'Minutas con IA y agenda. Ideal para escribanos que arrancan con la herramienta.',
   '["minutas","agenda","notas","biblioteca"]', 1),
  ('profesional', 'Profesional', 70000.00,
   'Todas las funciones: minutas, protocolo, clientes, expedientes, caja, comprobantes, UIF, agenda y equipo.',
   NULL, 1),
  ('estudio', 'Estudio', 120000.00,
   'Todo lo del plan Profesional mas soporte prioritario. Para estudios con equipo.',
   NULL, 1)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  precio_mensual_ars = VALUES(precio_mensual_ars),
  descripcion = VALUES(descripcion),
  modulos = VALUES(modulos),
  activo = VALUES(activo);

-- Desactivar el plan basico a $0 (era el seed original).
UPDATE planes SET activo = 0 WHERE clave = 'basico';

-- Parametros de facturacion por uso.
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('fee_fijo_ars_por_documento', '2000', 'Cargo fijo en ARS por cada documento procesado, ademas del costo de IA'),
  ('margen_ia_porcentaje', '15', 'Porcentaje que se suma sobre el costo real de IA al facturar el uso'),
  ('suscripcion_requerida', '1', 'Exigir suscripcion activa para procesar documentos nuevos')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);
