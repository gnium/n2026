-- =====================================================================
-- Jurisdicción de la escribanía (provincia). Determina aranceles,
-- alícuotas de sellos, tasas registrales y formularios de DDJJ.
-- =====================================================================
USE notarius;

-- Jurisdicción en el equipo (escribanía).
ALTER TABLE equipos ADD COLUMN jurisdiccion VARCHAR(40) NULL AFTER nombre;

-- Campos adicionales en presupuestos para cálculo automático.
ALTER TABLE presupuestos
  ADD COLUMN tipo_acto VARCHAR(40) NULL AFTER cliente_id,
  ADD COLUMN monto_operacion DECIMAL(14,2) NULL AFTER tipo_acto;
