-- =====================================================================
-- NOTARIUS 2026 - Canal de consultas de soporte
--
-- Las cuentas suscriptoras pueden enviar consultas al operador de la
-- plataforma. El operador las ve desde el panel de Operacion y puede
-- responder. Cada consulta es un hilo con mensajes.
--
-- Regla: los mensajes son texto libre del usuario y del operador. No
-- contienen datos de clientes ni de expedientes: es un canal de soporte
-- tecnico, no un lugar para compartir escrituras.
-- =====================================================================
USE notarius;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS consultas_soporte (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id   INT UNSIGNED    NOT NULL,
  asunto       VARCHAR(200)    NOT NULL,
  estado       ENUM('abierta','respondida','cerrada') NOT NULL DEFAULT 'abierta',
  creado_en    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_consultas_usuario (usuario_id),
  KEY ix_consultas_estado (estado, actualizado_en),
  CONSTRAINT fk_consultas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes_soporte (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  consulta_id  BIGINT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED    NOT NULL,
  contenido    TEXT            NOT NULL,
  leido        TINYINT(1)      NOT NULL DEFAULT 0,
  creado_en    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mensajes_consulta (consulta_id, creado_en),
  CONSTRAINT fk_mensajes_consulta FOREIGN KEY (consulta_id) REFERENCES consultas_soporte (id) ON DELETE CASCADE,
  CONSTRAINT fk_mensajes_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
