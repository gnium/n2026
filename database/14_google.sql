-- =====================================================================
-- Fase 4 · Integraciones con Google (Calendar, Gmail y Drive).
--
-- Viene APAGADA: no hace nada hasta que la titular carga el client_id y el
-- client_secret de un proyecto de Google Cloud (Configuracion) y cada cuenta
-- conecta su propia cuenta de Google y elige que sincronizar.
--
-- Privacidad (ver docs/PRIVACIDAD.md, "Integraciones con Google"): esta es la
-- primera funcion que puede sacar datos de la escribania hacia un tercero.
--   * Calendar: titulo, fecha y duracion del turno. Nada mas.
--   * Gmail: el correo lo envia la propia cuenta del escribano, con el PDF
--     adjunto (presupuesto o comprobante) que ya iba a mandar por otro medio.
--   * Drive: sube el .docx de la escritura y/o los PDF a una carpeta del
--     Drive del usuario. Cada destino se activa por separado y por cuenta.
-- Los tokens de OAuth se guardan cifrados (contexto "google").
-- =====================================================================
USE notarius;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS google_cuentas (
  usuario_id           INT UNSIGNED    NOT NULL,
  email                VARCHAR(190)    NULL,
  refresh_cifrado      MEDIUMTEXT      NOT NULL,
  access_cifrado       MEDIUMTEXT      NULL,
  access_expira_en     DATETIME        NULL,
  alcances             VARCHAR(600)    NULL,
  calendario_id        VARCHAR(190)    NOT NULL DEFAULT 'primary',
  sincronizar_agenda   TINYINT(1)      NOT NULL DEFAULT 0,
  enviar_por_gmail     TINYINT(1)      NOT NULL DEFAULT 0,
  drive_carpeta_id     VARCHAR(120)    NULL,
  drive_carpeta_nombre VARCHAR(190)    NULL,
  subir_escrituras     TINYINT(1)      NOT NULL DEFAULT 0,
  subir_comprobantes   TINYINT(1)      NOT NULL DEFAULT 0,
  conectado_en         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id),
  CONSTRAINT fk_google_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Envios hechos con Gmail. No se guarda el destinatario (ya esta cifrado en el
-- cliente): solo que se envio, de que comprobante y el id del mensaje.
CREATE TABLE IF NOT EXISTS google_envios (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id    INT UNSIGNED    NOT NULL,
  tipo          ENUM('presupuesto','comprobante','otro') NOT NULL DEFAULT 'otro',
  referencia_id BIGINT UNSIGNED NULL,
  gmail_id      VARCHAR(120)    NULL,
  enviado_en    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_envios_usuario (usuario_id, enviado_en),
  CONSTRAINT fk_envios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Enlace con el evento de Google Calendar.
CALL _agregar_columna_si_falta('turnos', 'google_evento_id', '`google_evento_id` VARCHAR(190) NULL AFTER `ejecucion_id`');
CALL _agregar_columna_si_falta('turnos', 'google_sincronizado_en', '`google_sincronizado_en` DATETIME NULL AFTER `google_evento_id`');
-- Enlace con el archivo en Drive.
CALL _agregar_columna_si_falta('comprobantes', 'drive_archivo_id', '`drive_archivo_id` VARCHAR(120) NULL AFTER `arca_resultado`');
CALL _agregar_columna_si_falta('comprobantes', 'drive_enlace', '`drive_enlace` VARCHAR(400) NULL AFTER `drive_archivo_id`');
CALL _agregar_columna_si_falta('presupuestos', 'drive_archivo_id', '`drive_archivo_id` VARCHAR(120) NULL');
CALL _agregar_columna_si_falta('presupuestos', 'drive_enlace', '`drive_enlace` VARCHAR(400) NULL');

DROP PROCEDURE _agregar_columna_si_falta;

-- Credenciales OAuth de la instalacion (las carga la titular en Configuracion).
INSERT IGNORE INTO configuracion (clave, valor) VALUES
  ('google_client_id', ''),
  ('google_client_secret_cifrado', ''),
  ('google_redirect_uri', '');
