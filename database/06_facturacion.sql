-- =====================================================================
-- NOTARIUS 2026 - Suscripciones y cobro por uso (Mercado Pago, ARS)
--
-- Sigue sin haber datos de clientes aqui: solo planes, estado de
-- suscripcion de cada CUENTA (la escribana o el escribano, no sus clientes) y el
-- registro de cargos por documento procesado, ligado a `ejecuciones`
-- (que ya es una tabla sin PII).
-- Si se aplica a mano con el cliente `mysql`, usar --default-character-set=utf8mb4
-- (si no, los acentos de este archivo pueden guardarse mal, aunque la tabla
-- este en utf8mb4). `npm run db:init` ya lo hace bien via mysql2.
-- =====================================================================
USE notarius;

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
-- Planes de suscripcion (definidos por la administradora).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planes (
  id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  clave             VARCHAR(40)      NOT NULL,
  nombre            VARCHAR(80)      NOT NULL,
  precio_mensual_ars DECIMAL(10,2)   NOT NULL DEFAULT 0,
  descripcion       VARCHAR(300)     NULL,
  activo            TINYINT(1)       NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_planes_clave (clave)
) ENGINE=InnoDB;

INSERT INTO planes (clave, nombre, precio_mensual_ars, descripcion) VALUES
  ('basico', 'Básico', 0, 'Sin suscripción mensual: solo se cobra el fee por documento procesado.')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- ---------------------------------------------------------------------
-- Estado de suscripcion de cada cuenta (no de sus clientes).
-- ---------------------------------------------------------------------
CALL _agregar_columna_si_falta('usuarios', 'plan_id', '`plan_id` INT UNSIGNED NULL AFTER es_admin');
CALL _agregar_columna_si_falta('usuarios', 'mp_preapproval_id', '`mp_preapproval_id` VARCHAR(64) NULL AFTER plan_id');
CALL _agregar_columna_si_falta('usuarios', 'estado_suscripcion', "`estado_suscripcion` ENUM('sin_suscripcion','pendiente','activa','pausada','cancelada') NOT NULL DEFAULT 'sin_suscripcion' AFTER mp_preapproval_id");
CALL _agregar_columna_si_falta('usuarios', 'proximo_cobro_en', '`proximo_cobro_en` DATE NULL AFTER estado_suscripcion');

-- Referencia opcional a planes (no bloqueante: MySQL no permite IF NOT EXISTS en ADD CONSTRAINT de forma portable).
SET @existe_fk = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND constraint_name = 'fk_usuarios_plan'
);
SET @sql_fk = IF(@existe_fk = 0,
  'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_plan FOREIGN KEY (plan_id) REFERENCES planes (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

-- ---------------------------------------------------------------------
-- Cargos por uso: fee fijo + costo real de la IA (convertido a ARS) + margen,
-- por cada ejecucion facturable. `facturado_en` queda NULL hasta que se
-- vuelca al proximo ciclo de la suscripcion (o se cobra aparte).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargos_uso (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED    NOT NULL,
  ejecucion_id    BIGINT UNSIGNED NULL,
  fee_fijo_ars    DECIMAL(10,2)   NOT NULL DEFAULT 0,
  costo_ia_usd    DECIMAL(12,6)   NULL,
  tipo_cambio     DECIMAL(10,4)   NULL,         -- ARS por USD usado en el calculo
  margen_pct      DECIMAL(6,2)    NOT NULL DEFAULT 0,
  monto_ars       DECIMAL(10,2)   NOT NULL,      -- total ya calculado: fee_fijo + costo_ia*tipo_cambio*(1+margen)
  facturado_en    TIMESTAMP       NULL,          -- se completa cuando se vuelca a un cobro de Mercado Pago
  creado_en       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cargos_ejecucion (ejecucion_id), -- una fila por documento: las iteraciones actualizan el costo de IA, no duplican el fee fijo
  KEY ix_cargos_usuario (usuario_id, facturado_en),
  CONSTRAINT fk_cargos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_cargos_ejecucion FOREIGN KEY (ejecucion_id) REFERENCES ejecuciones (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Historial de eventos de Mercado Pago recibidos (para depurar sin
-- reconstruir todo desde los logs; nunca incluye datos de clientes).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_eventos (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo            VARCHAR(60)     NOT NULL,
  mp_id           VARCHAR(64)     NULL,
  usuario_id      INT UNSIGNED    NULL,
  procesado       TINYINT(1)      NOT NULL DEFAULT 0,
  creado_en       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Precios/parametros de facturacion, junto a los de IA en `configuracion`.
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('fee_fijo_ars_por_documento', '0', 'Cargo fijo en ARS por cada documento procesado, ademas del costo de IA'),
  ('margen_ia_porcentaje', '0', 'Porcentaje que se suma sobre el costo real de IA al facturar el uso'),
  ('tipo_cambio_usd_ars', '0', 'Tipo de cambio manual USD->ARS usado para convertir el costo de IA al facturar. Actualizar periodicamente.'),
  ('suscripcion_requerida', '0', 'Si es 1, una cuenta sin suscripcion activa no puede iniciar documentos nuevos (la administradora siempre puede)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

DROP PROCEDURE _agregar_columna_si_falta;
