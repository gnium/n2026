-- =====================================================================
-- Fase 4 · correccion de la revision de codigo.
--
-- Quitar a alguien del equipo borraba su fila de `equipo_miembros`, y una
-- cuenta sin fila vale como 'escribano' (asi se comportan las instalaciones
-- de una sola persona). Resultado: expulsar a un empleado le concedia
-- justo los permisos que el rol le negaba. Ahora la fila se conserva con
-- estado 'retirado': la persona sale del equipo y queda como empleado.
-- =====================================================================
USE notarius;
SET NAMES utf8mb4;

ALTER TABLE equipo_miembros
  MODIFY COLUMN estado ENUM('activo','suspendido','retirado') NOT NULL DEFAULT 'activo';
