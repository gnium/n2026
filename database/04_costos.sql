-- =====================================================================
-- NOTARIUS 2026 - Seguimiento de costos de IA
-- Solo cifras operativas (tokens, proveedor, modelo, costo estimado en USD).
-- Nada de esto contiene datos de clientes.
-- =====================================================================
USE notarius;

-- ---------------------------------------------------------------------
-- Precios por proveedor+modelo, editables desde la aplicacion
-- (Configuracion -> Precios). Los precios de Anthropic son los publicados
-- por Anthropic; los de Gemini cambian con frecuencia y se marcan como
-- aproximados: conviene verificarlos en ai.google.dev/gemini-api/docs/pricing
-- y ajustarlos aqui si difieren. IA local y modo simulado no tienen costo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS precios_ia (
  proveedor        VARCHAR(20)     NOT NULL,   -- anthropic | gemini | local | mock
  modelo            VARCHAR(80)     NOT NULL,
  precio_entrada    DECIMAL(10,4)   NOT NULL DEFAULT 0,  -- USD por millon de tokens de entrada
  precio_salida     DECIMAL(10,4)   NOT NULL DEFAULT 0,  -- USD por millon de tokens de salida
  precio_cache      DECIMAL(10,4)   NULL,                -- USD por millon de tokens leidos de cache (NULL = igual a entrada)
  aproximado        TINYINT(1)      NOT NULL DEFAULT 0,  -- 1 = verificar antes de facturar a terceros
  actualizado_en     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (proveedor, modelo)
) ENGINE=InnoDB;

-- Precios de Anthropic (console.anthropic.com/settings/billing, USD por millon de tokens)
INSERT INTO precios_ia (proveedor, modelo, precio_entrada, precio_salida, precio_cache, aproximado) VALUES
  ('anthropic', 'claude-opus-5',    5.0000, 25.0000, 0.5000, 0),
  ('anthropic', 'claude-sonnet-5',  2.0000, 10.0000, 0.2000, 0),
  ('anthropic', 'claude-haiku-4-5', 1.0000,  5.0000, 0.1000, 0),
  ('anthropic', 'claude-opus-4-8',  5.0000, 25.0000, 0.5000, 0),
  ('anthropic', 'claude-sonnet-4-6',3.0000, 15.0000, 0.3000, 0)
ON DUPLICATE KEY UPDATE precio_entrada = VALUES(precio_entrada), precio_salida = VALUES(precio_salida), precio_cache = VALUES(precio_cache);

-- Precios de Gemini: Google los cambia con frecuencia (varios modelos "preview" por ano).
-- Estos son los publicados al momento de escribir esto; se marcan aproximado=1
-- para que la aplicacion lo indique. Corregir desde Configuracion -> Precios
-- si difieren de https://ai.google.dev/gemini-api/docs/pricing
INSERT INTO precios_ia (proveedor, modelo, precio_entrada, precio_salida, precio_cache, aproximado) VALUES
  ('gemini', 'gemini-2.5-flash',       0.3000,  2.5000, 0.0300, 1),
  ('gemini', 'gemini-2.5-pro',         1.2500, 10.0000, 0.1250, 1),
  ('gemini', 'gemini-3.1-pro-preview', 2.0000, 12.0000, 0.2000, 1),
  ('gemini', 'gemini-3.1-flash-preview',0.2500, 1.5000, 0.0250, 1)
ON DUPLICATE KEY UPDATE precio_entrada = VALUES(precio_entrada), precio_salida = VALUES(precio_salida), precio_cache = VALUES(precio_cache);

-- ---------------------------------------------------------------------
-- Costo por skill y por ejecucion (agregado). NULL = no habia precio
-- cargado para ese proveedor/modelo en el momento de la corrida.
-- ---------------------------------------------------------------------
-- MySQL no admite "ADD COLUMN IF NOT EXISTS" en ALTER TABLE (a diferencia de MariaDB),
-- asi que se agregan las columnas con un procedimiento que primero revisa information_schema,
-- para que este script pueda ejecutarse mas de una vez sin error.
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

CALL _agregar_columna_si_falta('ejecuciones_skills', 'proveedor', '`proveedor` VARCHAR(20) NULL AFTER `modelo`');
CALL _agregar_columna_si_falta('ejecuciones_skills', 'costo_usd', '`costo_usd` DECIMAL(12,6) NULL AFTER `tokens_salida`');
CALL _agregar_columna_si_falta('ejecuciones', 'costo_usd', '`costo_usd` DECIMAL(12,6) NULL AFTER `tokens_salida`');

DROP PROCEDURE _agregar_columna_si_falta;
