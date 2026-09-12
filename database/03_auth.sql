-- =====================================================================
-- NOTARIUS 2026 - Autenticacion (usuaria de la aplicacion, no clientes)
-- El backend tambien crea estas tablas al arrancar si no existen.
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS usuarios (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  email          VARCHAR(190)  NOT NULL,
  nombre         VARCHAR(120)  NULL,
  password_hash  VARCHAR(255)  NOT NULL,      -- scrypt$N$salt$hash (base64)
  activo         TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso  TIMESTAMP     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tokens_recuperacion (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED    NOT NULL,
  token_hash  CHAR(64)        NOT NULL,       -- sha256 del token enviado por correo
  expira_en   TIMESTAMP       NOT NULL,
  usado_en    TIMESTAMP       NULL,
  creado_en   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tokens_hash (token_hash),
  KEY ix_tokens_usuario (usuario_id),
  CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;
