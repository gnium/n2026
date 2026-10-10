-- =====================================================================
-- Condición fiscal del escribano (RI, monotributista, exento).
-- Determina si se incluye IVA en los presupuestos.
-- También se desactiva ITI (Ley 23.905), ya derogado.
-- Se renombra "DGI" a "DGI (Inmuebles)" para claridad.
-- =====================================================================
USE notarius;

ALTER TABLE equipos ADD COLUMN condicion_fiscal VARCHAR(30) NULL AFTER jurisdiccion;

UPDATE aranceles SET activo = 0, notas = CONCAT(IFNULL(notas, ''), ' [desactivado: impuesto derogado]')
  WHERE categoria = 'iti';

UPDATE aranceles SET nombre = REPLACE(nombre, 'Inscripción registral DGI', 'Inscripción registral DGI (Inmuebles)')
  WHERE categoria = 'inscripcion_dgi';
