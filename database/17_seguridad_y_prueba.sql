-- =====================================================================
-- NOTARIUS 2026 - Endurecimiento de seguridad + alta por invitacion con
-- periodo de prueba de 60 dias.
--
-- Tres cosas:
--   1. `usuarios.sesion_version`: corta de inmediato las sesiones ya
--      emitidas cuando la cuenta se desactiva o cambia su contrasena.
--      Antes, una cookie robada seguia valida hasta 12 h despues.
--   2. `invitaciones_plataforma`: el operador invita a una escribana o un
--      escribano nuevo desde el panel de Operacion. El alta queda cerrada a
--      quien no tenga invitacion (no depende mas de un codigo compartido).
--   3. Prueba y baja: cada cuenta invitada arranca con 60 dias de prueba.
--      Vencida la prueba sin suscripcion, la cuenta queda bloqueada y, tras
--      un plazo de gracia, TODO su contenido se borra. Es la contracara de
--      la promesa de privacidad: si el dato ya no tiene por que estar, no
--      se guarda "por las dudas".
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

-- ---------------------------------------------------------------------
-- 1. Corte inmediato de sesiones emitidas.
-- Cada token lleva la version de sesion de la cuenta; desactivarla o
-- cambiar la contrasena incrementa el contador y todo token con la version
-- anterior queda invalidado en el acto. Un contador y no una marca de
-- tiempo: las marcas tienen resolucion de un segundo (y zona horaria), y la
-- cookie nueva y la vieja pueden caer en el mismo segundo.
-- ---------------------------------------------------------------------
CALL _agregar_columna_si_falta('usuarios', 'sesion_version', '`sesion_version` INT UNSIGNED NOT NULL DEFAULT 0 AFTER ultimo_acceso');

-- ---------------------------------------------------------------------
-- 2. Periodo de prueba y baja programada de cada cuenta.
-- ---------------------------------------------------------------------
CALL _agregar_columna_si_falta('usuarios', 'prueba_termina_en', '`prueba_termina_en` DATE NULL AFTER proximo_cobro_en');
CALL _agregar_columna_si_falta('usuarios', 'eliminacion_programada_en', '`eliminacion_programada_en` DATE NULL AFTER prueba_termina_en');
-- Ultimo aviso enviado, en dias restantes (10, 3, 1, 0 = prueba vencida, -1 = ultimo aviso antes de borrar).
CALL _agregar_columna_si_falta('usuarios', 'aviso_prueba_dias', '`aviso_prueba_dias` TINYINT NULL AFTER eliminacion_programada_en');

-- `prueba` (en periodo de prueba) y `vencida` (prueba terminada sin pagar) son estados nuevos.
ALTER TABLE usuarios
  MODIFY COLUMN estado_suscripcion
  ENUM('sin_suscripcion','prueba','vencida','pendiente','activa','pausada','cancelada')
  NOT NULL DEFAULT 'sin_suscripcion';

-- ---------------------------------------------------------------------
-- 3. Invitaciones de la plataforma (alta de escribanias nuevas).
-- Igual que las del equipo: se guarda el sha256 del token, nunca el token.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitaciones_plataforma (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190)    NOT NULL,
  nombre        VARCHAR(120)    NULL,          -- a quien se invita (para el correo)
  escribania    VARCHAR(160)    NULL,          -- nombre sugerido del equipo, opcional
  token_hash    CHAR(64)        NOT NULL,
  dias_prueba   SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  invitado_por  INT UNSIGNED    NULL,
  expira_en     TIMESTAMP       NOT NULL,
  aceptada_en   TIMESTAMP       NULL,
  cancelada_en  TIMESTAMP       NULL,
  usuario_id    INT UNSIGNED    NULL,          -- cuenta creada al aceptarla
  creado_en     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_invplat_token (token_hash),
  KEY ix_invplat_email (email),
  KEY ix_invplat_estado (aceptada_en, cancelada_en, expira_en),
  CONSTRAINT fk_invplat_invitador FOREIGN KEY (invitado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_invplat_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. Constancia de las bajas. Sin PII: el correo va como sha256, para
-- poder responder "esta cuenta se borro el dia X" sin conservar el dato.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuentas_eliminadas (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED    NOT NULL,
  email_hash   CHAR(64)        NOT NULL,
  motivo       VARCHAR(40)     NOT NULL,      -- prueba_vencida | pedido_del_titular | operador
  filas        INT UNSIGNED    NOT NULL DEFAULT 0,
  eliminado_en TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cuentas_elim_fecha (eliminado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Parametros del periodo de prueba, junto al resto de la configuracion.
-- ---------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('prueba_dias', '60', 'Dias de prueba gratuita de una cuenta creada por invitacion de la plataforma'),
  ('prueba_gracia_dias', '15', 'Dias entre el fin de la prueba sin suscripcion y el borrado definitivo de todos los datos de la cuenta'),
  ('prueba_borrado_automatico', '1', 'Si es 1, el borrado definitivo se ejecuta solo al vencer la gracia; si es 0, queda pendiente de confirmacion del operador')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

DROP PROCEDURE _agregar_columna_si_falta;
