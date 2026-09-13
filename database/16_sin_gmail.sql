-- =====================================================================
-- Fase 4 · se saca Gmail de las integraciones.
--
-- Motivo: `gmail.send` es un alcance RESTRINGIDO de Google. Para publicar la
-- aplicacion con ese alcance hace falta, ademas de la verificacion, una
-- auditoria de seguridad anual de un tercero (CASA). Quedan Calendar
-- (`calendar.events`, sensible) y Drive (`drive.file`, que ni siquiera es
-- sensible porque solo ve los archivos que la propia app crea).
-- El correo se maneja fuera de la app.
-- =====================================================================
USE notarius;
SET NAMES utf8mb4;

DROP TABLE IF EXISTS google_envios;

SET @existe := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'google_cuentas' AND column_name = 'enviar_por_gmail');
SET @sql := IF(@existe > 0, 'ALTER TABLE google_cuentas DROP COLUMN enviar_por_gmail', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
