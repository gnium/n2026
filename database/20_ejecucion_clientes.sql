-- =====================================================================
-- DOY FE - Vinculo ejecuciones <-> clientes
--
-- Permite asociar clientes a cada acto (ejecucion del pipeline) al
-- momento de crearlo, independientemente de que exista un expediente.
-- =====================================================================
USE notarius;

CREATE TABLE IF NOT EXISTS ejecucion_clientes (
  ejecucion_id  BIGINT UNSIGNED NOT NULL,
  cliente_id    BIGINT UNSIGNED NOT NULL,
  rol           VARCHAR(40)     NULL,
  PRIMARY KEY (ejecucion_id, cliente_id),
  KEY ix_ec_cliente (cliente_id),
  CONSTRAINT fk_ec_ejecucion FOREIGN KEY (ejecucion_id)
    REFERENCES ejecuciones (id) ON DELETE CASCADE,
  CONSTRAINT fk_ec_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE CASCADE
) ENGINE=InnoDB;
