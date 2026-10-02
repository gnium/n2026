import { formatoUsd } from "../Pipeline.jsx";

export const PERIODOS = [["30", "30 días"], ["90", "90 días"], ["365", "12 meses"]];
export const NOMBRE_ROL = { root: "Operador", titular: "Titular", escribano: "Escribano/a", empleado: "Empleado/a" };
export const NOMBRE_SUSCRIPCION = {
  sin_suscripcion: "sin suscripción",
  prueba: "en prueba",
  vencida: "prueba vencida",
  pendiente: "pendiente",
  activa: "activa",
  pausada: "pausada",
  cancelada: "cancelada",
};
export const ESTADO_INVITACION = { pendiente: "pendiente", aceptada: "aceptada", vencida: "vencida", cancelada: "cancelada" };

// La prueba manda sobre el estado de Mercado Pago: una cuenta puede figurar
// "pendiente" de autorizar y estar igual dentro de su periodo de prueba.
export const textoSuscripcion = (c) => (c.enPrueba ? "en prueba" : c.pruebaVencida ? "prueba vencida" : NOMBRE_SUSCRIPCION[c.suscripcion] || c.suscripcion);
export const soloFecha = (v) => (v ? new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
export const cuando = (v) => (v ? new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");
// En esta pantalla el cero es un dato contable, no una promocion: "gratis" aca confunde.
export const usd = (n) => (Number(n) > 0 ? formatoUsd(n) : "US$ 0,00");
export const plural = (n, singular, p = `${singular}s`) => `${n} ${n === 1 ? singular : p}`;
export const pct = (parte, total) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : "—");
