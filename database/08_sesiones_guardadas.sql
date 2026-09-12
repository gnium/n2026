-- =====================================================================
-- NOTARIUS 2026 - Guardar y reanudar sesiones de redaccion
--
-- EXCEPCION EXPLICITA Y ACOTADA a la regla de oro: por defecto una sesion
-- de trabajo vive solo en memoria y se destruye al descargar, cerrar o por
-- inactividad (ver docs/PRIVACIDAD.md). Esta tabla es el UNICO otro lugar
-- donde datos de sesion pueden llegar a MySQL, y solo si la escribana o el
-- escribano lo pide explicitamente ("Guardar y continuar despues"): nunca
-- automatico. El contenido viaja cifrado (AES-256-GCM, contexto
-- "sesion_guardada", distinto del usado para el protocolo) y vence solo
-- (columna expira_en + barrido periodico); reanudar o descartar lo borra.
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS sesiones_guardadas (
  id               CHAR(36)        NOT NULL,   -- reusa el UUID de la sesion en memoria al guardar
  usuario_id       INT UNSIGNED    NOT NULL,
  modo             VARCHAR(30)     NOT NULL,   -- completo|escritura|estudio_titulos|certificacion_firmas
  estado_original  ENUM('en_curso','completada','fallida','cancelada') NOT NULL,
  numero_iteracion SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  payload_cifrado  LONGTEXT        NOT NULL,   -- AES-256-GCM, contexto "sesion_guardada"
  expira_en        DATETIME        NOT NULL,
  creado_en        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_guardadas_usuario (usuario_id, expira_en),
  CONSTRAINT fk_guardadas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;
