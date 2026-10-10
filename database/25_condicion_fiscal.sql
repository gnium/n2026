-- =====================================================================
-- Condición fiscal del escribano (RI, monotributista, exento).
-- Determina si se incluye IVA en los presupuestos.
-- También se desactiva ITI (Ley 23.905), ya derogado.
-- =====================================================================

ALTER TABLE equipos ADD COLUMN condicion_fiscal VARCHAR(30) NULL AFTER jurisdiccion;

UPDATE aranceles SET activo = 0, notas = CONCAT(IFNULL(notas, ''), ' [desactivado: impuesto derogado]')
  WHERE categoria = 'iti';
