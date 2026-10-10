USE notarius;

ALTER TABLE custodia MODIFY COLUMN estado ENUM('en_custodia','devuelto','entregado') NOT NULL DEFAULT 'en_custodia';
ALTER TABLE custodia MODIFY COLUMN recibido_en DATETIME NULL DEFAULT NULL;
ALTER TABLE custodia ADD COLUMN entregado_en DATETIME NULL AFTER devuelto_en;
ALTER TABLE custodia ADD COLUMN envio_entrega JSON NULL AFTER envio_devolucion;
