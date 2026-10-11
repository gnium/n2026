USE notarius;

CREATE TABLE IF NOT EXISTS notificaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo VARCHAR(200) NOT NULL,
  mensaje TEXT NOT NULL,
  tipo ENUM('info','alerta','novedad') NOT NULL DEFAULT 'info',
  destinatario_id INT UNSIGNED NULL COMMENT 'NULL = broadcast a todos',
  leida_por JSON NULL COMMENT 'Array de user IDs que la leyeron',
  creado_por INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notif_destinatario (destinatario_id),
  KEY ix_notif_creado (creado_en),
  CONSTRAINT fk_notif_destinatario FOREIGN KEY (destinatario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_creador FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;
