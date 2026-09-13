-- =====================================================================
-- Fase 4 · Equipo de la escribania.
--
-- Modelo elegido: CUENTAS SEPARADAS CON COMPARTIR PUNTUAL. Cada cuenta
-- sigue siendo duena de sus clientes, expedientes, agenda y caja (la
-- columna `usuario_id` de cada tabla no cambia). El equipo agrega:
--   * roles (titular / escribano / empleado) que habilitan o reservan
--     pantallas completas (protocolo, caja, comprobantes, UIF);
--   * invitaciones por correo;
--   * compartir un expediente puntual con otra cuenta del equipo;
--   * notas y turnos marcados como del equipo;
--   * metricas agregadas por integrante para la titular.
--
-- Migracion de datos: la instalacion existente pasa a ser un unico equipo
-- con la cuenta administradora como titular y el resto como escribanos.
-- Asi se preserva el comportamiento actual (las notas "compartidas" eran
-- visibles a toda la instalacion) sin abrir ningun dato nuevo.
-- =====================================================================
USE notarius;
SET NAMES utf8mb4; -- el archivo esta en UTF-8: sin esto el cliente mysql lo interpreta como latin1

CREATE TABLE IF NOT EXISTS equipos (
  id                 INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  nombre             VARCHAR(160)    NOT NULL,
  titular_usuario_id INT UNSIGNED    NOT NULL,
  creado_en          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_equipos_titular (titular_usuario_id),
  CONSTRAINT fk_equipos_titular FOREIGN KEY (titular_usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un usuario pertenece a lo sumo a un equipo: la clave primaria es usuario_id.
CREATE TABLE IF NOT EXISTS equipo_miembros (
  usuario_id INT UNSIGNED NOT NULL,
  equipo_id  INT UNSIGNED NOT NULL,
  rol        ENUM('titular','escribano','empleado') NOT NULL DEFAULT 'empleado',
  estado     ENUM('activo','suspendido') NOT NULL DEFAULT 'activo',
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id),
  KEY ix_miembros_equipo (equipo_id),
  CONSTRAINT fk_miembros_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_miembros_equipo  FOREIGN KEY (equipo_id)  REFERENCES equipos (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipo_invitaciones (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  equipo_id    INT UNSIGNED    NOT NULL,
  email        VARCHAR(190)    NOT NULL,
  rol          ENUM('escribano','empleado') NOT NULL DEFAULT 'empleado',
  token_hash   CHAR(64)        NOT NULL,
  invitado_por INT UNSIGNED    NULL,
  expira_en    TIMESTAMP       NOT NULL,
  aceptada_en  TIMESTAMP       NULL,
  cancelada_en TIMESTAMP       NULL,
  creado_en    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_invitacion_token (token_hash),
  KEY ix_invitacion_equipo (equipo_id),
  KEY ix_invitacion_email (email),
  CONSTRAINT fk_invitacion_equipo    FOREIGN KEY (equipo_id)    REFERENCES equipos (id)  ON DELETE CASCADE,
  CONSTRAINT fk_invitacion_invitador FOREIGN KEY (invitado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compartir puntual: un expediente concreto con una cuenta concreta.
-- lectura  -> ve el expediente, sus partes (solo nombre), tareas y presupuestos.
-- edicion  -> ademas edita caratula, observaciones, estado y tareas.
-- El dueno es el unico que maneja partes, protocolo, comprobantes y UIF.
CREATE TABLE IF NOT EXISTS expediente_colaboradores (
  expediente_id  BIGINT UNSIGNED NOT NULL,
  usuario_id     INT UNSIGNED    NOT NULL,
  permiso        ENUM('lectura','edicion') NOT NULL DEFAULT 'lectura',
  compartido_por INT UNSIGNED    NULL,
  creado_en      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (expediente_id, usuario_id),
  KEY ix_colab_usuario (usuario_id),
  CONSTRAINT fk_colab_expediente  FOREIGN KEY (expediente_id)  REFERENCES expedientes (id) ON DELETE CASCADE,
  CONSTRAINT fk_colab_usuario     FOREIGN KEY (usuario_id)     REFERENCES usuarios (id)    ON DELETE CASCADE,
  CONSTRAINT fk_colab_compartidor FOREIGN KEY (compartido_por) REFERENCES usuarios (id)    ON DELETE SET NULL
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

-- Tarea asignada a una cuenta del equipo (el texto libre `responsable` se conserva).
CALL _agregar_columna_si_falta('tareas', 'responsable_usuario_id', '`responsable_usuario_id` INT UNSIGNED NULL AFTER `responsable`');
-- Turno visible para el resto del equipo (la agenda del estudio).
CALL _agregar_columna_si_falta('turnos', 'compartido', '`compartido` TINYINT(1) NOT NULL DEFAULT 0 AFTER `estado`');

DROP PROCEDURE _agregar_columna_si_falta;

-- Migracion de datos: un equipo para la instalacion existente.
SET @tit := (SELECT MIN(id) FROM usuarios WHERE es_admin = 1);
SET @hay := (SELECT COUNT(*) FROM equipos);
INSERT INTO equipos (nombre, titular_usuario_id)
  SELECT 'Escribanía', @tit FROM DUAL WHERE @hay = 0 AND @tit IS NOT NULL;
SET @eq := (SELECT MIN(id) FROM equipos);
INSERT IGNORE INTO equipo_miembros (usuario_id, equipo_id, rol)
  SELECT u.id, @eq, IF(u.id = @tit, 'titular', 'escribano') FROM usuarios u WHERE @eq IS NOT NULL AND u.activo = 1;
