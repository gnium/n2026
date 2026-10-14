USE notarius;

-- =============================================================
-- Actualizar aranceles según Tabla Indicativa de Aranceles Éticos
-- Circular Nº 1.411 — Vigencia 10/08/2026
-- Caja de Previsión Social para Escribanos de Salta
-- =============================================================

-- Columna minimo (idempotente: no falla si ya existe)
DELIMITER $$
CREATE PROCEDURE _add_minimo()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aranceles' AND COLUMN_NAME = 'minimo') THEN
    ALTER TABLE aranceles ADD COLUMN minimo DECIMAL(18,4) NULL AFTER escala;
  END IF;
END$$
DELIMITER ;

CALL _add_minimo();

DROP PROCEDURE IF EXISTS _add_minimo;

-- ----------------- HONORARIOS (escala acumulativa) -----------------

UPDATE aranceles SET
  escala = '[{"hasta": 390000000, "valor": 3}, {"hasta": null, "valor": 2}]',
  minimo = 1300000
WHERE id = 1;

UPDATE aranceles SET
  escala = '[{"hasta": 390000000, "valor": 3}, {"hasta": null, "valor": 2}]',
  minimo = 890000
WHERE id = 14;

UPDATE aranceles SET
  escala = '[{"hasta": 240000000, "valor": 2}, {"hasta": null, "valor": 1}]',
  minimo = 1300000
WHERE id = 22;

-- ----------------- APORTES: unificar en "Aportes notariales (19%)" -----------------

UPDATE aranceles SET nombre = 'Aportes notariales (19%)', valor = 19.0000, quien_paga = 'cliente' WHERE id = 4;
UPDATE aranceles SET activo = 0 WHERE id = 5;

UPDATE aranceles SET nombre = 'Aportes notariales (19%)', valor = 19.0000, quien_paga = 'cliente' WHERE id = 17;
UPDATE aranceles SET activo = 0 WHERE id = 18;

UPDATE aranceles SET nombre = 'Aportes notariales (19%)', valor = 19.0000, quien_paga = 'cliente' WHERE id = 25;
UPDATE aranceles SET activo = 0 WHERE id = 26;

UPDATE aranceles SET nombre = 'Aportes notariales (19%)', valor = 19.0000, quien_paga = 'cliente' WHERE id = 33;
UPDATE aranceles SET nombre = 'Aportes notariales (19%)', valor = 19.0000, quien_paga = 'cliente' WHERE id = 37;

-- ----------------- SELLOS: compraventa lo paga el comprador -----------------

UPDATE aranceles SET quien_paga = 'comprador' WHERE id = 3;

-- ----------------- INSCRIPCIÓN REGISTRAL DGI: 0.3% → 0.2% -----------------

UPDATE aranceles SET nombre = 'Inscripción registral DGI (0,2%)', valor = 0.2000 WHERE id = 7;
UPDATE aranceles SET nombre = 'Inscripción registral DGI (0,2%)', valor = 0.2000 WHERE id = 19;
UPDATE aranceles SET nombre = 'Inscripción registral DGI (0,2%)', valor = 0.2000 WHERE id = 27;

-- ----------------- CERTIFICADOS: unificar dominio + inhibición -----------------

UPDATE aranceles SET nombre = 'Certificados de dominio e inhibición', valor = 90000.0000 WHERE id = 8;
UPDATE aranceles SET activo = 0 WHERE id = 9;

UPDATE aranceles SET nombre = 'Certificados de dominio e inhibición', valor = 90000.0000 WHERE id = 20;
UPDATE aranceles SET activo = 0 WHERE id = 21;

UPDATE aranceles SET nombre = 'Certificados de dominio e inhibición', valor = 90000.0000 WHERE id = 28;
UPDATE aranceles SET activo = 0 WHERE id = 29;

-- ----------------- INFORME CATASTRAL: descartar -----------------

UPDATE aranceles SET activo = 0 WHERE id = 10;

-- ----------------- LIBRE DEUDA: unificar provincial + municipal -----------------

UPDATE aranceles SET nombre = 'Certificados de libre deuda', valor = 27000.0000 WHERE id = 11;
UPDATE aranceles SET activo = 0 WHERE id = 12;

-- ----------------- NUEVOS RUBROS (idempotente) -----------------

INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, base, quien_paga, obligatorio, orden)
SELECT 'salta', 'gastos', 'compraventa', 'Fondo Cultural', 'fijo', 10000.0000, 'monto_operacion', 'cliente', 1, 55
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM aranceles WHERE jurisdiccion='salta' AND nombre='Fondo Cultural' AND tipo_acto='compraventa');

INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, base, quien_paga, obligatorio, orden)
SELECT 'salta', 'gastos', 'donacion', 'Fondo Cultural', 'fijo', 10000.0000, 'monto_operacion', 'cliente', 1, 55
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM aranceles WHERE jurisdiccion='salta' AND nombre='Fondo Cultural' AND tipo_acto='donacion');

INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, base, quien_paga, obligatorio, orden)
SELECT 'salta', 'gastos', 'hipoteca', 'Fondo Cultural', 'fijo', 10000.0000, 'monto_operacion', 'cliente', 1, 55
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM aranceles WHERE jurisdiccion='salta' AND nombre='Fondo Cultural' AND tipo_acto='hipoteca');

INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, base, quien_paga, obligatorio, orden)
SELECT 'salta', 'tasas', 'compraventa', 'Tasa de inscripción (0,3%)', 'porcentaje', 0.3000, 'monto_operacion', 'comprador', 1, 60
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM aranceles WHERE jurisdiccion='salta' AND nombre='Tasa de inscripción (0,3%)' AND tipo_acto='compraventa');

INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, base, quien_paga, obligatorio, orden)
SELECT 'salta', 'tasas', 'donacion', 'Tasa de inscripción (0,3%)', 'porcentaje', 0.3000, 'monto_operacion', 'comprador', 1, 60
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM aranceles WHERE jurisdiccion='salta' AND nombre='Tasa de inscripción (0,3%)' AND tipo_acto='donacion');

INSERT INTO aranceles (jurisdiccion, categoria, tipo_acto, nombre, tipo_calculo, valor, base, quien_paga, obligatorio, orden)
SELECT 'salta', 'tasas', 'hipoteca', 'Tasa de inscripción (0,3%)', 'porcentaje', 0.3000, 'monto_operacion', 'comprador', 1, 60
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM aranceles WHERE jurisdiccion='salta' AND nombre='Tasa de inscripción (0,3%)' AND tipo_acto='hipoteca');
