USE notarius;

CREATE TABLE IF NOT EXISTS custodia (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id      BIGINT UNSIGNED NOT NULL,
  cliente_id      BIGINT UNSIGNED NOT NULL,
  codigo          VARCHAR(12)     NOT NULL,
  descripcion     VARCHAR(500)    NOT NULL,
  notas           TEXT            NULL,
  estado          ENUM('en_custodia','devuelto') NOT NULL DEFAULT 'en_custodia',
  recibido_en     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  devuelto_en     DATETIME        NULL,
  envio_recepcion JSON            NULL,
  envio_devolucion JSON           NULL,
  UNIQUE KEY uq_custodia_codigo (codigo),
  KEY ix_custodia_usuario (usuario_id),
  KEY ix_custodia_cliente (cliente_id),
  CONSTRAINT fk_custodia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_custodia_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB;
